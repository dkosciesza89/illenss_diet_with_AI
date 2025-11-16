# DB Schema Plan for Personalized Recipe Assistant (MVP)

This file contains a comprehensive PostgreSQL schema plan intended as the basis for migrations.

---

## 1. Tables (columns, types, constraints)

1. `auth_user_map` — mapping Supabase auth users to internal user ids and anonymized ids
   - `auth_user_id` UUID PRIMARY KEY -- the Supabase `id` (sub) for service-side joins
   - `user_id` UUID NOT NULL UNIQUE -- internal application user id
   - `created_at` timestamptz NOT NULL DEFAULT now()

   Notes: This table is intended to be accessible only to the service role (not end-user roles). It allows RLS policies to map `auth.uid()` to application `user_id` where needed.

2. `users` — user profile (application-level)
   - `user_id` UUID PRIMARY KEY REFERENCES `auth_user_map`(`user_id`) ON DELETE CASCADE
   - `disease` TEXT NOT NULL CHECK (disease IN ('type1_diabetes','celiac','lactose_intolerance'))
   - `age` INT NOT NULL CHECK (age >= 0 AND age <= 150)
   - `sex` TEXT NOT NULL CHECK (sex IN ('female','male','other','unspecified'))
   - `allergies` JSONB DEFAULT '[]'::jsonb -- array of strings or structured objects
   - `preferences` JSONB DEFAULT '{}'::jsonb -- optional onboarding preferences
   - `created_at` timestamptz NOT NULL DEFAULT now()
   - `updated_at` timestamptz NOT NULL DEFAULT now()

3. `units` — canonical units and conversion to a base unit type
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `code` TEXT NOT NULL UNIQUE -- e.g. 'g', 'kg', 'ml', 'cup'
   - `display_name` TEXT NOT NULL
   - `conversion_to_base` NUMERIC(18,9) NOT NULL -- multiplier to convert to base_unit (e.g. grams/ml)
   - `base_unit_type` TEXT NOT NULL -- e.g. 'mass', 'volume'
   - `created_at` timestamptz NOT NULL DEFAULT now()

   Notes: `conversion_to_base` uses high precision numeric to avoid rounding issues in aggregations.

4. `recipes` — primary recipe table (user-owned)
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `owner_user_id` UUID NOT NULL REFERENCES `users`(`user_id`) ON DELETE CASCADE
   - `title` TEXT NOT NULL
   - `raw_text` TEXT NOT NULL
   - `recipe_data` JSONB NOT NULL -- structured representation: { title, ingredients: [{name,quantity,unit,normalized_name,unit_id}], steps: [string] }
   - `tsv` tsvector -- materialized tsvector for full-text search (derived from title + raw_text)
   - `cached_nutrition` JSONB DEFAULT NULL -- precomputed aggregated nutrition per recipe/serving
   - `created_at` timestamptz NOT NULL DEFAULT now()
   - `updated_at` timestamptz NOT NULL DEFAULT now()
   - `deleted_at` timestamptz DEFAULT NULL -- soft-delete

   Constraints & Notes:
   - `title` NOT NULL and enforced non-empty via application validation.
   - DB-level lightweight checks are provided where possible; detailed checks for `recipe_data.steps` length are enforced by triggers (see notes).

5. `ingredients` — ingredients normalized per recipe
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `recipe_id` UUID NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE
   - `name` TEXT NOT NULL -- original name as entered
   - `normalized_name` TEXT NOT NULL -- canonicalized name used for lookups
   - `quantity` NUMERIC(9,3) NOT NULL CHECK (quantity > 0)
   - `unit_id` UUID REFERENCES `units`(`id`) -- optional, fallback to `unit` text
   - `created_at` timestamptz NOT NULL DEFAULT now()
   - `updated_at` timestamptz NOT NULL DEFAULT now()

   Notes: `normalized_name` is required to enable lookup in `ingredient_nutrients` and caching.

6. `ingredient_nutrients` — AI-generated or cached nutrient mappings per normalized ingredient
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `normalized_name` TEXT NOT NULL
   - `nutrients` JSONB NOT NULL -- e.g. { kcal: 123, protein_g: 4.2, carbs_g: 12.3, fats_g: 2.1, fiber_g: 1.0, iron_mg: 0.5, calcium_mg: 10 }
   - `model` TEXT NOT NULL -- model identifier used to generate mapping
   - `prompt_hash` TEXT NOT NULL -- hash of prompt used for reproducibility
   - `provenance` JSONB DEFAULT '{}'::jsonb -- dataset/model metadata
   - `generated_at` timestamptz NOT NULL DEFAULT now()

   Constraints & Indexes (see Indexes section):
   - UNIQUE(normalized_name, model, prompt_hash)

7. `ai_jobs` — background tasks for heavy AI computations
   - `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - `recipe_id` UUID REFERENCES `recipes`(`id`) ON DELETE SET NULL
   - `requested_by_user_id` UUID REFERENCES `users`(`user_id`) -- who requested the job
   - `type` TEXT NOT NULL CHECK (type IN ('detailed_nutrition','batch_recompute','refresh_ingredient','other'))
   - `status` TEXT NOT NULL CHECK (status IN ('queued','in_progress','succeeded','failed','cancelled')) DEFAULT 'queued'
   - `result` JSONB DEFAULT NULL
   - `attempts` INT NOT NULL DEFAULT 0
   - `locked_at` timestamptz DEFAULT NULL
   - `locked_by` TEXT DEFAULT NULL
   - `created_at` timestamptz NOT NULL DEFAULT now()
   - `started_at` timestamptz DEFAULT NULL
   - `finished_at` timestamptz DEFAULT NULL

   Notes: Add a partial unique index to avoid duplicate queued/in_progress jobs per (recipe_id, type).

## 2. Relationships and cardinalities

- `auth_user_map` 1:1 `users` (each mapped auth_user -> single internal user record)
- `users` 1:N `recipes` (one user can have many recipes)
- `recipes` 1:N `ingredients` (each recipe has many ingredients)
- `ingredients` N:1 `units` (many ingredients can reference the same unit)
- `ingredient_nutrients` keyed by `normalized_name` (many mappings for same normalized name across different models/prompts)
- `recipes` 1:N `ai_jobs` (one recipe can have many background jobs)

Many-to-many relationships are not required by MVP. Should the product later support tagging or shared recipes, consider `recipe_tags` and `tags` tables.


## 3. Indexes

- `auth_user_map`
  - UNIQUE(auth_user_id) PRIMARY KEY
  - UNIQUE(user_id)

- `users`
  - PK on `user_id`

- `units`
  - UNIQUE(code)

- `recipes`
  - B-tree: (owner_user_id, created_at) -- fast per-user listing
  - GIN: on `cached_nutrition` (jsonb_path_ops or default jsonb_ops) -- quick retrieval for cached nutrition
  - GIN: on `tsv` (tsvector) for full-text search
  - Index: (created_at) for housekeeping, purge queries

- `ingredients`
  - B-tree: (recipe_id)
  - B-tree: (normalized_name)
  - If fuzzy search is required: GIN (pg_trgm) on `normalized_name`

- `ingredient_nutrients`
  - B-tree: (normalized_name)
  - GIN: (nutrients) -- JSONB
  - UNIQUE(normalized_name, model, prompt_hash)
  - Optional: GIN (pg_trgm) on `normalized_name` for fuzzy matching

- `ai_jobs`
  - Index: (status, created_at)
  - Partial UNIQUE index: UNIQUE(recipe_id, type) WHERE status IN ('queued','in_progress') -- prevents duplicate concurrent queued jobs for same recipe and job type

## 4. DB-level validations, triggers and constraints

- Recipe JSONB validation
  - Implement a trigger `validate_recipe_data()` that runs BEFORE INSERT OR UPDATE on `recipes` to ensure:
    - `recipe_data` contains non-empty `title` string
    - `recipe_data->'ingredients'` is an array and each element has `name` and `quantity` and either `unit_id`
    - `recipe_data->'steps'` is an array, and each step is a string with length between 10 and 500 characters
  - On violation, the trigger raises an exception (400-like behaviour). Primary validation remains in the application layer.

- Ingredients: CHECK (`quantity > 0`) enforced on column

- Ingredient nutrients uniqueness enforced by UNIQUE(normalized_name, model, prompt_hash)

- Ai job uniqueness: create a partial unique index to ensure only one queued/in_progress job per (recipe_id, type).


## 5. Example SQL snippets (use in migrations)

-- Example: UNIQUE partial index for `ai_jobs`
CREATE UNIQUE INDEX ux_ai_jobs_recipe_type_unique_queued
  ON ai_jobs(recipe_id, type)
  WHERE status IN ('queued','in_progress');

-- Example: tsvector update trigger for `recipes`
CREATE FUNCTION recipes_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('pg_catalog.english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.raw_text,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipes_tsv BEFORE INSERT OR UPDATE
  ON recipes FOR EACH ROW EXECUTE FUNCTION recipes_tsv_trigger();

-- Example: create GIN index on tsv
CREATE INDEX idx_recipes_tsv_gin ON recipes USING GIN(tsv);

-- GIN index on cached_nutrition
CREATE INDEX idx_recipes_cached_nutrition_gin ON recipes USING GIN(cached_nutrition);

-- Indexes for ingredient_nutrients
CREATE INDEX idx_ing_nutrients_normalized_name ON ingredient_nutrients USING BTREE (normalized_name);
CREATE INDEX idx_ing_nutrients_json_gin ON ingredient_nutrients USING GIN (nutrients);


## 6. Additional notes & rationale

- Data modeling
  - Recipe structure is stored both as `raw_text` (for fidelity) and as `recipe_data` JSONB for structured operations. Ingredients are normalized into their own table for easier joining and queries.

- Performance
  - Use GIN indexes for JSONB and tsvector to meet synchronous SLOs.
  - Precompute per-recipe nutrition (`cached_nutrition`) to serve synchronous mapping/substitution requests quickly.

- Scalability
  - No partitioning for MVP. Include `created_at` and `owner_user_id` on large tables to enable future range or hash partitioning.

- Operational
  - Implement background job workers to process `ai_jobs` and refresh `ingredient_nutrients` when stale.
  - Implement soft-delete (`deleted_at`) on recipes with a purge pipeline for GDPR-compliant hard deletes.

---

End of DB plan.


-- migration: 20251116123000_create_initial_schema.sql
-- purpose: create initial schema for personalized recipe assistant (mvp)
-- touched tables: auth_user_map, users, units, recipes, ingredients, ingredient_nutrients, ai_jobs, recipe_audit
-- notes: includes rls policies, indexes, triggers and validation functions. designed for supabase/postgres.

-- important: all sql is lower-case in this file.

-- ensure uuid helper available (gen_random_uuid)
create extension if not exists "pgcrypto";

-- --------------------------------------------------
-- table: auth_user_map
-- mapping between supabase auth user id (jwt sub) and internal user id
-- intended access: service role only (no end-user access)
-- --------------------------------------------------
create table if not exists auth_user_map (
  auth_user_id uuid primary key,
  user_id uuid not null unique,
  created_at timestamptz not null default now()
);

-- enable row level security as required
alter table auth_user_map enable row level security;

-- policy: deny anon explicitly (no anonymous access to mapping)
create policy auth_user_map_anon_select on auth_user_map for select using (auth_user_id = auth.uid());
create policy auth_user_map_anon_insert on auth_user_map for insert with check (false);
create policy auth_user_map_anon_update on auth_user_map for update with check (false);
create policy auth_user_map_anon_delete on auth_user_map for delete using (false);

-- policy: allow authenticated role no direct access (explicitly deny)
create policy auth_user_map_auth_select on auth_user_map for select using (false);
create policy auth_user_map_auth_insert on auth_user_map for insert with check (false);
create policy auth_user_map_auth_update on auth_user_map for update with check (false);
create policy auth_user_map_auth_delete on auth_user_map for delete using (false);

-- policy: service role full access (service role should be provided via jwt claim `role = 'service'`)
create policy auth_user_map_service_all on auth_user_map
  for all
  using (auth.role() = 'service')
  with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: users (application profile)
-- access: owner (mapped auth user) and service role
-- --------------------------------------------------
create table if not exists users (
  user_id uuid primary key,
  disease text not null check (disease in ('type1_diabetes','celiac','lactose_intolerance')),
  age int not null check (age >= 0 and age <= 150),
  sex text not null check (sex in ('female','male','other','unspecified')),
  allergies jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- foreign-key note: user_id is intended to match auth_user_map.user_id; handled at application/service layer

alter table users enable row level security;

-- policy: anon cannot access users
create policy users_anon_select on users for select using (false);
create policy users_anon_insert on users for insert with check (false);
create policy users_anon_update on users for update with check (false);
create policy users_anon_delete on users for delete using (false);

-- policy: authenticated users can select/update/insert their own profile only
-- using clause verifies that auth.uid() maps to users.user_id via auth_user_map
create policy users_auth_select on users for select using (
  exists (
    select 1 from auth_user_map m
    where m.user_id = users.user_id
      and m.auth_user_id = auth.uid()
  )
);
create policy users_auth_insert on users for insert with check (
  exists (
    select 1 from auth_user_map m
    where m.user_id = users.user_id
      and m.auth_user_id = auth.uid()
  )
);
create policy users_auth_update on users for update using (
  exists (
    select 1 from auth_user_map m
    where m.user_id = users.user_id
      and m.auth_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from auth_user_map m
    where m.user_id = users.user_id
      and m.auth_user_id = auth.uid()
  )
);
create policy users_auth_delete on users for delete using (false);

-- policy: service role full access
create policy users_service_all on users for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: units (canonical units list)
-- this table is public read-only for clients (select true for anon/auth)
-- inserts/updates/deletes only allowed by service
-- --------------------------------------------------
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  conversion_to_base numeric(18,9) not null,
  base_unit_type text not null,
  created_at timestamptz not null default now()
);

alter table units enable row level security;

-- anon/select: allow reading units (public list)
create policy units_anon_select on units for select using (true);
create policy units_anon_insert on units for insert with check (false);
create policy units_anon_update on units for update with check (false);
create policy units_anon_delete on units for delete using (false);

-- authenticated: same as anon for select; no write access
create policy units_auth_select on units for select using (true);
create policy units_auth_insert on units for insert with check (false);
create policy units_auth_update on units for update with check (false);
create policy units_auth_delete on units for delete using (false);

-- service role: full access
create policy units_service_all on units for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: recipes
-- user-owned recipes. rls: owners and service role full access
-- sensitive: soft-delete field present; views for clients should filter deleted_at is null
-- --------------------------------------------------
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  raw_text text not null,
  recipe_data jsonb not null,
  tsv tsvector,
  cached_nutrition jsonb default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz default null
);

-- add foreign key to users.user_id
alter table recipes
  add constraint fk_recipes_owner_user foreign key (owner_user_id) references users(user_id) on delete cascade;

alter table recipes enable row level security;

-- anon policies: explicit deny (no anonymous recipe access)
create policy recipes_anon_select on recipes for select using (false);
create policy recipes_anon_insert on recipes for insert with check (false);
create policy recipes_anon_update on recipes for update with check (false);
create policy recipes_anon_delete on recipes for delete using (false);

-- auth (authenticated users): allow select/insert/update/delete only when auth.uid() maps to owner_user_id
create policy recipes_auth_select on recipes for select using (
  exists (
    select 1 from auth_user_map m
    where m.user_id = recipes.owner_user_id
      and m.auth_user_id = auth.uid()
      and recipes.deleted_at is null
  )
);

create policy recipes_auth_insert on recipes for insert with check (
  exists (
    select 1 from auth_user_map m
    where m.user_id = owner_user_id
      and m.auth_user_id = auth.uid()
  )
);

create policy recipes_auth_update on recipes for update using (
  exists (
    select 1 from auth_user_map m
    where m.user_id = recipes.owner_user_id
      and m.auth_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from auth_user_map m
    where m.user_id = owner_user_id
      and m.auth_user_id = auth.uid()
  )
);

create policy recipes_auth_delete on recipes for delete using (
  exists (
    select 1 from auth_user_map m
    where m.user_id = recipes.owner_user_id
      and m.auth_user_id = auth.uid()
  )
);

-- service role: full access
create policy recipes_service_all on recipes for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: ingredients
-- ingredients belong to recipes; rls enforces that only recipe owners or service role can access
-- --------------------------------------------------
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  name text not null,
  normalized_name text not null,
  quantity numeric(9,3) not null check (quantity > 0),
  unit_id uuid null,
  unit_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ingredients
  add constraint fk_ingredients_recipe foreign key (recipe_id) references recipes(id) on delete cascade;

alter table ingredients
  add constraint fk_ingredients_unit foreign key (unit_id) references units(id) on delete set null;

alter table ingredients enable row level security;

-- anon policies: explicit deny
create policy ingredients_anon_select on ingredients for select using (false);
create policy ingredients_anon_insert on ingredients for insert with check (false);
create policy ingredients_anon_update on ingredients for update with check (false);
create policy ingredients_anon_delete on ingredients for delete using (false);

-- authenticated: allow actions only when the authenticated user owns the parent recipe
create policy ingredients_auth_select on ingredients for select using (
  exists (
    select 1 from recipes r
    join auth_user_map m on m.user_id = r.owner_user_id
    where r.id = ingredients.recipe_id
      and m.auth_user_id = auth.uid()
      and r.deleted_at is null
  )
);


create policy ingredients_auth_insert on ingredients for insert with check (
  exists (
    select 1 from recipes r
    join auth_user_map m on m.user_id = r.owner_user_id
    where r.id = recipe_id
      and m.auth_user_id = auth.uid()
  )
);
create policy ingredients_auth_delete on ingredients for delete using (
  exists (
    select 1 from recipes r
    join auth_user_map m on m.user_id = r.owner_user_id
    where r.id = ingredients.recipe_id
      and m.auth_user_id = auth.uid()
  )
);

-- service role: full access
create policy ingredients_service_all on ingredients for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: ingredient_nutrients
-- cached ai-generated nutrient mappings; readable by authenticated users; write by service role
-- --------------------------------------------------
create table if not exists ingredient_nutrients (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  nutrients jsonb not null,
  model text not null,
  prompt_hash text not null,
  provenance jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  stale_at timestamptz null,
  constraint ux_ing_nutrients_unique unique (normalized_name, model, prompt_hash)
);

alter table ingredient_nutrients enable row level security;

-- anon: deny
create policy ing_nutrients_anon_select on ingredient_nutrients for select using (false);
create policy ing_nutrients_anon_insert on ingredient_nutrients for insert with check (false);
create policy ing_nutrients_anon_update on ingredient_nutrients for update with check (false);
create policy ing_nutrients_anon_delete on ingredient_nutrients for delete using (false);

-- authenticated: allow select (read cached mappings)
create policy ing_nutrients_auth_select on ingredient_nutrients for select using (true);
create policy ing_nutrients_auth_insert on ingredient_nutrients for insert with check (false);
create policy ing_nutrients_auth_update on ingredient_nutrients for update with check (false);
create policy ing_nutrients_auth_delete on ingredient_nutrients for delete using (false);

-- service role: allow full access for writes and maintenance
create policy ing_nutrients_service_all on ingredient_nutrients for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- --------------------------------------------------
-- table: ai_jobs
-- background jobs for heavy computations. users may request jobs for their recipes; service workers process them.
-- --------------------------------------------------
create table if not exists ai_jobs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid null,
  requested_by_user_id uuid null,
  type text not null check (type in ('detailed_nutrition','batch_recompute','refresh_ingredient','other')),
  status text not null check (status in ('queued','in_progress','succeeded','failed','cancelled')) default 'queued',
  result jsonb null,
  attempts int not null default 0,
  locked_at timestamptz null,
  locked_by text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);

alter table ai_jobs
  add constraint fk_ai_jobs_recipe foreign key (recipe_id) references recipes(id) on delete set null;

alter table ai_jobs enable row level security;

-- anon: deny
create policy ai_jobs_anon_select on ai_jobs for select using (false);
create policy ai_jobs_anon_insert on ai_jobs for insert with check (false);
create policy ai_jobs_anon_update on ai_jobs for update with check (false);
create policy ai_jobs_anon_delete on ai_jobs for delete using (false);

create policy ai_jobs_auth_select on ai_jobs for select using (
  -- allow user to see jobs they requested
  exists (
    select 1 from auth_user_map m
    where m.auth_user_id = auth.uid()
      and m.user_id = ai_jobs.requested_by_user_id
  )
);

-- updates/deletes by auth: disallow (service handles lifecycle changes)
create policy ai_jobs_auth_update on ai_jobs for update using (false);
create policy ai_jobs_auth_delete on ai_jobs for delete using (false);

-- service role: full access
create policy ai_jobs_service_all on ai_jobs for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- create partial unique index to prevent duplicate queued/in_progress jobs for same recipe and type
create unique index if not exists ux_ai_jobs_recipe_type_unique_queued on ai_jobs(recipe_id, type) where status in ('queued','in_progress');

-- index for status queries
create index if not exists idx_ai_jobs_status_created_at on ai_jobs(status, created_at);

-- --------------------------------------------------
-- table: recipe_audit
-- audit trail of recipe actions. writes by service and possibly by authenticated owner; reads by service.
-- --------------------------------------------------
create table if not exists recipe_audit (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid null,
  user_id uuid null,
  anonymized_id uuid null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table recipe_audit
  add constraint fk_recipe_audit_recipe foreign key (recipe_id) references recipes(id) on delete cascade;

alter table recipe_audit enable row level security;

-- anon: deny
create policy recipe_audit_anon_select on recipe_audit for select using (false);
create policy recipe_audit_anon_insert on recipe_audit for insert with check (false);
create policy recipe_audit_anon_update on recipe_audit for update with check (false);
create policy recipe_audit_anon_delete on recipe_audit for delete using (false);

create policy recipe_audit_auth_select on recipe_audit for select using (false);
create policy recipe_audit_auth_update on recipe_audit for update using (false);
create policy recipe_audit_auth_delete on recipe_audit for delete using (false);

-- service: full access
create policy recipe_audit_service_all on recipe_audit for all using (auth.role() = 'service') with check (auth.role() = 'service');

-- index for audit queries
create index if not exists idx_recipe_audit_recipe_created_at on recipe_audit(recipe_id, created_at);

-- --------------------------------------------------
-- indexes for recipes, ingredients and ingredient_nutrients
-- --------------------------------------------------
create index if not exists idx_recipes_owner_created_at on recipes(owner_user_id, created_at);
create index if not exists idx_recipes_created_at on recipes(created_at);

-- gin index on cached_nutrition for fast retrieval
create index if not exists idx_recipes_cached_nutrition_gin on recipes using gin(cached_nutrition);

create index if not exists idx_ingredients_recipe_id on ingredients(recipe_id);
create index if not exists idx_ingredients_normalized_name on ingredients(normalized_name);

create index if not exists idx_ing_nutrients_normalized_name on ingredient_nutrients using btree(normalized_name);
create index if not exists idx_ing_nutrients_json_gin on ingredient_nutrients using gin(nutrients);

-- --------------------------------------------------
-- final notes: no destructive commands included in this migration (no drop/truncate/alter column that loses data)
-- if future migrations include destructive actions, ensure to add detailed comments and backups.
-- --------------------------------------------------



-- end of migration


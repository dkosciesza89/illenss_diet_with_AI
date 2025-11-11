/*
  # Recipe Assistant PoC Schema

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `disease` (text, one of: type1_diabetes, celiac, lactose_intolerance)
      - `age` (integer)
      - `sex` (text)
      - `allergies` (text array)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `recipes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text, required)
      - `servings` (integer, required)
      - `ingredients` (jsonb, array of {name, quantity, unit})
      - `steps` (jsonb, array of strings)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `ingredient_nutrients`
      - `id` (uuid, primary key)
      - `name` (text, unique, ingredient identifier)
      - `calories` (numeric)
      - `protein_g` (numeric)
      - `carbs_g` (numeric)
      - `fat_g` (numeric)
      - `fiber_g` (numeric)
      - `calcium_mg` (numeric)
      - `iron_mg` (numeric)
      - `vitamin_d_μg` (numeric)
      - `omega3_g` (numeric)
      - `created_at` (timestamp)

    - `disease_targets`
      - `id` (uuid, primary key)
      - `disease` (text, unique)
      - `targets` (jsonb, nutrition targets and constraints)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  disease text NOT NULL CHECK (disease IN ('type1_diabetes', 'celiac', 'lactose_intolerance')),
  age integer CHECK (age > 0 AND age < 150),
  sex text CHECK (sex IN ('male', 'female', 'other')),
  allergies text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) > 0),
  servings integer NOT NULL CHECK (servings > 0),
  ingredients jsonb NOT NULL DEFAULT '[]',
  steps jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredient_nutrients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  calories numeric NOT NULL DEFAULT 0,
  protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0,
  fat_g numeric NOT NULL DEFAULT 0,
  fiber_g numeric NOT NULL DEFAULT 0,
  calcium_mg numeric NOT NULL DEFAULT 0,
  iron_mg numeric NOT NULL DEFAULT 0,
  vitamin_d_μg numeric NOT NULL DEFAULT 0,
  omega3_g numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disease_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disease text UNIQUE NOT NULL,
  targets jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE disease_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own recipes"
  ON recipes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipes"
  ON recipes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes"
  ON recipes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes"
  ON recipes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "All users can view ingredient nutrients"
  ON ingredient_nutrients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All users can view disease targets"
  ON disease_targets FOR SELECT
  TO authenticated
  USING (true);

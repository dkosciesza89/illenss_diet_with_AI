export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  id?: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  created_at?: string;
}

export interface UserProfile {
  disease: 'type1_diabetes' | 'celiac' | 'lactose_intolerance';
  age?: number;
  sex?: 'male' | 'female' | 'other';
  allergies?: string[];
}

export interface NutritionData {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  iron_mg: number;
  vitamin_d_μg: number;
  omega3_g: number;
}

export interface ModifyResponse {
  recipe: Recipe;
  nutrition: {
    total: NutritionData;
    perServing: NutritionData;
  };
  targets: any;
  percentages: any;
  substitutions?: Array<{
    original: string;
    substitute: string;
    reason: string;
  }>;
}

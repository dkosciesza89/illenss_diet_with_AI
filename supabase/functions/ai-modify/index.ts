import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

interface Recipe {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
}

interface UserProfile {
  disease: string;
  age?: number;
  sex?: string;
  allergies?: string[];
}

interface ModifyRequest {
  recipeId?: string;
  recipePayload?: Recipe;
  operation: "substitute" | "scale" | "map_nutrients";
  userProfile: UserProfile;
  scaleFactor?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization")!;
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: ModifyRequest = await req.json();

    let recipe: Recipe;
    if (body.recipeId) {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", body.recipeId)
        .maybeSingle();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Recipe not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      recipe = {
        title: data.title,
        servings: data.servings,
        ingredients: data.ingredients,
        steps: data.steps,
      };
    } else if (body.recipePayload) {
      recipe = body.recipePayload;
    } else {
      return new Response(
        JSON.stringify({ error: "Either recipeId or recipePayload is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: nutrients } = await supabase
      .from("ingredient_nutrients")
      .select("*");

    const { data: diseaseTargets } = await supabase
      .from("disease_targets")
      .select("*")
      .eq("disease", body.userProfile.disease)
      .maybeSingle();

    if (body.operation === "map_nutrients") {
      const nutritionData = calculateNutrition(recipe, nutrients || []);
      const targets = diseaseTargets?.targets || {};
      
      return new Response(
        JSON.stringify({
          recipe,
          nutrition: nutritionData,
          targets,
          percentages: calculatePercentages(nutritionData, targets),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.operation === "scale") {
      const scaleFactor = body.scaleFactor || 1;
      const scaledRecipe = {
        ...recipe,
        servings: Math.round(recipe.servings * scaleFactor),
        ingredients: recipe.ingredients.map(ing => ({
          ...ing,
          quantity: ing.quantity * scaleFactor,
        })),
      };

      const nutritionData = calculateNutrition(scaledRecipe, nutrients || []);
      const targets = diseaseTargets?.targets || {};

      return new Response(
        JSON.stringify({
          recipe: scaledRecipe,
          nutrition: nutritionData,
          targets,
          percentages: calculatePercentages(nutritionData, targets),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.operation === "substitute") {
      if (!openrouterKey) {
        return new Response(
          JSON.stringify({ error: "OpenRouter API key not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const prompt = `You are a nutrition expert. Given this recipe and user health profile, suggest ingredient substitutions.

Recipe:
Title: ${recipe.title}
Servings: ${recipe.servings}
Ingredients:
${recipe.ingredients.map(i => `- ${i.quantity} ${i.unit} ${i.name}`).join('\n')}

User Profile:
Disease: ${body.userProfile.disease}
Allergies: ${body.userProfile.allergies?.join(', ') || 'none'}

Disease Targets: ${JSON.stringify(diseaseTargets?.targets || {})}

Available ingredients in our database: ${(nutrients || []).map(n => n.name).join(', ')}

Please suggest substitutions that:
1. Are suitable for ${body.userProfile.disease}
2. Avoid allergens: ${body.userProfile.allergies?.join(', ') || 'none'}
3. Use only ingredients from our database
4. Maintain similar culinary purpose

Respond with a JSON object containing:
{
  "substitutions": [
    {"original": "ingredient_name", "substitute": "new_ingredient_name", "reason": "explanation"}
  ],
  "modifiedRecipe": {
    "title": "new title",
    "servings": number,
    "ingredients": [{"name": "...", "quantity": number, "unit": "..."}],
    "steps": ["..."]
  }
}`;

      const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-sonnet",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({ error: "AI service error" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices[0]?.message?.content || "{}";
      
      let parsedResponse;
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
      } catch {
        parsedResponse = { substitutions: [], modifiedRecipe: recipe };
      }

      const modifiedRecipe = parsedResponse.modifiedRecipe || recipe;
      const nutritionData = calculateNutrition(modifiedRecipe, nutrients || []);
      const targets = diseaseTargets?.targets || {};

      return new Response(
        JSON.stringify({
          substitutions: parsedResponse.substitutions || [],
          recipe: modifiedRecipe,
          nutrition: nutritionData,
          targets,
          percentages: calculatePercentages(nutritionData, targets),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid operation" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function calculateNutrition(recipe: Recipe, nutrients: any[]) {
  const totals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    calcium_mg: 0,
    iron_mg: 0,
    vitamin_d_μg: 0,
    omega3_g: 0,
  };

  for (const ingredient of recipe.ingredients) {
    const nutrient = nutrients.find(n => n.name === ingredient.name);
    if (nutrient) {
      const factor = ingredient.quantity / 100;
      totals.calories += Number(nutrient.calories) * factor;
      totals.protein_g += Number(nutrient.protein_g) * factor;
      totals.carbs_g += Number(nutrient.carbs_g) * factor;
      totals.fat_g += Number(nutrient.fat_g) * factor;
      totals.fiber_g += Number(nutrient.fiber_g) * factor;
      totals.calcium_mg += Number(nutrient.calcium_mg) * factor;
      totals.iron_mg += Number(nutrient.iron_mg) * factor;
      totals.vitamin_d_μg += Number(nutrient.vitamin_d_μg) * factor;
      totals.omega3_g += Number(nutrient.omega3_g) * factor;
    }
  }

  const perServing: any = {};
  for (const key in totals) {
    totals[key] = Math.round(totals[key] * 10) / 10;
    perServing[key] = Math.round((totals[key] / recipe.servings) * 10) / 10;
  }

  return { total: totals, perServing };
}

function calculatePercentages(nutrition: any, targets: any) {
  const percentages: any = {};
  const perServing = nutrition.perServing;

  for (const key in targets) {
    if (key.endsWith('_g') || key.endsWith('_mg') || key.endsWith('_μg')) {
      const nutrientKey = key;
      if (perServing[nutrientKey] !== undefined) {
        percentages[key] = Math.round((perServing[nutrientKey] / targets[key]) * 100);
      }
    }
  }

  return percentages;
}
# Personalized Recipe Assistant - Proof of Concept

A minimal PoC demonstrating core functionality: recipe storage, ingredient to nutrient mapping, and AI-powered recipe modifications tailored to specific health conditions.

## Features

- **Recipe Management**: Create and store recipes with structured data (ingredients, steps, servings)
- **Nutrient Mapping**: Automatic calculation of nutritional values from ingredient database
- **AI Modifications**:
  - Smart ingredient substitutions based on health conditions
  - Recipe scaling with automatic nutrient recalculation
- **Health Profiles**: Support for Type 1 Diabetes, Celiac Disease, and Lactose Intolerance
- **Nutrition Analysis**: Per-serving breakdown and % of daily targets

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL (Supabase)
- **AI**: OpenRouter.ai (Claude 3.5 Sonnet)
- **Auth**: Supabase Auth (email/password)

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (database is pre-configured)
- OpenRouter API key (optional, for AI substitutions)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Environment variables are already configured in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. (Optional) Configure OpenRouter API key in Supabase Dashboard:
   - Navigate to Edge Functions settings
   - Add secret: `OPENROUTER_API_KEY=your_key_here`

### Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

## Database Schema

### Tables

- **user_profiles**: Health profiles (disease, age, sex, allergies)
- **recipes**: User recipes with JSONB ingredients and steps
- **ingredient_nutrients**: Nutrition data per 100g (calories, protein, carbs, etc.)
- **disease_targets**: Daily nutrition targets per condition

### Seed Data

6 ingredients pre-loaded:
- chicken_breast
- whole_milk
- wheat_flour
- olive_oil
- spinach
- salmon

3 disease profiles with targets:
- type1_diabetes (carbs focus)
- celiac (gluten avoidance)
- lactose_intolerance (dairy alternatives, calcium)

## API Endpoints

### POST /recipes
Create a new recipe
```json
{
  "title": "Grilled Chicken Salad",
  "servings": 4,
  "ingredients": [
    { "name": "chicken_breast", "quantity": 200, "unit": "g" },
    { "name": "spinach", "quantity": 100, "unit": "g" }
  ],
  "steps": [
    "Grill the chicken breast until fully cooked, about 6-8 minutes per side.",
    "Chop the spinach and mix with grilled chicken in a bowl."
  ]
}
```

### GET /recipes
List all recipes for authenticated user

### GET /recipes/:id
Get single recipe by ID

### POST /ai-modify
Modify recipe with AI or calculations
```json
{
  "recipeId": "uuid-here",
  "operation": "substitute" | "scale" | "map_nutrients",
  "userProfile": {
    "disease": "type1_diabetes",
    "age": 30,
    "sex": "male",
    "allergies": []
  },
  "scaleFactor": 2.0
}
```

## Usage Flow

1. Sign up / Sign in
2. Set up health profile (disease, allergies)
3. Create a recipe using ingredient names from the database
4. View automatic nutrition analysis per serving
5. Request AI substitutions for healthier alternatives
6. Scale recipe portions as needed

## PoC Limitations

- Minimal ingredient database (6 items)
- Simple nutrient calculations (no cooking loss factors)
- Basic AI prompts (production would need fine-tuning)
- No recipe search or filtering
- No meal planning features

## Testing

### Manual Test Scenario

1. Create user: `test@example.com`
2. Set profile: Type 1 Diabetes
3. Create recipe:
   - Title: "Salmon with Spinach"
   - Servings: 2
   - Ingredients: 200g salmon, 150g spinach, 10g olive_oil
   - Steps: "Cook salmon for 10 minutes. Sauté spinach in olive oil for 3 minutes."
4. Verify nutrition shows carbs under target
5. Click "Get AI Substitutions" (requires OpenRouter key)
6. Scale to 4 servings, verify doubled quantities

## Production Considerations

- Expand ingredient database (100s-1000s of items)
- Add fuzzy matching for ingredient names
- Implement caching for AI responses
- Add recipe search and tags
- Support meal plans and shopping lists
- Mobile responsive design improvements
- Comprehensive error handling
- Rate limiting on API endpoints

## License

MIT

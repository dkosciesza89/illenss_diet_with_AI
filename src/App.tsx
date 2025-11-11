import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { ProfileSetup } from './components/ProfileSetup';
import { RecipeForm } from './components/RecipeForm';
import { RecipeAnalysis } from './components/RecipeAnalysis';
import { UserProfile, ModifyResponse } from './types';
import { ChefHat, Sparkles, LogOut, Scale } from 'lucide-react';

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<ModifyResponse | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile({
        disease: data.disease,
        age: data.age,
        sex: data.sex,
        allergies: data.allergies,
      });
    }
  };

  const handleProfileComplete = async (newProfile: UserProfile) => {
    if (!session) return;

    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        id: session.user.id,
        disease: newProfile.disease,
        age: newProfile.age,
        sex: newProfile.sex,
        allergies: newProfile.allergies,
      });

    if (!error) {
      setProfile(newProfile);
    }
  };

  const handleRecipeSubmit = async (recipe: any) => {
    setOperationLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recipes`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(recipe),
      });

      const savedRecipe = await response.json();

      if (profile) {
        await analyzeRecipe(savedRecipe.id, 'map_nutrients');
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
    } finally {
      setOperationLoading(false);
    }
  };

  const analyzeRecipe = async (recipeId: string, operation: string) => {
    setOperationLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-modify`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const body: any = {
        recipeId,
        operation,
        userProfile: profile,
      };

      if (operation === 'scale') {
        body.scaleFactor = scaleFactor;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();
      setAnalysis(data);
    } catch (error) {
      console.error('Error analyzing recipe:', error);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAnalysis(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <ProfileSetup onComplete={handleProfileComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChefHat size={32} className="text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Recipe Assistant
                </h1>
                <p className="text-sm text-gray-600">
                  Personalized for {profile.disease.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Create Recipe
              </h2>
              <RecipeForm onSubmit={handleRecipeSubmit} loading={operationLoading} />
            </div>

            {analysis && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Recipe Actions
                </h2>
                <div className="space-y-3">
                  <button
                    onClick={() => analyzeRecipe(analysis.recipe.id!, 'substitute')}
                    disabled={operationLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Sparkles size={18} />
                    Get AI Substitutions
                  </button>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Scale Recipe
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={scaleFactor}
                        onChange={(e) => setScaleFactor(Number(e.target.value))}
                        min={0.5}
                        max={10}
                        step={0.5}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                      />
                      <button
                        onClick={() => analyzeRecipe(analysis.recipe.id!, 'scale')}
                        disabled={operationLoading}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Scale size={18} />
                        Scale
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            {operationLoading ? (
              <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-center h-64">
                <div className="text-gray-600">Analyzing recipe...</div>
              </div>
            ) : analysis ? (
              <RecipeAnalysis analysis={analysis} />
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-center h-64">
                <div className="text-center text-gray-500">
                  <ChefHat size={48} className="mx-auto mb-3 text-gray-400" />
                  <p>Create a recipe to see nutrition analysis</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

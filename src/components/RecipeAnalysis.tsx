import { ModifyResponse } from '../types';
import { Activity, TrendingUp } from 'lucide-react';

interface RecipeAnalysisProps {
  analysis: ModifyResponse;
}

export function RecipeAnalysis({ analysis }: RecipeAnalysisProps) {
  const { recipe, nutrition, targets, percentages, substitutions } = analysis;

  return (
    <div className="space-y-6">
      {substitutions && substitutions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-blue-600" />
            Recommended Substitutions
          </h3>
          <div className="space-y-3">
            {substitutions.map((sub, index) => (
              <div key={index} className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-600 line-through">{sub.original}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-medium">{sub.substitute}</span>
                </div>
                <p className="text-sm text-gray-600">{sub.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          {recipe.title}
        </h3>
        <p className="text-gray-600 mb-4">
          Servings: {recipe.servings}
        </p>

        <div className="mb-6">
          <h4 className="font-semibold text-gray-900 mb-2">Ingredients:</h4>
          <ul className="space-y-1">
            {recipe.ingredients.map((ing, index) => (
              <li key={index} className="text-gray-700">
                {ing.quantity} {ing.unit} {ing.name}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Steps:</h4>
          <ol className="space-y-2 list-decimal list-inside">
            {recipe.steps.map((step, index) => (
              <li key={index} className="text-gray-700">
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-green-600" />
          Nutrition per Serving
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(nutrition.perServing).map(([key, value]) => (
            <div key={key} className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">
                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {typeof value === 'number' ? value.toFixed(1) : value}
              </p>
              {percentages[key] && (
                <p className={`text-xs mt-1 ${
                  percentages[key] > 100 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {percentages[key]}% of target
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {Object.keys(targets).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Daily Targets for Your Profile
          </h3>
          <div className="space-y-2">
            {Object.entries(targets).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-gray-700">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
                <span className="font-medium text-gray-900">
                  {typeof value === 'number' ? value : JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

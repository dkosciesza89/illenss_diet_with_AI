import { useState } from 'react';
import { UserProfile } from '../types';

interface ProfileSetupProps {
  onComplete: (profile: UserProfile) => void;
}

export function ProfileSetup({ onComplete }: ProfileSetupProps) {
  const [disease, setDisease] = useState<UserProfile['disease']>('type1_diabetes');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<UserProfile['sex']>('other');
  const [allergies, setAllergies] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      disease,
      age: age ? Number(age) : undefined,
      sex,
      allergies: allergies ? allergies.split(',').map(a => a.trim()) : [],
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Set Up Your Profile
      </h2>
      <p className="text-gray-600 mb-6">
        Help us personalize recipes for your health needs
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Health Condition
          </label>
          <select
            value={disease}
            onChange={(e) => setDisease(e.target.value as UserProfile['disease'])}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="type1_diabetes">Type 1 Diabetes</option>
            <option value="celiac">Celiac Disease</option>
            <option value="lactose_intolerance">Lactose Intolerance</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Age (optional)
          </label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            min={1}
            max={150}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            placeholder="30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sex (optional)
          </label>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as UserProfile['sex'])}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Allergies (optional, comma-separated)
          </label>
          <input
            type="text"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            placeholder="nuts, shellfish"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg transition"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

import React from 'react';
import { GenerationProgress } from '../types';
import { Loader2 } from 'lucide-react';

interface Props {
  progress: GenerationProgress;
}

const LoadingStep: React.FC<Props> = ({ progress }) => {
  const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 animate-in fade-in duration-700">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-20 rounded-full"></div>
        <Loader2 size={64} className="text-blue-500 animate-spin relative z-10" />
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-2">{progress.currentAction}</h2>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Our AI is analyzing your content and applying pedagogical principles to create the perfect lesson.
      </p>

      <div className="w-full max-w-md bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-700">
        <div 
          className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-2 text-sm text-gray-500 font-mono">
        {percentage}% Complete ({progress.completed}/{progress.total})
      </div>
    </div>
  );
};

export default LoadingStep;
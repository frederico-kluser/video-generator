import React, { useState } from 'react';
import { ProjectData, AspectRatio } from '../types';
import { BookOpen, Video, LayoutTemplate } from 'lucide-react';

interface Props {
  onStart: (data: Partial<ProjectData>) => void;
}

const InputStep: React.FC<Props> = ({ onStart }) => {
  const [topic, setTopic] = useState('');
  const [materials, setMaterials] = useState('');
  const [audience, setAudience] = useState('High School Students');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.PORTRAIT);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !materials) return;
    onStart({ topic, materials, audience, aspectRatio });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto p-6 w-full overflow-y-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          EduScript AI
        </h1>
        <p className="text-gray-400">Turn your knowledge into engaging educational videos.</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-6 bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl">
        
        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <BookOpen size={16} /> What do you want to teach?
          </label>
          <input
            type="text"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            placeholder="e.g. The Pythagorean Theorem"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          />
        </div>

        {/* Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Target Audience
          </label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option>Elementary School (K-5)</option>
            <option>High School (6-12)</option>
            <option>University / Adult</option>
            <option>General Public</option>
          </select>
        </div>

        {/* Materials */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Paste your source material or rough notes
          </label>
          <textarea
            className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none"
            placeholder="Paste text from articles, your notes, or a transcript..."
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            required
          />
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <LayoutTemplate size={16} /> Video Format
          </label>
          <div className="grid grid-cols-3 gap-4">
            {[
              { id: AspectRatio.PORTRAIT, label: 'Shorts/TikTok', icon: '9:16' },
              { id: AspectRatio.LANDSCAPE, label: 'YouTube', icon: '16:9' },
              { id: AspectRatio.SQUARE, label: 'Post', icon: '1:1' },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setAspectRatio(fmt.id as AspectRatio)}
                className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                  aspectRatio === fmt.id
                    ? 'bg-blue-500/20 border-blue-500 text-blue-200'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="text-xs font-mono font-bold bg-gray-800 px-2 py-1 rounded">{fmt.icon}</span>
                <span className="text-sm font-medium">{fmt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 group"
        >
          <Video className="group-hover:scale-110 transition-transform" />
          Generate Script & Slides
        </button>
      </form>
    </div>
  );
};

export default InputStep;
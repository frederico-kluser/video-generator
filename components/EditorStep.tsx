import React, { useState, useEffect } from 'react';
import { Slide, AspectRatio } from '../types';
import { ChevronLeft, ChevronRight, RefreshCw, MessageSquare, Mic } from 'lucide-react';
import { refineContent, generateSlideImage } from '../services/geminiService';

interface Props {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
}

const EditorStep: React.FC<Props> = ({ slides, aspectRatio, onUpdateSlide, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isProcessingFeedback, setIsProcessingFeedback] = useState(false);

  const currentSlide = slides[currentIndex];
  
  // Calculate aspect ratio class
  const arClass = 
    aspectRatio === AspectRatio.PORTRAIT ? 'aspect-[9/16]' :
    aspectRatio === AspectRatio.LANDSCAPE ? 'aspect-[16/9]' :
    'aspect-square';

  const handleNext = () => {
    if (currentIndex < slides.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) return;
    setIsProcessingFeedback(true);
    
    try {
      // 1. Refine text/prompt with Gemini
      const refinements = await refineContent(currentSlide, feedback);
      
      // Update text immediately
      onUpdateSlide(currentSlide.id, {
        scriptText: refinements.scriptText,
        visualPrompt: refinements.visualPrompt,
        userNotes: feedback, // Save feedback history
        isRegeneratingImage: true
      });
      
      setFeedback('');

      // 2. Trigger Image Regeneration in background
      generateSlideImage(refinements.visualPrompt, aspectRatio)
        .then(url => {
          onUpdateSlide(currentSlide.id, { 
            imageUrl: url,
            isRegeneratingImage: false 
          });
        })
        .catch(err => {
          console.error("Failed to regenerate image", err);
          onUpdateSlide(currentSlide.id, { isRegeneratingImage: false });
        });

    } catch (e) {
      console.error(e);
      alert("Failed to process feedback");
    } finally {
      setIsProcessingFeedback(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm z-20">
        <div className="text-sm font-medium text-gray-400">
          Slide {currentIndex + 1} of {slides.length}
        </div>
        <button 
          onClick={onFinish}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
        >
          <Mic size={16} /> Start Recording
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* Visual Preview Area */}
        <div className="flex-1 bg-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Navigation Arrows */}
          <button 
            onClick={handlePrev} 
            disabled={currentIndex === 0}
            className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-white/20 disabled:opacity-30 transition"
          >
            <ChevronLeft />
          </button>
          <button 
            onClick={handleNext} 
            disabled={currentIndex === slides.length - 1}
            className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-white/20 disabled:opacity-30 transition"
          >
            <ChevronRight />
          </button>

          {/* Slide Content */}
          <div className={`relative w-full max-h-full ${arClass} max-w-3xl shadow-2xl bg-black rounded-lg overflow-hidden border border-gray-800 ring-1 ring-white/10`}>
             {currentSlide.imageUrl ? (
               <img 
                src={currentSlide.imageUrl} 
                alt="Slide visual" 
                className={`w-full h-full object-cover transition-opacity duration-500 ${currentSlide.isRegeneratingImage ? 'opacity-50 blur-sm' : 'opacity-100'}`}
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500 animate-pulse">
                 Generating Visual...
               </div>
             )}
             
             {currentSlide.isRegeneratingImage && (
               <div className="absolute inset-0 flex items-center justify-center">
                 <RefreshCw className="animate-spin text-white drop-shadow-lg" size={48} />
               </div>
             )}

             {/* Script Overlay (Optional for preview) */}
             <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pt-12">
               <p className="text-white text-lg font-medium leading-relaxed drop-shadow-md">
                 {currentSlide.scriptText}
               </p>
             </div>
          </div>
        </div>

        {/* Editor Sidebar */}
        <div className="w-full md:w-96 bg-gray-950 border-l border-gray-800 flex flex-col z-10 shadow-xl">
           <div className="p-4 border-b border-gray-800">
             <h3 className="font-semibold text-gray-200 mb-1">Editor & Feedback</h3>
             <p className="text-xs text-gray-500">Edit text or describe changes for the AI.</p>
           </div>

           <div className="flex-1 p-4 overflow-y-auto space-y-6">
             {/* Script Edit */}
             <div>
               <label className="block text-xs font-uppercase font-bold text-gray-500 mb-2">Narration Script</label>
               <textarea 
                 className="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
                 value={currentSlide.scriptText}
                 onChange={(e) => onUpdateSlide(currentSlide.id, { scriptText: e.target.value })}
               />
             </div>

             {/* Feedback Input */}
             <div className="bg-blue-900/10 border border-blue-900/30 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-blue-400 mb-2">
                  <MessageSquare size={14} /> AI Revision
                </label>
                <textarea 
                  className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:ring-1 focus:ring-blue-500 focus:outline-none mb-3 resize-none"
                  placeholder="e.g. 'Make the image more colorful' or 'Shorten the text'"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={isProcessingFeedback}
                />
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedback || isProcessingFeedback}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  {isProcessingFeedback ? <RefreshCw className="animate-spin" size={14} /> : 'Apply Changes'}
                </button>
             </div>

             <div className="text-xs text-gray-600">
               <p className="mb-1 font-bold">Current Visual Prompt:</p>
               <p className="italic opacity-70 truncate">{currentSlide.visualPrompt}</p>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default EditorStep;
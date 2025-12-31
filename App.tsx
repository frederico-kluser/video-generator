import React, { useState } from 'react';
import { AppStep, ProjectData, Slide, GenerationProgress, AspectRatio } from './types';
import InputStep from './components/InputStep';
import LoadingStep from './components/LoadingStep';
import EditorStep from './components/EditorStep';
import RecordingStep from './components/RecordingStep';
import PreviewStep from './components/PreviewStep';
import { generateScriptFromMaterials, generateSlideImage } from './services/geminiService';
import { uuidv4 } from './utils/uuid';
import { IMAGE_GENERATION_LIMIT } from './constants';
// p-limit isn't available in standard ESM without install, implementing a simple semaphore queue
import { Video, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [projectData, setProjectData] = useState<Partial<ProjectData>>({});
  const [slides, setSlides] = useState<Slide[]>([]);
  const [progress, setProgress] = useState<GenerationProgress>({ total: 0, completed: 0, currentAction: '' });

  const handleStart = async (data: Partial<ProjectData>) => {
    setProjectData(data);
    setStep(AppStep.GENERATING_SCRIPT);
    
    try {
      // 1. Generate Script
      setProgress({ total: 1, completed: 0, currentAction: 'Drafting Pedagogical Script...' });
      const rawSlides = await generateScriptFromMaterials(data.topic!, data.materials!, data.targetAudience || 'General');
      
      const newSlides: Slide[] = rawSlides.map((s, i) => ({
        ...s,
        id: uuidv4(),
        order: i,
        isRegeneratingImage: true
      }));
      setSlides(newSlides);

      // 2. Start Parallel Image Generation
      setStep(AppStep.GENERATING_SLIDES);
      await generateImagesInParallel(newSlides, data.aspectRatio || AspectRatio.LANDSCAPE);

      setStep(AppStep.EDITOR);

    } catch (error) {
      console.error(error);
      alert("An error occurred during generation. Please check your API Key and try again.");
      setStep(AppStep.INPUT);
    }
  };

  const generateImagesInParallel = async (slidesToProcess: Slide[], aspectRatio: AspectRatio) => {
    const total = slidesToProcess.length;
    let completed = 0;
    setProgress({ total, completed: 0, currentAction: 'Rendering Visuals...' });

    // Simple concurrency queue
    const queue = [...slidesToProcess];
    const activePromises: Promise<void>[] = [];

    const processNext = async () => {
      if (queue.length === 0) return;
      const slide = queue.shift();
      if (!slide) return;

      try {
        const imageUrl = await generateSlideImage(slide.visualPrompt, aspectRatio);
        
        setSlides(prev => prev.map(s => 
          s.id === slide.id 
            ? { ...s, imageUrl, isRegeneratingImage: false } 
            : s
        ));
      } catch (err) {
        console.error(`Failed to generate image for slide ${slide.id}`, err);
        // Fallback or retry logic could go here
        setSlides(prev => prev.map(s => 
            s.id === slide.id 
              ? { ...s, isRegeneratingImage: false } 
              : s
          ));
      } finally {
        completed++;
        setProgress({ total, completed, currentAction: `Rendering Visuals (${completed}/${total})...` });
      }
    };

    // Run queue
    const workers = Array(Math.min(IMAGE_GENERATION_LIMIT, total)).fill(null).map(async () => {
      while (queue.length > 0) {
        await processNext();
      }
    });

    await Promise.all(workers);
  };

  const handleUpdateSlide = (id: string, updates: Partial<Slide>) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  return (
    <div className="h-full w-full bg-gray-950 text-white font-sans">
        {/* Simple Top Bar (except on input) */}
        {step !== AppStep.INPUT && (
            <div className="absolute top-0 left-0 p-4 z-50 pointer-events-none">
                 <div className="flex items-center gap-2 text-blue-500 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-blue-900/50">
                     <Sparkles size={14} />
                     <span className="text-xs font-bold uppercase tracking-wider">{step.replace('_', ' ')}</span>
                 </div>
            </div>
        )}

      {step === AppStep.INPUT && <InputStep onStart={handleStart} />}
      
      {(step === AppStep.GENERATING_SCRIPT || step === AppStep.GENERATING_SLIDES) && (
        <LoadingStep progress={progress} />
      )}

      {step === AppStep.EDITOR && (
        <EditorStep 
            slides={slides} 
            aspectRatio={projectData.aspectRatio || AspectRatio.LANDSCAPE}
            onUpdateSlide={handleUpdateSlide}
            onFinish={() => setStep(AppStep.RECORDING)}
        />
      )}

      {step === AppStep.RECORDING && (
        <RecordingStep 
            slides={slides}
            aspectRatio={projectData.aspectRatio || AspectRatio.LANDSCAPE}
            onUpdateSlide={handleUpdateSlide}
            onFinish={() => setStep(AppStep.PREVIEW)}
        />
      )}

      {step === AppStep.PREVIEW && (
        <PreviewStep 
            slides={slides}
            aspectRatio={projectData.aspectRatio || AspectRatio.LANDSCAPE}
            onReset={() => setStep(AppStep.INPUT)}
        />
      )}
    </div>
  );
};

export default App;
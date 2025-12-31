import React, { useState, useRef, useEffect } from 'react';
import { Slide, AspectRatio } from '../types';
import { Mic, Square, Play, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
}

const RecordingStep: React.FC<Props> = ({ slides, aspectRatio, onUpdateSlide, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const currentSlide = slides[currentIndex];
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio URL on unmount/change
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, [currentIndex]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onUpdateSlide(currentSlide.id, { audioBlob });
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone access is required to record audio.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playRecording = () => {
    if (currentSlide.audioBlob) {
      const url = URL.createObjectURL(currentSlide.audioBlob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      
      audio.onended = () => setIsPlaying(false);
      
      setIsPlaying(true);
      audio.play();
    }
  };

  const deleteRecording = () => {
    onUpdateSlide(currentSlide.id, { audioBlob: undefined });
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  const progress = Math.round(((currentIndex) / slides.length) * 100);

  const arClass = 
    aspectRatio === AspectRatio.PORTRAIT ? 'aspect-[9/16] h-[60vh]' :
    aspectRatio === AspectRatio.LANDSCAPE ? 'aspect-[16/9] w-[80vw]' :
    'aspect-square h-[60vh]';

  return (
    <div className="flex flex-col h-full bg-gray-950 items-center">
      {/* Progress Header */}
      <div className="w-full bg-gray-900 border-b border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h2 className="font-bold text-gray-200">Voiceover Studio</h2>
            <div className="text-sm text-gray-400">Slide {currentIndex + 1} / {slides.length}</div>
        </div>
        <div className="h-1 bg-gray-800 mt-4 max-w-4xl mx-auto rounded-full overflow-hidden">
             <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-6xl flex flex-col md:flex-row items-center justify-center gap-8 p-6">
          
          {/* Visual Ref */}
          <div className={`${arClass} bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 flex-shrink-0 relative`}>
             <img src={currentSlide.imageUrl} className="w-full h-full object-cover" />
             {currentSlide.audioBlob && (
                 <div className="absolute top-4 right-4 bg-emerald-500 text-white p-2 rounded-full shadow-lg">
                     <CheckCircle2 size={24} />
                 </div>
             )}
          </div>

          {/* Teleprompter & Controls */}
          <div className="flex-1 w-full max-w-lg flex flex-col h-[60vh]">
              <div className="flex-1 bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6 overflow-y-auto shadow-inner">
                  <p className="text-lg md:text-2xl font-medium text-gray-200 leading-relaxed font-serif">
                      {currentSlide.scriptText}
                  </p>
              </div>

              {/* Controls */}
              <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 flex flex-col gap-4">
                  <div className="flex items-center justify-center gap-6">
                      {!currentSlide.audioBlob ? (
                          !isRecording ? (
                              <button 
                                onClick={startRecording}
                                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/30 transition-transform hover:scale-105"
                              >
                                  <Mic size={32} />
                              </button>
                          ) : (
                              <button 
                                onClick={stopRecording}
                                className="w-16 h-16 rounded-full bg-gray-200 hover:bg-white text-red-600 flex items-center justify-center animate-pulse"
                              >
                                  <Square size={32} fill="currentColor" />
                              </button>
                          )
                      ) : (
                          <>
                             <button 
                                onClick={playRecording}
                                disabled={isPlaying}
                                className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 hover:bg-gray-700 text-white flex items-center justify-center"
                             >
                                 <Play size={20} className={isPlaying ? 'opacity-50' : ''} />
                             </button>
                             <button 
                                onClick={deleteRecording}
                                className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 hover:bg-red-900/50 hover:border-red-800 hover:text-red-400 text-gray-400 flex items-center justify-center"
                             >
                                 <Trash2 size={20} />
                             </button>
                          </>
                      )}
                  </div>
                  
                  <div className="h-px bg-gray-800 w-full my-2"></div>

                  <button 
                    onClick={handleNext}
                    disabled={!currentSlide.audioBlob}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                     {currentIndex === slides.length - 1 ? 'Finish Project' : 'Next Slide'}
                     <ArrowRight size={18} />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default RecordingStep;
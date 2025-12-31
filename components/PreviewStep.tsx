import React, { useState, useEffect, useRef } from 'react';
import { Slide, AspectRatio } from '../types';
import { Play, Pause, Download, RotateCcw, Loader2 } from 'lucide-react';

interface Props {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onReset: () => void;
}

const PreviewStep: React.FC<Props> = ({ slides, aspectRatio, onReset }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const arClass = 
    aspectRatio === AspectRatio.PORTRAIT ? 'aspect-[9/16] h-[70vh]' :
    aspectRatio === AspectRatio.LANDSCAPE ? 'aspect-[16/9] w-[80vw]' :
    'aspect-square h-[70vh]';

  // Effect to handle slide transitions
  useEffect(() => {
    if (isPlaying) {
      playCurrentSlideAudio();
    }
  }, [currentSlideIndex, isPlaying]);

  const playCurrentSlideAudio = () => {
    if (audioRef.current) {
        audioRef.current.pause();
    }

    const slide = slides[currentSlideIndex];
    if (slide.audioBlob) {
        const url = URL.createObjectURL(slide.audioBlob);
        const audio = new Audio(url);
        audioRef.current = audio;
        
        audio.onended = () => {
            if (currentSlideIndex < slides.length - 1) {
                setCurrentSlideIndex(prev => prev + 1);
            } else {
                setIsPlaying(false);
                setCurrentSlideIndex(0); // Reset to start
            }
        };

        audio.play().catch(e => console.error("Playback failed", e));
    } else {
        // Fallback if no audio
        setTimeout(() => {
             if (currentSlideIndex < slides.length - 1) {
                setCurrentSlideIndex(prev => prev + 1);
            } else {
                setIsPlaying(false);
            }
        }, 3000);
    }
  };

  const togglePlay = () => {
      if (isPlaying) {
          setIsPlaying(false);
          audioRef.current?.pause();
      } else {
          setIsPlaying(true);
      }
  };

  const handleDownloadVideo = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    
    try {
      const canvas = document.createElement('canvas');
      // Resolution config based on Aspect Ratio
      const [width, height] = aspectRatio === AspectRatio.PORTRAIT 
        ? [720, 1280] 
        : aspectRatio === AspectRatio.LANDSCAPE 
          ? [1280, 720] 
          : [1080, 1080];
          
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // Setup Audio Context
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      
      // Pre-load all assets to prevent stuttering during recording
      const assets = await Promise.all(slides.map(async (s) => {
        // Load Image
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = s.imageUrl || '';
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = resolve; // Continue even if image fails
        });

        // Load Audio
        let audioBuffer: AudioBuffer | null = null;
        if (s.audioBlob) {
            const arrayBuffer = await s.audioBlob.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        }

        return { img, audioBuffer, text: s.scriptText };
      }));

      // Setup Recorder
      const stream = canvas.captureStream(30); // 30 FPS
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
          stream.addTrack(audioTrack);
      }

      // Prefer MP4, fallback to WebM
      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
      }

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.start();

      // --- RECORDING LOOP ---
      for (let i = 0; i < assets.length; i++) {
          setRenderProgress(Math.round((i / assets.length) * 100));
          const { img, audioBuffer, text } = assets[i];
          const duration = audioBuffer ? audioBuffer.duration : 3; // Default 3s
          
          // Draw Image & Text
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          
          // Draw image keeping aspect ratio (cover)
          const scale = Math.max(width / img.width, height / img.height);
          const x = (width / 2) - (img.width / 2) * scale;
          const y = (height / 2) - (img.height / 2) * scale;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          // Draw Subtitles (optional, burnt in)
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const fontSize = Math.floor(height * 0.05);
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          // Simple text wrapping
          const words = text.split(' ');
          let line = '';
          const lines = [];
          const maxWidth = width * 0.9;
          
          for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
              lines.push(line);
              line = words[n] + ' ';
            } else {
              line = testLine;
            }
          }
          lines.push(line);

          // Render subtitles background & text
          const textBlockHeight = lines.length * (fontSize * 1.2);
          const textYStart = height - textBlockHeight - (height * 0.05);

          // Background bar for text
          // ctx.fillRect(0, textYStart - 20, width, textBlockHeight + 40);

          ctx.fillStyle = '#fff';
          lines.forEach((l, idx) => {
              // Stroke for readability
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 4;
              ctx.strokeText(l, width / 2, textYStart + (idx * fontSize * 1.2));
              ctx.fillText(l, width / 2, textYStart + (idx * fontSize * 1.2));
          });

          // Play Audio
          if (audioBuffer) {
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(dest);
              source.start();
          }

          // Wait for slide duration
          // We break the wait into small chunks to keep the canvas updating if needed (though static image doesn't need much)
          await new Promise(r => setTimeout(r, duration * 1000));
      }

      recorder.stop();
      await new Promise(r => recorder.onstop = r);

      // Trigger Download
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eduscript_video.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      audioCtx.close();

    } catch (e) {
      console.error("Rendering failed", e);
      alert("Failed to render video. Please try again.");
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="flex flex-col h-full items-center justify-center bg-gray-950 gap-8 relative">
       {isRendering && (
         <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center animate-in fade-in">
             <Loader2 size={64} className="text-blue-500 animate-spin mb-4" />
             <h2 className="text-2xl font-bold text-white mb-2">Rendering Video...</h2>
             <p className="text-gray-400">Please wait while we stitch your slides and audio.</p>
             <div className="w-64 h-2 bg-gray-800 rounded-full mt-4 overflow-hidden">
                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${renderProgress}%` }}></div>
             </div>
         </div>
       )}

       <div className={`relative ${arClass} bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-gray-800`}>
           <img 
             src={currentSlide.imageUrl} 
             className="w-full h-full object-cover animate-in fade-in zoom-in duration-1000"
             key={currentSlideIndex} // Force re-render for animation
           />
           
           {/* Subtitles Overlay */}
           <div className="absolute bottom-10 left-0 right-0 px-8 text-center">
                <span className="bg-black/60 text-white px-2 py-1 rounded text-lg font-medium shadow-lg box-decoration-clone leading-loose">
                    {currentSlide.scriptText}
                </span>
           </div>
       </div>

       <div className="flex gap-4">
           <button 
             onClick={onReset}
             disabled={isRendering}
             className="p-4 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 transition disabled:opacity-50"
             title="Start Over"
           >
               <RotateCcw />
           </button>
           
           <button 
             onClick={togglePlay}
             disabled={isRendering}
             className="p-4 rounded-full bg-white text-black hover:bg-gray-200 transition scale-110 disabled:opacity-50"
             title={isPlaying ? "Pause" : "Play Preview"}
           >
               {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
           </button>

           <button 
             onClick={handleDownloadVideo}
             disabled={isRendering}
             className="px-6 py-4 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition shadow-lg shadow-blue-900/40 flex items-center gap-2 font-bold disabled:opacity-50"
           >
               <Download size={20} />
               <span>Download Video</span>
           </button>
       </div>
    </div>
  );
};

export default PreviewStep;

import React, { useEffect, useRef } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isListening: boolean;
  setIsListening: (val: boolean) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, isListening, setIsListening }) => {
  const recognitionRef = useRef<any>(null);
  const callbackRef = useRef(onTranscript);

  // Update the callback ref so the listener always has access to the latest function
  // without needing to restart the SpeechRecognition engine.
  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false; // Only want final results to avoid double-writing
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          callbackRef.current(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [setIsListening]); // Only depend on setIsListening which is stable

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Recognition start failed or already running", err);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`p-4 rounded-full transition-all flex items-center justify-center relative z-10 ${
        isListening 
          ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-110' 
          : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
      } text-white shadow-lg active:scale-95`}
      title={isListening ? "Stop listening" : "Start voice input"}
    >
      {isListening && (
        <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25"></span>
      )}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    </button>
  );
};

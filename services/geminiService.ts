
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { StudioResult, StudioConfig, Language, ContentType, Gender, ScriptCategory, Tone, Speed, AspectRatio } from "../types";
import { VOICES } from "../constants";

/**
 * Enhanced retry logic specifically designed to handle 429 Resource Exhausted errors.
 */
async function retry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
  let currentDelay = initialDelay;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || JSON.stringify(error).includes('429');
      
      if (i === retries) throw error;
      
      const waitTime = isRateLimit ? currentDelay * 2 : currentDelay;
      console.warn(`Attempt ${i + 1} failed. Retrying in ${waitTime}ms...`, error);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      currentDelay *= 2; 
    }
  }
  throw new Error("Retry failed after maximum attempts");
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateContent(
  prompt: string,
  config: StudioConfig,
  onProgress?: (percent: number) => void
): Promise<StudioResult> {
  // Initialize inside the call to ensure the latest API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });
  const model = 'gemini-3-flash-preview';
  
  if (onProgress) onProgress(5);

  const totalSeconds = (config.durationMinutes * 60) + config.durationSeconds;
  let multiplier = 2.5;
  if (config.speed === Speed.SLOW) multiplier = 2.0;
  if (config.speed === Speed.FAST) multiplier = 3.0;
  
  const targetWordCount = Math.round(totalSeconds * multiplier);

  const systemInstruction = `
    You are Creato AI, a high-end production studio.
    Generate a complete content package for: ${config.contentType} in category: ${config.scriptCategory}, language: ${config.language}.
    
    DURATION: Exactly ${config.durationMinutes}m ${config.durationSeconds}s (~${targetWordCount} words).
    VISUALS: Ratio ${config.aspectRatio}. 
    THUMBNAIL: A "Hero Shot" for topic: "${prompt}". 
    
    RESPONSE FORMAT: JSON.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      script: { type: Type.STRING },
      description: { type: Type.STRING },
      caption: { type: Type.STRING },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      bestTime: { type: Type.STRING },
      imagePrompts: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 4, maxItems: 4 },
      thumbnailPrompt: { type: Type.STRING }
    },
    required: ["title", "script", "description", "caption", "hashtags", "bestTime", "imagePrompts", "thumbnailPrompt"]
  };

  const response: GenerateContentResponse = await retry(() => ai.models.generateContent({
    model,
    contents: `Topic: ${prompt}\nRatio: ${config.aspectRatio}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema
    }
  }));

  if (onProgress) onProgress(20);
  const data = JSON.parse(response.text || '{}');

  const images: string[] = [];
  let isQuotaExhausted = false;

  for (let i = 0; i < (data.imagePrompts?.length || 0); i++) {
    if (isQuotaExhausted) {
      images.push(`https://picsum.photos/seed/fallback_${i}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
    } else {
      try {
        if (i > 0) await sleep(1500); 
        const img = await generateStudioImage(data.imagePrompts[i], config.aspectRatio);
        images.push(img);
      } catch (err: any) {
        images.push(`https://picsum.photos/seed/err_${i}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
        if (err?.message?.includes('429')) isQuotaExhausted = true;
      }
    }
    if (onProgress) onProgress(Math.min(20 + (i + 1) * 15, 80));
  }

  let thumbnail = '';
  try {
    await sleep(2000);
    thumbnail = await generateStudioImage(data.thumbnailPrompt || `Hero image for ${prompt}`, config.aspectRatio);
  } catch (err) {
    thumbnail = `https://picsum.photos/seed/thumb_err/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`;
  }

  const audioData = await generateStudioAudio(data.script || "", config);
  if (onProgress) onProgress(100);

  return {
    ...data,
    contentType: config.contentType,
    aspectRatio: config.aspectRatio,
    images,
    thumbnail,
    audioBlob: audioData.blob,
    audioUrl: audioData.url
  };
}

export async function generateStudioImage(prompt: string, aspectRatio: AspectRatio): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });
  const model = 'gemini-2.5-flash-image';

  const response: GenerateContentResponse = await retry(() => ai.models.generateContent({
    model,
    contents: { parts: [{ text: `${prompt}. Cinematic, high detail, realistic, ${aspectRatio} aspect ratio.` }] },
    config: { imageConfig: { aspectRatio } }
  }), 2, 3000);

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("No image data");
}

function createWavHeader(dataLength: number, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x52494646, false); 
  view.setUint32(4, 36 + dataLength, true); 
  view.setUint32(8, 0x57415645, false); 
  view.setUint32(12, 0x666d7420, false); 
  view.setUint16(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true); 
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  view.setUint32(36, 0x64617461, false); 
  view.setUint32(40, dataLength, true); 
  return new Uint8Array(header);
}

async function generateStudioAudio(script: string, config: StudioConfig): Promise<{ blob: Blob; url: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });
  const model = 'gemini-2.5-flash-preview-tts';
  const selectedVoice = VOICES.find(v => v.id === config.voiceId) || VOICES[0];

  const ttsText = `Performance: ${config.tone}. Speed: ${config.speed}. Script: ${script}`;

  let audioParams: any = {
    model,
    contents: [{ parts: [{ text: ttsText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: selectedVoice.geminiVoice }
        }
      }
    }
  };

  try {
    const response: GenerateContentResponse = await retry(() => ai.models.generateContent(audioParams));
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const pcmData = new Uint8Array(len);
      for (let i = 0; i < len; i++) pcmData[i] = binaryString.charCodeAt(i);
      
      const wavHeader = createWavHeader(pcmData.length, 24000);
      const combined = new Uint8Array(wavHeader.length + pcmData.length);
      combined.set(wavHeader);
      combined.set(pcmData, wavHeader.length);
      const blob = new Blob([combined], { type: 'audio/wav' });
      return { blob, url: URL.createObjectURL(blob) };
    }
  } catch (err) {
    console.error("Audio generation failed:", err);
  }
  return { blob: new Blob(), url: '' };
}

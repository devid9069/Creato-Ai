
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { StudioResult, StudioConfig, Language, ContentType, Gender, ScriptCategory, Tone, Speed, AspectRatio } from "../types";
import { VOICES } from "../constants";

/**
 * Enhanced retry logic with specific handling for Netlify/Production environments.
 */
async function retry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 3000): Promise<T> {
  let currentDelay = initialDelay;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = error?.message || JSON.stringify(error);
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
      const isAuthError = errorMsg.includes('403') || errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('not found');
      
      if (isAuthError) {
        throw new Error("API Key issue: Please check your Netlify Environment Variables. Make sure API_KEY is set.");
      }

      if (i === retries) throw error;
      
      // Increase delay significantly for rate limits in production
      const waitTime = isRateLimit ? currentDelay * 3 : currentDelay;
      console.warn(`Production attempt ${i + 1} failed. Retrying in ${waitTime}ms...`, errorMsg);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      currentDelay *= 2; 
    }
  }
  throw new Error("Production process timed out after retries.");
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateContent(
  prompt: string,
  config: StudioConfig,
  onProgress?: (percent: number) => void
): Promise<StudioResult> {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API_KEY is missing. Please add it to your Netlify Dashboard under Site Settings > Environment Variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3-flash-preview';
  
  if (onProgress) onProgress(5);

  const totalSeconds = (config.durationMinutes * 60) + config.durationSeconds;
  let multiplier = 2.5;
  if (config.speed === Speed.SLOW) multiplier = 2.0;
  if (config.speed === Speed.FAST) multiplier = 3.0;
  
  const targetWordCount = Math.round(totalSeconds * multiplier);

  const systemInstruction = `
    You are Creato AI Studio. Generate JSON content for: ${config.contentType}.
    Category: ${config.scriptCategory}. Language: ${config.language}.
    Duration: ${config.durationMinutes}m ${config.durationSeconds}s.
    Aspect Ratio: ${config.aspectRatio}.
    IMPORTANT: Provide exactly 4 detailed imagePrompts and 1 thumbnailPrompt tailored to the topic: "${prompt}".
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
    contents: `Production Topic: ${prompt}. Word count target: ${targetWordCount}.`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema
    }
  }));

  if (onProgress) onProgress(25);
  const data = JSON.parse(response.text || '{}');

  const images: string[] = [];
  let isQuotaExhausted = false;

  // Generate images one by one with a healthy gap to avoid 429
  for (let i = 0; i < 4; i++) {
    if (isQuotaExhausted) {
      images.push(`https://picsum.photos/seed/${i}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
    } else {
      try {
        await sleep(2500); // 2.5s gap between image requests
        const imgPrompt = data.imagePrompts?.[i] || `Cinematic scene for ${data.title}`;
        const img = await generateStudioImage(imgPrompt, config.aspectRatio);
        images.push(img);
      } catch (err: any) {
        console.error("Image gen failed", err);
        images.push(`https://picsum.photos/seed/err${i}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
        if (err.message?.includes('429')) isQuotaExhausted = true;
      }
    }
    if (onProgress) onProgress(25 + (i + 1) * 15);
  }

  let thumbnail = '';
  try {
    await sleep(3000); // Larger gap for thumbnail
    thumbnail = await generateStudioImage(data.thumbnailPrompt || `Hero shot for ${prompt}`, config.aspectRatio);
  } catch (err) {
    thumbnail = `https://picsum.photos/seed/thumb/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`;
  }

  if (onProgress) onProgress(90);
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
  const apiKey = process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey || '' });
  const model = 'gemini-2.5-flash-image';

  const response: GenerateContentResponse = await retry(() => ai.models.generateContent({
    model,
    contents: { parts: [{ text: `${prompt}. High quality, cinematic, ultra-realistic, ${aspectRatio} aspect ratio.` }] },
    config: { imageConfig: { aspectRatio } }
  }), 2, 4000);

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("Asset generation failed.");
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
  const apiKey = process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey || '' });
  const model = 'gemini-2.5-flash-preview-tts';
  const selectedVoice = VOICES.find(v => v.id === config.voiceId) || VOICES[0];

  let audioParams: any = {
    model,
    contents: [{ parts: [{ text: `Tone: ${config.tone}. Script: ${script}` }] }],
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
    const response: GenerateContentResponse = await retry(() => ai.models.generateContent(audioParams), 1, 5000);
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
    console.error("Audio Master Export Failed:", err);
  }
  return { blob: new Blob(), url: '' };
}

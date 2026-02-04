
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { StudioResult, StudioConfig, Language, ContentType, Gender, ScriptCategory, Tone, Speed, AspectRatio } from "../types";
import { VOICES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
      
      // If we are rate limited, wait significantly longer
      const waitTime = isRateLimit ? currentDelay * 2 : currentDelay;
      console.warn(`Attempt ${i + 1} failed. Retrying in ${waitTime}ms...`, error);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      currentDelay *= 2; // Exponential backoff
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
  const model = 'gemini-3-flash-preview';
  if (onProgress) onProgress(5);

  const totalSeconds = (config.durationMinutes * 60) + config.durationSeconds;
  let multiplier = 2.5;
  if (config.speed === Speed.SLOW) multiplier = 2.0;
  if (config.speed === Speed.FAST) multiplier = 3.0;
  
  const targetWordCount = Math.round(totalSeconds * multiplier);

  const systemInstruction = `
    You are Creato AI, a high-end production studio.
    Generate a complete content package for the user-selected format: ${config.contentType} in the category: ${config.scriptCategory}, using the language: ${config.language}.
    
    STRICT DURATION CONSTRAINT:
    The user has requested a script that lasts exactly ${config.durationMinutes} minutes and ${config.durationSeconds} seconds.
    Based on a ${config.speed} speaking pace, you MUST write a script that is approximately ${targetWordCount} words long.

    STRICT VISUAL CONSTRAINT:
    The user has selected an Aspect Ratio of ${config.aspectRatio}.
    - All image descriptions and visual cues MUST be optimized for ${config.aspectRatio === AspectRatio.VERTICAL ? 'Vertical (9:16) Portrait mode' : 'Horizontal (16:9) Landscape mode'}.

    RESPONSE FORMAT: Return valid JSON.
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
    contents: `Topic: ${prompt}\nFormat: ${config.contentType}\nCategory: ${config.scriptCategory}\nWords: ${targetWordCount}\nRatio: ${config.aspectRatio}`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema
    }
  }));

  if (onProgress) onProgress(20);
  const data = JSON.parse(response.text || '{}');

  const images: string[] = [];
  let currentProgress = 20;
  let isQuotaExhausted = false;

  // Process images sequentially with delays to respect RPM (Requests Per Minute)
  for (let i = 0; i < (data.imagePrompts?.length || 0); i++) {
    if (isQuotaExhausted) {
      images.push(`https://picsum.photos/seed/fallback_${i}_${Math.random()}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
    } else {
      try {
        // Wait a bit before each image request to stay under free tier limits
        if (i > 0) await sleep(1500); 
        const img = await generateStudioImage(data.imagePrompts[i], config.aspectRatio);
        images.push(img);
      } catch (err: any) {
        console.error("Image prompt failed, using fallback", err);
        images.push(`https://picsum.photos/seed/err_${i}_${Math.random()}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`);
        // If we hit a hard 429, don't keep hammering the API for this batch
        if (err?.message?.includes('429')) isQuotaExhausted = true;
      }
    }
    currentProgress += 12;
    if (onProgress) onProgress(Math.min(currentProgress, 85));
  }

  // Final thumbnail request
  let thumbnail = '';
  if (isQuotaExhausted) {
    thumbnail = `https://picsum.photos/seed/thumb_${Math.random()}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`;
  } else {
    try {
      await sleep(2000); // Larger gap for the final asset
      thumbnail = await generateStudioImage(data.thumbnailPrompt || "Cinematic title card", config.aspectRatio);
    } catch (err) {
      thumbnail = `https://picsum.photos/seed/thumb_err_${Math.random()}/${config.aspectRatio === AspectRatio.VERTICAL ? '720/1280' : '1280/720'}`;
    }
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
  const model = 'gemini-2.5-flash-image';

  // Use the enhanced retry for image generation
  const response: GenerateContentResponse = await retry(() => ai.models.generateContent({
    model,
    contents: { parts: [{ text: `${prompt}. Optimized for ${aspectRatio} aspect ratio. High detail cinematic style.` }] },
    config: { imageConfig: { aspectRatio } }
  }), 2, 3000); // 2 retries, 3s initial delay for images

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("No image data returned from API");
}

function createWavHeader(dataLength: number, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataLength, true); 
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint16(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true); 
  view.setUint32(28, sampleRate * 2, true); 
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataLength, true); 
  return new Uint8Array(header);
}

async function generateStudioAudio(script: string, config: StudioConfig): Promise<{ blob: Blob; url: string }> {
  const model = 'gemini-2.5-flash-preview-tts';
  const selectedVoice = VOICES.find(v => v.id === config.voiceId) || VOICES[0];

  const ttsText = `Performance: ${config.tone}. Speed: ${config.speed}. Duration target: ${config.durationMinutes}m ${config.durationSeconds}s. Script: ${script}`;

  let audioParams: any = {
    model,
    contents: [{ parts: [{ text: ttsText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
    }
  };

  if (config.contentType === ContentType.PODCAST) {
    audioParams.config.speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speaker: 'Joe', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          { speaker: 'Jane', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        ]
      }
    };
  } else {
    audioParams.config.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: selectedVoice.geminiVoice }
      }
    };
  }

  try {
    const response: GenerateContentResponse = await retry(() => ai.models.generateContent(audioParams));
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const pcmData = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        pcmData[i] = binaryString.charCodeAt(i);
      }

      const volumeFactor = config.volume || 1.0;
      if (volumeFactor !== 1.0) {
        const dataInt16 = new Int16Array(pcmData.buffer);
        for (let i = 0; i < dataInt16.length; i++) {
          let scaled = dataInt16[i] * volumeFactor;
          dataInt16[i] = Math.max(-32768, Math.min(32767, scaled));
        }
      }

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

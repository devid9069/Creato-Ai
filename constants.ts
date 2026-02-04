
import { VoiceOption, Gender, Tone, Speed, ScriptCategory } from './types';

export const VOICES: VoiceOption[] = [
  { id: 'v1', name: 'James', gender: Gender.MALE, geminiVoice: 'Puck' },
  { id: 'v2', name: 'David', gender: Gender.MALE, geminiVoice: 'Charon' },
  { id: 'v3', name: 'Robert', gender: Gender.MALE, geminiVoice: 'Fenrir' },
  { id: 'v4', name: 'Emma', gender: Gender.FEMALE, geminiVoice: 'Kore' },
  { id: 'v5', name: 'Sophia', gender: Gender.FEMALE, geminiVoice: 'Zephyr' },
  { id: 'v6', name: 'Olivia', gender: Gender.FEMALE, geminiVoice: 'Aoede' },
];

export const TONES = Object.values(Tone);
export const SPEEDS = Object.values(Speed);
export const SCRIPT_CATEGORIES = Object.values(ScriptCategory);

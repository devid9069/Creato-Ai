
export enum Language {
  ENGLISH = 'English',
  HINDI = 'Hindi'
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female'
}

export enum Tone {
  CALM = 'Calm',
  ENERGETIC = 'Energetic',
  EMOTIONAL = 'Emotional',
  AUTHORITATIVE = 'Authoritative'
}

export enum Speed {
  SLOW = 'Slow',
  NORMAL = 'Normal',
  FAST = 'Fast'
}

export enum ContentType {
  REEL = 'Shorts/Reels',
  LONG = 'Long Video',
  PODCAST = 'Podcast',
  NEWS = 'News Bulletin'
}

export enum AspectRatio {
  VERTICAL = '9:16',
  HORIZONTAL = '16:9'
}

export enum ScriptCategory {
  TECH = 'Technology',
  EDUCATION = 'Education',
  AI = 'Artificial Intelligence',
  SONG = 'Song/Music',
  MOVIE = 'Movie/Cinema',
  SHOPPING = 'Shopping/E-commerce',
  ADVERTISING = 'Advertising/Marketing',
  TRAVEL = 'Travel/Vlog',
  GAMING = 'Gaming',
  MOTIVATION = 'Motivation',
  HEALTH = 'Health & Fitness'
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: Gender;
  geminiVoice: string;
}

export interface StudioResult {
  title: string;
  script: string;
  description: string;
  caption: string;
  hashtags: string[];
  bestTime: string;
  images: string[];
  thumbnail: string;
  audioUrl?: string;
  audioBlob?: Blob;
  contentType: ContentType;
  aspectRatio: AspectRatio;
}

export interface HistoryItem extends StudioResult {
  id: string;
  timestamp: number;
  prompt: string;
}

export interface StudioConfig {
  language: Language;
  primaryGender: Gender;
  voiceId: string;
  tone: Tone;
  speed: Speed;
  volume: number;
  contentType: ContentType;
  scriptCategory: ScriptCategory;
  durationMinutes: number;
  durationSeconds: number;
  aspectRatio: AspectRatio;
}

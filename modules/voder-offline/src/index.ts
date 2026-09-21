import { NativeModules, Platform } from "react-native";

type NativeVoder = {
  ensureModel(url: string, fileName: string, force: boolean): Promise<string>;
  isModelPresent(fileName: string): Promise<boolean>;
  initialize(modelPath: string, sampleRateHz: number): Promise<boolean>;
  speakText(text: string): Promise<boolean>;
  release(): Promise<void>;
};

const LINKING_ERROR =
  "voder-offline native module is not available. Use an Expo development build (not Expo Go).";

const Native: NativeVoder | undefined =
  Platform.OS === "android" ? (NativeModules.VoderOffline as NativeVoder | undefined) : undefined;

export const isVoderNativeAvailable = (): boolean => Boolean(Native);

/** Default public Piper Arabic voice (ONNX) — rhasspy/piper releases. */
export const PIPER_AR_MODEL = {
  fileName: "ar_JO-kareem-low.onnx",
  // Official-style release asset pattern; override with EXPO_PUBLIC_VODER_MODEL_URL if needed.
  url:
    process.env.EXPO_PUBLIC_VODER_MODEL_URL?.trim() ||
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx",
  sampleRate: 16000,
} as const;

export async function ensureOfflineModel(
  url: string = PIPER_AR_MODEL.url,
  fileName: string = PIPER_AR_MODEL.fileName,
  force = false,
): Promise<string> {
  if (!Native) throw new Error(LINKING_ERROR);
  return Native.ensureModel(url, fileName, force);
}

export async function isOfflineModelPresent(
  fileName: string = PIPER_AR_MODEL.fileName,
): Promise<boolean> {
  if (!Native) return false;
  return Native.isModelPresent(fileName);
}

export async function initOfflineTts(
  modelPath?: string,
  sampleRateHz: number = PIPER_AR_MODEL.sampleRate,
): Promise<boolean> {
  if (!Native) return false;
  const path = modelPath || (await ensureOfflineModel());
  return Native.initialize(path, sampleRateHz);
}

/**
 * Speak Arabic (or any) text offline when native module is linked.
 * Note: full Piper needs phonemizer; native side uses a simple grapheme path as interim.
 */
export async function speakOffline(text: string): Promise<boolean> {
  if (!Native) throw new Error(LINKING_ERROR);
  return Native.speakText(text);
}

export async function releaseOfflineTts(): Promise<void> {
  if (!Native) return;
  await Native.release();
}

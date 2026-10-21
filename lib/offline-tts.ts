/**
 * TTS for Flsko v1 APK: system expo-speech only.
 * Native ONNX (voder-offline) is deferred until a later build.
 */
import * as Speech from "expo-speech";

export const PIPER_AR_MODEL = null;
export function isVoderNativeAvailable() {
  return false;
}

export async function prepareOfflineTts(): Promise<{ mode: "native" | "system"; ready: boolean }> {
  return { mode: "system", ready: true };
}

export async function speakArabic(
  text: string,
  options?: { voiceId?: string; rate?: number; pitch?: number },
): Promise<void> {
  await Speech.stop();
  Speech.speak(text, {
    language: "ar-SA",
    voice: options?.voiceId,
    rate: options?.rate ?? 0.92,
    pitch: options?.pitch ?? 1.0,
  });
}

export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}

export async function teardownOfflineTts(): Promise<void> {
  await Speech.stop();
}

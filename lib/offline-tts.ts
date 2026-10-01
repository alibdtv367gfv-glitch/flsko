/**
 * Unified TTS: prefers native ONNX (voder-offline) on Android dev builds,
 * falls back to expo-speech (works in Expo Go).
 */
import { Platform } from "react-native";
import * as Speech from "expo-speech";

import {
  ensureOfflineModel,
  initOfflineTts,
  isOfflineModelPresent,
  isVoderNativeAvailable,
  PIPER_AR_MODEL,
  releaseOfflineTts,
  speakOffline,
} from "../modules/voder-offline/src";

export { PIPER_AR_MODEL, isVoderNativeAvailable };

let offlineReady = false;

export async function prepareOfflineTts(): Promise<{ mode: "native" | "system"; ready: boolean }> {
  if (Platform.OS !== "android" || !isVoderNativeAvailable()) {
    return { mode: "system", ready: true };
  }
  try {
    const present = await isOfflineModelPresent();
    if (!present) {
      await ensureOfflineModel();
    }
    offlineReady = await initOfflineTts();
    return { mode: offlineReady ? "native" : "system", ready: true };
  } catch {
    offlineReady = false;
    return { mode: "system", ready: true };
  }
}

export async function speakArabic(
  text: string,
  options?: { voiceId?: string; rate?: number; pitch?: number },
): Promise<void> {
  await Speech.stop();
  if (offlineReady && isVoderNativeAvailable()) {
    try {
      const ok = await speakOffline(text);
      if (ok) return;
    } catch {
      // fall through to system TTS
    }
  }
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
  offlineReady = false;
  try {
    await releaseOfflineTts();
  } catch {
    // ignore
  }
}

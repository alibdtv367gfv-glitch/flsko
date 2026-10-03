/**
 * تحديث مرن لفلسقوا:
 * 1) فحص إصدار من Worker (رسائل، إجبار التحديث، قناة)
 * 2) OTA عبر expo-updates عند توفر build إنتاجي
 * يمكن لاحقًا تنزيل حزم إعداد (feature flags / brain hints) بدون متجر.
 */
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { getApiBaseUrl } from "@/constants/oauth";

export type AppVersionInfo = {
  minVersion: string;
  latestVersion: string;
  storeUrlAndroid?: string;
  storeUrlIos?: string;
  otaEnabled: boolean;
  messageAr?: string;
  forceUpdate?: boolean;
  channel?: string;
  features?: Record<string, boolean>;
};

function parseVer(v: string): number[] {
  return v.split(".").map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
}

export function isVersionOlder(current: string, minimum: string): boolean {
  const a = parseVer(current);
  const b = parseVer(minimum);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export function getLocalAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    "1.0.1"
  );
}

export async function fetchRemoteVersion(): Promise<AppVersionInfo | null> {
  try {
    const base = getApiBaseUrl() || "https://flsko-api.flsko.workers.dev";
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/app/version`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as AppVersionInfo;
  } catch {
    return null;
  }
}

/** تنزيل/تطبيق تحديث JS bundle عبر Expo Updates إن وُجد. */
export async function tryApplyOtaUpdate(): Promise<"updated" | "none" | "skipped" | "error"> {
  try {
    if (__DEV__) return "skipped";
    if (!Updates.isEnabled) return "skipped";
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return "none";
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return "updated";
  } catch {
    return "error";
  }
}

/**
 * فحص عند الإقلاع: OTA ثم سياسة الإصدار من الخادم.
 * لا يمنع الاستخدام إن فشل الشبكة (مرونة).
 */
export async function runStartupUpdateCheck(): Promise<void> {
  // OTA first (JS/assets without store)
  const ota = await tryApplyOtaUpdate();
  if (ota === "updated") return;

  const remote = await fetchRemoteVersion();
  if (!remote) return;

  const local = getLocalAppVersion();
  if (remote.forceUpdate && isVersionOlder(local, remote.minVersion)) {
    const url =
      Platform.OS === "ios" ? remote.storeUrlIos : remote.storeUrlAndroid;
    Alert.alert(
      "تحديث مطلوب",
      remote.messageAr ||
        `يلزم تحديث فلسقوا إلى الإصدار ${remote.latestVersion} للمتابعة.`,
      url
        ? [
            { text: "لاحقًا", style: "cancel" },
            { text: "تحديث", onPress: () => void Linking.openURL(url) },
          ]
        : [{ text: "حسنًا" }],
    );
    return;
  }

  if (isVersionOlder(local, remote.latestVersion) && remote.messageAr) {
    const url =
      Platform.OS === "ios" ? remote.storeUrlIos : remote.storeUrlAndroid;
    Alert.alert("يتوفر تحديث", remote.messageAr, [
      { text: "لاحقًا", style: "cancel" },
      ...(url
        ? [{ text: "تحديث", onPress: () => void Linking.openURL(url) }]
        : []),
    ]);
  }
}

import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import * as Network from "expo-network";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin, getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { ScreenContainer } from "@/components/screen-container";
import { runStartupUpdateCheck } from "@/lib/app-update";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function AuthGate() {
  const { loading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const networkState = Network.useNetworkState();
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const isOAuthCallback = segments[0] === "oauth";
  const isPublicPage = segments[0] === "privacy" || segments[0] === "terms" || segments[0] === "download";
  const handleLogin = async () => {
    if (loginBusy) return;
    setLoginError(null);
    if (networkState.isInternetReachable === false) { setLoginError("لا يوجد اتصال بالإنترنت. اتصل بالشبكة ثم اضغط إعادة المحاولة."); return; }
    setLoginBusy(true);
    try { await startOAuthLogin(); } catch (error) { setLoginBusy(false); setLoginError(error instanceof Error ? error.message : "تعذر فتح تسجيل الدخول."); }
  };
  const handleEmailAuth = async () => {
    if (loginBusy) return;
    setLoginError(null);
    if (networkState.isInternetReachable === false) {
      setLoginError("لا يوجد اتصال بالإنترنت.");
      return;
    }
    const em = email.trim();
    if (!em || password.length < 8) {
      setLoginError("أدخل بريدًا صالحًا وكلمة مرور من 8 أحرف على الأقل.");
      return;
    }
    setLoginBusy(true);
    try {
      const base = (getApiBaseUrl() || "https://flsko-api.flsko.workers.dev").replace(/\/+$/, "");
      const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email: em,
          password,
          name: displayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { sessionToken?: string; error?: string; user?: unknown };
      if (!res.ok || !data.sessionToken) {
        throw new Error(data.error || "تعذر إتمام العملية");
      }
      await Auth.setSessionToken(data.sessionToken, { notify: true });
      if (data.user) await Auth.setUserInfo?.(data.user as Auth.User).catch?.(() => undefined);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "فشل الدخول بالبريد");
    } finally {
      setLoginBusy(false);
    }
  };

  if (isOAuthCallback) return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="oauth/callback" /></Stack>;
  if (loading) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><Text className="text-3xl font-black text-foreground">Flsko</Text><Text className="mt-3 text-center text-muted">جارٍ التحقق من تسجيل الدخول...</Text></ScreenContainer>;
  if (!isAuthenticated && !isPublicPage) return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6">
      <View className="w-full max-w-md items-center rounded-[32px] border border-border bg-surface p-6">
        <Text className="text-sm font-bold text-primary">Flsko · فلسقوا</Text>
        <Text className="mt-3 text-center text-3xl font-black text-foreground">مرحبًا بك</Text>
        <Text className="mt-2 text-center text-sm leading-6 text-muted">سجّل بالبريد أو عبر Google.</Text>
        <View className="mt-4 w-full flex-row gap-2">
          <Pressable onPress={() => setAuthMode("login")} className="flex-1 rounded-xl py-2" style={{ backgroundColor: authMode === "login" ? "#0A7EA4" : "transparent", borderWidth: 1, borderColor: "#0A7EA4" }}>
            <Text className="text-center text-xs font-bold" style={{ color: authMode === "login" ? "#fff" : "#0A7EA4" }}>دخول</Text>
          </Pressable>
          <Pressable onPress={() => setAuthMode("register")} className="flex-1 rounded-xl py-2" style={{ backgroundColor: authMode === "register" ? "#0A7EA4" : "transparent", borderWidth: 1, borderColor: "#0A7EA4" }}>
            <Text className="text-center text-xs font-bold" style={{ color: authMode === "register" ? "#fff" : "#0A7EA4" }}>حساب جديد</Text>
          </Pressable>
        </View>
        {authMode === "register" && (
          <TextInput value={displayName} onChangeText={setDisplayName} placeholder="الاسم (اختياري)" placeholderTextColor="#94A3B8" className="mt-4 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground" />
        )}
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="البريد الإلكتروني" placeholderTextColor="#94A3B8" className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground" />
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="كلمة المرور (8+)" placeholderTextColor="#94A3B8" className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground" />
        {loginError && <View className="mt-3 w-full rounded-2xl border border-error bg-error/10 p-3"><Text className="text-center text-sm font-bold text-error">{loginError}</Text></View>}
        <Pressable onPress={() => void handleEmailAuth()} disabled={loginBusy} className="mt-4 w-full rounded-2xl bg-primary px-4 py-4">
          <Text className="text-center text-base font-black text-white">{loginBusy ? "جارٍ..." : authMode === "register" ? "إنشاء حساب" : "دخول بالبريد"}</Text>
        </Pressable>
        <View className="my-4 h-px w-full bg-border" />
        <Pressable onPress={() => void handleLogin()} disabled={loginBusy} className="w-full rounded-2xl border border-primary px-4 py-4">
          <Text className="text-center text-base font-black text-primary">المتابعة مع Google</Text>
        </Pressable>
        <Text className="mt-3 text-center text-xs leading-5 text-muted">Google خيار مستقل. كلمة المرور تُشفَّر ولا تُخزَّن بشكل صريح.</Text>
      </View>
    </ScreenContainer>
  );
  return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="privacy" /><Stack.Screen name="terms" /><Stack.Screen name="suggestions" /><Stack.Screen name="download" /><Stack.Screen name="development" /><Stack.Screen name="admin-suggestions" /></Stack>;
}

export default function RootLayout() {
  const network = Network.useNetworkState();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // OTA + remote version policy (flexible upgrades without full reinstall when possible)
  useEffect(() => {
    void runStartupUpdateCheck();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            networkMode: "offlineFirst",
          },
          mutations: {
            retry: 0,
            networkMode: "online",
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <AuthGate />
          {network.isInternetReachable === false && <View style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 20, borderRadius: 16, padding: 12, backgroundColor: "#FFF4E6" }}><Text style={{ color: "#7C3F00", textAlign: "right", fontWeight: "700" }}>لا يوجد اتصال بالإنترنت. يحتاج Flsko إلى شبكة للوصول إلى خدماته؛ إذا كانت الشبكة تحجبها، جرّب تفعيل VPN.</Text></View>}
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}

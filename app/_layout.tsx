import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, Pressable, Text, View } from "react-native";
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
import { startOAuthLogin } from "@/constants/oauth";
import { ScreenContainer } from "@/components/screen-container";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function AuthGate() {
  const { loading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const isOAuthCallback = segments[0] === "oauth";
  const handleLogin = async () => { try { await startOAuthLogin(); } catch { /* keep the gate visible; the user can retry */ } };
  if (isOAuthCallback) return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="oauth/callback" /></Stack>;
  if (loading) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><Text className="text-3xl font-black text-foreground">Flsko</Text><Text className="mt-3 text-center text-muted">جارٍ التحقق من تسجيل الدخول...</Text></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><View className="w-full max-w-md items-center rounded-[32px] border border-border bg-surface p-6"><Text className="text-sm font-bold text-primary">Flsko · فلسقوا</Text><Text className="mt-3 text-center text-3xl font-black text-foreground">مرحبًا بك</Text><Text className="mt-3 text-center leading-6 text-muted">سجّل الدخول أولًا للوصول إلى المحادثة وإنشاء الوسائط والذاكرة السحابية.</Text><Pressable onPress={() => void handleLogin()} style={({ pressed }) => [{ backgroundColor: "#0A7EA4" }, pressed && { opacity: 0.8 }]} className="mt-6 w-full rounded-2xl px-4 py-4"><Text className="text-center text-base font-black text-white">تسجيل الدخول للمتابعة</Text></Pressable><Text className="mt-4 text-center text-xs leading-5 text-muted">سيتم فتح تسجيل الدخول الرسمي ثم العودة تلقائيًا إلى التطبيق.</Text></View></ScreenContainer>;
  return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="privacy" /><Stack.Screen name="suggestions" /><Stack.Screen name="download" /><Stack.Screen name="development" /><Stack.Screen name="admin-suggestions" /></Stack>;
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
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
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

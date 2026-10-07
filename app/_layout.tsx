import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [emailNoticeVisible, setEmailNoticeVisible] = useState(false);
  const [emailNoticeAccepted, setEmailNoticeAccepted] = useState(false);
  const isOAuthCallback = segments[0] === "oauth";
  const isPublicPage = segments[0] === "privacy" || segments[0] === "terms" || segments[0] === "download";
  const handleLogin = async () => {
    if (loginBusy) return;
    setLoginError(null);
    if (networkState.isInternetReachable === false) { setLoginError("لا يوجد اتصال بالإنترنت. اتصل بالشبكة ثم اضغط إعادة المحاولة."); return; }
    setLoginBusy(true);
    try {
      await startOAuthLogin();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "تعذر فتح تسجيل الدخول.");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loginBusy) return;
    setLoginError(null);
    setResetInfo(null);
    const em = email.trim();
    if (!em) { setLoginError("أدخل بريدك أولاً"); return; }
    setLoginBusy(true);
    try {
      const base = (getApiBaseUrl() || "https://flsko-api.flsko.workers.dev").replace(/\/+$/, "");
      const res = await fetch(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string; debugCode?: string };
      if (!res.ok) throw new Error(data.error || "تعذر إرسال الرمز");
      let msg = data.message || "تحقق من بريدك";
      if (data.debugCode) msg += ` · رمز تجريبي: ${data.debugCode}`;
      setResetInfo(msg);
      setAuthMode("reset");
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "فشل الطلب");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (loginBusy) return;
    setLoginError(null);
    setLoginBusy(true);
    try {
      const base = (getApiBaseUrl() || "https://flsko-api.flsko.workers.dev").replace(/\/+$/, "");
      const res = await fetch(`${base}/api/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: resetCode.trim(), newPassword }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "تعذر التعيين");
      setResetInfo(data.message || "تم التحديث");
      setPassword(newPassword);
      setAuthMode("login");
      setResetCode("");
      setNewPassword("");
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "فشل التعيين");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleEmailAuth = async (opts?: { confirmed?: boolean }) => {
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
    // إشعار النسخة الأولى قبل الدخول/التسجيل بالبريد
    if (!opts?.confirmed && !emailNoticeAccepted) {
      setEmailNoticeVisible(true);
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
  if (loading) return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6">
      <Text className="text-4xl font-black text-primary">فلسقوا</Text>
      <Text className="mt-1 text-sm font-bold text-muted">Flsko</Text>
      <ActivityIndicator className="mt-8" color="#0A7EA4" size="large" />
      <Text className="mt-4 text-center text-sm text-muted">نتحقق من جلستك…</Text>
    </ScreenContainer>
  );
  if (!isAuthenticated && !isPublicPage) return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <View className="flex-1 justify-center">
        <View className="w-full max-w-md self-center">
          {/* Brand */}
          <View className="items-center mb-8">
            <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary">
              <Text className="text-2xl font-black text-white">ف</Text>
            </View>
            <Text className="mt-4 text-3xl font-black text-foreground">فلسقوا</Text>
            <Text className="mt-1 text-sm font-bold text-primary">Flsko</Text>
            <Text className="mt-3 text-center text-sm leading-6 text-muted px-2">
              سجّل الدخول أولًا — المحادثة والوسائط والذاكرة مرتبطة بحسابك.
            </Text>
          </View>

          <View className="rounded-[28px] border border-border bg-surface p-5">
            {/* 1) Google — primary */}
            <Text className="text-xs font-bold text-muted text-right mb-2">الطريقة الموصى بها</Text>
            <Pressable
              onPress={() => void handleLogin()}
              disabled={loginBusy}
              className="w-full rounded-2xl bg-primary px-4 py-4"
              style={{ opacity: loginBusy ? 0.7 : 1 }}
            >
              {loginBusy && authMode === "login" && !email ? (
                <View className="flex-row items-center justify-center gap-2">
                  <ActivityIndicator color="#fff" />
                  <Text className="text-center text-base font-black text-white">جارٍ فتح Google…</Text>
                </View>
              ) : (
                <Text className="text-center text-base font-black text-white">تسجيل الدخول عبر Google</Text>
              )}
            </Pressable>
            <Text className="mt-2 text-center text-[11px] leading-5 text-muted">
              أسرع وأكثر أمانًا في النسخة الأولى — تُحفظ بياناتك مع حسابك.
            </Text>

            <View className="my-5 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text className="text-xs text-muted">أو</Text>
              <View className="h-px flex-1 bg-border" />
            </View>

            {/* 2) Email */}
            <Text className="text-xs font-bold text-muted text-right mb-2">البريد الإلكتروني</Text>
            <View className="mb-3 w-full flex-row gap-2">
              <Pressable
                onPress={() => { setAuthMode("login"); setLoginError(null); setResetInfo(null); }}
                className="flex-1 rounded-xl py-2.5"
                style={{ backgroundColor: authMode === "login" ? "#0A7EA4" : "transparent", borderWidth: 1, borderColor: "#0A7EA4" }}
              >
                <Text className="text-center text-xs font-bold" style={{ color: authMode === "login" ? "#fff" : "#0A7EA4" }}>دخول</Text>
              </Pressable>
              <Pressable
                onPress={() => { setAuthMode("register"); setLoginError(null); setResetInfo(null); }}
                className="flex-1 rounded-xl py-2.5"
                style={{ backgroundColor: authMode === "register" ? "#0A7EA4" : "transparent", borderWidth: 1, borderColor: "#0A7EA4" }}
              >
                <Text className="text-center text-xs font-bold" style={{ color: authMode === "register" ? "#fff" : "#0A7EA4" }}>حساب جديد</Text>
              </Pressable>
            </View>

            {authMode === "register" && (
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="الاسم (اختياري)"
                placeholderTextColor="#94A3B8"
                className="mb-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground"
              />
            )}
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="البريد الإلكتروني"
              placeholderTextColor="#94A3B8"
              className="mb-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground"
            />
            {(authMode === "login" || authMode === "register") && (
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="كلمة المرور (8 أحرف على الأقل)"
                placeholderTextColor="#94A3B8"
                className="mb-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground"
              />
            )}
            {authMode === "reset" && (
              <>
                <TextInput
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="رمز التحقق (6 أرقام)"
                  placeholderTextColor="#94A3B8"
                  className="mb-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-center text-lg tracking-widest text-foreground"
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="كلمة المرور الجديدة"
                  placeholderTextColor="#94A3B8"
                  className="mb-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-right text-foreground"
                />
              </>
            )}

            {resetInfo ? (
              <View className="mb-2 w-full rounded-2xl border border-primary/30 bg-primary/10 p-3">
                <Text className="text-center text-sm text-primary">{resetInfo}</Text>
              </View>
            ) : null}
            {loginError ? (
              <View className="mb-2 w-full rounded-2xl border border-error bg-error/10 p-3">
                <Text className="text-center text-sm font-bold text-error">{loginError}</Text>
              </View>
            ) : null}

            {(authMode === "login" || authMode === "register") && (
              <Pressable
                onPress={() => void handleEmailAuth()}
                disabled={loginBusy}
                className="mt-1 w-full rounded-2xl border border-primary px-4 py-3.5"
                style={{ opacity: loginBusy ? 0.7 : 1 }}
              >
                <Text className="text-center text-sm font-black text-primary">
                  {loginBusy ? "جارٍ…" : authMode === "register" ? "إنشاء حساب بالبريد" : "دخول بالبريد"}
                </Text>
              </Pressable>
            )}
            {authMode === "login" && (
              <Pressable onPress={() => { setAuthMode("forgot"); setLoginError(null); setResetInfo(null); }} className="mt-3">
                <Text className="text-center text-xs font-bold text-muted">نسيت كلمة المرور؟</Text>
              </Pressable>
            )}
            {authMode === "forgot" && (
              <Pressable onPress={() => void handleForgotPassword()} disabled={loginBusy} className="mt-1 w-full rounded-2xl border border-primary px-4 py-3.5">
                <Text className="text-center text-sm font-black text-primary">{loginBusy ? "جارٍ الإرسال…" : "إرسال رمز التحقق"}</Text>
              </Pressable>
            )}
            {authMode === "reset" && (
              <Pressable onPress={() => void handleResetPassword()} disabled={loginBusy} className="mt-1 w-full rounded-2xl border border-primary px-4 py-3.5">
                <Text className="text-center text-sm font-black text-primary">{loginBusy ? "جارٍ…" : "تعيين كلمة المرور الجديدة"}</Text>
              </Pressable>
            )}
            {(authMode === "forgot" || authMode === "reset") && (
              <Pressable onPress={() => setAuthMode("login")} className="mt-3">
                <Text className="text-center text-xs text-muted">العودة لتسجيل الدخول</Text>
              </Pressable>
            )}
          </View>

          <Text className="mt-6 text-center text-[11px] leading-5 text-muted px-4">
            بتسجيل الدخول توافق على استخدام حسابك لحفظ المحادثات والملفات في السحابة المرتبطة بك فقط.
          </Text>
        </View>
      </View>

      <Modal visible={emailNoticeVisible} transparent animationType="fade" onRequestClose={() => setEmailNoticeVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }}>
          <View className="max-w-md self-center w-full rounded-3xl border border-border bg-surface p-5">
            <Text className="text-center text-lg font-black text-foreground">تنبيه مهم — النسخة الأولى</Text>
            <ScrollView style={{ maxHeight: 280 }} className="mt-3">
              <Text className="text-sm leading-7 text-muted text-right">
                تطبيق فلسقوا في نسخته الأولى. استعادة كلمة المرور عبر البريد غير مكتملة بالكامل بعد.
                {"\n\n"}
                احفظ كلمة المرور في مكان آمن. إن نسيتها قد تفقد الوصول لحساب البريد مؤقتًا.
                {"\n\n"}
                هذه مشكلة مؤقتة وسيتم حلها مع الإصدار الثاني.
                {"\n\n"}
                للحفظ الأأمن الآن: سجّل الدخول عبر Google.
              </Text>
            </ScrollView>
            <Pressable
              onPress={() => {
                setEmailNoticeAccepted(true);
                setEmailNoticeVisible(false);
                void handleEmailAuth({ confirmed: true });
              }}
              className="mt-4 w-full rounded-2xl bg-primary px-4 py-4"
            >
              <Text className="text-center text-base font-black text-white">فهمت — متابعة بالبريد</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEmailNoticeVisible(false);
                void handleLogin();
              }}
              className="mt-2 w-full rounded-2xl border border-primary px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-primary">التسجيل عبر Google (أأمن حاليًا)</Text>
            </Pressable>
            <Pressable onPress={() => setEmailNoticeVisible(false)} className="mt-2 py-2">
              <Text className="text-center text-xs text-muted">إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

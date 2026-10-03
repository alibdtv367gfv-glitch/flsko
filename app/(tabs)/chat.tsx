import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { AgentProcessing } from "@/components/agent-processing";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { prepareOfflineTts, speakArabic, stopSpeaking } from "@/lib/offline-tts";

type VoiceGender = "male" | "female";
type ChatMode = "natural" | "pro" | "pro-max";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; sourceId?: string };
type DeviceVoice = { identifier: string; language?: string; name?: string };

function voiceMatches(voice: DeviceVoice, gender: VoiceGender) {
  const label = `${voice.name || ""} ${voice.identifier}`.toLocaleLowerCase();
  return gender === "female"
    ? /female|woman|zira|samantha|laila|maged|نورا|أنثى/.test(label)
    : /male|man|maged|tarik|daniel|ذكر/.test(label);
}

function modeLabel(mode: ChatMode) {
  if (mode === "pro") return "برو";
  if (mode === "pro-max") return "سوبر برو";
  return "طبيعي";
}

export default function ChatScreen() {
  const colors = useColors();
  const { isAuthenticated, user } = useAuth() as { isAuthenticated: boolean; user?: { name?: string } };
  const profile = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated, staleTime: 60_000 });
  const files = trpc.files.list.useQuery(undefined, { enabled: isAuthenticated, staleTime: 45_000 });

  const [draft, setDraft] = useState("");
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");
  const [chatMode, setChatMode] = useState<ChatMode>("natural");
  const [liveVoiceMode, setLiveVoiceMode] = useState(false);
  const [liveSessionReady, setLiveSessionReady] = useState(false);
  const [voices, setVoices] = useState<DeviceVoice[]>([]);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastSourceId, setLastSourceId] = useState<string | undefined>();
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topSheetOpen, setTopSheetOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "أنا فلسقوا. احكِ لي ما تريد — محادثة جديدة وسلسة." },
  ]);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const utils = trpc.useUtils();
  const conversationsQuery = trpc.chat.list.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const createConversation = trpc.chat.create.useMutation({
    onSuccess: async (data) => {
      setConversationId(data.id);
      setMessages([{ id: "welcome", role: "assistant", content: "محادثة جديدة. تفضل، أنا فلسقوا." }]);
      setSidebarOpen(false);
      await conversationsQuery.refetch();
    },
  });

  const pinTask = trpc.chat.pinTask.useMutation({
    onSuccess: (data) => {
      Alert.alert("حُفظت كمهمّة", data.message || "الملخص في الذاكرة السحابية.");
      void conversationsQuery.refetch();
      setTopSheetOpen(false);
    },
    onError: (e) => Alert.alert("تعذر الحفظ", e.message),
  });

  const deleteConversation = trpc.chat.delete.useMutation({
    onSuccess: async () => {
      setConversationId(null);
      setMessages([{ id: "welcome", role: "assistant", content: "أنا فلسقوا. ابدأ محادثة جديدة متى شئت." }]);
      await conversationsQuery.refetch();
    },
  });

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then((available) => {
      setVoices(available.filter((voice) => voice.language?.toLocaleLowerCase().startsWith("ar")) as DeviceVoice[]);
    });
    void prepareOfflineTts();
    return () => {
      void stopSpeaking();
    };
  }, []);

  useEffect(() => {
    const gender = profile.data?.gender;
    const greeting =
      gender === "male"
        ? "أهلا بالحبيب، كيف بقدر ساعدك؟"
        : gender === "female"
          ? "أهلا بالأميرة، كيف بقدر ساعد هالجمال؟"
          : "أهلا، كيف بقدر ساعدك؟";
    setMessages((current) =>
      current.length === 1 && current[0].id === "welcome" ? [{ ...current[0], content: greeting }] : current,
    );
  }, [profile.data?.gender]);

  useEffect(() => {
    void requestRecordingPermissionsAsync();
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    return () => {
      void recorder.stop();
    };
  }, [recorder]);

  // Load first conversation if none selected
  useEffect(() => {
    if (!isAuthenticated || conversationId || !conversationsQuery.data?.length) return;
    const first = conversationsQuery.data[0] as { id: number };
    if (first?.id) void openConversation(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversationsQuery.data]);

  const openConversation = useCallback(
    async (id: number) => {
      try {
        const data = await utils.client.chat.get.query({ id });
        setConversationId(id);
        const loaded = (data.messages || []).map((m: { id: number; role: string; content: string }) => ({
          id: String(m.id),
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        }));
        setMessages(
          loaded.length
            ? loaded
            : [{ id: "welcome", role: "assistant", content: "هذه المحادثة فارغة — اكتب أول رسالة." }],
        );
        if (data.conversation?.mode === "pro" || data.conversation?.mode === "pro-max" || data.conversation?.mode === "natural") {
          setChatMode(data.conversation.mode as ChatMode);
        }
        setSidebarOpen(false);
      } catch (e) {
        Alert.alert("تعذر فتح المحادثة", e instanceof Error ? e.message : "خطأ");
      }
    },
    [utils.client.chat.get],
  );

  const mutation = trpc.agent.chat.useMutation({
    onSuccess: (data, variables) => {
      const assistant: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: data.text,
        sourceId: data.sourceId,
      };
      setLastSourceId(data.sourceId);
      if (data.conversationId && !conversationId) setConversationId(data.conversationId);
      setMessages((current) =>
        variables.excludeSource
          ? [...current, assistant]
          : [...current, { id: `${Date.now()}-user`, role: "user", content: variables.message }, assistant],
      );
      void conversationsQuery.refetch();
    },
    onError: (error) => Alert.alert("تعذر الرد", error.message || "حاول مرة أخرى."),
  });

  const reportMutation = trpc.safety.report.useMutation();

  const readAloud = (text: string) => {
    const selected = voices.find((voice) => voiceMatches(voice, voiceGender)) || voices[0];
    void speakArabic(text, {
      voiceId: selected?.identifier,
      rate: 0.92,
      pitch: voiceGender === "female" ? 1.05 : 0.9,
    });
  };

  const voiceSessionStart = trpc.agent.voiceSessionStart.useMutation({
    onSuccess: (data) => {
      setLiveSessionReady(true);
      setLiveVoiceMode(true);
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-live-greet`, role: "assistant", content: data.greeting, sourceId: data.provider },
      ]);
      readAloud(data.greeting);
    },
    onError: (error) => Alert.alert("تعذر بدء المحادثة الصوتية", error.message || "حاول مرة أخرى."),
  });

  const voiceTurnMutation = trpc.agent.voiceTurn.useMutation({
    onSuccess: (data) => {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user-voice`, role: "user", content: data.transcript },
        { id: `${Date.now()}-assistant-voice`, role: "assistant", content: data.text, sourceId: data.sourceId },
      ]);
      setDraft("");
      readAloud(data.text);
    },
    onError: (error) => Alert.alert("تعذر المحادثة الصوتية", error.message || "حاول مقطعًا أقصر."),
  });

  const enterLiveVoice = () => {
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لبدء محادثة صوتية مباشرة مع فلسقوا.", [
        { text: "لاحقًا", style: "cancel" },
        { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    voiceSessionStart.mutate({ mode: chatMode });
  };

  const exitLiveVoice = () => {
    setLiveVoiceMode(false);
    setLiveSessionReady(false);
    void stopSpeaking();
  };

  const toggleRecording = async () => {
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لاستخدام المحادثة الصوتية.", [
        { text: "لاحقًا", style: "cancel" },
        { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    if (recorderState.isRecording) {
      await recorder.stop();
      if (!recorder.uri) return;
      const base64 = await FileSystem.readAsStringAsync(recorder.uri, { encoding: FileSystem.EncodingType.Base64 });
      voiceTurnMutation.mutate({ dataUri: `data:audio/m4a;base64,${base64}`, language: "ar", mode: chatMode });
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("إذن الميكروفون مطلوب", "اسمح بالوصول إلى الميكروفون من الإعدادات.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const send = () => {
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا.", [
        { text: "لاحقًا", style: "cancel" },
        { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    if (!draft.trim() || mutation.isPending || voiceTurnMutation.isPending) return;
    const message = draft.trim();
    setDraft("");
    setLastPrompt(message);
    setLastSourceId(undefined);
    mutation.mutate({
      message,
      mode: chatMode,
      attachmentIds: selectedFileIds,
      conversationId: conversationId ?? undefined,
    });
    setSelectedFileIds([]);
  };

  const busy = mutation.isPending || voiceTurnMutation.isPending;
  const displayName = profile.data?.displayName || user?.name || "حسابك";
  const conversationTitle = useMemo(() => {
    const list = (conversationsQuery.data || []) as Array<{ id: number; title: string }>;
    return list.find((c) => c.id === conversationId)?.title || "محادثة";
  }, [conversationsQuery.data, conversationId]);

  return (
    <ScreenContainer className="px-0 pt-2">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        {/* Top bar */}
        <View className="flex-row items-center gap-2 border-b border-border px-3 pb-2">
          <Pressable
            onPress={() => setSidebarOpen(true)}
            className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"
          >
            <Text className="text-lg font-black text-primary">☰</Text>
          </Pressable>
          <Pressable onPress={() => setTopSheetOpen(true)} className="min-h-11 flex-1 justify-center rounded-2xl border border-border bg-surface px-3 py-2">
            <Text className="text-xs font-bold text-muted">فلسقوا · {modeLabel(chatMode)}</Text>
            <Text className="text-sm font-black text-foreground" numberOfLines={1}>
              {conversationTitle}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => createConversation.mutate({ mode: chatMode })}
            className="h-11 items-center justify-center rounded-2xl bg-primary px-3"
          >
            <Text className="text-xs font-black text-background">+ جديد</Text>
          </Pressable>
        </View>

        {/* Messages */}
        <ScrollView
          className="flex-1 px-3"
          contentContainerStyle={{ gap: 12, paddingVertical: 14, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
              className={`max-w-[92%] rounded-3xl p-4 ${message.role === "user" ? "self-start bg-primary" : "self-end border border-border bg-surface"}`}
            >
              <Text className="mb-1 text-xs font-bold" style={{ color: message.role === "user" ? colors.background : colors.primary }}>
                {message.role === "user" ? "أنت" : "فلسقوا"}
              </Text>
              <Text className="text-base leading-7" style={{ color: message.role === "user" ? colors.background : colors.foreground }}>
                {message.content}
              </Text>
              {message.role === "assistant" && (
                <Pressable onPress={() => readAloud(message.content)} className="mt-3">
                  <Text className="text-xs font-semibold text-primary">استمع</Text>
                </Pressable>
              )}
            </View>
          ))}
          {busy && <AgentProcessing mode="chat" />}
        </ScrollView>

        {/* Composer — wide & roomy */}
        <View className="border-t border-border bg-background px-3 pb-3 pt-2">
          {files.data?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              <View className="flex-row gap-2">
                {files.data.slice(0, 8).map((file) => {
                  const active = selectedFileIds.includes(file.id);
                  return (
                    <Pressable
                      key={file.id}
                      onPress={() =>
                        setSelectedFileIds((current) =>
                          active ? current.filter((id) => id !== file.id) : current.length < 4 ? [...current, file.id] : current,
                        )
                      }
                      className="rounded-full border px-3 py-2"
                      style={{ backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }}
                    >
                      <Text className="max-w-[120px] text-xs font-bold" numberOfLines={1} style={{ color: active ? colors.background : colors.foreground }}>
                        {file.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}

          <View className="min-h-[56px] flex-row items-end gap-2 rounded-3xl border border-border bg-surface px-2 py-2">
            <Pressable onPress={() => router.push("/(tabs)/library")} className="mb-1 h-12 w-11 items-center justify-center rounded-2xl">
              <Text className="text-xl text-primary">＋</Text>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="اكتب لفلسقوا…"
              placeholderTextColor={colors.muted}
              multiline
              className="max-h-36 min-h-[48px] flex-1 py-3 text-base leading-6 text-foreground"
              style={{ textAlign: "right", writingDirection: "rtl" }}
              onSubmitEditing={send}
            />
            <Pressable
              onPress={() => void toggleRecording()}
              disabled={voiceTurnMutation.isPending}
              className="mb-1 h-12 min-w-[48px] items-center justify-center rounded-2xl border border-border px-2"
              style={{ backgroundColor: recorderState.isRecording ? colors.error : colors.background }}
            >
              <Text className="text-xs font-bold" style={{ color: recorderState.isRecording ? colors.background : colors.primary }}>
                {voiceTurnMutation.isPending ? "…" : recorderState.isRecording ? "⏹" : "🎙"}
              </Text>
            </Pressable>
            <Pressable
              onPress={send}
              disabled={busy || !draft.trim()}
              className="mb-1 h-12 min-w-[56px] items-center justify-center rounded-2xl px-3"
              style={{ backgroundColor: busy || !draft.trim() ? colors.border : colors.primary }}
            >
              {busy ? <ActivityIndicator color={colors.background} /> : <Text className="text-sm font-black" style={{ color: colors.background }}>إرسال</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Side drawer — conversations + profile */}
      <Modal visible={sidebarOpen} animationType="slide" transparent onRequestClose={() => setSidebarOpen(false)}>
        <View className="flex-1 flex-row">
          <View className="h-full w-[86%] max-w-md border-l border-border bg-background px-4 pt-12">
            <View className="mb-4 rounded-3xl border border-border bg-surface p-4">
              <Text className="text-xs font-bold text-muted">المستخدم</Text>
              <Text className="mt-1 text-lg font-black text-foreground">{displayName}</Text>
              {profile.data?.governorate ? <Text className="mt-1 text-xs text-muted">{profile.data.governorate}</Text> : null}
              <Pressable onPress={() => { setSidebarOpen(false); router.push("/(tabs)/memory"); }} className="mt-3">
                <Text className="text-xs font-bold text-primary">الملف والذاكرة ←</Text>
              </Pressable>
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-black text-foreground">محادثاتك</Text>
              <Pressable onPress={() => createConversation.mutate({ mode: chatMode })}>
                <Text className="text-xs font-bold text-primary">محادثة جديدة</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(conversationsQuery.data || []).map((c: { id: number; title: string; pinnedTask?: number; updatedAt?: number }) => {
                const active = c.id === conversationId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => void openConversation(c.id)}
                    onLongPress={() =>
                      Alert.alert(c.title, "اختر إجراءً", [
                        { text: "إلغاء", style: "cancel" },
                        {
                          text: "حفظ كمهمّة (ملخص)",
                          onPress: () => pinTask.mutate({ id: c.id }),
                        },
                        {
                          text: "حذف",
                          style: "destructive",
                          onPress: () => deleteConversation.mutate({ id: c.id }),
                        },
                      ])
                    }
                    className="mb-2 rounded-2xl border px-3 py-3"
                    style={{
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text className="text-sm font-bold" numberOfLines={1} style={{ color: active ? colors.background : colors.foreground }}>
                      {c.pinnedTask ? "📌 " : ""}
                      {c.title}
                    </Text>
                    <Text className="mt-1 text-[10px]" style={{ color: active ? `${colors.background}CC` : colors.muted }}>
                      {c.pinnedTask ? "مهمّة محفوظة" : "تُحذف تلقائيًا بعد 30 يومًا إن لم تُثبَّت"}
                    </Text>
                  </Pressable>
                );
              })}
              {!conversationsQuery.data?.length && (
                <Text className="mt-6 text-center text-sm text-muted">لا محادثات بعد — ابدأ واحدة جديدة.</Text>
              )}
            </ScrollView>
            <Pressable onPress={() => setSidebarOpen(false)} className="mb-8 mt-3 rounded-2xl border border-border py-3">
              <Text className="text-center font-bold text-muted">إغلاق</Text>
            </Pressable>
          </View>
          <Pressable className="flex-1 bg-black/40" onPress={() => setSidebarOpen(false)} />
        </View>
      </Modal>

      {/* Top sheet — agent mode + pin task + voice */}
      <Modal visible={topSheetOpen} animationType="fade" transparent onRequestClose={() => setTopSheetOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setTopSheetOpen(false)}>
          <View className="mt-0 rounded-b-3xl border-b border-border bg-background px-4 pb-6 pt-12" onStartShouldSetResponder={() => true}>
            <Text className="text-center text-sm font-black text-foreground">إعدادات الوكيل</Text>
            <Text className="mt-1 text-center text-xs text-muted">اختر أسلوب فلسقوا لهذه المحادثة</Text>

            <View className="mt-4 flex-row gap-2">
              {([
                { id: "natural" as const, title: "طبيعي", sub: "سريع" },
                { id: "pro" as const, title: "برو", sub: "أعمق" },
                { id: "pro-max" as const, title: "سوبر برو", sub: "أقوى" },
              ]).map((m) => {
                const active = chatMode === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setChatMode(m.id)}
                    className="flex-1 rounded-2xl px-2 py-3"
                    style={{ backgroundColor: active ? colors.primary : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
                  >
                    <Text className="text-center text-xs font-black" style={{ color: active ? colors.background : colors.foreground }}>
                      {m.title}
                    </Text>
                    <Text className="mt-1 text-center text-[10px]" style={{ color: active ? `${colors.background}CC` : colors.muted }}>
                      {m.sub}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-4 flex-row gap-2">
              {(["female", "male"] as const).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setVoiceGender(g)}
                  className="flex-1 rounded-2xl py-3"
                  style={{ backgroundColor: voiceGender === g ? colors.primary : colors.surface }}
                >
                  <Text className="text-center text-xs font-bold" style={{ color: voiceGender === g ? colors.background : colors.foreground }}>
                    {g === "female" ? "صوت فتاة" : "صوت رجل"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => {
                if (!conversationId) {
                  Alert.alert("لا محادثة", "أرسل رسالة أولًا أو افتح محادثة من القائمة.");
                  return;
                }
                pinTask.mutate({ id: conversationId });
              }}
              disabled={pinTask.isPending}
              className="mt-4 rounded-2xl bg-primary py-4"
            >
              <Text className="text-center text-sm font-black text-background">
                {pinTask.isPending ? "يلخّص ويحفظ…" : "📌 حفظ كمهمّة (ملخص في الذاكرة السحابية)"}
              </Text>
            </Pressable>
            <Text className="mt-2 text-center text-[10px] leading-5 text-muted">
              يُنشئ فلسقوا ملخصًا للمعلومات المهمة فقط. المحادثات غير المثبّتة تُحذف بعد شهر لتوفير المساحة.
            </Text>

            {!liveVoiceMode ? (
              <Pressable onPress={enterLiveVoice} className="mt-3 rounded-2xl border border-primary py-3">
                <Text className="text-center text-xs font-bold text-primary">🎙 محادثة صوتية مباشرة</Text>
              </Pressable>
            ) : (
              <Pressable onPress={exitLiveVoice} className="mt-3 rounded-2xl border border-border py-3">
                <Text className="text-center text-xs font-bold text-muted">إنهاء الجلسة الصوتية {liveSessionReady ? "· جاهز" : ""}</Text>
              </Pressable>
            )}

            <Pressable onPress={() => setTopSheetOpen(false)} className="mt-4 py-2">
              <Text className="text-center font-bold text-muted">إغلاق</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

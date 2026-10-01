import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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

export default function ChatScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const profile = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated });
  const files = trpc.files.list.useQuery(undefined, { enabled: isAuthenticated });
  const [draft, setDraft] = useState("");
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");
  const [chatMode, setChatMode] = useState<ChatMode>("natural");
  const [voices, setVoices] = useState<DeviceVoice[]>([]);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastSourceId, setLastSourceId] = useState<string | undefined>();
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "أنا فلسقوا. احكِ لي ما تريد، وبإمكاني مساعدتك في الفكرة أو النص أو الصورة أو الفيديو." },
  ]);

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then((available) => {
      setVoices(available.filter((voice) => voice.language?.toLocaleLowerCase().startsWith("ar")) as DeviceVoice[]);
    });
    // Prefer ONNX offline TTS on Android dev builds; falls back to system Speech
    void prepareOfflineTts();
    return () => { void stopSpeaking(); };
  }, []);

  useEffect(() => {
    const gender = profile.data?.gender;
    const greeting = gender === "male" ? "أهلا بالحبيب، كيف بقدر ساعدك؟" : gender === "female" ? "أهلا بالأميرة، كيف بقدر ساعد هالجمال؟" : "أهلا، كيف بقدر ساعدك؟";
    setMessages((current) => current.length === 1 && current[0].id === "welcome" ? [{ ...current[0], content: greeting }] : current);
  }, [profile.data?.gender]);

  useEffect(() => {
    void requestRecordingPermissionsAsync();
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    return () => { void recorder.stop(); };
  }, [recorder]);

  const mutation = trpc.agent.chat.useMutation({
    onSuccess: (data, variables) => {
      const assistant: ChatMessage = { id: `${Date.now()}-assistant`, role: "assistant", content: data.text, sourceId: data.sourceId };
      setLastSourceId(data.sourceId);
      setMessages((current) => variables.excludeSource
        ? [...current, assistant]
        : [...current, { id: `${Date.now()}-user`, role: "user", content: variables.message }, assistant]);
    },
    onError: (error) => Alert.alert("تعذر الرد", error.message || "حاول مرة أخرى."),
  });
  const reportMutation = trpc.safety.report.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation({
    onSuccess: (data) => setDraft((current) => current ? `${current} ${data.text}` : data.text),
    onError: (error) => Alert.alert("تعذر فهم التسجيل", error.message || "حاول تسجيل مقطع أقصر."),
  });

  const readAloud = (text: string) => {
    const selected = voices.find((voice) => voiceMatches(voice, voiceGender)) || voices[0];
    void speakArabic(text, {
      voiceId: selected?.identifier,
      rate: 0.92,
      pitch: voiceGender === "female" ? 1.05 : 0.9,
    });
  };

  const toggleRecording = async () => {
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لاستخدام المحادثة الصوتية وحفظها بأمان.", [{ text: "لاحقًا", style: "cancel" }, { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() }]);
      return;
    }
    if (recorderState.isRecording) {
      await recorder.stop();
      if (!recorder.uri) return;
      const base64 = await FileSystem.readAsStringAsync(recorder.uri, { encoding: FileSystem.EncodingType.Base64 });
      transcribeMutation.mutate({ dataUri: `data:audio/m4a;base64,${base64}`, language: "ar" });
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("إذن الميكروفون مطلوب", "اسمح بالوصول إلى الميكروفون من إعدادات الجهاز لتسجيل رسالتك.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const reportMessage = (messageId: string) => {
    Alert.alert("الإبلاغ عن المحتوى", "هل تريد الإبلاغ عن هذه الإجابة لمراجعة السلامة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "محتوى ضار", onPress: () => reportMutation.mutate({ targetType: "chat", targetId: messageId, reason: "أبلغ المستخدم عن محتوى يحتاج إلى مراجعة السلامة" }) },
    ]);
  };

  const send = () => {
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا لحفظ المحادثة وتشغيل الوكيل السحابي.", [
        { text: "لاحقًا", style: "cancel" },
        { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    if (!draft.trim() || mutation.isPending) return;
    const message = draft.trim();
    setDraft("");
    setLastPrompt(message);
    setLastSourceId(undefined);
    mutation.mutate({ message, mode: chatMode, attachmentIds: selectedFileIds });
    setSelectedFileIds([]);
  };

  const retryWithAnotherSource = () => {
    if (!lastPrompt || mutation.isPending) return;
    mutation.mutate({ message: lastPrompt, mode: chatMode, excludeSource: lastSourceId });
  };

  return (
    <ScreenContainer className="px-5 pt-4">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text className="text-sm font-semibold text-primary">مساحة الحوار</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">احكِ مع Flsko</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">يفهم العربية واللهجات السورية، ويتعلم فقط ما تختار حفظه.</Text>

        <View className="mt-4 rounded-2xl border border-border bg-surface p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-muted">صوت قراءة الإجابات</Text>
            <Text className="text-xs text-primary">يعمل من جهازك</Text>
          </View>
          <View className="mt-2 flex-row gap-2">
            {(["female", "male"] as const).map((gender) => (
              <Pressable key={gender} onPress={() => setVoiceGender(gender)} style={({ pressed }) => [{ backgroundColor: voiceGender === gender ? colors.primary : colors.background }, pressed && { opacity: 0.8 }]} className="flex-1 rounded-xl px-3 py-2">
                <Text className="text-center text-xs font-bold" style={{ color: voiceGender === gender ? colors.background : colors.foreground }}>{gender === "female" ? "صوت فتاة" : "صوت رجل"}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="mt-3 rounded-2xl border border-border bg-surface p-3">
          <Text className="text-xs font-bold text-muted">أسلوب الإجابة</Text>
          <View className="mt-2 flex-row gap-2">
            {(["natural", "pro", "pro-max"] as const).map((mode) => {
              const active = chatMode === mode;
              return (
                <Pressable key={mode} onPress={() => setChatMode(mode)} style={({ pressed }) => [{ flex: 1, borderRadius: 12, paddingVertical: 10, backgroundColor: active ? colors.primary : colors.background }, pressed && { opacity: 0.8 }]}>
                  <Text className="text-center text-xs font-bold" style={{ color: active ? colors.background : colors.foreground }}>{mode === "natural" ? "إجابة سريعة" : mode === "pro" ? "برو" : "برو ماكس"}</Text>
                  <Text className="mt-1 text-center text-[10px]" style={{ color: active ? `${colors.background}CC` : colors.muted }}>{mode === "natural" ? "طبيعي" : mode === "pro" ? "تفكير" : "تحليل"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView className="mt-5 flex-1 rounded-3xl" style={{ backgroundColor: profile.data?.chatBackground || colors.background }} contentContainerStyle={{ gap: 12, padding: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {messages.map((message) => (
            <View key={message.id} className={`max-w-[88%] rounded-3xl p-4 ${message.role === "user" ? "self-start bg-primary" : "self-end border border-border bg-surface"}`}>
              <Text className="mb-1 text-xs font-bold" style={{ color: message.role === "user" ? colors.background : colors.primary }}>{message.role === "user" ? "أنت" : "فلسقوا"}</Text>
              <Text className="text-base leading-7" style={{ color: message.role === "user" ? colors.background : colors.foreground }}>{message.content}</Text>
              {message.role === "assistant" && <View className="mt-3 flex-row gap-4"><Pressable onPress={() => readAloud(message.content)}><Text className="text-xs font-semibold text-primary">استمع</Text></Pressable>{message.id !== "welcome" && <Pressable onPress={() => reportMessage(message.id)} disabled={reportMutation.isPending}><Text className="text-xs font-semibold text-muted">إبلاغ</Text></Pressable>}</View>}
            </View>
          ))}
          {mutation.isPending && <AgentProcessing mode="chat" />}
          {!mutation.isPending && lastPrompt && lastSourceId && <Pressable onPress={retryWithAnotherSource} style={({ pressed }) => [pressed && { opacity: 0.75 }]} className="self-center rounded-full border border-primary px-4 py-2"><Text className="text-xs font-bold text-primary">إجابة أخرى من مصدر مختلف</Text></Pressable>}
        </ScrollView>

        {files.data?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2"><View className="flex-row gap-2">{files.data.slice(0, 8).map((file) => { const active = selectedFileIds.includes(file.id); return <Pressable key={file.id} onPress={() => setSelectedFileIds((current) => active ? current.filter((id) => id !== file.id) : current.length < 4 ? [...current, file.id] : current)} style={{ backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }} className="rounded-full border px-3 py-2"><Text className="max-w-[120px] text-xs font-bold" numberOfLines={1} style={{ color: active ? colors.background : colors.foreground }}>{file.name}</Text></Pressable>; })}</View></ScrollView> : null}
        <View className="mb-2 flex-row items-end gap-2 rounded-3xl border border-border bg-surface p-2">
          <Pressable onPress={() => router.push("/(tabs)/library")} style={({ pressed }) => [pressed && { opacity: 0.7 }]} className="h-12 w-12 items-center justify-center rounded-2xl border border-border"><Text className="text-xl text-primary">＋</Text></Pressable>
          <TextInput value={draft} onChangeText={setDraft} multiline textAlign="right" placeholder="اكتب رسالتك..." placeholderTextColor={colors.muted} className="max-h-28 min-h-[48px] flex-1 px-3 py-3 text-base text-foreground" />
          <Pressable onPress={() => void toggleRecording()} disabled={transcribeMutation.isPending} style={({ pressed }) => [{ backgroundColor: recorderState.isRecording ? colors.error : colors.background }, pressed && { opacity: 0.75 }]} className="h-12 min-w-[52px] items-center justify-center rounded-2xl border border-border"><Text className="text-xs font-bold" style={{ color: recorderState.isRecording ? colors.background : colors.primary }}>{transcribeMutation.isPending ? "يفهم" : recorderState.isRecording ? "إيقاف" : "تسجيل"}</Text></Pressable>
          <Pressable onPress={send} style={({ pressed }) => [pressed && { opacity: 0.75 }]} className="h-12 w-12 items-center justify-center rounded-2xl bg-primary"><Text className="text-xl font-black text-background">↑</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Speech from "expo-speech";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { AgentProcessing } from "@/components/agent-processing";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type VoiceGender = "male" | "female";
type ChatMode = "natural" | "pro" | "pro-max";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; sourceId?: string };
type DeviceVoice = { identifier: string; language?: string; name?: string };

function voiceMatches(voice: DeviceVoice, gender: VoiceGender) {
  const label = `${voice.name || ""} ${voice.identifier}`.toLocaleLowerCase();
  return gender === "female" ? /female|woman|zira|samantha|laila|نورا|أنثى/.test(label) : /male|man|maged|tarik|daniel|ذكر/.test(label);
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
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", role: "assistant", content: "أنا فلسقوا. احكِ لي ما تريد، وبإمكاني مساعدتك في الفكرة أو النص أو الصورة أو الفيديو." }]);

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then((available) => setVoices(available.filter((voice) => voice.language?.toLocaleLowerCase().startsWith("ar")) as DeviceVoice[]));
    return () => { void Speech.stop(); };
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
      setMessages((current) => variables.excludeSource ? [...current, assistant] : [...current, { id: `${Date.now()}-user`, role: "user", content: variables.message }, assistant]);
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
    void Speech.stop();
    Speech.speak(text, { language: "ar-SA", voice: selected?.identifier, rate: 0.92, pitch: voiceGender === "female" ? 1.05 : 0.9 });
  };
  const toggleRecording = async () => {
    if (!isAuthenticated) { Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لاستخدام المحادثة الصوتية وحفظها بأمان.", [{ text: "لاحقًا", style: "cancel" }, { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() }]); return; }
    if (recorderState.isRecording) { await recorder.stop(); if (!recorder.uri) return; const base64 = await FileSystem.readAsStringAsync(recorder.uri, { encoding: FileSystem.EncodingType.Base64 }); transcribeMutation.mutate({ dataUri: `data:audio/m4a;base64,${base64}`, language: "ar" }); return; }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { Alert.alert("إذن الميكروفون مطلوب", "اسمح بالوصول إلى الميكروفون من إعدادات الجهاز لتسجيل رسالتك."); return; }
    await recorder.prepareToRecordAsync(); recorder.record();
  };
  const send = () => {
    if (!isAuthenticated) { Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا لحفظ المحادثة وتشغيل الوكيل السحابي.", [{ text: "لاحقًا", style: "cancel" }, { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() }]); return; }
    if (!draft.trim() || mutation.isPending) return;
    const message = draft.trim(); setDraft(""); setLastPrompt(message); setLastSourceId(undefined); mutation.mutate({ message, mode: chatMode, attachmentIds: selectedFileIds }); setSelectedFileIds([]);
  };
  const retryWithAnotherSource = () => { if (lastPrompt && !mutation.isPending) mutation.mutate({ message: lastPrompt, mode: chatMode, excludeSource: lastSourceId }); };
  const reportMessage = (messageId: string) => Alert.alert("الإبلاغ عن المحتوى", "هل تريد الإبلاغ عن هذه الإجابة لمراجعة السلامة؟", [{ text: "إلغاء", style: "cancel" }, { text: "محتوى ضار", onPress: () => reportMutation.mutate({ targetType: "chat", targetId: messageId, reason: "أبلغ المستخدم عن محتوى يحتاج إلى مراجعة السلامة" }) }]);

  return (
    <ScreenContainer className="px-5 pt-3">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View><Text style={[styles.eyebrow, { color: colors.primary }]}>مساحة الحوار</Text><Text style={[styles.title, { color: colors.foreground }]}>احكِ مع فلسقوا</Text><Text style={[styles.subtitle, { color: colors.muted }]}>يفهمك، ثم يترك لك القرار.</Text></View>
          <View style={[styles.onlineBadge, { backgroundColor: `${colors.success}15` }]}><View style={[styles.onlineDot, { backgroundColor: colors.success }]} /><Text style={[styles.onlineText, { color: colors.success }]}>متصل</Text></View>
        </View>

        <View style={[styles.controlCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.controlTop}><View style={styles.controlLabel}><MaterialIcons name="volume-up" size={17} color={colors.primary} /><Text style={[styles.controlTitle, { color: colors.foreground }]}>صوت القراءة</Text></View><Text style={[styles.controlHint, { color: colors.muted }]}>من جهازك</Text></View>
          <View style={styles.segmentRow}>{(["female", "male"] as const).map((gender) => <Pressable key={gender} onPress={() => setVoiceGender(gender)} style={[styles.segment, { backgroundColor: voiceGender === gender ? colors.primary : colors.background }]}><Text style={{ color: voiceGender === gender ? colors.background : colors.foreground, fontSize: 12, fontWeight: "800" }}>{gender === "female" ? "صوت فتاة" : "صوت رجل"}</Text></Pressable>)}</View>
          <View style={styles.modeLabel}><Text style={[styles.controlTitle, { color: colors.foreground }]}>أسلوب الإجابة</Text><Text style={[styles.controlHint, { color: colors.muted }]}>يتغير حسب حاجتك</Text></View>
          <View style={styles.segmentRow}>{(["natural", "pro", "pro-max"] as const).map((mode) => <Pressable key={mode} onPress={() => setChatMode(mode)} style={[styles.modeSegment, { backgroundColor: chatMode === mode ? `${colors.primary}18` : colors.background, borderColor: chatMode === mode ? colors.primary : colors.border }]}><Text style={{ color: chatMode === mode ? colors.primary : colors.foreground, fontSize: 11, fontWeight: "900" }}>{mode === "natural" ? "طبيعي" : mode === "pro" ? "برو" : "برو ماكس"}</Text></Pressable>)}</View>
        </View>

        <ScrollView style={[styles.messageArea, { backgroundColor: profile.data?.chatBackground || colors.background }]} contentContainerStyle={styles.messageContent} showsVerticalScrollIndicator={false}>
          {messages.map((message) => <View key={message.id} style={[styles.message, message.role === "user" ? { alignSelf: "flex-start", backgroundColor: colors.primary } : { alignSelf: "flex-end", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}><View style={styles.messageMeta}><MaterialIcons name={message.role === "user" ? "person" : "auto-awesome"} size={14} color={message.role === "user" ? colors.background : colors.primary} /><Text style={{ color: message.role === "user" ? colors.background : colors.primary, fontSize: 11, fontWeight: "900" }}>{message.role === "user" ? "أنت" : "فلسقوا"}</Text></View><Text style={{ color: message.role === "user" ? colors.background : colors.foreground, fontSize: 15, lineHeight: 25 }}>{message.content}</Text>{message.role === "assistant" && <View style={styles.messageActions}><Pressable onPress={() => readAloud(message.content)}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>استمع</Text></Pressable>{message.id !== "welcome" && <Pressable onPress={() => reportMessage(message.id)} disabled={reportMutation.isPending}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>إبلاغ</Text></Pressable>}</View>}</View>)}
          {mutation.isPending && <AgentProcessing mode="chat" />}
          {!mutation.isPending && lastPrompt && lastSourceId && <Pressable onPress={retryWithAnotherSource} style={[styles.retry, { borderColor: colors.primary }]}><MaterialIcons name="refresh" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>إجابة أخرى من مصدر مختلف</Text></Pressable>}
        </ScrollView>

        {files.data?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fileStrip}><View style={styles.fileRow}>{files.data.slice(0, 8).map((file) => { const active = selectedFileIds.includes(file.id); return <Pressable key={file.id} onPress={() => setSelectedFileIds((current) => active ? current.filter((id) => id !== file.id) : current.length < 4 ? [...current, file.id] : current)} style={[styles.fileChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: active ? colors.background : colors.foreground, fontSize: 11, fontWeight: "800" }} numberOfLines={1}>{file.name}</Text></Pressable>; })}</View></ScrollView> : null}
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable onPress={() => router.push("/(tabs)/library")} style={[styles.iconButton, { borderColor: colors.border }]}><MaterialIcons name="add" size={22} color={colors.primary} /></Pressable>
          <TextInput value={draft} onChangeText={setDraft} multiline textAlign="right" placeholder="اكتب ما يدور ببالك..." placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground }]} />
          <Pressable onPress={() => void toggleRecording()} disabled={transcribeMutation.isPending} style={[styles.voiceButton, { backgroundColor: recorderState.isRecording ? colors.error : colors.background, borderColor: colors.border }]}><MaterialIcons name={recorderState.isRecording ? "stop" : "mic-none"} size={19} color={recorderState.isRecording ? colors.background : colors.primary} /></Pressable>
          <Pressable onPress={send} style={[styles.sendButton, { backgroundColor: colors.primary }]}><MaterialIcons name="arrow-upward" size={21} color={colors.background} /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: "900", marginBottom: 5 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 12, marginTop: 4 },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 10, fontWeight: "900" },
  controlCard: { borderWidth: 1, borderRadius: 22, padding: 13, marginBottom: 12 },
  controlTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  controlLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  controlTitle: { fontSize: 12, fontWeight: "900" },
  controlHint: { fontSize: 10 },
  segmentRow: { flexDirection: "row", gap: 7, marginTop: 9 },
  segment: { flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: "center" },
  modeLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  modeSegment: { flex: 1, borderWidth: 1, borderRadius: 11, paddingVertical: 8, alignItems: "center" },
  messageArea: { flex: 1, borderRadius: 24 },
  messageContent: { gap: 11, padding: 13, paddingBottom: 20 },
  message: { maxWidth: "88%", borderRadius: 22, padding: 14 },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 7 },
  messageActions: { flexDirection: "row", gap: 16, marginTop: 11 },
  retry: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  fileStrip: { marginTop: 9, marginBottom: 3 },
  fileRow: { flexDirection: "row", gap: 7 },
  fileChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, maxWidth: 140 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, borderWidth: 1, borderRadius: 24, padding: 7, marginTop: 8, marginBottom: 2 },
  iconButton: { width: 43, height: 43, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 43, maxHeight: 108, paddingHorizontal: 7, paddingVertical: 10, fontSize: 14 },
  voiceButton: { width: 43, height: 43, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  sendButton: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});

import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { AgentProcessing } from "@/components/agent-processing";
import { InlineAudioPlayer, InlineVideoPlayer } from "@/components/inline-media-player";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Kind = "image" | "video" | "music";
const kindMeta: Record<Kind, { label: string; icon: keyof typeof MaterialIcons.glyphMap; title: string; helper: string }> = {
  image: { label: "صورة", icon: "image", title: "صمّم مشهدك", helper: "ملصق سينمائي لمدينة دمشق وقت الغروب، تفاصيل معمارية واقعية، إضاءة ذهبية" },
  video: { label: "فيديو", icon: "movie-creation", title: "حرّك فكرتك", helper: "لقطة سينمائية لشارع قديم بعد المطر، حركة كاميرا بطيئة، ضوء دافئ، 5 ثوانٍ" },
  music: { label: "موسيقى", icon: "music-note", title: "اصنع مزاجًا", helper: "موسيقى شرقية سورية هادئة، عود وقانون وإيقاع خفيف، دقيقة واحدة، بدون كلمات" },
};

export default function CreateScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { isAuthenticated } = useAuth();
  const [kind, setKind] = useState<Kind>(params.kind === "video" ? "video" : params.kind === "music" ? "music" : "image");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{ status: string; url?: string; message?: string; provider?: string; jobId?: string; estimatedWaitSec?: number } | null>(null);
  const [waitLeft, setWaitLeft] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const utils = trpc.useUtils();
  const mutation = trpc.agent.generate.useMutation({
    onSuccess: async (data) => {
      setResult(data);
      const est = typeof data.estimatedWaitSec === "number" ? data.estimatedWaitSec : kind === "video" ? 120 : kind === "image" ? 45 : 30;
      if (data.status === "queued" && data.jobId) {
        setWaitLeft(est);
        setPolling(true);
        // Auto-poll until complete or budget exhausted (~2–3 min for video)
        const budgetMs = Math.max(est, 90) * 1000;
        const started = Date.now();
        while (Date.now() - started < budgetMs) {
          await new Promise((r) => setTimeout(r, 8000));
          try {
            const job = await utils.client.agent.mediaJob.mutate({ jobId: data.jobId });
            setResult(job);
            if (job.status === "completed" && job.url) {
              setWaitLeft(0);
              setPolling(false);
              return;
            }
            if (typeof job.estimatedWaitSec === "number") setWaitLeft(job.estimatedWaitSec);
          } catch {
            /* keep trying within budget */
          }
        }
        setPolling(false);
      } else {
        setWaitLeft(data.status === "completed" ? 0 : est);
        setPolling(false);
      }
    },
    onError: (error) => Alert.alert("لم يكتمل الطلب", error.message || "تحقق من اتصال الخادم."),
  });
  const musicMutation = trpc.agent.music.useMutation({ onSuccess: (data) => setResult({ status: data.status, url: data.url, message: data.message, provider: data.provider }), onError: (error) => Alert.alert("لم تكتمل الموسيقى", error.message || "تحقق من اتصال الخادم.") });
  const reportMutation = trpc.safety.report.useMutation();
  useEffect(() => { if (params.kind === "video" || params.kind === "music") setKind(params.kind); }, [params.kind]);
  useEffect(() => {
    if (waitLeft === null || waitLeft <= 0 || !polling) return;
    const id = setInterval(() => setWaitLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [waitLeft, polling]);
  const meta = kindMeta[kind];
  const helper = useMemo(() => meta.helper, [meta.helper]);
  const busy = mutation.isPending || musicMutation.isPending || polling;

  const submit = () => {
    if (!isAuthenticated) { Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا لإنشاء الوسائط وحفظها في مكتبتك السحابية.", [{ text: "لاحقًا", style: "cancel" }, { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() }]); return; }
    if (prompt.trim().length < 3) { Alert.alert("اكتب وصفًا أولًا", "أضف تفاصيل المشهد أو الصورة التي تريدها."); return; }
    setResult(null);
    setWaitLeft(kind === "video" ? 120 : kind === "image" ? 45 : 30);
    setPolling(false);
    if (kind === "music") musicMutation.mutate({ prompt: prompt.trim() }); else mutation.mutate({ kind, prompt: prompt.trim() });
  };

  return (
    <ScreenContainer className="px-5 pt-3">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>استوديو فلسقوا</Text><Text style={[styles.title, { color: colors.foreground }]}>اصنع شيئًا يُرى</Text><Text style={[styles.subtitle, { color: colors.muted }]}>صف الفكرة بسلاسة — فلسقوا يرتّب الطبقات والانتظار نيابةً عنك.</Text></View><View style={[styles.headerIcon, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="auto-awesome" size={23} color={colors.primary} /></View></View>
        <View style={[styles.modeBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>{(Object.keys(kindMeta) as Kind[]).map((item) => { const active = item === kind; return <Pressable key={item} onPress={() => { setKind(item); setResult(null); }} style={[styles.modeItem, { backgroundColor: active ? colors.primary : "transparent" }]}><MaterialIcons name={kindMeta[item].icon} size={17} color={active ? colors.background : colors.muted} /><Text style={{ color: active ? colors.background : colors.muted, fontSize: 12, fontWeight: "900" }}>{kindMeta[item].label}</Text></Pressable>; })}</View>
        <View style={[styles.promptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.promptHeading}><View><Text style={[styles.promptTitle, { color: colors.foreground }]}>{meta.title}</Text><Text style={[styles.promptHint, { color: colors.muted }]}>وصفك هو نقطة البداية</Text></View><View style={[styles.kindIcon, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name={meta.icon} size={20} color={colors.primary} /></View></View>
          <TextInput value={prompt} onChangeText={setPrompt} multiline textAlign="right" placeholder={helper} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          <View style={styles.tipRow}><MaterialIcons name="lightbulb-outline" size={15} color={colors.warning} /><Text style={[styles.tip, { color: colors.muted }]}>أضف الحركة، الإضاءة، العدسة والمزاج لنتيجة أدق.</Text></View>
          {kind === "video" && <View style={[styles.limit, { backgroundColor: `${colors.warning}12` }]}><MaterialIcons name="schedule" size={15} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 11, flex: 1 }}>حد الفيديو: مقطع واحد كل 12 ساعة، حتى 5 ثوانٍ و720p.</Text></View>}
          {kind === "music" && <View style={[styles.limit, { backgroundColor: `${colors.warning}12` }]}><MaterialIcons name="schedule" size={15} color={colors.warning} /><Text style={{ color: colors.warning, fontSize: 11, flex: 1 }}>حد الموسيقى: مقطعان كل 24 ساعة، حتى 60 ثانية للمقطع.</Text></View>}
          <Pressable onPress={submit} disabled={busy} style={[styles.createButton, { backgroundColor: colors.primary }, busy && { opacity: 0.65 }]}>{busy ? <ActivityIndicator color={colors.background} /> : <MaterialIcons name="auto-awesome" size={18} color={colors.background} />}<Text style={{ color: colors.background, fontSize: 13, fontWeight: "900" }}>{busy ? "جارٍ الإبداع..." : `إنشاء ${meta.label}`}</Text></Pressable>
          {busy && <AgentProcessing mode={kind === "image" ? "image" : kind === "video" ? "video" : kind === "music" ? "music" : "media"} waitLeft={waitLeft} />}
        </View>
        {result && <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.resultHeader}><View><Text style={[styles.resultTitle, { color: colors.foreground }]}>النتيجة</Text><Text style={[styles.resultSub, { color: colors.muted }]}>{result.provider === "open-source" ? "مزود مفتوح المصدر" : result.provider === "not-configured" ? "بانتظار الربط" : "معالجة سحابية"}</Text></View><MaterialIcons name={result.url ? "check-circle" : "hourglass-top"} size={22} color={result.url ? colors.success : colors.warning} /></View>{result.url && kind === "image" ? <Image source={{ uri: result.url }} style={styles.imageResult} resizeMode="cover" /> : null}{result.url && kind === "video" ? <InlineVideoPlayer source={result.url} /> : null}{result.url && kind === "music" ? <InlineAudioPlayer source={result.url} /> : null}<Text style={[styles.resultMessage, { color: colors.muted }]}>{result.message || (result.url ? "تم إنشاء النتيجة وحفظها في التخزين السحابي." : "تم إنشاء المهمة السحابية.")}</Text>{result.url && <Pressable onPress={() => reportMutation.mutate({ targetType: kind === "music" ? "image" : kind, targetId: String(result.url), reason: "أبلغ المستخدم عن محتوى مولد يحتاج إلى مراجعة السلامة" })} disabled={reportMutation.isPending}><Text style={[styles.report, { color: colors.muted }]}>إبلاغ عن هذه النتيجة</Text></Pressable>}</View>}
        <View style={[styles.note, { backgroundColor: `${colors.primary}09` }]}><MaterialIcons name="cloud-queue" size={17} color={colors.primary} /><Text style={[styles.noteText, { color: colors.muted }]}>تُعالج طلباتك سحابيًا وتعود النتيجة إلى مكتبتك المرتبطة بحسابك. لا نضع ملفات نماذج كبيرة على الهاتف.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 34 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  eyebrow: { fontSize: 11, fontWeight: "900", marginBottom: 5 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 12, marginTop: 4 },
  headerIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modeBar: { flexDirection: "row", borderWidth: 1, borderRadius: 20, padding: 5, gap: 5, marginBottom: 13 },
  modeItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 15, paddingVertical: 11 },
  promptCard: { borderWidth: 1, borderRadius: 26, padding: 16 },
  promptHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  promptTitle: { fontSize: 19, fontWeight: "900" },
  promptHint: { fontSize: 11, marginTop: 3 },
  kindIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 140, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, lineHeight: 24, textAlignVertical: "top" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  tip: { fontSize: 11, flex: 1 },
  limit: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 13, padding: 10, marginTop: 10 },
  createButton: { minHeight: 49, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 15 },
  resultCard: { borderWidth: 1, borderRadius: 26, padding: 16, marginTop: 14 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultTitle: { fontSize: 17, fontWeight: "900" },
  resultSub: { fontSize: 10, marginTop: 3 },
  imageResult: { width: "100%", height: 280, borderRadius: 18 },
  resultMessage: { fontSize: 12, lineHeight: 19, marginTop: 10 },
  report: { fontSize: 11, fontWeight: "800", marginTop: 10 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 18, padding: 13, marginTop: 14 },
  noteText: { flex: 1, fontSize: 11, lineHeight: 18 },
});

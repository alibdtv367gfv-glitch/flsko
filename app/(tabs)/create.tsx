import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image as ImageIcon, Video, Music2, Sparkles, Lightbulb, Clock, ImagePlus, X } from "lucide-react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AgentProcessing } from "@/components/agent-processing";
import { InlineAudioPlayer, InlineVideoPlayer } from "@/components/inline-media-player";
import { FlskoCard } from "@/components/ui/flsko-card";
import { startOAuthLogin } from "@/constants/oauth";
import { Radius, Shadow, Space, Touch, Type } from "@/constants/design";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Kind = "image" | "video" | "music";

const kindMeta: Record<
  Kind,
  { label: string; title: string; helper: string; Icon: typeof ImageIcon; wait: number }
> = {
  image: {
    label: "صورة",
    title: "اصنع صورة",
    helper: "أنشئ من نص، أو ارفع صورة وعدّلها بالوصف — فلسقوا يختار أفضل طبقة.",
    Icon: ImageIcon,
    wait: 45,
  },
  video: {
    label: "فيديو",
    title: "اصنع فيديو",
    helper: "وصف قصير للحركة والمزاج. التوليد قد يستغرق دقيقة أو أكثر.",
    Icon: Video,
    wait: 120,
  },
  music: {
    label: "موسيقى",
    title: "اصنع موسيقى",
    helper: "مزاج، آلات، وإيقاع — تُرسل للطبقات المجانية المتاحة.",
    Icon: Music2,
    wait: 30,
  },
};

function tap() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export default function CreateScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { isAuthenticated } = useAuth();
  const [kind, setKind] = useState<Kind>("image");
  const [prompt, setPrompt] = useState("");
  const [sourceImageUri, setSourceImageUri] = useState<string | null>(null);
  const [sourceImageDataUri, setSourceImageDataUri] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status?: string;
    url?: string;
    message?: string;
    provider?: string;
    jobId?: string;
    estimatedWaitSec?: number;
  } | null>(null);
  const [waitLeft, setWaitLeft] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const utils = trpc.useUtils();

  const mutation = trpc.agent.generate.useMutation({
    onSuccess: async (data) => {
      const anyData = data as {
        status?: string;
        url?: string;
        jobId?: string;
        message?: string;
        provider?: string;
        estimatedWaitSec?: number;
      };
      setResult({
        status: anyData.status || "completed",
        url: anyData.url,
        message: anyData.message,
        provider: anyData.provider,
        jobId: anyData.jobId,
        estimatedWaitSec: anyData.estimatedWaitSec,
      });
      const est =
        typeof anyData.estimatedWaitSec === "number"
          ? anyData.estimatedWaitSec
          : kindMeta[kind].wait;
      if (anyData.status === "queued" && anyData.jobId) {
        const jobId = anyData.jobId;
        setWaitLeft(est);
        setPolling(true);
        const budgetMs = Math.max(est, 90) * 1000;
        const started = Date.now();
        while (Date.now() - started < budgetMs) {
          await new Promise((r) => setTimeout(r, 8000));
          try {
            const job = (await utils.client.agent.mediaJob.mutate({ jobId })) as {
              status?: string;
              url?: string;
              estimatedWaitSec?: number;
              message?: string;
              provider?: string;
              jobId?: string;
            };
            setResult({
              status: job.status || "queued",
              url: job.url,
              message: job.message,
              provider: job.provider,
              jobId: job.jobId || jobId,
              estimatedWaitSec: job.estimatedWaitSec,
            });
            if (job.status === "completed" && job.url) {
              setWaitLeft(0);
              setPolling(false);
              return;
            }
            if (typeof job.estimatedWaitSec === "number") setWaitLeft(job.estimatedWaitSec);
          } catch {
            /* keep polling */
          }
        }
        setPolling(false);
      } else {
        setWaitLeft(anyData.status === "completed" ? 0 : est);
        setPolling(false);
      }
    },
    onError: (error) => Alert.alert("لم يكتمل الطلب", error.message || "تحقق من اتصال الخادم."),
  });

  const musicMutation = trpc.agent.music.useMutation({
    onSuccess: (data) =>
      setResult({ status: data.status, url: data.url, message: data.message, provider: data.provider }),
    onError: (error) => Alert.alert("لم تكتمل الموسيقى", error.message || "تحقق من اتصال الخادم."),
  });

  useEffect(() => {
    if (params.kind === "video" || params.kind === "music") setKind(params.kind);
  }, [params.kind]);

  useEffect(() => {
    if (waitLeft === null || waitLeft <= 0 || !polling) return;
    const id = setInterval(() => setWaitLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [waitLeft, polling]);

  const meta = kindMeta[kind];
  const busy = mutation.isPending || musicMutation.isPending || polling;
  const Icon = meta.Icon;

  const pickReferenceImage = async () => {
    tap();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الإذن مطلوب", "اسمح بالوصول للصور لرفع صورة مرجعية للتعديل.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setSourceImageUri(asset.uri);
    let dataUri = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : null;
    if (!dataUri) {
      try {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        dataUri = `data:image/jpeg;base64,${b64}`;
      } catch {
        Alert.alert("تعذر قراءة الصورة", "جرّب صورة أصغر أو صيغة JPEG/PNG.");
        return;
      }
    }
    // Limit ~3.5MB base64 payload for Worker
    if (dataUri.length > 3_800_000) {
      Alert.alert("الصورة كبيرة", "اختر صورة أصغر قليلًا (أقل من حوالي 2.5 ميجا).");
      setSourceImageUri(null);
      setSourceImageDataUri(null);
      return;
    }
    setSourceImageDataUri(dataUri);
  };

  const clearReferenceImage = () => {
    setSourceImageUri(null);
    setSourceImageDataUri(null);
  };

  const submit = () => {
    tap();
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا لإنشاء الوسائط وحفظها.", [
        { text: "لاحقًا", style: "cancel" },
        { text: "تسجيل الدخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    if (!prompt.trim()) {
      Alert.alert("أضف وصفًا", "اكتب جملة واضحة عن النتيجة المطلوبة.");
      return;
    }
    setResult(null);
    if (kind === "music") musicMutation.mutate({ prompt: prompt.trim() });
    else
      mutation.mutate({
        kind,
        prompt: prompt.trim(),
        ...(kind === "image" && sourceImageDataUri
          ? { imageDataUri: sourceImageDataUri }
          : {}),
      } as { kind: Kind; prompt: string; imageDataUri?: string });
  };

  return (
    <ScreenContainer className="px-5 pt-2" containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>استوديو فلسقوا</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>اصنع شيئًا يُرى</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              صف الفكرة بسلاسة — فلسقوا يرتّب الطبقات والانتظار نيابةً عنك.
            </Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}15` }]}>
            <Sparkles size={22} color={colors.primary} strokeWidth={2.2} />
          </View>
        </View>

        {/* Kind selector */}
        <View style={[styles.modeBar, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.soft]}>
          {(Object.keys(kindMeta) as Kind[]).map((item) => {
            const active = item === kind;
            const KIcon = kindMeta[item].Icon;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  tap();
                  setKind(item);
                  setResult(null);
                  if (item !== "image") {
                    setSourceImageUri(null);
                    setSourceImageDataUri(null);
                  }
                }}
                style={[
                  styles.modeItem,
                  {
                    backgroundColor: active ? colors.primary : "transparent",
                    minHeight: Touch.min,
                  },
                ]}
              >
                <KIcon size={18} color={active ? "#FFFFFF" : colors.muted} strokeWidth={2.2} />
                <Text style={{ color: active ? "#FFFFFF" : colors.muted, fontSize: 12, fontWeight: "800" }}>
                  {kindMeta[item].label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prompt card */}
        <FlskoCard padding="lg" style={{ marginTop: Space.lg }}>
          <View style={styles.promptHeading}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.promptTitle, { color: colors.foreground }]}>{meta.title}</Text>
              <Text style={[styles.promptHint, { color: colors.muted }]}>{meta.helper}</Text>
            </View>
            <View style={[styles.kindIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Icon size={20} color={colors.primary} />
            </View>
          </View>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlign="right"
            placeholder="مثال: غروب على بحر اللاذقية، ألوان دافئة، أسلوب سينمائي…"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.background,
                borderColor: colors.border,
                minHeight: 120,
              },
            ]}
          />
          <View style={styles.tipRow}>
            <Lightbulb size={15} color={colors.warning} />
            <Text style={[styles.tip, { color: colors.muted }]}>
              {kind === "image"
                ? "يمكنك رفع صورة لتعديلها، أو الاعتماد على النص فقط للإنشاء من الصفر."
                : "أضف الحركة، الإضاءة، العدسة والمزاج لنتيجة أدق."}
            </Text>
          </View>

          {kind === "image" && (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "right", marginBottom: 8 }}>
                صورة مرجعية (اختياري — للتعديل)
              </Text>
              {sourceImageUri ? (
                <View style={{ position: "relative" }}>
                  <Image
                    source={{ uri: sourceImageUri }}
                    style={{ width: "100%", height: 180, borderRadius: 16 }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={clearReferenceImage}
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: "rgba(0,0,0,0.55)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={18} color="#fff" />
                  </Pressable>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "right" }}>
                    سيتم تعديل هذه الصورة حسب وصفك
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => void pickReferenceImage()}
                  style={{
                    minHeight: 52,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <ImagePlus size={20} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>
                    رفع صورة للتعديل
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: colors.primary,
                opacity: busy ? 0.65 : pressed ? 0.9 : 1,
                transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
              },
              Shadow.glow(colors.primary),
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Sparkles size={18} color="#fff" />
            )}
            <Text style={styles.ctaText}>{busy ? "فلسقوا يعمل…" : sourceImageDataUri && kind === "image" ? "عدّل الصورة" : "ابدأ الإنشاء"}</Text>
          </Pressable>
        </FlskoCard>

        {(busy || result) && (
          <View style={{ marginTop: Space.lg }}>
            {busy && !result?.url && (
              <FlskoCard>
                <AgentProcessing label="جاري التوليد عبر طبقات فلسقوا" />
                {waitLeft !== null && waitLeft > 0 && (
                  <View style={styles.waitRow}>
                    <Clock size={14} color={colors.muted} />
                    <Text style={{ color: colors.muted, fontSize: Type.caption, fontWeight: "700" }}>
                      انتظار تقريبي: {waitLeft} ث
                    </Text>
                  </View>
                )}
              </FlskoCard>
            )}
            {result?.url && kind === "image" && (
              <FlskoCard padding="sm">
                <Image source={{ uri: result.url }} style={styles.previewImage} resizeMode="cover" />
                {result.provider ? (
                  <Text style={[styles.provider, { color: colors.muted }]}>عبر {result.provider}</Text>
                ) : null}
              </FlskoCard>
            )}
            {result?.url && kind === "video" && <InlineVideoPlayer source={result.url} />}
            {result?.url && kind === "music" && <InlineAudioPlayer source={result.url} />}
            {result?.message && !result.url ? (
              <Text style={{ color: colors.muted, marginTop: 10, textAlign: "right", fontSize: 13 }}>
                {result.message}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  eyebrow: { fontSize: Type.caption, fontWeight: "800", marginBottom: 4 },
  title: { fontSize: Type.hero - 4, fontWeight: "900" },
  subtitle: { fontSize: Type.caption, lineHeight: 20, marginTop: 6 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBar: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginTop: Space.md,
  },
  modeItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: Radius.md,
    paddingVertical: 10,
  },
  promptHeading: { flexDirection: "row", gap: 12, marginBottom: 12 },
  promptTitle: { fontSize: Type.section, fontWeight: "900" },
  promptHint: { fontSize: Type.caption, lineHeight: 18, marginTop: 4 },
  kindIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: 14,
    fontSize: Type.body,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  tip: { flex: 1, fontSize: Type.micro, lineHeight: 16 },
  cta: {
    marginTop: 16,
    minHeight: Touch.comfortable,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  waitRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" },
  previewImage: { width: "100%", height: 280, borderRadius: Radius.lg },
  provider: { fontSize: Type.micro, textAlign: "center", marginTop: 10, fontWeight: "600" },
});

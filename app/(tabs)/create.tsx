import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AgentProcessing } from "@/components/agent-processing";
import { InlineAudioPlayer, InlineVideoPlayer } from "@/components/inline-media-player";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function CreateScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { isAuthenticated } = useAuth();
  const [kind, setKind] = useState<"image" | "video" | "music">(params.kind === "video" ? "video" : params.kind === "music" ? "music" : "image");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{ status: string; url?: string; message?: string; provider?: string } | null>(null);
  const mutation = trpc.agent.generate.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (error) => Alert.alert("لم يكتمل الطلب", error.message || "تحقق من اتصال الخادم."),
  });
  const musicMutation = trpc.agent.music.useMutation({ onSuccess: (data) => setResult({ status: data.status, url: data.url, message: data.message, provider: data.provider }), onError: (error) => Alert.alert("لم تكتمل الموسيقى", error.message || "تحقق من اتصال الخادم.") });
  const reportMutation = trpc.safety.report.useMutation();

  useEffect(() => {
    if (params.kind === "video") setKind("video");
  }, [params.kind]);

  const helper = useMemo(
    () => kind === "image"
      ? "مثال: ملصق سينمائي لمدينة دمشق وقت الغروب، تفاصيل معمارية واقعية، إضاءة ذهبية، مساحة للنص العربي"
      : kind === "video" ? "مثال: لقطة سينمائية لشارع قديم بعد المطر، حركة كاميرا بطيئة، ضوء دافئ، تفاصيل واقعية، 5 ثوانٍ" : "مثال: موسيقى شرقية سورية هادئة، عود وقانون وإيقاع خفيف، دقيقة واحدة، بدون كلمات",
    [kind],
  );

  const submit = () => {
    if (!isAuthenticated) {
      void startOAuthLogin();
      return;
    }
    if (prompt.trim().length < 3) {
      Alert.alert("اكتب وصفًا أولًا", "أضف تفاصيل المشهد أو الصورة التي تريدها.");
      return;
    }
    setResult(null);
    if (kind === "music") musicMutation.mutate({ prompt: prompt.trim() });
    else mutation.mutate({ kind, prompt: prompt.trim() });
  };

  return (
    <ScreenContainer className="px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold text-primary">استوديو Flsko</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">اصنع بصريًا</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">تصل الطلبات إلى مزود سحابي قابل للتبديل بدل ربط التطبيق بشبكة واحدة.</Text>

        <View className="mt-6 flex-row rounded-2xl border border-border bg-surface p-1">
          {(["image", "video", "music"] as const).map((item) => {
            const active = item === kind;
            return (
              <Pressable
                key={item}
                onPress={() => { setKind(item); setResult(null); }}
                style={({ pressed }) => [
                  { backgroundColor: active ? colors.primary : "transparent" },
                  pressed && { opacity: 0.8 },
                ]}
                className="flex-1 items-center rounded-xl px-4 py-3"
              >
                <Text className="font-bold" style={{ color: active ? colors.background : colors.muted }}>{item === "image" ? "صورة" : item === "video" ? "فيديو" : "موسيقى"}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-5 rounded-3xl border border-border bg-surface p-4">
          <Text className="text-base font-bold text-foreground">وصف العمل</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlign="right"
            placeholder={helper}
            placeholderTextColor={colors.muted}
            className="mt-3 min-h-[150px] rounded-2xl border border-border bg-background p-4 text-base leading-7 text-foreground"
          />
          <Text className="mt-2 text-xs leading-5 text-muted">كلما وصفت الحركة، العدسة، الإضاءة والمزاج بدقة، تحسنت النتيجة.</Text>
          <Pressable onPress={submit} disabled={mutation.isPending || musicMutation.isPending} style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }] }, (mutation.isPending || musicMutation.isPending) && { opacity: 0.65 }]} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4">
            {(mutation.isPending || musicMutation.isPending) && <ActivityIndicator color={colors.background} />}
            <Text className="font-black text-background">{mutation.isPending || musicMutation.isPending ? "جارٍ الإبداع..." : `إنشاء ${kind === "image" ? "الصورة" : kind === "video" ? "الفيديو" : "الموسيقى"}`}</Text>
          </Pressable>
          {(mutation.isPending || musicMutation.isPending) && <AgentProcessing mode="media" />}
        </View>

        {result && (
          <View className="mt-5 rounded-3xl border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-foreground">النتيجة</Text>
              <Text className="text-xs font-bold text-primary">{result.provider === "open-source" ? "مفتوح المصدر" : result.provider === "not-configured" ? "بانتظار الربط" : "مزود سحابي"}</Text>
            </View>
            {result.url && kind === "image" ? <Image source={{ uri: result.url }} className="mt-4 h-64 w-full rounded-2xl" resizeMode="cover" /> : null}
            {result.url && kind === "video" ? <InlineVideoPlayer source={result.url} /> : null}
            {result.url && kind === "music" ? <InlineAudioPlayer source={result.url} /> : null}
            <Text className="mt-3 text-sm leading-6 text-muted">{result.message || (result.url ? "تم حفظ النتيجة في التخزين السحابي." : "تم إنشاء المهمة السحابية.")}</Text>
            {result.url && <Pressable onPress={() => reportMutation.mutate({ targetType: kind === "music" ? "image" : kind, targetId: String(result.url), reason: "أبلغ المستخدم عن محتوى مولد يحتاج إلى مراجعة السلامة" })} disabled={reportMutation.isPending} className="mt-3 self-start"><Text className="text-xs font-semibold text-muted">إبلاغ عن هذه النتيجة</Text></Pressable>}
            {!result.url && kind === "video" && <Text className="mt-2 text-xs leading-5 text-warning">لإنتاج فيديو مفتوح المصدر، اربط خادم Wan 2.2 أو LTX عبر FLSKO_VIDEO_PROVIDER_URL في بيئة الخادم.</Text>}
            {!result.url && kind === "music" && <Text className="mt-2 text-xs leading-5 text-warning">اربط مزود موسيقى مفتوحًا عبر FLSKO_MUSIC_PROVIDER_URL أو موصل موسيقى Gemini على الخادم.</Text>}
          </View>
        )}

        <View className="mt-5 rounded-3xl bg-background p-4">
          <Text className="text-sm font-bold text-foreground">ملاحظة عن الخصوصية</Text>
          <Text className="mt-2 text-xs leading-5 text-muted">لا تُحفظ الملفات على الهاتف كذاكرة دائمة؛ النتيجة تعود من التخزين السحابي المرتبط بحسابك.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

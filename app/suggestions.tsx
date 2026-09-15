import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { startOAuthLogin } from "@/constants/oauth";

export default function SuggestionsScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState("فكرة مستقبلية");
  const [content, setContent] = useState("");
  const submit = trpc.suggestions.submit.useMutation({
    onSuccess: (result) => {
      setContent("");
      Alert.alert("وصل اقتراحك", result.delivered ? "شكرًا لك. تم استلام اقتراحك." : "تم حفظ اقتراحك وسيُرسل عند توفر قناة البريد.");
    },
    onError: (error) => Alert.alert("تعذر إرسال الاقتراح", error.message),
  });

  if (!isAuthenticated) {
    return <ScreenContainer className="items-center justify-center px-6"><Text className="text-4xl">✦</Text><Text className="mt-4 text-center text-2xl font-black text-foreground">اقتراحاتك تهمنا</Text><Text className="mt-3 text-center text-sm leading-6 text-muted">سجّل الدخول حتى نربط الاقتراح بحسابك ونمنع الإرسال المزعج.</Text><Pressable onPress={() => void startOAuthLogin()} style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 14, marginTop: 24 }, pressed && { opacity: 0.8 }]}><Text className="font-bold text-background">تسجيل الدخول</Text></Pressable></ScreenContainer>;
  }

  return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="text-sm font-semibold text-primary">Flsko</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">اقترح للمستقبل</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">اكتب فكرتك أو المشكلة التي تريد أن نحلها. تُرسل من الخادم دون إظهار بريد مالك التطبيق داخل الواجهة.</Text>
        <Text className="mt-7 text-sm font-bold text-foreground">التصنيف</Text>
        <TextInput value={category} onChangeText={setCategory} textAlign="right" placeholder="فكرة مستقبلية" placeholderTextColor={colors.muted} className="mt-2 rounded-2xl border border-border bg-surface p-4 text-base text-foreground" />
        <Text className="mt-5 text-sm font-bold text-foreground">اقتراحك</Text>
        <TextInput value={content} onChangeText={setContent} multiline textAlign="right" placeholder="مثلاً: أريد طريقة أسهل لتنظيم ملفاتي..." placeholderTextColor={colors.muted} className="mt-2 min-h-[180px] rounded-2xl border border-border bg-surface p-4 text-base leading-7 text-foreground" />
        <Pressable onPress={() => submit.mutate({ category: category.trim() || "عام", content: content.trim() })} disabled={submit.isPending || content.trim().length < 10} style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: "center", marginTop: 18 }, (submit.isPending || content.trim().length < 10) && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }] }]}><Text className="font-black text-background">{submit.isPending ? "جارٍ إرسال الاقتراح..." : "إرسال الاقتراح"}</Text></Pressable>
        <View className="mt-8 rounded-3xl border border-border bg-surface p-4"><Text className="text-sm font-bold text-foreground">حقوق الملكية الفكرية</Text><Text className="mt-2 text-xs leading-6 text-muted">© 2026 علي يوسف. جميع الحقوق محفوظة لتطبيق Flsko، بما في ذلك الهوية البصرية والبرمجيات والمحتوى الأصلي، ما لم يُذكر خلاف ذلك.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

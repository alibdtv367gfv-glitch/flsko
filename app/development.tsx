import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function DevelopmentPortalScreen() {
  const colors = useColors();
  const { user, isAuthenticated } = useAuth();
  const [passwordOne, setPasswordOne] = useState("");
  const [passwordTwo, setPasswordTwo] = useState("");
  const [passwordThree, setPasswordThree] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const unlock = trpc.development.unlock.useMutation({ onSuccess: () => setUnlocked(true), onError: (error) => Alert.alert("تعذر فتح البوابة", error.message) });
  const stats = trpc.development.stats.useQuery(undefined, { enabled: unlocked });
  const files = trpc.development.files.useQuery(undefined, { enabled: unlocked });
  const file = trpc.development.file.useQuery({ relativePath: selectedFile || "README.md" }, { enabled: unlocked && Boolean(selectedFile) });
  const isOwner = isAuthenticated && user?.role === "admin";
  const summary = useMemo(() => stats.data ? [
    ["المستخدمون", stats.data.users],
    ["طلبات المحادثة", stats.data.chatRequests],
    ["إبداعات مكتملة", stats.data.completedGenerations],
    ["مقاطع موسيقية", stats.data.completedMusic],
    ["إجمالي الطلبات", stats.data.totalRequests],
  ] : [], [stats.data]);

  if (!isOwner) return <ScreenContainer className="items-center justify-center px-6"><Text className="text-2xl font-black text-foreground">بوابة خاصة</Text><Text className="mt-3 text-center leading-6 text-muted">هذه المساحة متاحة لمالك المشروع بعد تسجيل الدخول بالحساب المصرح له.</Text></ScreenContainer>;

  if (!unlocked) return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-bold text-primary">Flsko · مركز التطوير</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">بوابة خاصة محمية</Text>
        <Text className="mt-3 leading-6 text-muted">يلزم تسجيل الدخول بالحساب الإداري، ثم كلمات المرور الثلاث المحفوظة على الخادم. لا تُحفظ كلمات المرور داخل التطبيق.</Text>
        {[['كلمة المرور الأولى', setPasswordOne, passwordOne], ['كلمة المرور الثانية', setPasswordTwo, passwordTwo], ['كلمة المرور الثالثة', setPasswordThree, passwordThree]].map(([label, setter, value]) => (
          <TextInput key={String(label)} value={String(value)} onChangeText={setter as (text: string) => void} secureTextEntry placeholder={String(label)} placeholderTextColor={colors.muted} className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4 text-right text-foreground" />
        ))}
        <Pressable onPress={() => unlock.mutate({ passwordOne, passwordTwo, passwordThree })} disabled={unlock.isPending} style={({ pressed }) => [{ backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]} className="mt-5 rounded-2xl px-4 py-4"><Text className="text-center font-black text-background">{unlock.isPending ? "جارٍ التحقق..." : "فتح مركز التطوير"}</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );

  return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-sm font-bold text-primary">Flsko · مركز التطوير</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">لوحة المشروع</Text>
        <Text className="mt-2 leading-6 text-muted">إحصاءات تشغيلية وملفات المصدر، مع إمكانية توسيع اللوحة لاحقًا إلى إصدارات ونشر ومراقبة.</Text>
        <View className="mt-5 flex-row flex-wrap gap-3">{summary.map(([label, value]) => <View key={String(label)} className="min-w-[45%] flex-1 rounded-2xl border border-border bg-surface p-4"><Text className="text-xs font-bold text-muted">{label}</Text><Text className="mt-2 text-2xl font-black text-primary">{value}</Text></View>)}</View>
        <View className="mt-6 rounded-3xl border border-border bg-surface p-4"><Text className="text-lg font-black text-foreground">ملفات التطبيق</Text><Text className="mt-2 text-xs leading-5 text-muted">الفهرس يستبعد الأسرار والمجلدات التشغيلية. اختر ملفًا لعرضه، ويمكن تطويره لاحقًا إلى حزمة تنزيل كاملة.</Text>{files.data?.files.map((name) => <Pressable key={name} onPress={() => setSelectedFile(name)} className="mt-2 rounded-xl bg-background px-3 py-3"><Text className="text-xs text-primary">{name}</Text></Pressable>)}</View>
        {selectedFile && <View className="mt-5 rounded-3xl border border-border bg-background p-4"><Text className="font-bold text-foreground">{selectedFile}</Text><Text selectable className="mt-3 text-xs leading-5 text-muted">{file.isLoading ? "جارٍ تحميل الملف..." : file.data?.content || "تعذر قراءة الملف."}</Text></View>}
      </ScrollView>
    </ScreenContainer>
  );
}

import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function MemoryScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [memory, setMemory] = useState("");
  const [source, setSource] = useState("");
  const memories = trpc.memory.list.useQuery(undefined, { enabled: isAuthenticated });
  const sources = trpc.knowledge.list.useQuery(undefined, { enabled: isAuthenticated });
  const remember = trpc.memory.remember.useMutation({ onSuccess: () => { setMemory(""); void memories.refetch(); }, onError: (error) => Alert.alert("لم تُحفظ الذاكرة", error.message) });
  const submitSource = trpc.knowledge.submitPublicSource.useMutation({ onSuccess: () => { setSource(""); void sources.refetch(); }, onError: (error) => Alert.alert("الرابط غير صالح", error.message) });

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="items-center justify-center px-6">
        <Text className="text-4xl">⌁</Text>
        <Text className="mt-4 text-center text-2xl font-black text-foreground">ذاكرة باختيارك</Text>
        <Text className="mt-3 text-center text-sm leading-6 text-muted">سجّل الدخول لتخزين تفضيلاتك وروابط المعرفة في السحابة. لا نقرأ حساباتك الخاصة.</Text>
        <Pressable onPress={() => void startOAuthLogin()} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-6 rounded-full bg-primary px-6 py-4"><Text className="font-bold text-background">تسجيل الدخول</Text></Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold text-primary">التحكم والخصوصية</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">ذاكرتي</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">أنت من يقرر ما الذي يبقى. يمكنك حذف هذه الطبقة لاحقًا من لوحة الحساب.</Text>

        <View className="mt-6 rounded-3xl border border-border bg-surface p-4">
          <Text className="text-base font-bold text-foreground">أضف تفضيلًا يتذكره Flsko</Text>
          <TextInput value={memory} onChangeText={setMemory} multiline textAlign="right" placeholder="مثال: أفضل أن تكون الإجابات مختصرة وباللهجة الشامية عند الإمكان" placeholderTextColor={colors.muted} className="mt-3 min-h-[92px] rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-foreground" />
          <Pressable disabled={remember.isPending} onPress={() => remember.mutate({ category: "preference", content: memory.trim(), consent: true })} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-3 self-start rounded-full bg-primary px-5 py-3"><Text className="font-bold text-background">حفظ بموافقتي</Text></Pressable>
        </View>

        <Text className="mt-7 text-lg font-black text-foreground">ما وافقتَ على تذكره</Text>
        <View className="mt-3 gap-2">
          {memories.data?.length ? memories.data.map((item) => <View key={item.id} className="rounded-2xl border border-border bg-surface p-4"><Text className="text-sm leading-6 text-foreground">{item.content}</Text><Text className="mt-2 text-xs text-muted">{item.category} · موافق عليه</Text></View>) : <Text className="text-sm text-muted">لا توجد ذكريات محفوظة بعد.</Text>}
        </View>

        <View className="mt-7 rounded-3xl border border-border bg-surface p-4">
          <Text className="text-base font-bold text-foreground">مصدر سوري عام بإذن واضح</Text>
          <Text className="mt-2 text-xs leading-5 text-muted">أضف رابطًا عامًا تملك حق استخدامه. لن نسحب منشورات خاصة أو ننسخ محتوى اجتماعيًا تلقائيًا.</Text>
          <TextInput value={source} onChangeText={setSource} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={colors.muted} className="mt-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground" />
          <Pressable onPress={() => submitSource.mutate({ url: source.trim(), permission: true })} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-3 self-start rounded-full bg-foreground px-5 py-3"><Text className="font-bold text-background">إرسال للمراجعة</Text></Pressable>
        </View>
        <Text className="mt-4 text-xs leading-5 text-muted">المصادر المضافة: {sources.data?.length || 0} · تمر بمراجعة قبل دخولها إلى معرفة Flsko العامة.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

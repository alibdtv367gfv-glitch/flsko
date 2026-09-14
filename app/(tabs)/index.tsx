import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { startOAuthLogin } from "@/constants/oauth";

function ActionCard({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.88 },
      ]}
      className="flex-1 rounded-3xl border p-4"
    >
      <Text className="mb-3 text-2xl">{icon}</Text>
      <Text className="text-base font-bold text-foreground">{title}</Text>
      <Text className="mt-1 text-xs leading-5 text-muted">{subtitle}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { user, loading, isAuthenticated } = useAuth();
  const status = trpc.agent.status.useQuery();

  return (
    <ScreenContainer className="px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-primary">FLSKO / 01</Text>
            <Text className="mt-1 text-3xl font-bold text-foreground">أهلًا بك</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Text className="text-2xl font-black text-background">F</Text>
          </View>
        </View>

        <View className="mt-6 rounded-[28px] bg-primary p-5">
          <Text className="text-sm font-semibold text-background/80">الوكيل السوري الذكي</Text>
          <Text className="mt-2 text-3xl font-black leading-10 text-background">افهم فكرتك،{`\n`}واصنعها بصوتك.</Text>
          <Text className="mt-3 text-sm leading-6 text-background/80">
            محادثة، صور وفيديو في مساحة سحابية واحدة، مع ذاكرة لا تعمل إلا بإذنك.
          </Text>
          <View className="mt-4 flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-background" />
            <Text className="text-xs font-semibold text-background/90">
              {status.data?.orchestration === "automatic" ? "اختيار تلقائي لأفضل نتيجة" : "المزودات قيد الفحص"}
            </Text>
          </View>
        </View>

        <View className="mt-7 flex-row items-end justify-between">
          <View>
            <Text className="text-xl font-bold text-foreground">ابدأ من هنا</Text>
            <Text className="mt-1 text-sm text-muted">أدواتك الأساسية في مكان واحد</Text>
          </View>
          <Text className="text-xs font-semibold text-primary">سحابي بالكامل</Text>
        </View>

        <View className="mt-4 flex-row gap-3">
          <ActionCard icon="✦" title="صورة" subtitle="حوّل الوصف إلى صورة احترافية" onPress={() => router.push("/create")} />
          <ActionCard icon="◉" title="فيديو" subtitle="جهّز مشهدًا لـ Wan أو LTX" onPress={() => router.push("/create?kind=video")} />
        </View>
        <View className="mt-3 flex-row gap-3">
          <ActionCard icon="◌" title="احكِ مع Flsko" subtitle="يفهم العربية واللهجات السورية" onPress={() => router.push("/chat")} />
          <ActionCard icon="⌁" title="ذاكرتي" subtitle="ما وافقتَ أن يتذكره فقط" onPress={() => router.push("/memory")} />
        </View>

        <View className="mt-7 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-foreground">حسابك السحابي</Text>
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: isAuthenticated ? `${colors.success}20` : `${colors.warning}20` }}>
              <Text className="text-xs font-bold" style={{ color: isAuthenticated ? colors.success : colors.warning }}>
                {loading ? "جارٍ التحقق" : isAuthenticated ? "متصل" : "ضيف"}
              </Text>
            </View>
          </View>
          <Text className="mt-2 text-sm leading-6 text-muted">
            {isAuthenticated
              ? `مرحبًا ${user?.name || "بك"}. ستتزامن ذاكرتك وملفاتك عبر أجهزتك.`
              : "سجّل الدخول لحفظ المحادثات والذكريات والنتائج في مساحة سحابية آمنة."}
          </Text>
          {!isAuthenticated && (
            <Pressable onPress={() => void startOAuthLogin()} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-4 self-start rounded-full bg-foreground px-5 py-3">
              <Text className="font-bold text-background">تسجيل الدخول</Text>
            </Pressable>
          )}
        </View>

        <View className="mt-5 flex-row items-start gap-2 px-1">
          <Text className="text-sm text-primary">⌁</Text>
          <Text className="flex-1 text-xs leading-5 text-muted">
            لا يقرأ Flsko حسابات خاصة ولا يجمع محتوى من الشبكات الاجتماعية تلقائيًا. أضف فقط روابط عامة تملك حق استخدامها وبموافقة واضحة.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

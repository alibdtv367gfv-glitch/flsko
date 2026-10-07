import { router } from "expo-router";
import { useMemo, type ReactNode } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MessageCircle, Sparkles, Clapperboard, Brain, ArrowLeft, Sun, Moon } from "lucide-react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useThemeContext } from "@/lib/theme-provider";
import { startOAuthLogin } from "@/constants/oauth";

function pressFeedback() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function ActionCard({ icon, title, subtitle, tone, onPress }: { icon: ReactNode; title: string; subtitle: string; tone: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => { pressFeedback(); onPress(); }}
      style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#0B1220", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 }, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${tone}18` }]}>{icon}</View>
      <Text style={[styles.actionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.actionSubtitle, { color: colors.muted }]}>{subtitle}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { user, isAuthenticated } = useAuth();
  const { colorScheme, setColorScheme } = useThemeContext();
  const status = trpc.agent.status.useQuery(undefined, { staleTime: 20_000, refetchInterval: 120_000 });
  const orchestrationReady = status.data?.orchestration === "automatic";
  const greeting = useMemo(() => user?.name ? `أهلًا ${user.name.split(" ")[0]}` : "أهلًا بك", [user?.name]);

  const handleLogin = async () => {
    pressFeedback();
    try {
      await startOAuthLogin();
    } catch {
      Alert.alert("تعذر فتح تسجيل الدخول", "تحقق من اتصال الإنترنت وحاول مرة أخرى.");
    }
  };

  return (
    <ScreenContainer className="px-5 pt-3" containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <Image source={require("../../assets/images/icon.png")} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>Flsko</Text>
              <Text style={[styles.brandArabic, { color: colors.primary }]}>فلسقوا · وكيلك الذكي</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="تبديل الوضع الداكن" onPress={() => { pressFeedback(); setColorScheme(colorScheme === "dark" ? "light" : "dark"); }} style={({ pressed }) => [styles.themeButton, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }, pressed && styles.pressed]}>
              <MaterialIcons name={colorScheme === "dark" ? "light-mode" : "dark-mode"} size={18} color={colors.primary} />
            </Pressable>
            {isAuthenticated ? (
              <Pressable accessibilityLabel="فتح الملف الشخصي" onPress={() => { pressFeedback(); router.push("/memory"); }} style={({ pressed }) => [styles.avatar, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` }, pressed && styles.pressed]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{(user?.name || "ف").slice(0, 1).toUpperCase()}</Text>
              </Pressable>
            ) : <View style={[styles.liveDot, { backgroundColor: colors.success }]} />}
          </View>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.foreground }]}>
          <View style={[styles.heroOrb, { backgroundColor: `${colors.primary}35` }]} />
          <View style={styles.heroHeader}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={styles.statusText}>{orchestrationReady ? "جاهز لمساعدتك" : "يجهّز أدواته"}</Text>
            </View>
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
          </View>
          <Text style={styles.heroGreeting}>{greeting}</Text>
          <Text style={styles.heroTitle}>خلّي فكرتك{`\n`}تصير حقيقة.</Text>
          <Text style={styles.heroBody}>احكِ، اكتب، أو ارفع ملفًا. فلسقوا يرتّب الخطوة التالية معك.</Text>
          {!isAuthenticated && (
            <Pressable accessibilityRole="button" onPress={handleLogin} style={({ pressed }) => [styles.heroButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
              <Text style={[styles.heroButtonText, { color: colors.background }]}>ابدأ بأمان</Text>
              <MaterialIcons name="arrow-forward" size={18} color={colors.background} />
            </Pressable>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isAuthenticated ? "ماذا ننجز اليوم؟" : "كل شيء يبدأ من هنا"}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>أدوات واضحة، ونتيجة بلا تعقيد</Text>
          </View>
          <View style={[styles.cloudBadge, { backgroundColor: `${colors.primary}12` }]}>
            <MaterialIcons name="cloud-done" size={16} color={colors.primary} />
            <Text style={[styles.cloudText, { color: colors.primary }]}>سحابي</Text>
          </View>
        </View>

        {isAuthenticated ? (
          <View style={styles.grid}>
            <ActionCard icon={<MessageCircle size={22} color={colors.primary} />} title="احكِ مع فلسقوا" subtitle="محادثة تفهم لهجتك" tone={colors.primary} onPress={() => router.push("/chat")} />
            <ActionCard icon={<Sparkles size={22} color={colors.warning} />} title="اصنع صورة" subtitle="فكرة إلى مشهد بصري" tone={colors.warning} onPress={() => router.push("/create")} />
            <ActionCard icon={<Clapperboard size={22} color={colors.success} />} title="اصنع فيديو" subtitle="لقطة قصيرة من وصفك" tone={colors.success} onPress={() => router.push("/create?kind=video")} />
            <ActionCard icon={<Brain size={22} color={colors.primary} />} title="ذاكرتي" subtitle="ما اخترت أن يتذكّره" tone={colors.primary} onPress={() => router.push("/memory")} />
          </View>
        ) : (
          <View style={[styles.guestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.guestIcon, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="lock-outline" size={21} color={colors.primary} /></View>
            <View style={styles.guestCopy}>
              <Text style={[styles.guestTitle, { color: colors.foreground }]}>مساحتك الخاصة تنتظرك</Text>
              <Text style={[styles.guestBody, { color: colors.muted }]}>سجّل الدخول لمزامنة محادثاتك ونتائجك وذاكرتك بين أجهزتك.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={handleLogin} style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.smallButtonText, { color: colors.background }]}>دخول</Text></Pressable>
          </View>
        )}

        <View style={[styles.trustRow, { borderColor: colors.border }]}>
          <MaterialIcons name="verified-user" size={17} color={colors.success} />
          <Text style={[styles.trustText, { color: colors.muted }]}>خصوصيتك أولًا · لا تُحفظ الذكريات إلا بموافقتك</Text>
        </View>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/suggestions")}><Text style={[styles.footerLink, { color: colors.primary }]}>اقتراح لتطوير Flsko</Text></Pressable>
          <Text style={[styles.footerSeparator, { color: colors.border }]}>·</Text>
          <Pressable onPress={() => router.push("/privacy")}><Text style={[styles.footerLink, { color: colors.primary }]}>الخصوصية</Text></Pressable>
        </View>
        <Text style={[styles.copyright, { color: colors.muted }]}>© 2026 علي يوسف · Flsko</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 34 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 42, height: 42, borderRadius: 18 },
  brandName: { fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
  brandArabic: { marginTop: 1, fontSize: 11, fontWeight: "700" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeButton: { width: 36, height: 36, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "900" },
  liveDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  hero: { minHeight: 274, borderRadius: 30, padding: 22, overflow: "hidden", position: "relative" },
  heroOrb: { position: "absolute", width: 210, height: 210, borderRadius: 105, right: -70, top: -70 },
  heroHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  heroGreeting: { color: "rgba(255,255,255,0.68)", fontSize: 14, fontWeight: "700", marginTop: 28 },
  heroTitle: { color: "#FFFFFF", fontSize: 34, lineHeight: 42, fontWeight: "900", marginTop: 4 },
  heroBody: { color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 21, marginTop: 10, maxWidth: 270 },
  heroButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 12, marginTop: 16 },
  heroButtonText: { fontSize: 13, fontWeight: "900" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 28, marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { fontSize: 12, marginTop: 4 },
  cloudBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  cloudText: { fontSize: 11, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  actionCard: { borderRadius: 20, padding: 16, borderWidth: 1, minHeight: 120, gap: 8, flex: 1, minWidth: "46%" },
  actionIcon: { width: 40, height: 40, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  actionTitle: { fontSize: 14, fontWeight: "900" },
  actionSubtitle: { fontSize: 11, lineHeight: 17, marginTop: 5, paddingRight: 4 },
  actionArrow: { position: "absolute", left: 14, bottom: 14 },
  guestCard: { borderWidth: 1, borderRadius: 24, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  guestIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  guestCopy: { flex: 1 },
  guestTitle: { fontSize: 14, fontWeight: "900" },
  guestBody: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  smallButton: { borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10 },
  smallButtonText: { fontSize: 12, fontWeight: "900" },
  trustRow: { borderTopWidth: 1, marginTop: 24, paddingTop: 15, flexDirection: "row", alignItems: "center", gap: 7 },
  trustText: { fontSize: 11, flex: 1 },
  footerLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20 },
  footerLink: { fontSize: 11, fontWeight: "800" },
  footerSeparator: { fontSize: 13 },
  copyright: { textAlign: "center", fontSize: 10, marginTop: 13 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});

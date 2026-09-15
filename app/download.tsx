import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const androidDownloadUrl = process.env.EXPO_PUBLIC_ANDROID_DOWNLOAD_URL?.trim();

export default function DownloadScreen() {
  const colors = useColors();
  return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View className="items-center">
          <View className="h-32 w-32 items-center justify-center rounded-[36px]" style={{ backgroundColor: "#061A33" }}>
            <Image source={require("../assets/images/icon.png")} className="h-28 w-28" resizeMode="contain" />
          </View>
          <Text className="mt-5 text-4xl font-black text-foreground">Flsko</Text>
          <Text className="mt-2 text-center text-base font-semibold text-primary">فلسقوا · الوكيل السوري الذكي</Text>
          <Text className="mt-3 text-center text-sm leading-6 text-muted">محادثة، صور، فيديو وموسيقى في مساحة سحابية واحدة، مع خصوصية وذاكرة بإذنك.</Text>
        </View>

        <View className="mt-8 rounded-3xl border border-border bg-surface p-5">
          <Text className="text-lg font-black text-foreground">تحميل Flsko على الهاتف</Text>
          <Text className="mt-2 text-sm leading-6 text-muted">ستبقى هذه الصفحة رابط التحميل الرسمي. لا تثبّت ملفات APK من مصادر غير موثوقة تحمل اسم Flsko.</Text>
          <Pressable
            disabled={!androidDownloadUrl}
            onPress={() => androidDownloadUrl && void Linking.openURL(androidDownloadUrl)}
            style={({ pressed }) => [{ backgroundColor: androidDownloadUrl ? colors.primary : colors.border }, pressed && { opacity: 0.8 }]}
            className="mt-5 rounded-2xl px-4 py-4"
          >
            <Text className="text-center font-black" style={{ color: androidDownloadUrl ? colors.background : colors.muted }}>{androidDownloadUrl ? "تحميل نسخة Android" : "نسخة Android قيد الرفع"}</Text>
          </Pressable>
          {!androidDownloadUrl && <Text className="mt-3 text-center text-xs leading-5 text-muted">بعد إنشاء APK أو AAB موقّع ورفع رابطه، سيظهر زر التحميل هنا تلقائيًا.</Text>}
        </View>

        <View className="mt-5 gap-3">
          {["روبوت Flsko الرسمي ظاهر في الأيقونة", "اسم التطبيق واضح: Flsko", "تسجيل الدخول والبيانات عبر خادم آمن", "واجهة عربية صديقة للهاتف"].map((item) => (
            <View key={item} className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <Text className="text-lg text-primary">✓</Text>
              <Text className="flex-1 text-sm font-semibold text-foreground">{item}</Text>
            </View>
          ))}
        </View>
        <Text className="mt-8 text-center text-xs text-muted">© 2026 علي يوسف · Flsko</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

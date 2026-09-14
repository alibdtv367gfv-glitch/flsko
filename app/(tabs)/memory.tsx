import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const governorates = ["دمشق", "ريف دمشق", "حلب", "حمص", "حماة", "اللاذقية", "طرطوس", "إدلب", "درعا", "السويداء", "القنيطرة", "دير الزور", "الرقة", "الحسكة"];
const backgrounds = ["#F4F8F7", "#E8F4FF", "#FFF4E6", "#F5EEFF", "#E8F7EF"];

type Gender = "male" | "female" | "unspecified";

export default function MemoryScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [memory, setMemory] = useState("");
  const [source, setSource] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [about, setAbout] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [chatBackground, setChatBackground] = useState("#F4F8F7");
  const [voiceGender, setVoiceGender] = useState<"male" | "female">("female");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const memories = trpc.memory.list.useQuery(undefined, { enabled: isAuthenticated });
  const sources = trpc.knowledge.list.useQuery(undefined, { enabled: isAuthenticated });
  const profile = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated });
  const remember = trpc.memory.remember.useMutation({ onSuccess: () => { setMemory(""); void memories.refetch(); }, onError: (error) => Alert.alert("لم تُحفظ الذاكرة", error.message) });
  const submitSource = trpc.knowledge.submitPublicSource.useMutation({ onSuccess: () => { setSource(""); void sources.refetch(); }, onError: (error) => Alert.alert("الرابط غير صالح", error.message) });
  const saveProfile = trpc.profile.save.useMutation({ onSuccess: (saved) => { if (saved) setAvatarUrl(saved.avatarUrl || undefined); void profile.refetch(); Alert.alert("تم الحفظ", "سيستخدم فلسقوا هذه المعلومات لفهمك بشكل أفضل."); }, onError: (error) => Alert.alert("لم يُحفظ الملف", error.message) });
  const uploadAvatar = trpc.profile.uploadAvatar.useMutation({ onSuccess: (saved) => { setAvatarUrl(saved?.avatarUrl || undefined); void profile.refetch(); }, onError: (error) => Alert.alert("لم تُرفع الصورة", error.message) });

  useEffect(() => {
    const data = profile.data;
    if (!data) return;
    setDisplayName(data.displayName || "");
    setGender(data.gender as Gender);
    setAbout(data.about || "");
    setGovernorate(data.governorate || "");
    setChatBackground(data.chatBackground || "#F4F8F7");
    setVoiceGender(data.voiceGender || "female");
    setAvatarUrl(data.avatarUrl || undefined);
  }, [profile.data]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    if (!result.canceled && result.assets[0]?.base64) {
      const type = result.assets[0].mimeType || "image/jpeg";
      uploadAvatar.mutate({ dataUri: `data:${type};base64,${result.assets[0].base64}` });
    }
  };

  const save = () => saveProfile.mutate({ displayName: displayName.trim(), gender, avatarUrl: avatarUrl || "", about: about.trim(), governorate, chatBackground, voiceGender });

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="items-center justify-center px-6">
        <Text className="text-4xl">⌁</Text>
        <Text className="mt-4 text-center text-2xl font-black text-foreground">ملفي وذاكرتي</Text>
        <Text className="mt-3 text-center text-sm leading-6 text-muted">سجّل الدخول ليحفظ فلسقوا تفضيلاتك وإعداداتك في السحابة، وليس على الهاتف.</Text>
        <Pressable onPress={() => void startOAuthLogin()} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-6 rounded-full bg-primary px-6 py-4"><Text className="font-bold text-background">تسجيل الدخول</Text></Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold text-primary">ملفك السحابي</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">عنّي وذاكرتي</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">هذه المعلومات اختيارية وتساعد فلسقوا على فهم لهجتك وطريقة مخاطبتك.</Text>

        <View className="mt-6 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-4">
            <Pressable onPress={pickAvatar} style={({ pressed }) => [pressed && { opacity: 0.75 }]} className="h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-primary">
              {avatarUrl ? <Image source={{ uri: avatarUrl }} className="h-full w-full" /> : <Text className="text-3xl font-black text-background">{displayName.slice(0, 1) || "F"}</Text>}
            </Pressable>
            <View className="flex-1"><Text className="text-base font-bold text-foreground">صورتك الشخصية</Text><Text className="mt-1 text-xs leading-5 text-muted">اختيارية، وتُخزن في المساحة السحابية.</Text><Pressable onPress={pickAvatar} className="mt-2 self-start"><Text className="text-xs font-bold text-primary">اختيار صورة</Text></Pressable></View>
          </View>
          <TextInput value={displayName} onChangeText={setDisplayName} textAlign="right" placeholder="اسمك الذي تفضّل أن يناديك به فلسقوا" placeholderTextColor={colors.muted} className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground" />
          <TextInput value={about} onChangeText={setAbout} multiline textAlign="right" placeholder="معلومات عامة تريد أن يعرفها عنك" placeholderTextColor={colors.muted} className="mt-3 min-h-[82px] rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-foreground" />
          <Text className="mt-4 text-xs font-bold text-muted">الجنس لرسالة الترحيب</Text>
          <View className="mt-2 flex-row gap-2">{(["male", "female", "unspecified"] as const).map((item) => <Pressable key={item} onPress={() => setGender(item)} style={{ backgroundColor: gender === item ? colors.primary : colors.background }} className="flex-1 rounded-xl px-2 py-3"><Text className="text-center text-xs font-bold" style={{ color: gender === item ? colors.background : colors.foreground }}>{item === "male" ? "ذكر" : item === "female" ? "أنثى" : "أفضل عدم التحديد"}</Text></Pressable>)}</View>
          <Text className="mt-4 text-xs font-bold text-muted">المحافظة أو البيئة الأقرب للهجتك</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2"><View className="flex-row gap-2">{governorates.map((item) => <Pressable key={item} onPress={() => setGovernorate(item)} style={{ backgroundColor: governorate === item ? colors.primary : colors.background }} className="rounded-full border border-border px-3 py-2"><Text className="text-xs font-bold" style={{ color: governorate === item ? colors.background : colors.foreground }}>{item}</Text></Pressable>)}</View></ScrollView>
          <Text className="mt-4 text-xs font-bold text-muted">لون خلفية المحادثة</Text>
          <View className="mt-2 flex-row gap-3">{backgrounds.map((item) => <Pressable key={item} onPress={() => setChatBackground(item)} style={{ backgroundColor: item, borderColor: chatBackground === item ? colors.primary : colors.border, borderWidth: chatBackground === item ? 3 : 1 }} className="h-9 w-9 rounded-full" />)}</View>
          <Text className="mt-4 text-xs font-bold text-muted">الصوت الافتراضي</Text>
          <View className="mt-2 flex-row gap-2">{(["female", "male"] as const).map((item) => <Pressable key={item} onPress={() => setVoiceGender(item)} style={{ backgroundColor: voiceGender === item ? colors.primary : colors.background }} className="flex-1 rounded-xl px-3 py-2"><Text className="text-center text-xs font-bold" style={{ color: voiceGender === item ? colors.background : colors.foreground }}>{item === "female" ? "صوت فتاة" : "صوت رجل"}</Text></Pressable>)}</View>
          <Pressable disabled={saveProfile.isPending} onPress={save} style={({ pressed }) => [pressed && { opacity: 0.8 }]} className="mt-5 rounded-2xl bg-primary px-4 py-4"><Text className="text-center font-black text-background">{saveProfile.isPending ? "جارٍ الحفظ..." : "حفظ ملفي"}</Text></Pressable>
        </View>

        <View className="mt-6 rounded-3xl border border-border bg-surface p-4"><Text className="text-base font-bold text-foreground">ذاكرة باختيارك</Text><TextInput value={memory} onChangeText={setMemory} multiline textAlign="right" placeholder="مثال: أفضل الإجابات المختصرة باللهجة الشامية" placeholderTextColor={colors.muted} className="mt-3 min-h-[80px] rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-foreground" /><Pressable disabled={remember.isPending} onPress={() => remember.mutate({ category: "preference", content: memory.trim(), consent: true })} className="mt-3 self-start rounded-full bg-primary px-5 py-3"><Text className="font-bold text-background">حفظ بموافقتي</Text></Pressable></View>
        <Text className="mt-6 text-lg font-black text-foreground">ما وافقتَ على تذكره</Text>
        <View className="mt-3 gap-2">{memories.data?.length ? memories.data.map((item) => <View key={item.id} className="rounded-2xl border border-border bg-surface p-4"><Text className="text-sm leading-6 text-foreground">{item.content}</Text><Text className="mt-2 text-xs text-muted">{item.category} · موافق عليه</Text></View>) : <Text className="text-sm text-muted">لا توجد ذكريات محفوظة بعد.</Text>}</View>
        <View className="mt-7 rounded-3xl border border-border bg-surface p-4"><Text className="text-base font-bold text-foreground">مصدر سوري عام بإذن واضح</Text><Text className="mt-2 text-xs leading-5 text-muted">أضف رابطًا عامًا تملك حق استخدامه. يمر الرابط بالمراجعة قبل استخدامه.</Text><TextInput value={source} onChangeText={setSource} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={colors.muted} className="mt-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground" /><Pressable onPress={() => submitSource.mutate({ url: source.trim(), permission: true })} className="mt-3 self-start rounded-full bg-foreground px-5 py-3"><Text className="font-bold text-background">إرسال للمراجعة</Text></Pressable></View>
        <Text className="mt-4 text-xs leading-5 text-muted">المصادر المضافة: {sources.data?.length || 0} · لا تدخل المعرفة العامة قبل المراجعة.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

import { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Filter = "all" | "image" | "video" | "document";

export default function LibraryScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const files = trpc.files.list.useQuery(undefined, { enabled: isAuthenticated });
  const upload = trpc.files.upload.useMutation({ onSuccess: () => void files.refetch(), onError: (error) => Alert.alert("تعذر رفع الملف", error.message) });
  const visible = useMemo(() => files.data?.filter((file) => filter === "all" || file.kind === filter) || [], [files.data, filter]);

  const uploadAsset = async (asset: { uri: string; name?: string; mimeType?: string; base64?: string | null }) => {
    const base64 = asset.base64 || await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mimeType = asset.mimeType || "application/octet-stream";
    const name = asset.name || `flsko-${Date.now()}`;
    upload.mutate({ name, mimeType, dataUri: `data:${mimeType};base64,${base64}` });
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsEditing: false, quality: 0.85, base64: true });
    if (!result.canceled && result.assets[0]) await uploadAsset(result.assets[0]);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"], copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => uploadAsset({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, base64: String(reader.result).split(",")[1] });
      reader.readAsDataURL(blob);
    }
  };

  if (!isAuthenticated) return <ScreenContainer className="items-center justify-center px-6"><Text className="text-4xl">⌁</Text><Text className="mt-4 text-center text-2xl font-black text-foreground">مكتبتي السحابية</Text><Text className="mt-3 text-center text-sm leading-6 text-muted">سجّل الدخول لرفع ملفاتك ومساعدة فلسقوا في فهمها.</Text><Pressable onPress={() => void startOAuthLogin()} className="mt-6 rounded-full bg-primary px-6 py-4"><Text className="font-bold text-background">تسجيل الدخول</Text></Pressable></ScreenContainer>;

  return (
    <ScreenContainer className="px-5 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold text-primary">مساحة الملفات</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">مكتبتي</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">ارفع صورة أو فيديو أو مستندًا، وسيبقى في حسابك السحابي لمساعدة فلسقوا عند طلبك.</Text>
        <View className="mt-5 flex-row gap-2"><Pressable onPress={pickMedia} disabled={upload.isPending} className="flex-1 rounded-2xl bg-primary px-3 py-4"><Text className="text-center font-black text-background">إضافة صورة / فيديو</Text></Pressable><Pressable onPress={pickDocument} disabled={upload.isPending} className="flex-1 rounded-2xl border border-primary px-3 py-4"><Text className="text-center font-black text-primary">إضافة مستند</Text></Pressable></View>
        {upload.isPending && <Text className="mt-3 text-center text-xs font-bold text-primary">جارٍ رفع الملف إلى السحابة...</Text>}
        <View className="mt-6 flex-row rounded-2xl border border-border bg-surface p-1">{(["all", "image", "video", "document"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={{ backgroundColor: filter === item ? colors.primary : "transparent" }} className="flex-1 rounded-xl px-2 py-3"><Text className="text-center text-xs font-bold" style={{ color: filter === item ? colors.background : colors.muted }}>{item === "all" ? "الكل" : item === "image" ? "صور" : item === "video" ? "فيديو" : "مستندات"}</Text></Pressable>)}</View>
        <View className="mt-5 gap-3">{visible.length ? visible.map((file) => <Pressable key={file.id} onPress={() => void Linking.openURL(file.storageUrl)} className="flex-row items-center rounded-2xl border border-border bg-surface p-3"><View className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-background">{file.kind === "image" ? <Image source={{ uri: file.storageUrl }} className="h-full w-full" resizeMode="cover" /> : <Text className="text-2xl">{file.kind === "video" ? "▶" : "▤"}</Text>}</View><View className="mr-3 flex-1"><Text numberOfLines={1} className="text-sm font-bold text-foreground">{file.name}</Text><Text className="mt-1 text-xs text-muted">{file.kind === "image" ? "صورة" : file.kind === "video" ? "فيديو" : "مستند"} · {Math.ceil(file.sizeBytes / 1024)} كيلوبايت</Text></View><Text className="text-xs font-bold text-primary">فتح</Text></Pressable>) : <View className="rounded-2xl border border-dashed border-border p-8"><Text className="text-center text-sm leading-6 text-muted">لا توجد ملفات في هذا القسم بعد. ابدأ بإضافة صورة أو فيديو أو مستند.</Text></View>}</View>
        <View className="mt-6 rounded-3xl bg-surface p-4"><Text className="text-sm font-bold text-foreground">الخصوصية</Text><Text className="mt-2 text-xs leading-5 text-muted">لا يستخدم فلسقوا ملفًا في الإجابة إلا عند طلبك أو عند منحه إذنًا واضحًا. الملفات محفوظة في التخزين السحابي المرتبط بحسابك.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

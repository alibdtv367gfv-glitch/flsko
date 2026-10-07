import { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { FolderOpen, Image as ImageIcon, Video, FileText, Upload, Trash2, RefreshCw } from "lucide-react-native";

import { ScreenContainer } from "@/components/screen-container";
import { FlskoCard } from "@/components/ui/flsko-card";
import { startOAuthLogin } from "@/constants/oauth";
import { Radius, Shadow, Space, Touch, Type } from "@/constants/design";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Filter = "all" | "image" | "video" | "document";

function tap() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export default function LibraryScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const files = trpc.files.list.useQuery(undefined, { enabled: isAuthenticated, staleTime: 45_000 });
  const upload = trpc.files.upload.useMutation({
    onSuccess: () => void files.refetch(),
    onError: (error) => Alert.alert("تعذر رفع الملف", error.message),
  });
  const remove = trpc.files.delete.useMutation({
    onSuccess: () => void files.refetch(),
    onError: (error) => Alert.alert("تعذر حذف الملف", error.message),
  });

  const visible = useMemo(
    () => files.data?.filter((file) => filter === "all" || file.kind === filter) || [],
    [files.data, filter],
  );

  const uploadAsset = async (asset: {
    uri: string;
    name?: string;
    mimeType?: string;
    base64?: string | null;
  }) => {
    const base64 =
      asset.base64 ||
      (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
    const mimeType = asset.mimeType || "application/octet-stream";
    const name = asset.name || `flsko-${Date.now()}`;
    upload.mutate({ name, mimeType, dataUri: `data:${mimeType};base64,${base64}` });
  };

  const pickMedia = async () => {
    tap();
    if (!isAuthenticated) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لحفظ ملفاتك.", [
        { text: "إلغاء", style: "cancel" },
        { text: "دخول", onPress: () => void startOAuthLogin() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) await uploadAsset(result.assets[0]);
  };

  const pickDocument = async () => {
    tap();
    if (!isAuthenticated) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const reader = new FileReader();
      const dataUri: string = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      upload.mutate({
        name: asset.name || `doc-${Date.now()}`,
        mimeType: asset.mimeType || "application/octet-stream",
        dataUri,
      });
    }
  };

  const filters: { id: Filter; label: string; Icon: typeof ImageIcon }[] = [
    { id: "all", label: "الكل", Icon: FolderOpen },
    { id: "image", label: "صور", Icon: ImageIcon },
    { id: "video", label: "فيديو", Icon: Video },
    { id: "document", label: "مستندات", Icon: FileText },
  ];

  return (
    <ScreenContainer className="px-5 pt-2" containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>مساحتك الخاصة</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>مكتبتي</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              ارفع صورًا وفيديو ومستندات ليرتبط بها فلسقوا عند الحاجة وبموافقتك.
            </Text>
          </View>
          <Pressable
            onPress={() => {
              tap();
              void files.refetch();
            }}
            style={[styles.iconBtn, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28` }]}
          >
            <RefreshCw size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void pickMedia()}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
              Shadow.glow(colors.primary),
            ]}
          >
            <Upload size={18} color="#fff" />
            <Text style={styles.actionBtnText}>صورة / فيديو</Text>
          </Pressable>
          <Pressable
            onPress={() => void pickDocument()}
            style={({ pressed }) => [
              styles.actionBtnOutline,
              { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <FileText size={18} color={colors.primary} />
            <Text style={[styles.actionBtnTextOutline, { color: colors.primary }]}>مستند</Text>
          </Pressable>
        </View>

        <View style={[styles.filterBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {filters.map(({ id, label, Icon }) => {
            const active = filter === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  tap();
                  setFilter(id);
                }}
                style={[
                  styles.filterItem,
                  { backgroundColor: active ? colors.primary : "transparent", minHeight: Touch.min - 4 },
                ]}
              >
                <Icon size={14} color={active ? "#fff" : colors.muted} />
                <Text style={{ color: active ? "#fff" : colors.muted, fontSize: 11, fontWeight: "800" }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!isAuthenticated ? (
          <FlskoCard style={{ marginTop: Space.lg }}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>سجّل الدخول أولًا</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              المكتبة مرتبطة بحسابك حتى تبقى ملفاتك خاصة بك.
            </Text>
            <Pressable
              onPress={() => void startOAuthLogin()}
              style={[styles.loginCta, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>تسجيل الدخول</Text>
            </Pressable>
          </FlskoCard>
        ) : files.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : visible.length === 0 ? (
          <FlskoCard style={{ marginTop: Space.lg }}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}12` }]}>
              <FolderOpen size={26} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا ملفات هنا بعد</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              ابدأ برفع صورة أو فيديو أو مستند من الأزرار أعلاه.
            </Text>
          </FlskoCard>
        ) : (
          <View style={{ marginTop: Space.lg, gap: 12 }}>
            {visible.map((file) => (
              <FlskoCard key={file.id} padding="sm">
                <View style={styles.row}>
                  <Pressable
                    onPress={() => void Linking.openURL(file.storageUrl)}
                    style={styles.rowMain}
                  >
                    <View
                      style={[
                        styles.thumb,
                        { backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    >
                      {file.kind === "image" ? (
                        <Image
                          source={{ uri: file.storageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : file.kind === "video" ? (
                        <Video size={22} color={colors.primary} />
                      ) : (
                        <FileText size={22} color={colors.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>
                        {file.name}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                        {file.kind === "image" ? "صورة" : file.kind === "video" ? "فيديو" : "مستند"} ·{" "}
                        {Math.ceil(file.sizeBytes / 1024)} ك.ب
                      </Text>
                    </View>
                    <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>فتح</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Alert.alert("حذف الملف", "سيختفي من مساحتك ولن يستخدمه الوكيل.", [
                        { text: "إلغاء", style: "cancel" },
                        {
                          text: "حذف",
                          style: "destructive",
                          onPress: () => remove.mutate({ id: file.id }),
                        },
                      ])
                    }
                    style={styles.trash}
                  >
                    <Trash2 size={16} color={colors.error} />
                  </Pressable>
                </View>
              </FlskoCard>
            ))}
          </View>
        )}

        <FlskoCard style={{ marginTop: Space.xl }} elevated={false}>
          <Text style={[styles.privacyTitle, { color: colors.foreground }]}>الخصوصية والتنظيف</Text>
          <Text style={[styles.privacyBody, { color: colors.muted }]}>
            لا يستخدم فلسقوا ملفًا إلا عند طلبك. ملفاتك الناجحة لا تُحذف تلقائيًا.
          </Text>
        </FlskoCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: { flexDirection: "row", gap: 12, marginBottom: Space.md },
  eyebrow: { fontSize: Type.caption, fontWeight: "800", marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "900" },
  subtitle: { fontSize: Type.caption, lineHeight: 20, marginTop: 6 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginBottom: Space.md },
  actionBtn: {
    flex: 1,
    minHeight: Touch.comfortable,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  actionBtnOutline: {
    flex: 1,
    minHeight: Touch.comfortable,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnTextOutline: { fontWeight: "900", fontSize: 13 },
  filterBar: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  filterItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: Radius.md,
    paddingVertical: 8,
  },
  center: { paddingVertical: 48, alignItems: "center" },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
  loginCta: {
    marginTop: 16,
    minHeight: Touch.min,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 14, fontWeight: "800" },
  trash: { padding: 10 },
  privacyTitle: { fontSize: 14, fontWeight: "800" },
  privacyBody: { fontSize: 12, lineHeight: 19, marginTop: 8 },
});

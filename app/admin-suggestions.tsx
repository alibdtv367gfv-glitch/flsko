import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function AdminSuggestionsScreen() {
  const colors = useColors();
  const { isAuthenticated, user } = useAuth();
  const suggestions = trpc.suggestions.adminList.useQuery(undefined, { enabled: isAuthenticated && user?.role === "admin" });

  if (!isAuthenticated || user?.role !== "admin") {
    return <ScreenContainer className="items-center justify-center px-6"><Text className="text-2xl font-black text-foreground">لوحة الفريق</Text><Text className="mt-3 text-center text-sm leading-6 text-muted">هذه الصفحة مخصصة لمالك Flsko ولا تعرض الاقتراحات للمستخدمين العاديين.</Text></ScreenContainer>;
  }

  return (
    <ScreenContainer className="px-5 pt-5">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-semibold text-primary">مساحة الفريق</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">اقتراحات المستخدمين</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">تصل الاقتراحات إلى البريد الخادمي، ويمكن مراجعتها هنا دون كشف عنوان المالك داخل التطبيق.</Text>
        <Pressable onPress={() => void suggestions.refetch()} style={({ pressed }) => [pressed && { opacity: 0.75 }]} className="mt-5 self-start rounded-full bg-primary px-5 py-3"><Text className="font-bold text-background">تحديث القائمة</Text></Pressable>
        <View className="mt-6 gap-3">
          {suggestions.isLoading && <Text className="text-sm text-muted">جارٍ تحميل الاقتراحات...</Text>}
          {suggestions.error && <Text className="text-sm text-error">تعذر تحميل الاقتراحات. تحقق من صلاحية المالك.</Text>}
          {!suggestions.isLoading && !suggestions.data?.length && <Text className="text-sm text-muted">لا توجد اقتراحات بعد.</Text>}
          {suggestions.data?.map((item) => (
            <View key={item.id} className="rounded-3xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between gap-3"><Text className="flex-1 text-base font-black text-foreground">{item.category}</Text><Text className="text-xs font-bold" style={{ color: item.emailStatus === "sent" ? colors.success : colors.warning }}>{item.emailStatus}</Text></View>
              <Text className="mt-3 text-sm leading-6 text-foreground">{item.content}</Text>
              <Text className="mt-3 text-xs text-muted">{item.userName || "مستخدم"} · {item.userEmail || "بريد مخفي"} · {item.createdAt ? new Date(item.createdAt).toLocaleString("ar-SY") : ""}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={() => Alert.alert("خصوصية الفريق", "لا يُعرض بريد استقبال الاقتراحات في هذه اللوحة؛ تُستخدم بيانات المستخدمين للمراجعة فقط.")} className="mt-7 rounded-2xl border border-border p-4"><Text className="text-center text-xs font-bold text-primary">ملاحظة الخصوصية</Text></Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

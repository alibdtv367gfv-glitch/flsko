import { ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

export default function PrivacyScreen() {
  return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="text-sm font-semibold text-primary">Flsko</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">سياسة الخصوصية</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">نسخة أولية للمراجعة قبل النشر العام — آخر تحديث: 14 أيلول 2026.</Text>

        <View className="mt-7 gap-5">
          <View>
            <Text className="text-lg font-bold text-foreground">ما الذي نستخدمه؟</Text>
            <Text className="mt-2 text-sm leading-7 text-muted">يستخدم Flsko بيانات الحساب اللازمة لتسجيل الدخول، ورسائلك وملفات التوليد التي تطلب حفظها، والذكريات التي تمنحها موافقة صريحة. لا نقرأ حساباتك الخاصة على الشبكات الاجتماعية ولا نجمعها تلقائيًا.</Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-foreground">المعالجة السحابية</Text>
            <Text className="mt-2 text-sm leading-7 text-muted">تُرسل الطلبات إلى خادم Flsko لمعالجتها. قد يستخدم الخادم مزودات ذكاء اصطناعي ومزودات مفتوحة متاحة في البيئة، ثم يقارن النتائج ويعرض إجابة واحدة. لا تُضمّن مفاتيح المزودات داخل الهاتف.</Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-foreground">الذاكرة</Text>
            <Text className="mt-2 text-sm leading-7 text-muted">لا يحفظ Flsko تفضيلاتك كذاكرة إلا عندما تضيفها وتوافق عليها. يمكنك طلب مراجعة الذاكرة أو حذفها من مساحة الذاكرة في التطبيق.</Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-foreground">المحتوى والسلامة</Text>
            <Text className="mt-2 text-sm leading-7 text-muted">تُستخدم بلاغات المحتوى لتحسين السلامة ومراجعة النتائج المسيئة. لا تستخدم الخدمة لإنشاء محتوى ينتهك حقوق الآخرين أو يعرّض أي شخص للخطر.</Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-foreground">قبل الإطلاق العام</Text>
            <Text className="mt-2 text-sm leading-7 text-muted">يجب نشر هذه السياسة على رابط عام، وتعبئة نموذج Data safety في Google Play، وإضافة قناة دعم وحذف حساب واضحة، ثم تحديث هذه الصفحة ببيانات الجهة المالكة ومدة الاحتفاظ ومعلومات التواصل الرسمية.</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

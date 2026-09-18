import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function TermsScreen() {
  return (
    <ScreenContainer className="px-5 pt-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="text-sm font-semibold text-primary">Flsko · فلسقوا</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">شروط الاستخدام</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">آخر تحديث: 18 أيلول 2026 · هذه الشروط مخصصة للاستخدام مع النسخة التجريبية والعامة من التطبيق.</Text>
        <View className="mt-7 gap-5">
          <View><Text className="text-lg font-bold text-foreground">1. قبول الشروط</Text><Text className="mt-2 text-sm leading-7 text-muted">باستخدام Flsko أو تسجيل الدخول إليه، تؤكد أنك قرأت هذه الشروط وتوافق عليها. إذا لم توافق، فلا تستخدم الخدمة.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">2. طبيعة الخدمة</Text><Text className="mt-2 text-sm leading-7 text-muted">Flsko وكيل مساعد يعتمد على خدمات سحابية ونماذج ذكاء اصطناعي متعددة. النتائج قد تخطئ أو تتأخر أو تصبح غير متاحة، ولا تشكل استشارة طبية أو قانونية أو مالية أو ضمانًا لنتيجة معينة.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">3. حساب Google</Text><Text className="mt-2 text-sm leading-7 text-muted">يلزم تسجيل الدخول للوصول إلى المحادثة والذاكرة والوسائط. تستخدم Google للمصادقة فقط وفق الأذونات الظاهرة لها، ولا يطلب Flsko كلمة مرور Google أو يخزنها.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">4. المحتوى المسموح</Text><Text className="mt-2 text-sm leading-7 text-muted">أنت مسؤول عن الطلبات والملفات التي ترسلها. يحظر استخدام التطبيق لانتهاك حقوق الملكية، أو انتحال الأشخاص، أو إنشاء محتوى يهدد أو يستغل أو يضر بالآخرين، أو التحايل على حدود الخدمة.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">5. الملكية والتراخيص</Text><Text className="mt-2 text-sm leading-7 text-muted">تعود هوية Flsko والمواد التي يملكها المشروع إلى علي يوسف. تحتفظ بملكية مدخلاتك، وتمنح الخدمة إذنًا محدودًا لمعالجتها وإعادتها إليك من أجل تنفيذ طلبك، وفق سياسة الخصوصية.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">6. الإتاحة والحدود</Text><Text className="mt-2 text-sm leading-7 text-muted">الخدمة مجانية تجريبيًا وقد تتوقف أو تتغير حدودها، خصوصًا توليد الفيديو والموسيقى، بسبب طوابير المزودات المفتوحة أو حدود البنية التحتية. لا ترفع معلومات حساسة لا تريد معالجتها سحابيًا.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">7. الإيقاف والحذف</Text><Text className="mt-2 text-sm leading-7 text-muted">يمكن إيقاف الوصول أو حذف بيانات الحساب عند الحاجة إلى حماية الخدمة أو المستخدمين أو الامتثال للقانون. يمكنك طلب حذف البيانات عبر قناة الدعم التي يعلنها المشروع.</Text></View>
          <View><Text className="text-lg font-bold text-foreground">8. التواصل</Text><Text className="mt-2 text-sm leading-7 text-muted">مالك المشروع: علي يوسف. للاقتراحات وطلبات الخصوصية، استخدم قناة الاقتراحات داخل التطبيق أو وسيلة التواصل الرسمية المنشورة مع الإصدار.</Text></View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

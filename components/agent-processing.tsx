import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { FlskoRobot } from "@/components/flsko-robot";
import { useColors } from "@/hooks/use-colors";

type ProcessingMode = "chat" | "media" | "image" | "video" | "music";

const phrases: Record<string, string[]> = {
  chat: [
    "فلسقوا يفكّر بهدوء…",
    "يلتقط نبرة كلامك…",
    "يربط الفكرة بما يناسبك…",
    "يصوغ جوابًا واضحًا…",
  ],
  media: [
    "يتخيّل المشهد…",
    "يضبط الإضاءة والتفاصيل…",
    "يوازن الجودة والسرعة…",
    "يلمّع النتيجة الأخيرة…",
  ],
  image: [
    "يرسم ملامح الصورة…",
    "يضيف عمقًا ولونًا…",
    "يراجع التفاصيل الدقيقة…",
    "يجهّز الصورة للعرض…",
  ],
  video: [
    "يحرّك الكاميرا في خياله…",
    "يبني اللقطة إطارًا إطارًا…",
    "يصبر على الطابور السحابي…",
    "يجهّز المقطع للمشاهدة…",
  ],
  music: [
    "يلتقط المزاج الموسيقي…",
    "يركب الإيقاع…",
    "يهذّب المقطع…",
    "يجهّز الاستماع…",
  ],
};

export function AgentProcessing({
  mode = "chat",
  waitLeft,
}: {
  mode?: ProcessingMode;
  waitLeft?: number | null;
}) {
  const colors = useColors();
  const key = mode === "image" || mode === "video" || mode === "music" ? mode : mode === "media" ? "media" : "chat";
  const lines = phrases[key] || phrases.chat;
  const [line, setLine] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.25, duration: 180, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      setLine((c) => (c + 1) % lines.length);
    }, 1600);
    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(bar, { toValue: 0.2, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    barLoop.start();
    return () => {
      clearInterval(id);
      barLoop.stop();
    };
  }, [bar, fade, lines.length]);

  return (
    <View
      accessibilityLabel="فلسقوا يعمل"
      className="mt-3 overflow-hidden rounded-[28px] border border-border bg-surface p-5"
    >
      <View className="flex-row items-center gap-4">
        <FlskoRobot mood="thinking" size={64} />
        <View className="flex-1">
          <Text className="text-base font-black text-foreground">فلسقوا يشتغل معك</Text>
          <Animated.Text style={{ opacity: fade }} className="mt-1.5 text-sm leading-6 text-muted">
            {lines[line]}
          </Animated.Text>
          {typeof waitLeft === "number" && waitLeft > 0 ? (
            <Text className="mt-2 text-xs font-bold text-primary">حوالي {waitLeft} ث متبقية</Text>
          ) : null}
        </View>
      </View>
      <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-background">
        <Animated.View
          style={{
            width: bar.interpolate({ inputRange: [0, 1], outputRange: ["18%", "92%"] }),
            height: "100%",
            borderRadius: 999,
            backgroundColor: colors.primary,
          }}
        />
      </View>
      <Text className="mt-3 text-center text-[11px] leading-5 text-muted">
        تجربة هادئة بدون أرقام مراحل — فقط روبوت يفكّر معك
      </Text>
    </View>
  );
}

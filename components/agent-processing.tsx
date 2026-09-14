import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type ProcessingMode = "chat" | "media";

const chatStages = ["أفهم طلبك…", "أجمع المعرفة المناسبة…", "أوازن الاحتمالات…", "أصيغ لك الجواب الأدق…"];
const mediaStages = ["أفهم فكرتك…", "أرتّب التفاصيل…", "أوازن الجودة والسرعة…", "أجهّز النتيجة…"];
const stageIcons = ["✦", "⌁", "◌", "✓"];

export function AgentProcessing({ mode = "chat" }: { mode?: ProcessingMode }) {
  const colors = useColors();
  const [stage, setStage] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const stages = mode === "chat" ? chatStages : mediaStages;

  useEffect(() => {
    const interval = setInterval(() => setStage((current) => Math.min(current + 1, stages.length - 1)), 1350);
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const breatheLoop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const shimmerLoop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1650, easing: Easing.linear, useNativeDriver: false }));
    pulseLoop.start(); breatheLoop.start(); shimmerLoop.start();
    return () => { clearInterval(interval); pulseLoop.stop(); breatheLoop.stop(); shimmerLoop.stop(); };
  }, [breathe, pulse, shimmer, stages.length]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const progress = `${Math.min(88, Math.round(((stage + 1) / stages.length) * 88))}%` as `${number}%`;

  return (
    <View accessibilityLabel="فلسقوا يعمل على تحسين الإجابة" className="mt-3 overflow-hidden rounded-3xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center">
          <Animated.View style={{ backgroundColor: colors.primary, transform: [{ scale: haloScale }], opacity: 0.2 }} className="absolute h-11 w-11 rounded-full" />
          <Animated.View style={{ backgroundColor: colors.primary, transform: [{ scale }], opacity }} className="h-10 w-10 items-center justify-center rounded-2xl"><Text className="text-lg font-black text-background">F</Text></Animated.View>
        </View>
        <View className="flex-1"><Text className="text-sm font-bold text-foreground">فلسقوا يفكّر معك</Text><Text className="mt-1 text-xs text-muted">{stages[stage]}</Text></View>
        <Animated.Text style={{ opacity }} className="text-xs font-bold text-primary">{progress}</Animated.Text>
      </View>
      <View className="mt-4 h-2 overflow-hidden rounded-full bg-background"><Animated.View style={{ width: shimmer.interpolate({ inputRange: [0, 1], outputRange: ["12%", progress] }), backgroundColor: colors.primary }} className="h-full rounded-full" /></View>
      <View className="mt-4 flex-row items-start justify-between">{stages.map((label, index) => { const active = index <= stage; return <View key={label} className="items-center" style={{ width: `${100 / stages.length}%` }}><View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: active ? colors.primary : colors.background, borderWidth: active ? 0 : 1, borderColor: colors.border }}><Text style={{ color: active ? colors.background : colors.muted }} className="text-xs font-black">{stageIcons[index]}</Text></View><Text numberOfLines={1} className="mt-1 text-center text-[9px]" style={{ color: active ? colors.primary : colors.muted }}>{label.replace("…", "")}</Text></View>; })}</View>
      <Text className="mt-3 text-center text-[10px] text-muted">أهتم بالمعنى أولًا، ثم أقدّم لك خلاصة واضحة</Text>
    </View>
  );
}

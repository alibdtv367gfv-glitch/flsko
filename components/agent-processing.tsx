import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type ProcessingMode = "chat" | "media";

const chatStages = ["أفهم طلبك…", "أبحث في المصادر المتاحة…", "أقارن النتائج…", "أحللها وأصيغها بطريقتك…"];
const mediaStages = ["أفهم فكرتك…", "أوازن الجودة والسرعة…", "أجهّز النتيجة…"];

export function AgentProcessing({ mode = "chat" }: { mode?: ProcessingMode }) {
  const colors = useColors();
  const [stage, setStage] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const stages = mode === "chat" ? chatStages : mediaStages;

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((current) => Math.min(current + 1, stages.length - 1));
    }, 1250);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1700, easing: Easing.linear, useNativeDriver: false }),
    );
    pulseLoop.start();
    shimmerLoop.start();

    return () => {
      clearInterval(interval);
      pulseLoop.stop();
      shimmerLoop.stop();
    };
  }, [pulse, shimmer, stages.length]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const progress = `${Math.round(((stage + 1) / stages.length) * 100)}%` as `${number}%`;

  return (
    <View className="mt-3 overflow-hidden rounded-3xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <Animated.View
          style={{ backgroundColor: colors.primary, transform: [{ scale }], opacity }}
          className="h-10 w-10 items-center justify-center rounded-2xl"
        >
          <Text className="text-lg font-black text-background">F</Text>
        </Animated.View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-foreground">فلسقوا يعمل من أجلك</Text>
          <Text className="mt-1 text-xs text-muted">{stages[stage]}</Text>
        </View>
        <Animated.Text style={{ opacity }} className="text-xs font-bold text-primary">{progress}</Animated.Text>
      </View>
      <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-background">
        <Animated.View
          style={{ width: shimmer.interpolate({ inputRange: [0, 1], outputRange: ["18%", progress] }), backgroundColor: colors.primary }}
          className="h-full rounded-full"
        />
      </View>
      <View className="mt-3 flex-row gap-1.5">
        {stages.map((label, index) => (
          <View key={label} className="flex-1">
            <View className="h-1 rounded-full" style={{ backgroundColor: index <= stage ? colors.primary : colors.border }} />
          </View>
        ))}
      </View>
    </View>
  );
}

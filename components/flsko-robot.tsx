/**
 * Flsko animated robot — thinking / talking / idle
 * Pure RN Animated (no extra native modules) for smooth Expo builds.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export type RobotMood = "idle" | "thinking" | "talking" | "listening";

type Props = {
  mood?: RobotMood;
  size?: number;
  label?: string;
};

export function FlskoRobot({ mood = "idle", size = 72, label }: Props) {
  const colors = useColors();
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const mouth = useRef(new Animated.Value(0.25)).current;
  const think = useRef(new Animated.Value(0)).current;
  const ear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: mood === "talking" ? 420 : 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: mood === "talking" ? 420 : 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bobLoop.start();

    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(blink, { toValue: 0.12, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.delay(1600),
      ]),
    );
    blinkLoop.start();

    let mouthLoop: Animated.CompositeAnimation | null = null;
    let thinkLoop: Animated.CompositeAnimation | null = null;
    let earLoop: Animated.CompositeAnimation | null = null;

    if (mood === "talking") {
      mouthLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(mouth, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: false }),
          Animated.timing(mouth, { toValue: 0.2, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: false }),
          Animated.timing(mouth, { toValue: 0.75, duration: 110, useNativeDriver: false }),
          Animated.timing(mouth, { toValue: 0.35, duration: 100, useNativeDriver: false }),
        ]),
      );
      mouthLoop.start();
    } else if (mood === "listening") {
      mouth.setValue(0.15);
      earLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ear, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(ear, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      );
      earLoop.start();
    } else if (mood === "thinking") {
      mouth.setValue(0.2);
      thinkLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(think, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(think, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      thinkLoop.start();
    } else {
      mouth.setValue(0.35);
    }

    return () => {
      bobLoop.stop();
      blinkLoop.stop();
      mouthLoop?.stop();
      thinkLoop?.stop();
      earLoop?.stop();
    };
  }, [mood, bob, blink, mouth, think, ear]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, mood === "talking" ? -4 : -6] });
  const bodyScale = bob.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const mouthH = mouth.interpolate({ inputRange: [0, 1], outputRange: [Math.max(4, size * 0.06), Math.max(10, size * 0.18)] });
  const bubbleY = think.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const bubbleOp = think.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1, 0.85] });
  const earScale = ear.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });

  const head = size * 0.72;
  const eye = size * 0.12;
  const primary = colors.primary;
  const surface = colors.surface;
  const bg = colors.background;

  return (
    <View style={{ width: size * 1.35, alignItems: "center" }} accessibilityLabel={label || "فلسقوا"}>
      <Animated.View style={{ transform: [{ translateY }, { scale: bodyScale }], alignItems: "center" }}>
        {/* thinking bubbles */}
        {mood === "thinking" && (
          <Animated.View style={{ position: "absolute", top: -size * 0.28, right: 0, opacity: bubbleOp, transform: [{ translateY: bubbleY }], flexDirection: "row", gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: primary, opacity: 0.5 }} />
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: primary, opacity: 0.7 }} />
            <View style={{ width: 14, height: 14, borderRadius: 8, backgroundColor: primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 8, color: bg, fontWeight: "900" }}>?</Text>
            </View>
          </Animated.View>
        )}

        {/* antenna */}
        <View style={{ width: 3, height: size * 0.12, backgroundColor: primary, borderRadius: 2 }} />
        <View style={{ width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: primary, marginBottom: 2 }} />

        {/* head */}
        <View
          style={{
            width: head,
            height: head,
            borderRadius: head * 0.28,
            backgroundColor: primary,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 3,
            borderColor: `${primary}99`,
          }}
        >
          {/* ears */}
          <Animated.View style={{ position: "absolute", left: -size * 0.06, width: size * 0.1, height: size * 0.16, borderRadius: 6, backgroundColor: primary, transform: [{ scale: earScale }] }} />
          <Animated.View style={{ position: "absolute", right: -size * 0.06, width: size * 0.1, height: size * 0.16, borderRadius: 6, backgroundColor: primary, transform: [{ scale: earScale }] }} />

          {/* eyes */}
          <View style={{ flexDirection: "row", gap: size * 0.12, marginBottom: size * 0.06 }}>
            <Animated.View style={{ width: eye, height: eye, borderRadius: eye, backgroundColor: bg, transform: [{ scaleY: blink }] }} />
            <Animated.View style={{ width: eye, height: eye, borderRadius: eye, backgroundColor: bg, transform: [{ scaleY: blink }] }} />
          </View>

          {/* mouth */}
          <Animated.View
            style={{
              width: size * 0.28,
              height: mouthH,
              borderRadius: size * 0.08,
              backgroundColor: bg,
              opacity: mood === "listening" ? 0.7 : 1,
            }}
          />
        </View>

        {/* body */}
        <View
          style={{
            marginTop: 4,
            width: size * 0.5,
            height: size * 0.28,
            borderRadius: 12,
            backgroundColor: surface,
            borderWidth: 2,
            borderColor: primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: 8, backgroundColor: primary, opacity: 0.85 }} />
        </View>
      </Animated.View>
      {label ? (
        <Text style={{ marginTop: 6, fontSize: 11, fontWeight: "800", color: colors.muted }}>{label}</Text>
      ) : null}
    </View>
  );
}

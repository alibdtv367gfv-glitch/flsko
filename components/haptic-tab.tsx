import { Pressable, type PressableProps, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Tab button with light haptic feedback — no react-navigation dependency (SDK 57). */
export function HapticTab(props: PressableProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (Platform.OS === "ios") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

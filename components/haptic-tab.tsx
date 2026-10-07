import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof PlatformPressable>;

export function HapticTab(props: Props) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "wand.and.stars": "auto-awesome",
  "bubble.left.fill": "chat-bubble",
  "brain.head.profile": "psychology",
  "folder.fill": "folder",
} as const;

type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: string;
}) {
  const icon = MAPPING[name] as ComponentProps<typeof MaterialIcons>["name"];
  return <MaterialIcons color={color} size={size} name={icon} style={style} />;
}

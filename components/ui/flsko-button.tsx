import { ActivityIndicator, Pressable, Text, View, type PressableProps, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

type Props = PressableProps & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
};

export function FlskoButton({
  title,
  variant = "primary",
  loading,
  icon,
  className,
  fullWidth = true,
  disabled,
  onPress,
  ...rest
}: Props) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.error
        : variant === "secondary"
          ? colors.surface
          : "transparent";
  const textColor =
    variant === "primary" || variant === "danger" ? "#FFFFFF" : colors.primary;
  const border =
    variant === "outline" || variant === "secondary" || variant === "ghost"
      ? { borderWidth: 1.5, borderColor: variant === "ghost" ? "transparent" : colors.primary }
      : {};

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        if (Platform.OS !== "web") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
      className={cn(fullWidth ? "w-full" : "self-start", className)}
      style={({ pressed }) => [
        {
          minHeight: 52,
          borderRadius: 18,
          paddingHorizontal: 18,
          paddingVertical: 14,
          backgroundColor: bg,
          opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          ...border,
          ...(variant === "primary"
            ? Platform.select({
                ios: {
                  shadowColor: colors.primary,
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                },
                android: { elevation: 4 },
                default: {},
              })
            : {}),
        },
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={textColor} /> : icon ? <View>{icon}</View> : null}
      <Text style={{ color: textColor, fontSize: 15, fontWeight: "800", letterSpacing: 0.2 }}>{title}</Text>
    </Pressable>
  );
}

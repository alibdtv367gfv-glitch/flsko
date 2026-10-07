import { View, type ViewProps, StyleSheet, Platform } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";

type Props = ViewProps & {
  className?: string;
  elevated?: boolean;
  glass?: boolean;
  padding?: "sm" | "md" | "lg";
};

const pad = { sm: 12, md: 16, lg: 20 };

/** Soft card with modern radius + depth (glass optional). */
export function FlskoCard({ className, elevated = true, glass, padding = "md", style, children, ...rest }: Props) {
  const colors = useColors();
  return (
    <View
      className={cn("overflow-hidden", className)}
      style={[
        {
          borderRadius: 20,
          padding: pad[padding],
          backgroundColor: glass ? colors.surface : colors.surface,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
          ...(elevated
            ? Platform.select({
                ios: {
                  shadowColor: "#0B1220",
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                },
                android: { elevation: 3 },
                default: {},
              })
            : {}),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

import { TextInput, View, Text, type TextInputProps, Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export function FlskoInput({ label, error, leftIcon, rightIcon, style, ...rest }: Props) {
  const colors = useColors();
  return (
    <View className="w-full">
      {label ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 6, textAlign: "right" }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          minHeight: 52,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: error ? colors.error : colors.border,
          backgroundColor: colors.background,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        {leftIcon}
        <TextInput
          placeholderTextColor={colors.muted}
          style={[
            {
              flex: 1,
              minHeight: 48,
              color: colors.foreground,
              fontSize: 15,
              textAlign: "right",
              paddingVertical: Platform.OS === "ios" ? 12 : 8,
            },
            style,
          ]}
          {...rest}
        />
        {rightIcon}
      </View>
      {error ? (
        <Text style={{ color: colors.error, fontSize: 12, marginTop: 6, textAlign: "right", fontWeight: "600" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

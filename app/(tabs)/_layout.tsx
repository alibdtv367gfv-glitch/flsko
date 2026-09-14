import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "إنشاء", tabBarIcon: ({ color }) => <IconSymbol size={24} name="wand.and.stars" color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: "مكتبتي", tabBarIcon: ({ color }) => <IconSymbol size={24} name="folder.fill" color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: "حوار", tabBarIcon: ({ color }) => <IconSymbol size={24} name="bubble.left.fill" color={color} /> }} />
      <Tabs.Screen name="memory" options={{ title: "ذاكرة", tabBarIcon: ({ color }) => <IconSymbol size={24} name="brain.head.profile" color={color} /> }} />
    </Tabs>
  );
}

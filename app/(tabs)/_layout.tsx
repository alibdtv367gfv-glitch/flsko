import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { Home, Sparkles, FolderOpen, MessageCircle, Brain } from "lucide-react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";

function TabIcon({
  Icon,
  color,
  focused,
}: {
  Icon: typeof Home;
  color: string;
  focused: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        width: 48,
        height: 32,
        borderRadius: 12,
        backgroundColor: focused ? `${colors.primary}18` : "transparent",
      }}
    >
      <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 10);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab as any,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          marginTop: 2,
          marginBottom: 2,
        },
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          elevation: 8,
          shadowColor: "#0B1220",
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Home} color={String(color)} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "إنشاء",
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Sparkles} color={String(color)} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "مكتبتي",
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={FolderOpen} color={String(color)} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "حوار",
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageCircle} color={String(color)} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Brain} color={String(color)} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

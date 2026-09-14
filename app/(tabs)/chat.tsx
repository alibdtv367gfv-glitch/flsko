import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

export default function ChatScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: "أنا فلسقوا. احكِ لي ما تريد، وبإمكاني مساعدتك في الفكرة أو النص أو الصورة أو الفيديو." },
  ]);
  const mutation = trpc.agent.chat.useMutation({
    onSuccess: (data, variables) => {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: "user", content: variables.message },
        { id: `${Date.now()}-assistant`, role: "assistant", content: data.text },
      ]);
    },
    onError: (error) => Alert.alert("تعذر الرد", error.message || "حاول مرة أخرى.")
  });

  const send = () => {
    if (!isAuthenticated) {
      void startOAuthLogin();
      return;
    }
    if (!draft.trim() || mutation.isPending) return;
    const message = draft.trim();
    setDraft("");
    mutation.mutate({ message });
  };

  return (
    <ScreenContainer className="px-5 pt-4">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text className="text-sm font-semibold text-primary">مساحة الحوار</Text>
        <Text className="mt-2 text-3xl font-black text-foreground">احكِ مع فلسقوا</Text>
        <Text className="mt-2 text-sm leading-6 text-muted">يفهم العربية واللهجات السورية، ويتعلم فقط ما تختار حفظه.</Text>

        <ScrollView className="mt-5 flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {messages.map((message) => (
            <View key={message.id} className={`max-w-[88%] rounded-3xl p-4 ${message.role === "user" ? "self-start bg-primary" : "self-end border border-border bg-surface"}`}>
              <Text className="mb-1 text-xs font-bold" style={{ color: message.role === "user" ? colors.background : colors.primary }}>{message.role === "user" ? "أنت" : "فلسقوا"}</Text>
              <Text className="text-base leading-7" style={{ color: message.role === "user" ? colors.background : colors.foreground }}>{message.content}</Text>
            </View>
          ))}
          {mutation.isPending && <View className="self-end rounded-3xl border border-border bg-surface p-4"><ActivityIndicator color={colors.primary} /></View>}
        </ScrollView>

        <View className="mb-2 flex-row items-end gap-2 rounded-3xl border border-border bg-surface p-2">
          <TextInput value={draft} onChangeText={setDraft} multiline textAlign="right" placeholder="اكتب رسالتك..." placeholderTextColor={colors.muted} className="max-h-28 min-h-[48px] flex-1 px-3 py-3 text-base text-foreground" />
          <Pressable onPress={send} style={({ pressed }) => [pressed && { opacity: 0.75 }]} className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Text className="text-xl font-black text-background">↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

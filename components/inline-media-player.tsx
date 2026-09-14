import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";

export function InlineAudioPlayer({ source }: { source: string }) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  return <View className="mt-4 rounded-2xl bg-background p-4"><Text className="mb-3 text-sm font-bold text-foreground">المقطع الصوتي جاهز</Text><View className="flex-row items-center gap-3"><Pressable onPress={() => { if (status.playing) player.pause(); else player.play(); }} className="rounded-full bg-primary px-5 py-3"><Text className="font-black text-background">{status.playing ? "إيقاف مؤقت" : "تشغيل"}</Text></Pressable><Text className="text-xs text-muted">{Math.round(status.currentTime || 0)}ث / {Math.round(status.duration || 0)}ث</Text></View></View>;
}

export function InlineVideoPlayer({ source }: { source: string }) {
  const player = useVideoPlayer(source);
  const status = player.status;
  const [paused, setPaused] = useState(true);
  const toggle = () => { if (paused) player.play(); else player.pause(); setPaused((value) => !value); };
  return <View className="mt-4 overflow-hidden rounded-2xl bg-background"><View style={styles.videoWrap}>{status === "loading" && <ActivityIndicator className="absolute self-center" color="#ffffff" />}{status !== "error" && <VideoView style={styles.video} player={player} allowsFullscreen allowsPictureInPicture contentFit="contain" />}</View><Pressable onPress={toggle} className="px-4 py-3"><Text className="text-center font-black text-primary">{paused ? "تشغيل الفيديو" : "إيقاف الفيديو"}</Text></Pressable></View>;
}

const styles = StyleSheet.create({ videoWrap: { minHeight: 190, justifyContent: "center", backgroundColor: "#111827" }, video: { width: "100%", height: 220 } });

export function useAudioPlayer() { return { play() {}, pause() {}, seekTo() {}, replace() {} }; }
export function useAudioPlayerStatus() { return { playing: false, currentTime: 0, duration: 0 }; }
export function useAudioRecorder() {
  return { prepareToRecordAsync: async () => {}, record: async () => {}, stop: async () => {}, uri: null };
}
export function useAudioRecorderState() { return { isRecording: false, durationMillis: 0 }; }
export async function requestRecordingPermissionsAsync() { return { granted: false }; }
export async function setAudioModeAsync() {}
export const RecordingPresets = { HIGH_QUALITY: {} };

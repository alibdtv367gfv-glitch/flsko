function useAudioPlayer() { return { play() {}, pause() {}, seekTo() {}, replace() {} }; }
function useAudioPlayerStatus() { return { playing: false, currentTime: 0, duration: 0 }; }
function useAudioRecorder() { return { prepareToRecordAsync: async () => {}, record: async () => {}, stop: async () => {}, uri: null }; }
function useAudioRecorderState() { return { isRecording: false, durationMillis: 0 }; }
async function requestRecordingPermissionsAsync() { return { granted: false }; }
async function setAudioModeAsync() {}
const RecordingPresets = { HIGH_QUALITY: {} };
module.exports = {
  useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState,
  requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets,
};

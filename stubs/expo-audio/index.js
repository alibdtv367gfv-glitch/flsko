export function useAudioPlayer(){return{play(){},pause(){},seekTo(){},replace(){},remove(){}};}
export function useAudioPlayerStatus(){return{playing:false,currentTime:0,duration:0,isBuffering:false};}
export function useAudioRecorder(){return{prepareToRecordAsync:async()=>{},record:async()=>{},stop:async()=>{},uri:null};}
export function useAudioRecorderState(){return{isRecording:false,durationMillis:0};}
export async function requestRecordingPermissionsAsync(){return{granted:false,status:"denied"};}
export async function setAudioModeAsync(){}
export const RecordingPresets={HIGH_QUALITY:{},LOW_QUALITY:{}};

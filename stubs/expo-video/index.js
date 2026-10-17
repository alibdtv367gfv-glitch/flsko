import React from 'react';
import { View } from 'react-native';
export function useVideoPlayer() { return { play() {}, pause() {}, replace() {} }; }
export function VideoView(props) { return React.createElement(View, props); }

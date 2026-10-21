const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.resolver.blockList = [
  new RegExp("^" + path.resolve(__dirname, "server").replace(/[/\\]/g, "[/\\\\]") + "[/\\\\].*"),
  new RegExp("^" + path.resolve(__dirname, "cloudflare").replace(/[/\\]/g, "[/\\\\]") + "[/\\\\].*"),
  new RegExp("^" + path.resolve(__dirname, "flsko_flask").replace(/[/\\]/g, "[/\\\\]") + "[/\\\\].*"),
];
config.resolver.extraNodeModules = {
  "expo-audio": path.resolve(__dirname, "stubs/expo-audio"),
  "expo-video": path.resolve(__dirname, "stubs/expo-video"),
  "react-native-reanimated": path.resolve(__dirname, "stubs/react-native-reanimated"),
};
config.resolver.unstable_enablePackageExports = true;
module.exports = config;

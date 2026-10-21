const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "expo-audio": path.resolve(__dirname, "stubs/expo-audio"),
  "expo-video": path.resolve(__dirname, "stubs/expo-video"),
};

module.exports = config;

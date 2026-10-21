const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Only block top-level project folders — NOT node_modules/@trpc/server
config.resolver.blockList = [
  /\/flsko-github\/server\/.*/,
  /\/flsko-github\/cloudflare\/.*/,
  /\/flsko-github\/flsko_flask\/.*/,
  // More portable: absolute paths
  new RegExp(`^${path.resolve(__dirname, "server").replace(/[/\\]/g, "[/\\\\]")}[/\\\\].*`),
  new RegExp(`^${path.resolve(__dirname, "cloudflare").replace(/[/\\]/g, "[/\\\\]")}[/\\\\].*`),
  new RegExp(`^${path.resolve(__dirname, "flsko_flask").replace(/[/\\]/g, "[/\\\\]")}[/\\\\].*`),
];

config.resolver.extraNodeModules = {
  "expo-audio": path.resolve(__dirname, "stubs/expo-audio"),
  "expo-video": path.resolve(__dirname, "stubs/expo-video"),
};

config.resolver.unstable_enablePackageExports = true;

module.exports = config;

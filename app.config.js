require("./scripts/load-env.js");

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Flsko",
  slug: "flsko",
  owner: "alityys-team",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "flsko",
  userInterfaceStyle: "automatic",
  newArchEnabled: false,
          packagingOptions: { pickFirst: ["**/libc++_shared.so","**/libfbjni.so","**/libjsi.so"] },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.flsko.app",
    buildNumber: "5",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    jsEngine: "jsc",
    adaptiveIcon: {
      backgroundColor: "#061A33",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.flsko.app",
    versionCode: 5,
    permissions: [
      "POST_NOTIFICATIONS",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "READ_MEDIA_AUDIO",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "flsko", host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["arm64-v8a"],
          minSdkVersion: 24,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          kotlinVersion: "2.0.21",
          enableProguardInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
          usesCleartextTraffic: false,
          newArchEnabled: false,
          packagingOptions: { pickFirst: ["**/libc++_shared.so","**/libfbjni.so","**/libjsi.so"] },
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: false,
  },
  updates: {
    enabled: false,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "https://flsko-api.flsko.workers.dev",
    appChannel: process.env.EXPO_PUBLIC_APP_CHANNEL || "production",
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "67ba7788-e6c2-4cd7-8c96-76e2f208739b",
    },
  },
};

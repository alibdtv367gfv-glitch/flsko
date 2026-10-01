const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withMainApplication,
  createRunOncePlugin,
} = require("@expo/config-plugins");

/**
 * Expo config plugin: ensure ONNX Maven dep and package registration hints.
 * Full native linking still requires `npx expo prebuild` + autolinking.
 */
function withVoderOffline(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    // mavenCentral is already present in modern Expo templates
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    const marker = "onnxruntime-android";
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {
    implementation "com.microsoft.onnxruntime:onnxruntime-android:1.19.2"`,
      );
    }
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(withVoderOffline, "voder-offline", "1.0.0");

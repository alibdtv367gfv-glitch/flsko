const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const block = ["server", "cloudflare", "flsko_flask", "modules"].map(
  (d) => new RegExp(`${escape(`/${d}/`)}.*`)
);
config.resolver.blockList = block;
module.exports = config;

const keys = ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_OAUTH_SERVER_URL", "EXPO_PUBLIC_OAUTH_PORTAL_URL"];
for (const key of keys) console.log(`${key}=${process.env[key] ? "configured" : "missing"}`);

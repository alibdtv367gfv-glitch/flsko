/**
 * Central Flsko environment map — names aligned with API vault inventory (2026-10-01).
 * Secrets stay in Cloudflare Secrets / host env. Never put tokens in EXPO_PUBLIC_*.
 */

function trim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

function isHttp(v: string | undefined): v is string {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const FlskoEnv = {
  apiBaseUrl: trim(process.env.EXPO_PUBLIC_API_BASE_URL) || "https://flsko-api.flsko.workers.dev",

  googleClientId: trim(process.env.GOOGLE_OAUTH_CLIENT_ID),
  googleClientSecret: trim(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  googleRedirectUri:
    trim(process.env.GOOGLE_OAUTH_REDIRECT_URI) ||
    "https://flsko-api.flsko.workers.dev/api/google/callback",

  jwtSecret: trim(process.env.JWT_SECRET) || trim(process.env.SESSION_SECRET),
  sessionSecret: trim(process.env.SESSION_SECRET) || trim(process.env.JWT_SECRET),

  hfToken: trim(process.env.HF_TOKEN),
  hfChatModel: trim(process.env.FLSKO_HF_MODEL) || "meta-llama/Llama-3.1-8B-Instruct",
  hfImageModel: trim(process.env.FLSKO_HF_IMAGE_MODEL) || "black-forest-labs/FLUX.1-schnell",

  wanSpace: trim(process.env.FLSKO_WAN_SPACE) || "https://wan-ai-wan2-1.hf.space",

  geminiKey: trim(process.env.FLSKO_GEMINI_API_KEY),
  geminiModel: trim(process.env.FLSKO_GEMINI_MODEL) || "gemini-2.5-flash",
  geminiImageModel: trim(process.env.FLSKO_GEMINI_IMAGE_MODEL) || "gemini-2.5-flash-image",
  geminiVideoModel: trim(process.env.FLSKO_GEMINI_VIDEO_MODEL) || "veo-3.1-generate-preview",
  geminiMusicModel: trim(process.env.FLSKO_GEMINI_MUSIC_MODEL) || "lyria-3.5",
  geminiMusicProviderUrl: trim(process.env.FLSKO_GEMINI_MUSIC_PROVIDER_URL),

  openAiKey: trim(process.env.FLSKO_OPENAI_API_KEY),
  openAiModel: trim(process.env.FLSKO_OPENAI_MODEL) || "gpt-4o-mini",

  llmProviderUrl: trim(process.env.FLSKO_LLM_PROVIDER_URL),
  llmProviderKey: trim(process.env.FLSKO_LLM_PROVIDER_KEY),
  llmModel: trim(process.env.FLSKO_LLM_MODEL) || "Qwen/Qwen2.5-7B-Instruct",

  pollinationsKey: trim(process.env.FLSKO_POLLINATIONS_API_KEY),
  imageProviderUrl: trim(process.env.FLSKO_IMAGE_PROVIDER_URL),
  imageModel: trim(process.env.FLSKO_IMAGE_MODEL) || "stabilityai/stable-diffusion-xl-base-1.0",
  videoProviderUrl: trim(process.env.FLSKO_VIDEO_PROVIDER_URL),
  videoModel: trim(process.env.FLSKO_VIDEO_MODEL) || "Wan-AI/Wan2.2-TI2V-5B",
  musicProviderUrl: trim(process.env.FLSKO_MUSIC_PROVIDER_URL),
  musicProviderKey: trim(process.env.FLSKO_MUSIC_PROVIDER_KEY),
  voderApiUrl: trim(process.env.FLSKO_VODER_API_URL),

  researchProviderUrl: trim(process.env.FLSKO_RESEARCH_PROVIDER_URL),
  researchProviderKey: trim(process.env.FLSKO_RESEARCH_PROVIDER_KEY),

  remoteSkyreelsUrl: trim(process.env.REMOTE_SKYREELS_URL),
  remoteSkyreelsKey: trim(process.env.REMOTE_SKYREELS_KEY),
  remoteAllegroUrl: trim(process.env.REMOTE_ALLEGRO_URL),
  remoteAllegroKey: trim(process.env.REMOTE_ALLEGRO_KEY),
  remoteGenstudioUrl: trim(process.env.REMOTE_GENSTUDIO_URL),
  remoteGenstudioKey: trim(process.env.REMOTE_GENSTUDIO_KEY),
  remoteCosmosUrl: trim(process.env.REMOTE_COSMOS_URL),
  remoteCosmosKey: trim(process.env.REMOTE_COSMOS_KEY),

  resendKey: trim(process.env.RESEND_API_KEY),
  emailFrom: trim(process.env.FLSKO_EMAIL_FROM),
  suggestionsTo: trim(process.env.FLSKO_SUGGESTIONS_TO_EMAIL),

  databaseUrl: trim(process.env.DATABASE_URL),
  forgeApiUrl: trim(process.env.BUILT_IN_FORGE_API_URL),
  forgeApiKey: trim(process.env.BUILT_IN_FORGE_API_KEY),
  gcpBucket: trim(process.env.GCP_BUCKET_NAME),

  isHttp,
};

export function flskoEnvStatus() {
  return {
    apiBaseUrl: FlskoEnv.apiBaseUrl,
    googleOAuth: Boolean(FlskoEnv.googleClientId && FlskoEnv.googleClientSecret),
    hf: Boolean(FlskoEnv.hfToken),
    wanSpace: FlskoEnv.wanSpace,
    gemini: Boolean(FlskoEnv.geminiKey),
    openAi: Boolean(FlskoEnv.openAiKey),
    pollinations: Boolean(FlskoEnv.pollinationsKey),
    imageProvider: isHttp(FlskoEnv.imageProviderUrl),
    videoProvider: isHttp(FlskoEnv.videoProviderUrl),
    musicProvider: isHttp(FlskoEnv.musicProviderUrl),
    llmProvider: isHttp(FlskoEnv.llmProviderUrl),
    session: Boolean(FlskoEnv.jwtSecret || FlskoEnv.sessionSecret),
  };
}

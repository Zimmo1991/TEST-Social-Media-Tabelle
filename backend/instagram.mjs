const AUTHORIZATION_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_ORIGIN = "https://graph.instagram.com";

async function responseJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { message: text }; }
  if (!response.ok || body.error) {
    const detail = body.error?.message || body.error_description || body.message || `HTTP ${response.status}`;
    throw new Error(`Instagram API: ${detail}`);
  }
  return body;
}

export function instagramConfiguration() {
  return {
    appId: process.env.INSTAGRAM_APP_ID || "",
    appSecret: process.env.INSTAGRAM_APP_SECRET || "",
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || "http://127.0.0.1:8765/api/instagram/callback",
    apiVersion: process.env.INSTAGRAM_API_VERSION || "v24.0",
    dryRun: process.env.INSTAGRAM_DRY_RUN === "true"
  };
}

export function buildAuthorizationUrl(state) {
  const config = instagramConfiguration();
  if (!config.appId || !config.appSecret) throw new Error("Die Meta-App-Zugangsdaten fehlen noch in der .env-Datei.");
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish");
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

export async function exchangeAuthorizationCode(code) {
  const config = instagramConfiguration();
  const form = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code
  });
  const shortResponse = await fetch(TOKEN_URL, { method: "POST", body: form });
  const shortToken = await responseJson(shortResponse);
  const exchangeUrl = new URL(`${GRAPH_ORIGIN}/access_token`);
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
  exchangeUrl.searchParams.set("client_secret", config.appSecret);
  exchangeUrl.searchParams.set("access_token", shortToken.access_token);
  const longToken = await responseJson(await fetch(exchangeUrl));
  return {
    accessToken: longToken.access_token,
    expiresIn: Number(longToken.expires_in) || Number(shortToken.expires_in) || 0,
    instagramUserId: String(shortToken.user_id || "")
  };
}

export async function fetchInstagramProfile(accessToken) {
  const config = instagramConfiguration();
  const url = new URL(`${GRAPH_ORIGIN}/${config.apiVersion}/me`);
  url.searchParams.set("fields", "id,username,account_type");
  url.searchParams.set("access_token", accessToken);
  return responseJson(await fetch(url));
}

export async function refreshInstagramAccessToken(accessToken) {
  const url = new URL(`${GRAPH_ORIGIN}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const refreshed = await responseJson(await fetch(url));
  return {
    accessToken: refreshed.access_token,
    expiresIn: Number(refreshed.expires_in) || 0
  };
}

async function graphPost(path, accessToken, values) {
  const config = instagramConfiguration();
  const body = new URLSearchParams(values);
  const response = await fetch(`${GRAPH_ORIGIN}/${config.apiVersion}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  return responseJson(response);
}

async function graphGet(path, accessToken, values = {}) {
  const config = instagramConfiguration();
  const url = new URL(`${GRAPH_ORIGIN}/${config.apiVersion}${path}`);
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return responseJson(response);
}

async function waitForContainer(containerId, accessToken) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const status = await graphGet(`/${containerId}`, accessToken, { fields: "status_code,status" });
    if (status.status_code === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) throw new Error(status.status || `Medienverarbeitung: ${status.status_code}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error("Instagram hat die Medienverarbeitung nicht rechtzeitig abgeschlossen.");
}

async function createSingleContainer({ instagramUserId, accessToken, media, contentType, caption, carouselItem = false }) {
  const isVideo = media.mimeType.startsWith("video/");
  const values = carouselItem ? { is_carousel_item: "true" } : { caption };
  if (contentType === "story") values.media_type = "STORIES";
  else if (contentType === "reel" || (isVideo && !carouselItem)) values.media_type = "REELS";
  else if (isVideo) values.media_type = "VIDEO";
  values[isVideo ? "video_url" : "image_url"] = media.publicUrl;
  const container = await graphPost(`/${instagramUserId}/media`, accessToken, values);
  if (isVideo) await waitForContainer(container.id, accessToken);
  return container.id;
}

export async function publishToInstagram({ instagramUserId, accessToken, media, contentType, caption }) {
  const config = instagramConfiguration();
  if (config.dryRun) return { id: `dry-run-${Date.now()}` };
  if (!media.length) throw new Error("Mindestens ein Medium ist erforderlich.");
  if (contentType === "story" && media.length !== 1) throw new Error("Eine Story-Veröffentlichung unterstützt in diesem Ablauf genau ein Medium.");
  if (contentType === "reel" && (media.length !== 1 || !media[0].mimeType.startsWith("video/"))) {
    throw new Error("Ein Reel benötigt genau eine Videodatei.");
  }

  let creationId;
  if (media.length === 1) {
    creationId = await createSingleContainer({ instagramUserId, accessToken, media: media[0], contentType, caption });
  } else {
    const childIds = [];
    for (const item of media) {
      childIds.push(await createSingleContainer({ instagramUserId, accessToken, media: item, contentType: "post", caption: "", carouselItem: true }));
    }
    const parent = await graphPost(`/${instagramUserId}/media`, accessToken, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption
    });
    creationId = parent.id;
  }
  return graphPost(`/${instagramUserId}/media_publish`, accessToken, { creation_id: creationId });
}

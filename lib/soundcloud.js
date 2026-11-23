const API = "https://api-v2.soundcloud.com";

// The public web client ID is configuration published by SoundCloud's own
// frontend. It is not a visitor's login token or cookie.
let clientIdCache = { value: null, expiresAt: 0 };
const CLIENT_ID_TTL = 20 * 60 * 1000;
const FETCH_TIMEOUT = 7000;
const ASSET_HOSTS = ["soundcloud.com", "sndcdn.com"];

function isSoundCloudAsset(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && ASSET_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/javascript,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://soundcloud.com/"
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  });
  if (!response.ok) throw new Error(`SoundCloud public asset returned HTTP ${response.status}.`);
  return response.text();
}

function findClientIds(text) {
  const patterns = [
    /["']client_id["']\s*:\s*["']([A-Za-z0-9_-]{16,80})["']/gi,
    /[?&]client_id=([A-Za-z0-9_-]{16,80})/gi,
    /clientId\s*[:=]\s*["']([A-Za-z0-9_-]{16,80})["']/gi,
    /client_id%3D([A-Za-z0-9_-]{16,80})/gi
  ];
  const found = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) if (m[1] && !found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

function getAssetUrls(html) {
  const candidates = new Set();
  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+(?:href|imagesrcset)=["']([^"']+)["']/gi,
    /https?:\\?\/\\?\/(?:a-v2\.)?sndcdn\.com[^\s"'<>\\]+/gi,
    /https?:\\?\/\\?\/soundcloud\.com[^\s"'<>\\]+\.js(?:\?[^\s"'<>\\]*)?/gi
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const raw = m[1] || m[0];
      try {
        const url = new URL(raw.replaceAll("\\/", "/"), "https://soundcloud.com").toString();
        if (isSoundCloudAsset(url) && /\.js(?:[?#]|$)|\/assets\//i.test(url)) candidates.add(url);
      } catch {}
    }
  }
  return [...candidates].slice(0, 24);
}

export async function getPublicClientId({ forceRefresh = false } = {}) {
  if (!forceRefresh && clientIdCache.value && Date.now() < clientIdCache.expiresAt) return clientIdCache.value;

  const html = await fetchText("https://soundcloud.com/");
  const inlineIds = findClientIds(html);
  if (inlineIds.length) {
    clientIdCache = { value: inlineIds[0], expiresAt: Date.now() + CLIENT_ID_TTL };
    return inlineIds[0];
  }

  const assets = getAssetUrls(html);
  // Fetch public first-party bundles concurrently; a serial crawl was slow and
  // commonly timed out on serverless functions before reaching the right bundle.
  const batches = await Promise.allSettled(assets.map(url => fetchText(url)));
  const ids = [];
  for (const result of batches) {
    if (result.status !== "fulfilled") continue;
    for (const id of findClientIds(result.value)) if (!ids.includes(id)) ids.push(id);
  }
  if (!ids.length) {
    throw new Error(`Could not find client_id in SoundCloud's public page or ${assets.length} first-party assets. SoundCloud may have changed its frontend or blocked this server region.`);
  }
  clientIdCache = { value: ids[0], expiresAt: Date.now() + CLIENT_ID_TTL };
  return ids[0];
}

export function validateTrackUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Masukkan URL track SoundCloud yang valid."); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !(host === "soundcloud.com" || host === "www.soundcloud.com")) {
    throw new Error("Hanya URL HTTPS soundcloud.com yang didukung.");
  }
  return parsed.toString();
}

async function scGet(path, params = {}, retry = true) {
  const clientId = await getPublicClientId();
  const url = new URL(`${API}${path}`);
  url.searchParams.set("client_id", clientId);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "Origin": "https://soundcloud.com", "Referer": "https://soundcloud.com/" },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if ([401, 403].includes(response.status) && retry) {
    await getPublicClientId({ forceRefresh: true });
    return scGet(path, params, false);
  }
  if (!response.ok) {
    const error = new Error(data.message || data.error || `SoundCloud API error (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function resolveTrack(url) {
  const result = await scGet("/resolve", { url: validateTrackUrl(url) });
  if (!result?.id || result.kind !== "track") throw new Error("URL tidak mengarah ke track SoundCloud publik.");
  return result;
}

export async function getStreams(trackId) {
  if (!/^\d+$/.test(String(trackId))) throw new Error("Invalid track ID.");
  return scGet(`/tracks/${encodeURIComponent(trackId)}/streams`);
}

export async function searchTracks(query) {
  return scGet("/search/tracks", { q: query, limit: 24, offset: 0 });
}

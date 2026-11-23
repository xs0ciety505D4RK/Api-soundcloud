const API = "https://api-v2.soundcloud.com";

// Public web-app client IDs are not user credentials. Discover the currently
// published ID from SoundCloud's public web assets and cache it briefly.
let clientIdCache = { value: null, expiresAt: 0 };
const CLIENT_ID_TTL = 30 * 60 * 1000;
const FETCH_TIMEOUT = 8000;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SoundCloudPublicResolver/1.0)",
      "Accept": "text/html,application/javascript,*/*"
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  });
  if (!response.ok) throw new Error(`Could not read public SoundCloud assets (${response.status}).`);
  return response.text();
}

function findClientId(text) {
  // SoundCloud's public web bundles have used several serialization styles.
  const patterns = [
    /["']client_id["']\s*:\s*["']([A-Za-z0-9]{20,})["']/,
    /[?&]client_id=([A-Za-z0-9]{20,})/,
    /client_id\s*=\s*["']([A-Za-z0-9]{20,})["']/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export async function getPublicClientId({ forceRefresh = false } = {}) {
  if (!forceRefresh && clientIdCache.value && Date.now() < clientIdCache.expiresAt) {
    return clientIdCache.value;
  }

  const html = await fetchText("https://soundcloud.com/");
  let id = findClientId(html);

  // If the HTML only references hashed bundles, inspect a limited number of
  // first-party JS assets. Do not crawl arbitrary external URLs.
  if (!id) {
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map(match => match[1])
      .map(src => new URL(src, "https://soundcloud.com").toString())
      .filter(src => new URL(src).hostname === "soundcloud.com")
      .slice(0, 12);

    for (const scriptUrl of scriptUrls) {
      try {
        const js = await fetchText(scriptUrl);
        id = findClientId(js);
        if (id) break;
      } catch { /* continue to the next public asset */ }
    }
  }

  if (!id) throw new Error("Could not discover a public SoundCloud client ID. SoundCloud may have changed its web assets; retry later.");
  clientIdCache = { value: id, expiresAt: Date.now() + CLIENT_ID_TTL };
  return id;
}

export function validateTrackUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Provide a valid SoundCloud track URL."); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !(host === "soundcloud.com" || host.endsWith(".soundcloud.com"))) {
    throw new Error("Only HTTPS SoundCloud URLs are accepted.");
  }
  return parsed.toString();
}

async function scGet(path, params = {}, retry = true) {
  const clientId = await getPublicClientId();
  const url = new URL(`${API}${path}`);
  url.searchParams.set("client_id", clientId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { "Accept": "application/json; charset=utf-8" },
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));

  // A stale/rejected public ID triggers one fresh scrape and one retry.
  if ((response.status === 401 || response.status === 403) && retry) {
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
  const safeUrl = validateTrackUrl(url);
  const result = await scGet("/resolve", { url: safeUrl });
  if (!result || !result.id || !result.kind || result.kind !== "track") {
    throw new Error("The URL did not resolve to a public SoundCloud track.");
  }
  return result;
}

export async function getStreams(trackId) {
  if (!/^\d+$/.test(String(trackId))) throw new Error("Invalid track ID.");
  return scGet(`/tracks/${encodeURIComponent(trackId)}/streams`);
}

export async function searchTracks(query) {
  return scGet("/search/tracks", { q: query, limit: 18 });
}

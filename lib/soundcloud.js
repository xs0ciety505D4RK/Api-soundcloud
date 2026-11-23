/*
Scrape by xs0ciety505/xs0cietyHUB
t.me/xs0cietyHUB
wa.me/9779845668812
*/

"use strict";

const SC_BASE = "https://soundcloud.com";
const API_V2 = "https://api-v2.soundcloud.com";
const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

// Client ID fallback dari request asli user — dipakai instan sebelum extraction
const FALLBACK_CLIENT_ID = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";

const CLIENT_ID_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam di memory
const FETCH_TIMEOUT_MS = 8000;
const BUNDLE_TIMEOUT_MS = 2500;

// Module cache (hidup selama container warm)
let cachedClientId = FALLBACK_CLIENT_ID;
let clientIdExpiresAt = 0;
let extractionInProgress = null;

// ============================================================
// TIMED FETCH
// ============================================================
async function timedFetch(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// CLIENT_ID EXTRACTION (PARALLEL + MULTI-PATTERN)
// ============================================================
const CLIENT_ID_PATTERNS = [
  /client_id\s*[:=]\s*["']([a-zA-Z0-9]{20,40})["']/,
  /"client_id"\s*:\s*"([a-zA-Z0-9]{20,40})"/,
  /clientId\s*[:=]\s*["']([a-zA-Z0-9]{20,40})["']/,
  /"clientId"\s*:\s*"([a-zA-Z0-9]{20,40})"/,
];

function extractFromJs(js) {
  for (const re of CLIENT_ID_PATTERNS) {
    const m = js.match(re);
    if (m) return m[1];
  }
  return null;
}

async function extractClientId(force = false) {
  // Kalau cache masih valid & bukan force, pakai cache
  if (!force && cachedClientId && Date.now() < clientIdExpiresAt) {
    return cachedClientId;
  }

  // Kalau ada extraction yang sedang jalan, tunggu bareng (dedupe)
  if (extractionInProgress) {
    return await extractionInProgress;
  }

  extractionInProgress = (async () => {
    try {
      // 1. Fetch HTML SoundCloud
      const htmlRes = await timedFetch(SC_BASE, {
        headers: { "User-Agent": UA, Accept: "text/html" },
      });
      if (!htmlRes.ok) throw new Error(`SoundCloud HTML HTTP ${htmlRes.status}`);
      const html = await htmlRes.text();

      // 2. Kumpulkan URL bundle
      const scriptRegex = /<script[^>]+src="([^"]+\.js[^"]*)"/gi;
      const urls = [];
      let m;
      while ((m = scriptRegex.exec(html)) !== null) {
        let u = m[1];
        if (u.startsWith("//")) u = "https:" + u;
        if (!u.startsWith("http")) u = SC_BASE + u;
        urls.push(u);
      }

      // 3. Prioritaskan bundle besar (biasanya "app" / "vendor")
      const prioritized = urls
        .sort((a, b) => {
          const score = (u) => (/app|vendor|main/i.test(u) ? 0 : 1);
          return score(a) - score(b);
        })
        .slice(0, 6);

      // 4. Fetch bundle PARALEL dengan timeout per bundle
      const results = await Promise.allSettled(
        prioritized.map(async (url) => {
          const r = await timedFetch(
            url,
            { headers: { "User-Agent": UA, Referer: SC_BASE } },
            BUNDLE_TIMEOUT_MS
          );
          if (!r.ok) return null;
          const js = await r.text();
          return extractFromJs(js);
        })
      );

      // 5. Ambil hasil pertama yang sukses
      for (const res of results) {
        if (res.status === "fulfilled" && res.value) {
          cachedClientId = res.value;
          clientIdExpiresAt = Date.now() + CLIENT_ID_TTL_MS;
          return res.value;
        }
      }

      // 6. Gagal total → pakai fallback, jangan crash
      console.log("[SC] client_id extraction failed, using fallback");
      cachedClientId = FALLBACK_CLIENT_ID;
      clientIdExpiresAt = Date.now() + 10 * 60 * 1000; // retry 10 menit lagi
      return cachedClientId;
    } finally {
      extractionInProgress = null;
    }
  })();

  return await extractionInProgress;
}

// ============================================================
// API FETCH — AUTO RETRY SAAT EXPIRED
// ============================================================
async function apiFetch(endpoint, params = {}, force = false) {
  const cid = await extractClientId(force);

  const u = new URL(endpoint.startsWith("http") ? endpoint : API_V2 + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  if (!u.searchParams.has("client_id")) u.searchParams.set("client_id", cid);

  const res = await timedFetch(u.toString(), {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://m.soundcloud.com",
      Referer: "https://m.soundcloud.com/",
    },
  });

  // Auto-bypass expired
  if (res.status === 401 || res.status === 403) {
    if (!force) {
      console.log(`[SC] ${res.status} → re-extracting client_id`);
      cachedClientId = null;
      clientIdExpiresAt = 0;
      return apiFetch(endpoint, params, true);
    }
    throw new Error(`SoundCloud auth ${res.status} (extraction gagal, coba lagi)`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SoundCloud HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ============================================================
// MAPPER
// ============================================================
function mapTrack(t) {
  return {
    id: t.id,
    urn: t.urn,
    title: t.title,
    artist: t.user?.username || null,
    artist_id: t.user?.id || null,
    artist_verified: !!t.user?.verified,
    duration_ms: t.duration,
    genre: t.genre,
    artwork: t.artwork_url,
    permalink: t.permalink_url,
    streamable: !!t.streamable,
    playback_count: t.playback_count,
    created_at: t.created_at,
  };
}

// ============================================================
// SEARCH — PRIORITAS PENYANYI ASLI
// ============================================================
async function searchOriginal(query, limit = 20) {
  const result = {
    query,
    source: null,
    artist: null,
    fallback_used: false,
    tracks: [],
  };

  try {
    const users = await apiFetch("/search/users", { q: query, limit: 5 });
    const candidates = (users.collection || []).filter((u) => u.username);

    let best = candidates.find(
      (u) => u.username.toLowerCase() === query.toLowerCase()
    );
    if (!best) best = candidates.find((u) => u.verified);
    if (!best) {
      best = candidates.sort(
        (a, b) => (b.followers_count || 0) - (a.followers_count || 0)
      )[0];
    }

    if (best) {
      const t = await apiFetch(`/users/${best.id}/tracks`, { limit });
      const tracks = t.collection || [];
      if (tracks.length) {
        result.source = "artist_uploads";
        result.artist = {
          id: best.id,
          username: best.username,
          verified: !!best.verified,
          followers: best.followers_count || 0,
          permalink: best.permalink_url,
        };
        result.tracks = tracks.map(mapTrack);
        return result;
      }
    }
  } catch (e) {
    console.log(`[search] artist path failed: ${e.message}`);
  }

  const r = await apiFetch("/search/tracks", { q: query, limit });
  result.source = "generic_tracks";
  result.fallback_used = true;
  result.tracks = (r.collection || []).map(mapTrack);
  return result;
}

// ============================================================
// STREAM
// ============================================================
async function getStream(trackId) {
  let t;
  if (String(trackId).startsWith("http")) {
    t = await apiFetch("/resolve", { url: trackId });
  } else {
    const numeric = String(trackId).includes(":")
      ? String(trackId).split(":").pop()
      : trackId;
    t = await apiFetch(`/tracks/${numeric}`);
  }

  if (!t.streamable) throw new Error("Track tidak streamable");

  const s = await apiFetch(`/tracks/${t.id}/streams`);
  const hls = s.hls_aac_160_url || s.hls_mp3_128_url || null;
  const mp3 = s.preview_mp3_128_url || null;

  return {
    track: {
      id: t.id,
      title: t.title,
      artist: t.user?.username,
      duration_ms: t.duration,
      artwork: t.artwork_url,
      permalink: t.permalink_url,
    },
    stream_url: hls || mp3,
    hls_url: hls,
    mp3_url: mp3,
  };
}

// ============================================================
// FULL AUTO
// ============================================================
async function autoStream(query) {
  const search = await searchOriginal(query, 5);
  const first = search.tracks.find((t) => t.streamable);
  if (!first) throw new Error(`Tidak ada track streamable untuk: "${query}"`);

  const stream = await getStream(first.id);
  return {
    query,
    matched_via: search.source,
    artist: search.artist,
    fallback_used: search.fallback_used,
    ...stream,
  };
}

module.exports = {
  extractClientId,
  apiFetch,
  searchOriginal,
  getStream,
  autoStream,
  mapTrack,
}; 

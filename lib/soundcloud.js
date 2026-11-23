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

// Fallback lama, tapi kita tidak akan bergantung padanya lagi.
const FALLBACK_CLIENT_ID = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";

const FETCH_TIMEOUT_MS = 8000;
const BUNDLE_TIMEOUT_MS = 3000;

let cachedClientId = null;
let clientIdExpiresAt = 0;
let extractionInProgress = null;

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
// EKSTRAKSI CLIENT_ID (DIPERKUAT)
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
  // Selalu paksa ekstraksi jika `force` true atau cache kosong/kedaluwarsa
  if (!force && cachedClientId && Date.now() < clientIdExpiresAt) {
    return cachedClientId;
  }

  if (extractionInProgress) {
    return await extractionInProgress;
  }

  extractionInProgress = (async () => {
    try {
      console.log("[SC] Memulai ekstraksi client_id dari bundle...");
      const htmlRes = await timedFetch(SC_BASE, {
        headers: { "User-Agent": UA, Accept: "text/html" },
      });
      if (!htmlRes.ok) throw new Error(`HTML fetch HTTP ${htmlRes.status}`);
      const html = await htmlRes.text();

      const scriptRegex = /<script[^>]+src="([^"]+\.js[^"]*)"/gi;
      const urls = [];
      let m;
      while ((m = scriptRegex.exec(html)) !== null) {
        let u = m[1];
        if (u.startsWith("//")) u = "https:" + u;
        if (!u.startsWith("http")) u = SC_BASE + u;
        urls.push(u);
      }

      // Ambil lebih banyak bundle, prioritaskan yang mengandung "app" atau "vendor"
      const prioritized = urls
        .sort((a, b) => (/app|vendor|main/i.test(b) ? 1 : -1))
        .slice(0, 10);

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

      for (const res of results) {
        if (res.status === "fulfilled" && res.value) {
          cachedClientId = res.value;
          clientIdExpiresAt = Date.now() + 6 * 60 * 60 * 1000; // 6 jam
          console.log(`[SC] client_id baru ditemukan: ${cachedClientId}`);
          return cachedClientId;
        }
      }

      console.log("[SC] Ekstraksi gagal, mencoba fallback...");
      cachedClientId = FALLBACK_CLIENT_ID;
      clientIdExpiresAt = Date.now() + 5 * 60 * 1000; // coba lagi 5 menit
      return cachedClientId;
    } finally {
      extractionInProgress = null;
    }
  })();

  return await extractionInProgress;
}

// ============================================================
// API FETCH (LOG LEBIH JELAS)
// ============================================================
async function apiFetch(endpoint, params = {}, force = false) {
  const cid = await extractClientId(force);

  const u = new URL(endpoint.startsWith("http") ? endpoint : API_V2 + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  if (!u.searchParams.has("client_id")) u.searchParams.set("client_id", cid);

  console.log(`[SC] Request: ${u.toString()}`);

  const res = await timedFetch(u.toString(), {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://m.soundcloud.com",
      Referer: "https://m.soundcloud.com/",
    },
  });

  if (res.status === 401 || res.status === 403) {
    if (!force) {
      console.log(`[SC] ${res.status} → paksa ekstraksi ulang client_id`);
      cachedClientId = null;
      clientIdExpiresAt = 0;
      return apiFetch(endpoint, params, true);
    }
    throw new Error(`SoundCloud auth ${res.status} setelah ekstraksi ulang`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`[SC] ${res.status} pada ${u.pathname}: ${txt.slice(0, 200)}`);
    throw new Error(`SoundCloud HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ... (fungsi mapper, searchOriginal, getStream, autoStream tetap sama)

const SC_HOME = "https://soundcloud.com";
const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

// Cache in-memory per instance serverless (bertahan selama instance warm)
let cache: { id: string; expires: number } | null = null;
const TTL = 48 * 60 * 60 * 1000; // 48 jam

async function fetchText(url: string, accept = "text/html,application/xhtml+xml") {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.text();
}

function extractBundleUrls(html: string): string[] {
  const re =
    /<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

// Beberapa pola regex yang umum ditemukan di bundle SoundCloud
const PATTERNS = [
  /client_id=([a-zA-Z0-9]{32})/,
  /client_id:"([a-zA-Z0-9]{32})"/,
  /clientId":"([a-zA-Z0-9]{32})"/,
];

async function tryExtractFromBundle(url: string): Promise<string | null> {
  try {
    const js = await fetchText(url, "application/javascript");
    for (const re of PATTERNS) {
      const m = js.match(re);
      if (m) return m[1];
    }
  } catch {
    // bundle gagal diunduh → lanjut ke bundle berikutnya
  }
  return null;
}

// Validasi ringan: client_id harus bisa dipakai ke api-v2
async function isValidClientId(id: string): Promise<boolean> {
  try {
    const url = new URL("https://api-v2.soundcloud.com/search");
    url.searchParams.set("q", "test");
    url.searchParams.set("client_id", id);
    url.searchParams.set("limit", "1");
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    return r.ok;
  } catch {
    return false;
  }
}

export async function getClientId(force = false): Promise<string> {
  if (!force && cache && Date.now() < cache.expires) return cache.id;

  const html = await fetchText(SC_HOME);
  const bundles = extractBundleUrls(html);
  if (bundles.length === 0) throw new Error("Tidak ada JS bundle ditemukan di homepage");

  // Coba dari bundle terbaru (paling akhir) ke yang lama
  for (const bundle of [...bundles].reverse()) {
    const id = await tryExtractFromBundle(bundle);
    if (!id) continue;

    const valid = await isValidClientId(id);
    if (!valid) continue;

    cache = { id, expires: Date.now() + TTL };
    return id;
  }

  throw new Error("client_id tidak ditemukan di semua bundle");
}

export { UA };

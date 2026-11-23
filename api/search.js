/*
Scrape by xs0ciety505/xs0cietyHUB
t.me/xs0cietyHUB
wa.me/9779845668812
*/

const { searchOriginal } = require("../lib/soundcloud");

function getQuery(req, key) {
  try {
    const u = new URL(req.url, "http://x");
    return u.searchParams.get(key);
  } catch {
    return req.query?.[key];
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const q = getQuery(req, "q");
  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "Parameter 'q' wajib (min 2 karakter)",
      example: "/api/search?q=Taylor Swift",
    });
  }

  const rawLimit = parseInt(getQuery(req, "limit"), 10);
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 50);

  try {
    const data = await searchOriginal(q.trim(), limit);
    res.status(200).json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

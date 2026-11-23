/*
Scrape by xs0ciety505/xs0cietyHUB
t.me/xs0cietyHUB
wa.me/9779845668812
*/

const { autoStream } = require("../lib/soundcloud");

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
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const q = getQuery(req, "q");
  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "Parameter 'q' wajib (min 2 karakter)",
      example: "/api/auto?q=lofi hip hop",
    });
  }

  try {
    const data = await autoStream(q.trim());
    res.status(200).json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}; 

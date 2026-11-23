/*
Scrape by xs0ciety505/xs0cietyHUB
t.me/xs0cietyHUB
wa.me/9779845668812
*/

const { getStream } = require("../lib/soundcloud");

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

  const id = getQuery(req, "id");
  if (!id) {
    return res.status(400).json({
      success: false,
      error: "Parameter 'id' wajib (track ID atau URL SoundCloud)",
      example: "/api/stream?id=123456789",
    });
  }

  try {
    const data = await getStream(id);
    res.status(200).json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

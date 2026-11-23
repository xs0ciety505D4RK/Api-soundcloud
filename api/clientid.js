/*
Scrape by xs0ciety505/xs0cietyHUB
t.me/xs0cietyHUB
wa.me/9779845668812
*/

const { extractClientId } = require("../lib/soundcloud");

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

  try {
    const force = getQuery(req, "force") === "1";
    const cid = await extractClientId(force);
    res.status(200).json({ success: true, client_id: cid });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

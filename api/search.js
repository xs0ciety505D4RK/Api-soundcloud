import { searchTracks } from "../lib/soundcloud.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "Search query must contain at least 2 characters." });
    const results = await searchTracks(q);
    return res.status(200).json({ ok: true, collection: results.collection || [] });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
}

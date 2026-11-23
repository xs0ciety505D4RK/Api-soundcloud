import { resolveTrack, getStreams } from "../lib/soundcloud.js";
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    if (!req.query.url) return res.status(400).json({ error: "Parameter ?url= wajib diisi." });
    const track = await resolveTrack(req.query.url);
    if (track.access === "blocked" || track.streamable === false) return res.status(403).json({ error: "Track ini tidak diizinkan untuk streaming publik." });
    const streams = await getStreams(track.id);
    return res.status(200).json({ ok: true, track: { id: track.id, title: track.title, user: track.user?.username, permalink_url: track.permalink_url, artwork_url: track.artwork_url }, streams });
  } catch (error) { return res.status(error.status || 502).json({ error: error.message }); }
}

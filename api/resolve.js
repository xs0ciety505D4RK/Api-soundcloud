import { resolveTrack } from "../lib/soundcloud.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing ?url=SoundCloudTrackURL" });
    const track = await resolveTrack(url);
    return res.status(200).json({
      ok: true,
      track: {
        id: track.id,
        urn: track.urn,
        title: track.title,
        user: track.user?.username,
        permalink_url: track.permalink_url,
        artwork_url: track.artwork_url,
        duration: track.duration,
        access: track.access
      }
    });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
}

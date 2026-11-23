import { resolveTrack, getStreams } from "../lib/soundcloud.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing ?url=SoundCloudTrackURL" });

    // Resolve and fetch streams for every request. CDN URLs are not persisted.
    const track = await resolveTrack(url);
    if (track.access === "blocked") {
      return res.status(403).json({ error: "This track is blocked from playback through the public API." });
    }
    const streams = await getStreams(track.id);
    return res.status(200).json({
      ok: true,
      track: {
        id: track.id,
        urn: track.urn,
        title: track.title,
        user: track.user?.username,
        permalink_url: track.permalink_url,
        access: track.access
      },
      streams,
      note: "Stream metadata is fetched on demand. Any CDN URLs returned by SoundCloud may expire; call this endpoint again for current stream information."
    });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
}

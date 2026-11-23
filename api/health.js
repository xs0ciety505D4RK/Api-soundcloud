import { getPublicClientId } from "../lib/soundcloud.js";

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    await getPublicClientId();
    res.status(200).json({ ok: true, service: "SoundCloud Public API", client_id: "auto-discovered", version: "2.0.0" });
  } catch (error) {
    res.status(503).json({ ok: false, service: "SoundCloud Public API", error: error.message });
  }
}

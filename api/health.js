import { getPublicClientId } from "../lib/soundcloud.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    await getPublicClientId();
    return res.status(200).json({ ok: true, service: "SoundPulse", soundcloud: "reachable", client_id: "discovered" });
  } catch (error) {
    return res.status(503).json({ ok: false, service: "SoundPulse", stage: "client_id_discovery", error: error.message });
  }
}

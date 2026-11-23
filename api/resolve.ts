import { getClientId, UA } from "../lib/soundcloud";

export default async function handler(req: any, res: any) {
  const trackUrl = req.query.url;
  if (!trackUrl) return res.status(400).json({ error: "parameter url wajib" });

  try {
    let clientId = await getClientId();

    const buildUrl = (id: string) => {
      const url = new URL("https://api-v2.soundcloud.com/resolve");
      url.searchParams.set("url", String(trackUrl));
      url.searchParams.set("client_id", id);
      return url;
    };

    let r = await fetch(buildUrl(clientId), { headers: { "User-Agent": UA } });

    if (r.status === 401) {
      clientId = await getClientId(true);
      r = await fetch(buildUrl(clientId), { headers: { "User-Agent": UA } });
    }

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

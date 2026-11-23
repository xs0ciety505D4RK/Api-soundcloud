import { getClientId, UA } from "../lib/soundcloud";

export default async function handler(req: any, res: any) {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "parameter q wajib" });

  try {
    let clientId = await getClientId();

    const buildUrl = (id: string) => {
      const url = new URL("https://api-v2.soundcloud.com/search");
      url.searchParams.set("q", String(q));
      url.searchParams.set("client_id", id);
      url.searchParams.set("limit", String(req.query.limit ?? 20));
      if (req.query.offset) url.searchParams.set("offset", String(req.query.offset));
      if (req.query.linked_partitioning)
        url.searchParams.set("linked_partitioning", "1");
      return url;
    };

    let r = await fetch(buildUrl(clientId), { headers: { "User-Agent": UA } });

    // 401 → client_id kemungkinan sudah dirotasi, paksa refresh sekali
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

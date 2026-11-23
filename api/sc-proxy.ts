import { SoundCloudClient } from "soundcloud-core";

// Instance client dibuat sekali di level modul (bertahan selama instance warm)
const client = new SoundCloudClient();

export default async function handler(req: any, res: any) {
  const { action, q, url } = req.query;

  try {
    // Aksi 1: Cek client_id yang sedang dipakai library (untuk debugging)
    if (action === "get-id") {
      const clientId = await client.getClientId();
      return res.status(200).json({ client_id: clientId });
    }

    // Aksi 2: Cari track
    if (action === "search") {
      if (!q) return res.status(400).json({ error: "parameter q wajib" });
      // Library ini punya method bawaan untuk search, tapi kita bisa juga
      // memakai client_id-nya untuk fetch manual jika butuh parameter lain.
      const clientId = await client.getClientId();
      const searchUrl = new URL("https://api-v2.soundcloud.com/search");
      searchUrl.searchParams.set("q", String(q));
      searchUrl.searchParams.set("client_id", clientId);
      searchUrl.searchParams.set("limit", "20");

      const r = await fetch(searchUrl);
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // Aksi 3: Resolve URL track
    if (action === "resolve") {
      if (!url) return res.status(400).json({ error: "parameter url wajib" });
      const track = await client.getMetaData({ url: String(url) });
      return res.status(200).json(track);
    }

    return res.status(400).json({ error: "action tidak dikenal" });
  } catch (e: any) {
    // Library akan otomatis mencoba refresh client_id saat error 401/403
    // sebelum melempar error ini, jadi error di sini biasanya bukan soal token.
    res.status(500).json({ error: e.message });
  }
}

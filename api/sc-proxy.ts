import { SoundCloudClient } from "soundcloud-core";

type AnyClient = InstanceType<typeof SoundCloudClient>;

// Instance client bertahan selama serverless instance masih warm.
// Jika env SC_CLIENT_ID diisi, library tidak perlu scraping ulang.
let client: AnyClient = process.env.SC_CLIENT_ID
  ? new SoundCloudClient({ clientId: process.env.SC_CLIENT_ID })
  : new SoundCloudClient();

function resetClient(): AnyClient {
  client = process.env.SC_CLIENT_ID
    ? new SoundCloudClient({ clientId: process.env.SC_CLIENT_ID })
    : new SoundCloudClient();
  return client;
}

/**
 * Jalankan fn dengan client yang ada.
 * Jika error mengandung 401/unauthorized/invalid client,
 * buat instance baru (library akan auto-fetch client_id baru)
 * lalu ulangi sekali.
 */
async function withRetry<T>(fn: (c: AnyClient) => Promise<T>): Promise<T> {
  try {
    return await fn(client);
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (/401|unauthorized|invalid[_\s-]?client/i.test(msg)) {
      const fresh = resetClient();
      return await fn(fresh);
    }
    throw err;
  }
}

export default async function handler(req: any, res: any) {
  const action = String(req.query?.action ?? "");

  try {
    switch (action) {
      // ------------------------------------------------------------
      // 1) Cek client_id yang sedang dipakai library
      // GET /api/sc-proxy?action=get-id
      // ------------------------------------------------------------
      case "get-id": {
        const id = await withRetry((c) => c.getClientId());
        return res.status(200).json({ client_id: id });
      }

      // ------------------------------------------------------------
      // 2) Cari track
      // GET /api/sc-proxy?action=search&q=lofi&limit=20
      // ------------------------------------------------------------
      case "search": {
        const q = String(req.query?.q ?? "").trim();
        if (!q) return res.status(400).json({ error: "parameter q wajib" });

        const limit = Math.min(Number(req.query?.limit ?? 20) || 20, 100);

        const results = await withRetry((c) =>
          c.search({ query: q, limit })
        );

        return res.status(200).json({
          query: q,
          count: results.length,
          results,
        });
      }

      // ------------------------------------------------------------
      // 3) Resolve URL track → metadata + streamUrl
      // GET /api/sc-proxy?action=resolve&url=https://soundcloud.com/...
      // ------------------------------------------------------------
      case "resolve": {
        const url = String(req.query?.url ?? "").trim();
        if (!url) return res.status(400).json({ error: "parameter url wajib" });

        const track = await withRetry((c) => c.getMetaData({ url }));
        return res.status(200).json(track);
      }

      // ------------------------------------------------------------
      // 4) Ambil playlist
      // GET /api/sc-proxy?action=playlist&url=https://soundcloud.com/...&limit=20
      // limit bisa angka atau "max"
      // ------------------------------------------------------------
      case "playlist": {
        const url = String(req.query?.url ?? "").trim();
        if (!url) return res.status(400).json({ error: "parameter url wajib" });

        const raw = req.query?.limit;
        const limit: number | "max" =
          raw === "max"
            ? "max"
            : Math.min(Number(raw ?? 20) || 20, 100);

        const playlist = await withRetry((c) =>
          c.getPlaylist({ url, limit: limit as any })
        );
        return res.status(200).json(playlist);
      }

      // ------------------------------------------------------------
      // 5) Profil user
      // GET /api/sc-proxy?action=profile&username=BlazeInferno64
      // ------------------------------------------------------------
      case "profile": {
        const username = String(req.query?.username ?? "").trim();
        if (!username) {
          return res.status(400).json({ error: "parameter username wajib" });
        }

        const profile = await withRetry((c) =>
          c.getProfile({ username })
        );
        return res.status(200).json(profile);
      }

      // ------------------------------------------------------------
      // Default
      // ------------------------------------------------------------
      default:
        return res.status(400).json({
          error: "action tidak dikenal",
          actions: ["get-id", "search", "resolve", "playlist", "profile"],
        });
    }
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message ?? String(err),
      ...(process.env.NODE_ENV === "development"
        ? { stack: err?.stack }
        : {}),
    });
  }
}

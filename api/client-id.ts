import { getClientId } from "../lib/soundcloud";

export default async function handler(req: any, res: any) {
  try {
    const force = req.query.refresh === "1";
    const clientId = await getClientId(force);
    res.status(200).json({ client_id: clientId, cached: !force });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

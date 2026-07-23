import { sql } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { deviceId, subscription } = req.body || {};
  if (!deviceId || !subscription || !subscription.endpoint || !subscription.keys) {
    res.status(400).json({ error: "payload inválido" });
    return;
  }

  const db = sql();
  await db`
    insert into subscriptions (device_id, endpoint, p256dh, auth)
    values (${deviceId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    on conflict (endpoint) do update set device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth
  `;

  res.status(200).json({ ok: true });
}

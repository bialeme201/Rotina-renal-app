import { sql } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { deviceId, petNome, agendaItems, recorrentes } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ error: "deviceId ausente" });
    return;
  }

  const db = sql();
  await db`
    insert into schedule (device_id, pet_nome, agenda_items, recorrentes, updated_at)
    values (${deviceId}, ${petNome || null}, ${JSON.stringify(agendaItems || [])}, ${JSON.stringify(recorrentes || [])}, now())
    on conflict (device_id) do update set
      pet_nome = excluded.pet_nome,
      agenda_items = excluded.agenda_items,
      recorrentes = excluded.recorrentes,
      updated_at = now()
  `;

  res.status(200).json({ ok: true });
}

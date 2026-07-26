import webpush from "web-push";
import { sql } from "./_db.js";

const TOLERANCE_MINUTES = 20;
const AGENDA_WINDOW_START_MINUTES = 7 * 60; // não manda lembrete de agenda antes das 7h

function nowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutesOfDay: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: weekdayMap[get("weekday")],
  };
}

function parseHorario(horario) {
  if (!horario || !horario.includes(":")) return null;
  const [h, m] = horario.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default async function handler(req, res) {
  const token = req.query.token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    res.status(500).json({ error: "VAPID não configurado" });
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const db = sql();
  const { dateStr: today, minutesOfDay: nowMinutes, weekday } = nowInSaoPaulo();

  const rows = await db`select device_id, pet_nome, agenda_items, recorrentes from schedule`;

  const toSend = []; // { deviceId, key, title, body }

  for (const row of rows) {
    const nome = row.pet_nome || "seu gato";
    const recorrentes = row.recorrentes || [];
    const agendaItems = row.agenda_items || [];

    for (const med of recorrentes) {
      if (!Array.isArray(med.dias) || !med.dias.includes(weekday)) continue;
      if (med.dataInicio && today < med.dataInicio) continue;
      if (med.duracao === "determinado" && med.dataFim && today > med.dataFim) continue;

      const medMinutes = parseHorario(med.horario);
      if (medMinutes === null) continue;
      const diff = nowMinutes - medMinutes;
      if (diff < 0 || diff > TOLERANCE_MINUTES) continue;

      toSend.push({
        deviceId: row.device_id,
        key: `recorrente_${med.id}_${today}`,
        title: `Hora do remédio de ${nome}`,
        body: `${med.nome} · ${med.horario}`,
      });
    }

    for (const item of agendaItems) {
      if (item.data !== today) continue;

      if (nowMinutes >= AGENDA_WINDOW_START_MINUTES) {
        toSend.push({
          deviceId: row.device_id,
          key: `agenda_${item.id}_${today}`,
          title: `Compromisso hoje: ${item.tipo}`,
          body: `${nome} tem "${item.tipo}" hoje.${item.obs ? " " + item.obs : ""}`,
        });
      }

      const itemMinutes = parseHorario(item.horario);
      if (itemMinutes !== null) {
        const oneHourBefore = itemMinutes - 60;
        const diff = nowMinutes - oneHourBefore;
        if (oneHourBefore >= 0 && diff >= 0 && diff <= TOLERANCE_MINUTES) {
          toSend.push({
            deviceId: row.device_id,
            key: `agenda_1h_${item.id}_${today}`,
            title: `Daqui a 1h: ${item.tipo}`,
            body: `${nome} tem "${item.tipo}" às ${item.horario}.${item.obs ? " " + item.obs : ""}`,
          });
        }
      }
    }
  }

  let sentCount = 0;
  let skippedCount = 0;

  for (const notif of toSend) {
    const [already] = await db`
      select 1 from sent_log where device_id = ${notif.deviceId} and notif_key = ${notif.key}
    `;
    if (already) {
      skippedCount++;
      continue;
    }

    const subs = await db`select endpoint, p256dh, auth from subscriptions where device_id = ${notif.deviceId}`;
    if (subs.length === 0) continue;

    const payload = JSON.stringify({ title: notif.title, body: notif.body, url: "/" });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sentCount++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db`delete from subscriptions where endpoint = ${sub.endpoint}`;
        }
      }
    }

    await db`
      insert into sent_log (device_id, notif_key) values (${notif.deviceId}, ${notif.key})
      on conflict (device_id, notif_key) do nothing
    `;
  }

  res.status(200).json({ ok: true, sent: sentCount, skipped: skippedCount, checked: toSend.length });
}

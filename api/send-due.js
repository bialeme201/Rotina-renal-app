import webpush from "web-push";
import { sql } from "./_db.js";

// O cron roda a cada 15 min; a tolerância cobre o atraso entre a hora marcada
// e a execução seguinte.
const TOLERANCE_MINUTES = 20;
const AGENDA_WINDOW_START_MINUTES = 7 * 60; // não manda lembrete de agenda antes das 7h

const DEFAULT_LEMBRETES = { diasAntes: [1], minutosAntes: 60 };

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

function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m}min`;
  const resto = m % 60;
  return resto === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(resto).padStart(2, "0")}`;
}

function parseDateKey(key) {
  return new Date(`${key}T12:00:00Z`);
}

function diffDays(a, b) {
  return Math.round((parseDateKey(a) - parseDateKey(b)) / 86400000);
}

function addDays(key, n) {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --- as regras abaixo espelham src/agendaLogic.js ---

function medFrequencia(med) {
  if (med && med.frequencia) return med.frequencia;
  if (med && Array.isArray(med.dias) && med.dias.length === 7) return "24h";
  return "dias";
}

function medHorarios(med) {
  if (med && Array.isArray(med.horarios) && med.horarios.length) return med.horarios.filter(Boolean);
  return med && med.horario ? [med.horario] : [];
}

function medOccursOn(med, key, weekday) {
  if (!med) return false;
  if (med.dataInicio && key < med.dataInicio) return false;
  if (med.duracao === "determinado" && med.dataFim && key > med.dataFim) return false;

  const freq = medFrequencia(med);
  if (freq === "24h") return true;
  if (freq === "48h") {
    if (!med.dataInicio) return true;
    return diffDays(key, med.dataInicio) % 2 === 0;
  }
  return Array.isArray(med.dias) && med.dias.includes(weekday);
}

function normalizeLembretes(lembretes) {
  const base = lembretes || {};
  const dias = Array.isArray(base.diasAntes)
    ? [...new Set(base.diasAntes.map(Number).filter((d) => d > 0))].sort((a, b) => a - b)
    : DEFAULT_LEMBRETES.diasAntes;
  const minutos = Number(base.minutosAntes);
  return {
    diasAntes: dias,
    minutosAntes: Number.isFinite(minutos) && minutos > 0 ? minutos : DEFAULT_LEMBRETES.minutosAntes,
  };
}

function agendaExames(item) {
  return Array.isArray(item.exames) ? item.exames.filter(Boolean) : [];
}

function agendaTipos(item) {
  if (Array.isArray(item.tipos) && item.tipos.length) return item.tipos.filter(Boolean);
  return item.tipo ? [item.tipo] : [];
}

function agendaTitulo(item) {
  const tipos = agendaTipos(item);
  if (tipos.length) return tipos.join(" + ");
  const exames = agendaExames(item);
  return exames.length ? exames[0] : "Compromisso";
}

function doseLabel(med) {
  if (!med || !med.dose) return "";
  return `${String(med.dose).trim()} ${med.doseUnidade || "mg"}`;
}

// Cadastros anteriores não têm esses campos: avisam na hora, que era o
// comportamento fixo antes de a antecedência ser configurável.
function medAvisar(med) {
  return med ? med.avisar !== false : true;
}

function medAvisoMinutos(med) {
  const m = Number(med && med.avisoMinutosAntes);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

// Contexto extra que vale a pena caber na notificação: os exames do dia e o
// jejum, que é justamente o que costuma ser esquecido na véspera.
function agendaDetalhes(item) {
  const partes = [];
  const exames = agendaExames(item);
  const tipos = agendaTipos(item);
  if (exames.length > 1) partes.push(`${exames.length} exames: ${exames.join(", ")}`);
  else if (exames.length === 1 && !tipos.includes(exames[0])) partes.push(exames[0]);
  if (item.jejum) {
    const horas = Number(item.jejumHoras) || 0;
    partes.push(horas ? `jejum de ${horas}h` : "precisa de jejum");
  }
  if (item.obs) partes.push(item.obs);
  return partes.join(" · ");
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

  // Uma janela é "agora" quando o horário alvo já passou há menos que a tolerância.
  const dentroDaJanela = (targetMinutes) => {
    if (targetMinutes < 0) return false;
    const diff = nowMinutes - targetMinutes;
    return diff >= 0 && diff <= TOLERANCE_MINUTES;
  };

  for (const row of rows) {
    const nome = row.pet_nome || "seu gato";
    const recorrentes = row.recorrentes || [];
    const agendaItems = row.agenda_items || [];

    for (const med of recorrentes) {
      if (!medOccursOn(med, today, weekday)) continue;

      for (const horario of medHorarios(med)) {
        const medMinutes = parseHorario(horario);
        if (medMinutes === null) continue;

        // Aviso de jejum: só faz sentido se o jejum começar ainda hoje.
        if (med.jejum) {
          const jejumMinutos = Number(med.jejumMinutos) || 0;
          const inicioJejum = medMinutes - jejumMinutos;
          if (jejumMinutos > 0 && dentroDaJanela(inicioJejum)) {
            toSend.push({
              deviceId: row.device_id,
              key: `recorrente_jejum_${med.id}_${horario}_${today}`,
              title: `Jejum antes do remédio de ${nome}`,
              body: `${med.nome} às ${horario} — a partir de agora, sem comida (${formatDuration(jejumMinutos)}).`,
            });
          }
        }

        if (!medAvisar(med)) continue;

        // A chave não inclui a antecedência de propósito: mudar de "na hora"
        // para "15min antes" no meio do dia não deve render um segundo aviso
        // da mesma dose.
        const antecedencia = medAvisoMinutos(med);
        if (!dentroDaJanela(medMinutes - antecedencia)) continue;
        toSend.push({
          deviceId: row.device_id,
          key: `recorrente_${med.id}_${horario}_${today}`,
          title: antecedencia === 0
            ? `Hora do remédio de ${nome}`
            : `Daqui a ${formatDuration(antecedencia)}: remédio de ${nome}`,
          body: `${med.nome}${doseLabel(med) ? ` · ${doseLabel(med)}` : ""} · ${horario}${med.jejum ? " · dar em jejum" : ""}`,
        });
      }
    }

    for (const item of agendaItems) {
      if (item.concluido) continue;

      const lembretes = normalizeLembretes(item.lembretes);
      const titulo = agendaTitulo(item);
      const detalhes = agendaDetalhes(item);
      const itemMinutes = parseHorario(item.horario);

      // Avisos antecipados: um por dia configurado, sempre na abertura da janela.
      for (const diasAntes of lembretes.diasAntes) {
        if (item.data !== addDays(today, diasAntes)) continue;
        if (nowMinutes < AGENDA_WINDOW_START_MINUTES) continue;
        const quando = diasAntes === 1 ? "amanhã" : `em ${diasAntes} dias`;
        toSend.push({
          deviceId: row.device_id,
          key: `agenda_d${diasAntes}_${item.id}_${today}`,
          title: `${titulo} ${quando}`,
          body: `${nome} tem "${titulo}" ${quando}${item.horario ? ` às ${item.horario}` : ""}.${detalhes ? " " + detalhes : ""}`,
        });
      }

      // Jejum longo começa na véspera (ex.: 12h de jejum para uma coleta às 8h).
      if (item.jejum && itemMinutes !== null && item.data === addDays(today, 1)) {
        const jejumHoras = Number(item.jejumHoras) || 0;
        const inicioJejum = itemMinutes - jejumHoras * 60;
        if (jejumHoras > 0 && inicioJejum < 0 && dentroDaJanela(1440 + inicioJejum)) {
          toSend.push({
            deviceId: row.device_id,
            key: `agenda_jejum_${item.id}_${item.data}`,
            title: `Começa o jejum de ${nome}`,
            body: `${titulo} amanhã às ${item.horario} pede ${jejumHoras}h de jejum — última refeição agora.`,
          });
        }
      }

      if (item.data !== today) continue;

      if (nowMinutes >= AGENDA_WINDOW_START_MINUTES) {
        toSend.push({
          deviceId: row.device_id,
          key: `agenda_${item.id}_${today}`,
          title: `Compromisso hoje: ${titulo}`,
          body: `${nome} tem "${titulo}" hoje${item.horario ? ` às ${item.horario}` : ""}.${detalhes ? " " + detalhes : ""}`,
        });
      }

      if (itemMinutes === null) continue;

      // Início do jejum — o aviso que realmente muda a manhã de quem cuida.
      if (item.jejum) {
        const jejumHoras = Number(item.jejumHoras) || 0;
        const inicioJejum = itemMinutes - jejumHoras * 60;
        if (jejumHoras > 0 && dentroDaJanela(inicioJejum)) {
          toSend.push({
            deviceId: row.device_id,
            key: `agenda_jejum_${item.id}_${item.data}`,
            title: `Começa o jejum de ${nome}`,
            body: `${titulo} às ${item.horario} pede ${jejumHoras}h de jejum — última refeição agora.`,
          });
        }
      }

      const antecedencia = itemMinutes - lembretes.minutosAntes;
      if (dentroDaJanela(antecedencia)) {
        toSend.push({
          deviceId: row.device_id,
          key: `agenda_pre${lembretes.minutosAntes}_${item.id}_${today}`,
          title: `Daqui a ${formatDuration(lembretes.minutosAntes)}: ${titulo}`,
          body: `${nome} tem "${titulo}" às ${item.horario}.${detalhes ? " " + detalhes : ""}`,
        });
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

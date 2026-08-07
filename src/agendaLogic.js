// Regras de agenda compartilhadas pela interface. A mesma semântica está
// replicada em api/send-due.js, que roda no servidor e não pode importar daqui.

export const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Antecedências oferecidas no cadastro de compromisso.
export const DIAS_ANTES_OPCOES = [1, 2, 3, 7];
export const MINUTOS_ANTES_OPCOES = [15, 30, 60, 120, 180];
export const JEJUM_HORAS_OPCOES = [2, 4, 6, 8, 12];
export const JEJUM_MINUTOS_MED_OPCOES = [30, 60, 120];

export const DEFAULT_LEMBRETES = { diasAntes: [1], minutosAntes: 60 };

// Padrões aplicados aos próximos cadastros. Guarda os dois tipos de aviso:
// o do compromisso (dias e antecedência) e o do remédio.
export const DEFAULT_NOTIF_PREFS = { ...DEFAULT_LEMBRETES, medAvisar: true, medMinutosAntes: 0 };

export function normalizeNotifPrefs(prefs) {
  const base = prefs || {};
  const minutos = Number(base.medMinutosAntes);
  return {
    ...normalizeLembretes(base),
    medAvisar: base.medAvisar !== false,
    medMinutosAntes: Number.isFinite(minutos) && minutos > 0 ? minutos : 0,
  };
}

export function normalizeLembretes(lembretes) {
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

// ---- datas -------------------------------------------------------------
// Sempre no fuso local do aparelho: usar toISOString() aqui jogaria o "hoje"
// para o dia seguinte a partir das 21h no horário de Brasília.

export function dateKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  return new Date(`${key}T12:00:00`);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKeyFromDate(d);
}

export function diffDays(a, b) {
  return Math.round((parseDateKey(a) - parseDateKey(b)) / 86400000);
}

export function startOfWeek(key) {
  const d = parseDateKey(key);
  return addDays(key, -d.getDay());
}

export function weekDays(weekStartKey) {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStartKey, i));
}

export function monthKeyOf(key) {
  return key.slice(0, 7);
}

// Grade de 6 semanas começando no domingo, como no calendário do Google.
export function monthGrid(monthKey) {
  const first = `${monthKey}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey) {
  const label = parseDateKey(`${monthKey}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDayLabel(key) {
  const label = parseDateKey(key).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m}min`;
  const horas = m / 60;
  const inteiro = Math.floor(horas);
  const resto = m % 60;
  return resto === 0 ? `${inteiro}h` : `${inteiro}h${String(resto).padStart(2, "0")}`;
}

export function parseHorario(horario) {
  if (!horario || !horario.includes(":")) return null;
  const [h, m] = horario.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToHorario(total) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

// ---- remédios ----------------------------------------------------------

// Cadastros antigos guardavam só `dias`; a frequência é inferida para eles.
export function medFrequencia(med) {
  if (med && med.frequencia) return med.frequencia;
  if (med && Array.isArray(med.dias) && med.dias.length === 7) return "24h";
  return "dias";
}

export function medHorarios(med) {
  if (med && Array.isArray(med.horarios) && med.horarios.length) {
    return med.horarios.filter(Boolean);
  }
  return med && med.horario ? [med.horario] : [];
}

export function medOccursOn(med, key) {
  if (!med) return false;
  if (med.dataInicio && key < med.dataInicio) return false;
  if (med.duracao === "determinado" && med.dataFim && key > med.dataFim) return false;

  const freq = medFrequencia(med);
  if (freq === "24h") return true;
  if (freq === "48h") {
    if (!med.dataInicio) return true;
    return diffDays(key, med.dataInicio) % 2 === 0;
  }
  return Array.isArray(med.dias) && med.dias.includes(parseDateKey(key).getDay());
}

export function medCheckKey(dateKey, medId) {
  return `${dateKey}_${medId}`;
}

// "none" quando o remédio não é previsto para o dia.
export function medStatus(med, key, checks, todayKey) {
  if (!medOccursOn(med, key)) return "none";
  if (checks && checks[medCheckKey(key, med.id)]) return "done";
  if (key < todayKey) return "late";
  if (key === todayKey) return "today";
  return "future";
}

export function doseLabel(med) {
  if (!med || !med.dose) return "";
  return `${String(med.dose).trim()} ${med.doseUnidade || "mg"}`;
}

// ---- aviso do remédio --------------------------------------------------
// Cadastros anteriores a esta versão não têm os campos: avisam na hora,
// que era o comportamento fixo do envio.

export const AVISO_MED_OPCOES = [0, 5, 15, 30];

export function medAvisar(med) {
  return med ? med.avisar !== false : true;
}

export function medAvisoMinutos(med) {
  const m = Number(med && med.avisoMinutosAntes);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

export function avisoLabel(med) {
  if (!medAvisar(med)) return "sem aviso";
  const min = medAvisoMinutos(med);
  return min === 0 ? "avisa na hora" : `avisa ${formatDuration(min)} antes`;
}

// Os horários em que a notificação realmente chega — é isso que a tela
// precisa mostrar para a pessoa não ter que fazer a conta de cabeça.
export function horariosDoAviso(med) {
  const offset = medAvisoMinutos(med);
  return medHorarios(med)
    .map((h) => {
      const m = parseHorario(h);
      return m === null ? null : minutesToHorario(m - offset);
    })
    .filter(Boolean);
}

export function horariosDoJejum(med) {
  if (!med || !med.jejum) return [];
  const minutos = Number(med.jejumMinutos) || 0;
  if (!minutos) return [];
  return medHorarios(med)
    .map((h) => {
      const m = parseHorario(h);
      return m === null ? null : minutesToHorario(m - minutos);
    })
    .filter(Boolean);
}

function listar(itens) {
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// A frase que explica, em português, exatamente o que vai chegar no celular.
export function explicaAvisoRemedio(med) {
  if (!medAvisar(med)) return "Você não vai receber nenhum aviso deste remédio — nem o da dose, nem o do jejum.";
  const horarios = horariosDoAviso(med);
  if (horarios.length === 0) return "Defina o horário acima para o aviso funcionar.";

  const offset = medAvisoMinutos(med);
  const quando = offset === 0
    ? `Você recebe um aviso às ${listar(horarios)}, na hora da dose.`
    : `Você recebe um aviso às ${listar(horarios)} — ${formatDuration(offset)} antes de cada dose.`;

  const jejum = horariosDoJejum(med);
  if (jejum.length === 0) return quando;
  return `${quando} E às ${listar(jejum)}, avisando para começar o jejum.`;
}

export function medFrequenciaLabel(med) {
  const freq = medFrequencia(med);
  if (freq === "24h") return "a cada 24h";
  if (freq === "48h") return "a cada 48h";
  const dias = Array.isArray(med.dias) ? med.dias : [];
  if (dias.length === 7) return "todos os dias";
  return dias.slice().sort().map((d) => WEEKDAY_SHORT[d]).join(", ");
}

// ---- compromissos ------------------------------------------------------

// Duas granularidades diferentes: `tipos` são os procedimentos do dia
// (ultrassom, coleta de sangue) e `exames` são os itens do painel pedido
// pelo veterinário (creatinina, ureia). Cadastros antigos só têm `tipo`.
export function agendaExames(item) {
  if (!item) return [];
  if (Array.isArray(item.exames)) return item.exames.filter(Boolean);
  return [];
}

export function agendaTipos(item) {
  if (!item) return [];
  if (Array.isArray(item.tipos) && item.tipos.length) return item.tipos.filter(Boolean);
  return item.tipo ? [item.tipo] : [];
}

export function agendaTitulo(item) {
  const tipos = agendaTipos(item);
  if (tipos.length) return tipos.join(" + ");
  const exames = agendaExames(item);
  if (exames.length) return exames[0];
  return "Compromisso";
}

export function agendaResumoExames(item) {
  const exames = agendaExames(item);
  if (exames.length === 0) return "";
  if (exames.length === 1) return exames[0];
  return `${exames.length} exames: ${exames.join(", ")}`;
}

export function lembretesLabel(lembretes) {
  const l = normalizeLembretes(lembretes);
  const hora = `${formatDuration(l.minutosAntes)} antes`;
  if (l.diasAntes.length === 0) return hora;
  if (l.diasAntes.length === 1) {
    const d = l.diasAntes[0];
    const unico = d === 1 ? "1 dia" : d === 7 ? "1 semana" : `${d} dias`;
    return `${unico} antes, ${hora}`;
  }
  const ultimo = l.diasAntes[l.diasAntes.length - 1];
  const dias = `${l.diasAntes.slice(0, -1).join(", ")} e ${ultimo}`;
  return `${dias} dias antes, ${hora}`;
}

// Simétrico ao do remédio: item sem o campo avisa, que era o comportamento
// antes de ele existir.
export function agendaAvisar(item) {
  return item ? item.avisar !== false : true;
}

export function agendaStatus(item, todayKey) {
  if (!item) return "future";
  if (item.concluido) return "done";
  if (item.data < todayKey) return "late";
  if (item.data === todayKey) return "today";
  return "future";
}

export function jejumInfo(item) {
  if (!item || !item.jejum) return null;
  const horas = Number(item.jejumHoras) || 0;
  if (!horas) return { horas: 0, inicio: null, texto: "Jejum necessário" };
  const itemMinutes = parseHorario(item.horario);
  const inicio = itemMinutes === null ? null : minutesToHorario(itemMinutes - horas * 60);
  const viraNoDiaAnterior = itemMinutes !== null && itemMinutes - horas * 60 < 0;
  return {
    horas,
    inicio,
    viraNoDiaAnterior,
    texto: inicio
      ? `Jejum de ${horas}h — última refeição às ${inicio}${viraNoDiaAnterior ? " do dia anterior" : ""}`
      : `Jejum de ${horas}h antes`,
  };
}

export function daysUntilLabel(dateStr, todayKey) {
  if (!dateStr) return "";
  const diff = diffDays(dateStr, todayKey);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff > 1) return `Em ${diff} dias`;
  if (diff === -1) return "Ontem";
  return `Há ${Math.abs(diff)} dias`;
}

// Tudo que acontece num dia, na ordem do relógio — a base das visões de
// mês, semana e lista.
export function dayOccurrences(key, agendaItems, recorrentes, checks, todayKey) {
  const compromissos = (agendaItems || [])
    .filter((it) => it.data === key)
    .map((it) => ({
      kind: "compromisso",
      id: it.id,
      item: it,
      horario: it.horario || "",
      minutes: parseHorario(it.horario),
      titulo: agendaTitulo(it),
      status: agendaStatus(it, todayKey),
    }));

  const remedios = [];
  (recorrentes || []).forEach((med) => {
    if (!medOccursOn(med, key)) return;
    const status = medStatus(med, key, checks, todayKey);
    medHorarios(med).forEach((horario, i) => {
      remedios.push({
        kind: "remedio",
        id: `${med.id}_${i}`,
        med,
        horario,
        minutes: parseHorario(horario),
        titulo: med.nome,
        status,
      });
    });
    if (medHorarios(med).length === 0) {
      remedios.push({ kind: "remedio", id: `${med.id}_0`, med, horario: "", minutes: null, titulo: med.nome, status });
    }
  });

  return [...compromissos, ...remedios].sort((a, b) => {
    if (a.minutes === null) return 1;
    if (b.minutes === null) return -1;
    return a.minutes - b.minutes;
  });
}

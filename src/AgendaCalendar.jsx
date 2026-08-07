import { ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { TEAL, TERRACOTTA, INK, GREY } from "./theme.js";
import {
  WEEKDAY_LETTERS, monthGrid, monthKeyOf, formatMonthLabel, parseDateKey,
  weekDays, addDays, medStatus, medHorarios, medFrequenciaLabel, doseLabel, agendaStatus,
  agendaTitulo, agendaResumoExames, jejumInfo, dayOccurrences, formatDayLabel,
  daysUntilLabel, lembretesLabel, formatDuration,
} from "./agendaLogic.js";

const STATUS_STYLE = {
  done: { bg: "rgba(59,110,100,0.14)", fg: TEAL, label: "Cumprido" },
  late: { bg: "rgba(196,98,45,0.14)", fg: TERRACOTTA, label: "Em atraso" },
  today: { bg: "rgba(59,110,100,0.08)", fg: TEAL, label: "Hoje" },
  future: { bg: "rgba(42,42,42,0.05)", fg: GREY, label: "Previsto" },
};

const cardStyle = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.8)",
  borderRadius: 22,
  boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
};

// Filtro do resumo: "doses" mostra só as que faltam, "compromissos" só os que
// ainda não foram marcados como feitos. null mostra tudo.
export function passaNoFiltro(oc, filtro) {
  if (!filtro) return true;
  if (filtro === "doses") return oc.kind === "remedio" && oc.status !== "done";
  if (filtro === "compromissos") return oc.kind === "compromisso" && !oc.item.concluido;
  return true;
}

export const FILTRO_ROTULO = {
  doses: "doses que faltam",
  compromissos: "compromissos a fazer",
};

function Dot({ color, hollow }) {
  return (
    <div style={{
      width: 5, height: 5, borderRadius: "50%",
      background: hollow ? "transparent" : color,
      border: hollow ? `1.5px solid ${color}` : "none",
      boxSizing: "border-box",
    }} />
  );
}

// Grade mensal no formato do calendário do Google: seis semanas fixas,
// dia selecionado em destaque e marcadores discretos do que existe no dia.
export function MonthCalendar({ monthKey, selected, todayKey, marksFor, onSelect, onMonthChange }) {
  const days = monthGrid(monthKey);

  return (
    <div style={{ ...cardStyle, padding: "18px 14px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
        <button
          onClick={() => onMonthChange(-1)}
          aria-label="Mês anterior"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "flex", color: GREY }}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14 }}>
          {formatMonthLabel(monthKey)}
        </div>
        <button
          onClick={() => onMonthChange(1)}
          aria-label="Próximo mês"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "flex", color: GREY }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WEEKDAY_LETTERS.map((letra, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: GREY, paddingBottom: 4 }}>
            {letra}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {days.map((key) => {
          const marks = marksFor(key);
          const isSelected = key === selected;
          const isToday = key === todayKey;
          const outsideMonth = monthKeyOf(key) !== monthKey;
          const dayNumber = parseDateKey(key).getDate();

          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              style={{
                border: "none", background: "none", cursor: "pointer", padding: "3px 0 5px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                borderRadius: 10, opacity: outsideMonth ? 0.34 : 1,
              }}
            >
              <div style={{
                width: 29, height: 29, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isSelected ? TEAL : isToday ? "rgba(59,110,100,0.12)" : "transparent",
                color: isSelected ? "#fff" : isToday ? TEAL : INK,
                fontWeight: isSelected || isToday ? 800 : 500,
                fontSize: 12.5,
                transition: "background 0.18s ease",
              }}>
                {dayNumber}
              </div>
              <div style={{ display: "flex", gap: 2, height: 5, alignItems: "center" }}>
                {marks.compromissoLate && <Dot color={TERRACOTTA} />}
                {marks.compromissos > 0 && !marks.compromissoLate && (
                  <Dot color={TERRACOTTA} hollow={marks.compromissosDone} />
                )}
                {marks.remedioLate && <Dot color="#D9534F" />}
                {marks.remedios > 0 && !marks.remedioLate && (
                  <Dot color={TEAL} hollow={marks.remediosDone} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 10, fontSize: 9.5, color: GREY }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Dot color={TERRACOTTA} /> compromisso</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Dot color={TEAL} /> remédio</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Dot color={TEAL} hollow /> tudo cumprido</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Dot color="#D9534F" /> em atraso</span>
      </div>
    </div>
  );
}

function StatusCell({ status, onClick, title }) {
  if (status === "none") {
    return <div style={{ width: 22, height: 22, margin: "0 auto", borderRadius: 7, background: "rgba(42,42,42,0.04)" }} />;
  }
  const s = STATUS_STYLE[status];
  const clickable = typeof onClick === "function";
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      title={title}
      aria-label={title}
      style={{
        width: 22, height: 22, margin: "0 auto", borderRadius: 7, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 0,
        border: status === "future" ? "1.5px dashed rgba(42,42,42,0.18)" : "none",
        background: status === "future" ? "transparent" : s.bg,
        color: s.fg, cursor: clickable ? "pointer" : "default",
      }}
    >
      {status === "done" && <Check size={13} strokeWidth={3} />}
      {status === "late" && <AlertCircle size={13} strokeWidth={2.6} />}
      {status === "today" && <div style={{ width: 7, height: 7, borderRadius: "50%", border: `2px solid ${TEAL}` }} />}
    </button>
  );
}

// Visão da semana: cada remédio por dia, sinalizando o que já foi cumprido e
// o que ficou para trás. Dias passados e o dia de hoje podem ser marcados aqui.
export function WeekOverview({
  weekStartKey, todayKey, recorrentes, agendaItems, checks,
  onToggleMed, onWeekChange, onSelectDay, selected,
}) {
  const dias = weekDays(weekStartKey);
  const inicio = parseDateKey(dias[0]).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const fim = parseDateKey(dias[6]).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  const pendencias = [];
  dias.forEach((key) => {
    if (key > todayKey) return;
    recorrentes.forEach((med) => {
      if (medStatus(med, key, checks, todayKey) === "late") pendencias.push({ key, med });
    });
  });

  return (
    <div style={{ ...cardStyle, padding: "18px 16px 16px", marginBottom: 14, overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button
          onClick={() => onWeekChange(-1)}
          aria-label="Semana anterior"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "flex", color: GREY }}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5 }}>
          {inicio} – {fim}
        </div>
        <button
          onClick={() => onWeekChange(1)}
          aria-label="Próxima semana"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "flex", color: GREY }}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: GREY, textAlign: "center", marginBottom: 14 }}>
        Toque num quadradinho para marcar ou desmarcar o remédio daquele dia.
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 320 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingBottom: 8 }} />
            {dias.map((key) => {
              const d = parseDateKey(key);
              const isToday = key === todayKey;
              return (
                <th key={key} style={{ width: 30, paddingBottom: 8 }}>
                  <button
                    onClick={() => onSelectDay(key)}
                    style={{
                      border: "none", background: "none", cursor: "pointer", padding: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%",
                    }}
                  >
                    <span style={{ fontSize: 9.5, color: GREY, fontWeight: 700 }}>{WEEKDAY_LETTERS[d.getDay()]}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: isToday ? "#fff" : key === selected ? TEAL : INK,
                      background: isToday ? TEAL : "transparent",
                      borderRadius: "50%", width: 20, height: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {d.getDate()}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {recorrentes.map((med) => (
            <tr key={med.id}>
              <td style={{ paddingRight: 8, paddingTop: 5, paddingBottom: 5, maxWidth: 110 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {med.nome}
                </div>
                <div style={{ fontSize: 9.5, color: GREY, whiteSpace: "nowrap" }}>
                  {medHorarios(med).join(" · ") || "sem horário"}
                </div>
              </td>
              {dias.map((key) => {
                const status = medStatus(med, key, checks, todayKey);
                return (
                  <td key={key} style={{ textAlign: "center", paddingTop: 5, paddingBottom: 5 }}>
                    <StatusCell
                      status={status}
                      title={status === "none" ? undefined : `${med.nome} — ${STATUS_STYLE[status].label}`}
                      onClick={status === "none" || key > todayKey ? undefined : () => onToggleMed(key, med.id)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}

          {agendaItems.some((it) => dias.includes(it.data)) && (
            <tr>
              <td style={{ paddingRight: 8, paddingTop: 5, paddingBottom: 5 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: TERRACOTTA, whiteSpace: "nowrap" }}>Compromissos</div>
              </td>
              {dias.map((key) => {
                const doDia = agendaItems.filter((it) => it.data === key);
                if (doDia.length === 0) {
                  return <td key={key} style={{ textAlign: "center" }}><StatusCell status="none" /></td>;
                }
                const statuses = doDia.map((it) => agendaStatus(it, todayKey));
                const status = statuses.includes("late")
                  ? "late"
                  : statuses.every((s) => s === "done")
                    ? "done"
                    : statuses.includes("today") ? "today" : "future";
                return (
                  <td key={key} style={{ textAlign: "center", paddingTop: 5, paddingBottom: 5 }}>
                    <StatusCell
                      status={status}
                      title={`${doDia.length} compromisso(s) — ${STATUS_STYLE[status].label}`}
                      onClick={() => onSelectDay(key)}
                    />
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>

      {recorrentes.length === 0 && (
        <div style={{ fontSize: 12, color: GREY, textAlign: "center", padding: "14px 0 4px" }}>
          Nenhum remédio cadastrado ainda.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(42,42,42,0.06)", fontSize: 10, color: GREY }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><StatusCell status="done" /> cumprido</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><StatusCell status="late" /> em atraso</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><StatusCell status="today" /> hoje</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><StatusCell status="future" /> previsto</span>
      </div>

      {pendencias.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 12, background: "rgba(196,98,45,0.10)", fontSize: 11.5, color: TERRACOTTA }}>
          {pendencias.length === 1
            ? `1 dose ficou sem marcação nesta semana: ${pendencias[0].med.nome} em ${parseDateKey(pendencias[0].key).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}.`
            : `${pendencias.length} doses ficaram sem marcação nesta semana. Se você deu o remédio, marque no quadro acima.`}
        </div>
      )}
    </div>
  );
}

function Chip({ children, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
      background: bg, color, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// Painel do dia selecionado — a lista do que acontece naquele dia, em ordem
// de horário, com as ações rápidas de cada item.
export function DayPanel({
  dayKey, todayKey, agendaItems, recorrentes, checks, filtro,
  onToggleMed, onEditCompromisso, onToggleCompromisso, onEditMed, onAddCompromisso, onAddMed,
}) {
  const todas = dayOccurrences(dayKey, agendaItems, recorrentes, checks, todayKey);
  const ocorrencias = todas.filter((oc) => passaNoFiltro(oc, filtro));
  const escondidas = todas.length - ocorrencias.length;
  const relativo = daysUntilLabel(dayKey, todayKey);

  return (
    <div style={{ ...cardStyle, padding: "18px 18px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14 }}>
          {formatDayLabel(dayKey)}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: dayKey === todayKey ? TEAL : GREY }}>{relativo}</div>
      </div>

      {ocorrencias.length === 0 ? (
        <div style={{ fontSize: 12.5, color: GREY, padding: "6px 0 12px" }}>
          {filtro && todas.length > 0
            ? `Nada pendente neste dia — ${todas.length} ${todas.length === 1 ? "item já resolvido" : "itens já resolvidos"}. Tire o filtro acima para ver.`
            : "Nada marcado para este dia."}
        </div>
      ) : (
        ocorrencias.map((oc) => {
          if (oc.kind === "remedio") {
            const done = oc.status === "done";
            const late = oc.status === "late";
            return (
              <div key={oc.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid rgba(42,42,42,0.06)" }}>
                <button
                  onClick={() => dayKey <= todayKey && onToggleMed(dayKey, oc.med.id)}
                  disabled={dayKey > todayKey}
                  aria-label={done ? `Desmarcar ${oc.med.nome}` : `Marcar ${oc.med.nome} como dado`}
                  style={{
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    border: done ? "none" : `2px solid ${late ? TERRACOTTA : "rgba(42,42,42,0.15)"}`,
                    background: done ? TEAL : "transparent", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: dayKey > todayKey ? "default" : "pointer", opacity: dayKey > todayKey ? 0.45 : 1,
                  }}
                >
                  {done && <Check size={14} strokeWidth={3} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: done ? GREY : INK, textDecoration: done ? "line-through" : "none" }}>
                    {oc.med.nome}
                  </div>
                  <div style={{ fontSize: 10.5, color: GREY, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {doseLabel(oc.med) && (
                      <span style={{ fontWeight: 700, color: TEAL }}>{doseLabel(oc.med)}</span>
                    )}
                    <span>{medFrequenciaLabel(oc.med)}</span>
                    {oc.med.jejum && (
                      <Chip color={TERRACOTTA} bg="rgba(196,98,45,0.12)">
                        jejum {formatDuration(oc.med.jejumMinutos)}
                      </Chip>
                    )}
                    {late && <Chip color={TERRACOTTA} bg="rgba(196,98,45,0.12)">em atraso</Chip>}
                  </div>
                  {oc.med.obs && (
                    <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginTop: 2 }}>{oc.med.obs}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: TERRACOTTA, flexShrink: 0 }}>{oc.horario}</div>
                <button
                  onClick={() => onEditMed(oc.med)}
                  style={{ border: "none", background: "none", color: TEAL, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}
                >
                  editar
                </button>
              </div>
            );
          }

          const item = oc.item;
          const jejum = jejumInfo(item);
          const resumo = agendaResumoExames(item);
          return (
            <div key={oc.id} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 0", borderBottom: "1px solid rgba(42,42,42,0.06)" }}>
              <button
                onClick={() => onToggleCompromisso(item)}
                aria-label={item.concluido ? "Desmarcar compromisso" : "Marcar compromisso como feito"}
                style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1,
                  border: item.concluido ? "none" : `2px solid ${oc.status === "late" ? TERRACOTTA : "rgba(42,42,42,0.15)"}`,
                  background: item.concluido ? TERRACOTTA : "transparent", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                {item.concluido && <Check size={14} strokeWidth={3} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: item.concluido ? GREY : INK, textDecoration: item.concluido ? "line-through" : "none" }}>
                  {agendaTitulo(item)}
                </div>
                {resumo && <div style={{ fontSize: 11, color: GREY, marginTop: 1 }}>{resumo}</div>}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                  {jejum && <Chip color={TERRACOTTA} bg="rgba(196,98,45,0.12)">{jejum.texto}</Chip>}
                  {oc.status === "late" && <Chip color={TERRACOTTA} bg="rgba(196,98,45,0.12)">em atraso</Chip>}
                  <Chip color={GREY} bg="rgba(42,42,42,0.05)">avisa {lembretesLabel(item.lembretes)}</Chip>
                </div>
                {item.obs && <div style={{ fontSize: 11, color: GREY, fontStyle: "italic", marginTop: 4 }}>{item.obs}</div>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: TERRACOTTA, flexShrink: 0 }}>{item.horario}</div>
              <button
                onClick={() => onEditCompromisso(item)}
                style={{ border: "none", background: "none", color: TEAL, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}
              >
                editar
              </button>
            </div>
          );
        })
      )}

      {filtro && escondidas > 0 && ocorrencias.length > 0 && (
        <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginTop: 10 }}>
          {escondidas === 1 ? "1 item escondido pelo filtro" : `${escondidas} itens escondidos pelo filtro`}.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => onAddCompromisso(dayKey)}
          style={{ flex: 1, padding: "9px 10px", borderRadius: 11, border: `1px solid rgba(196,98,45,0.3)`, background: "transparent", color: TERRACOTTA, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}
        >
          + compromisso
        </button>
        <button
          onClick={() => onAddMed(dayKey)}
          style={{ flex: 1, padding: "9px 10px", borderRadius: 11, border: `1px solid rgba(59,110,100,0.3)`, background: "transparent", color: TEAL, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}
        >
          + remédio
        </button>
      </div>
    </div>
  );
}

// Quadro do resumo: vira botão quando há o que ver, e continua só informativo
// quando o número é zero — não há detalhe nenhum para abrir.
function ResumoTile({ valor, rotulo, cor, fundo, onClick }) {
  const conteudo = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: cor, fontFamily: "'Poppins', sans-serif", lineHeight: 1.1 }}>
          {valor}
        </div>
        {onClick && <ChevronRight size={15} color={cor} strokeWidth={2.4} style={{ marginTop: 2, flexShrink: 0 }} />}
      </div>
      <div style={{ fontSize: 10.5, color: cor, textAlign: "left" }}>{rotulo}</div>
    </>
  );
  const estilo = {
    flex: "1 1 130px", background: fundo, borderRadius: 12, padding: "10px 12px",
    border: "none", textAlign: "left", fontFamily: "inherit",
  };
  if (!onClick) return <div style={estilo}>{conteudo}</div>;
  return (
    <button onClick={onClick} style={{ ...estilo, cursor: "pointer" }}>
      {conteudo}
    </button>
  );
}

// Cartão de resumo no topo: o que ainda falta hoje e o próximo compromisso.
// `onAbrirSemana` leva para a visão da semana, onde cada dose e cada
// compromisso podem ser marcados um a um.
export function TodaySummary({ todayKey, agendaItems, recorrentes, checks, onAbrirSemana }) {
  const hoje = dayOccurrences(todayKey, agendaItems, recorrentes, checks, todayKey);
  const remediosPendentes = hoje.filter((o) => o.kind === "remedio" && o.status !== "done");
  const compromissosHoje = hoje.filter((o) => o.kind === "compromisso" && !o.item.concluido);

  const proximo = agendaItems
    .filter((it) => it.data > todayKey && !it.concluido)
    .sort((a, b) => (a.data > b.data ? 1 : -1))[0];

  const atrasados = agendaItems.filter((it) => agendaStatus(it, todayKey) === "late");

  // Doses de dias anteriores que ficaram sem marcação. Janela de 7 dias: longe
  // o bastante para não ser só "hoje", curta o bastante para o número seguir
  // sendo uma coisa que dá para resolver.
  const dosesEmAtraso = Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - 7))
    .reduce((total, dia) => total + recorrentes.filter((med) => medStatus(med, dia, checks, todayKey) === "late").length, 0);

  const tudoEmDia = dosesEmAtraso === 0 && atrasados.length === 0;

  if (recorrentes.length === 0 && agendaItems.length === 0) return null;

  const linhaAtraso = {
    width: "100%", display: "flex", alignItems: "center", gap: 10,
    padding: "11px 13px", borderRadius: 12, cursor: "pointer", border: "none",
    background: STATUS_STYLE.late.bg, color: STATUS_STYLE.late.fg,
    fontFamily: "inherit", textAlign: "left",
  };

  return (
    <>
      {/* Bloco separado do "Hoje" de propósito: misturar dias passados com o
          dia corrente fazia o cartão dizer "tudo em dia" logo acima de doses
          pendentes de hoje. Aqui só se fala do que já passou. */}
      {tudoEmDia ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 9, marginBottom: 10,
          padding: "10px 14px", borderRadius: 14,
          background: "rgba(59,110,100,0.10)", color: TEAL,
        }}>
          <Check size={15} strokeWidth={3} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.4 }}>
            Nada ficou para trás nos últimos dias.
          </span>
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: "16px 16px 14px", marginBottom: 10 }}>
          <div style={{
            fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 10,
            letterSpacing: "0.05em", textTransform: "uppercase", color: GREY, marginBottom: 10,
          }}>
            O que ficou para trás
          </div>

          {dosesEmAtraso > 0 && (
            <button
              onClick={() => onAbrirSemana(todayKey)}
              style={{ ...linhaAtraso, marginBottom: atrasados.length > 0 ? 6 : 0 }}
            >
              <AlertCircle size={16} strokeWidth={2.4} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                {dosesEmAtraso === 1
                  ? "1 dose sem marcação"
                  : `${dosesEmAtraso} doses sem marcação`}
              </span>
              <ChevronRight size={16} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            </button>
          )}

          {atrasados.length > 0 && (
            <button
              onClick={() => onAbrirSemana(atrasados.slice().sort((a, b) => (a.data > b.data ? 1 : -1))[0].data)}
              style={linhaAtraso}
            >
              <AlertCircle size={16} strokeWidth={2.4} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                {atrasados.length === 1
                  ? "1 compromisso passou da data sem ser marcado como feito"
                  : `${atrasados.length} compromissos passaram da data sem serem marcados como feitos`}
              </span>
              <ChevronRight size={16} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            </button>
          )}
        </div>
      )}

    <div style={{ ...cardStyle, padding: "18px 18px 16px", marginBottom: 14 }}>
      <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
        Hoje
      </div>

      {hoje.length === 0 ? (
        <div style={{ fontSize: 12.5, color: GREY }}>Nada marcado para hoje.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: compromissosHoje.length || proximo ? 10 : 0 }}>
          {/* Falta fazer usa exatamente o estilo de "em atraso" do quadro da
              semana — mesma constante, para as duas telas não divergirem.
              Zerado: verde quando é conquista (todas as doses dadas), neutro
              quando é só ausência (nenhum compromisso marcado). */}
          <ResumoTile
            valor={remediosPendentes.length}
            rotulo={
              remediosPendentes.length === 0
                ? "todas as doses de hoje dadas"
                : remediosPendentes.length === 1 ? "dose ainda pendente" : "doses ainda pendentes"
            }
            cor={remediosPendentes.length > 0 ? STATUS_STYLE.late.fg : TEAL}
            fundo={remediosPendentes.length > 0 ? STATUS_STYLE.late.bg : "rgba(59,110,100,0.09)"}
            onClick={remediosPendentes.length > 0 ? () => onAbrirSemana(todayKey, "doses") : undefined}
          />
          <ResumoTile
            valor={compromissosHoje.length}
            rotulo={compromissosHoje.length === 1 ? "compromisso hoje" : "compromissos hoje"}
            cor={compromissosHoje.length > 0 ? STATUS_STYLE.late.fg : GREY}
            fundo={compromissosHoje.length > 0 ? STATUS_STYLE.late.bg : "rgba(42,42,42,0.05)"}
            onClick={compromissosHoje.length > 0 ? () => onAbrirSemana(todayKey, "compromissos") : undefined}
          />
        </div>
      )}

      {proximo && (
        <button
          onClick={() => onAbrirSemana(proximo.data)}
          style={{
            width: "100%", textAlign: "left", border: "none", background: "rgba(42,42,42,0.04)",
            borderRadius: 12, padding: "10px 12px", cursor: "pointer", marginTop: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: GREY, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Próximo</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginTop: 2 }}>
                {agendaTitulo(proximo)} · {daysUntilLabel(proximo.data, todayKey).toLowerCase()}
              </div>
              {jejumInfo(proximo) && (
                <div style={{ fontSize: 10.5, color: TERRACOTTA, marginTop: 2 }}>{jejumInfo(proximo).texto}</div>
              )}
            </div>
            <ChevronRight size={16} color={GREY} strokeWidth={2.4} style={{ marginTop: 2, flexShrink: 0 }} />
          </div>
        </button>
      )}

    </div>
    </>
  );
}

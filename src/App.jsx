import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  HeartPulse, BookOpen, FolderOpen,
  Droplet, UtensilsCrossed, Smile, Waves, Syringe, Palette, Cat,
  ExternalLink, Info, Stethoscope, Calendar, Plus, X, Bell, ChevronRight,
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { subscribeToPush, syncSchedule, getPushStatus, pushSupported } from "./push.js";
import { getStorageEstimate } from "./storage.js";
import { track } from "@vercel/analytics/react";
import { TEAL, TERRACOTTA, INK, CREAM, SAND, GREY } from "./theme.js";
import { MonthCalendar, WeekOverview, DayPanel, TodaySummary } from "./AgendaCalendar.jsx";
import {
  dateKeyFromDate, addDays, addMonths, startOfWeek, monthKeyOf, medOccursOn, medStatus,
  medHorarios, medFrequencia, medFrequenciaLabel, medCheckKey, agendaStatus, agendaTitulo,
  agendaExames, agendaTipos, doseLabel, medAvisar, medAvisoMinutos, avisoLabel,
  explicaAvisoRemedio, AVISO_MED_OPCOES, normalizeNotifPrefs, DEFAULT_NOTIF_PREFS,
  jejumInfo, daysUntilLabel as agendaDaysUntilLabel, normalizeLembretes,
  lembretesLabel, formatDuration, WEEKDAY_SHORT,
  DEFAULT_LEMBRETES, DIAS_ANTES_OPCOES, MINUTOS_ANTES_OPCOES,
  JEJUM_HORAS_OPCOES, JEJUM_MINUTOS_MED_OPCOES,
} from "./agendaLogic.js";

// Data local do aparelho — toISOString() devolveria o dia seguinte a partir
// das 21h no horário de Brasília, bagunçando "hoje" no diário e na agenda.
function todayKey() {
  return dateKeyFromDate(new Date());
}

const EMPTY_AGENDA_ITEM = {
  tipos: [], exames: [], data: "", horario: "", obs: "",
  jejum: false, jejumHoras: 8, lembretes: DEFAULT_LEMBRETES, concluido: false,
};

const EMPTY_RECORRENTE = {
  nome: "", dose: "", doseUnidade: "mg", horarios: [""], frequencia: "24h",
  dias: [0, 1, 2, 3, 4, 5, 6], duracao: "continuo", dataInicio: todayKey(), dataFim: "",
  jejum: false, jejumMinutos: 60, avisar: true, avisoMinutosAntes: 0, obs: "",
};

const HORARIOS_SUGERIDOS = ["07:00", "08:00", "12:00", "18:00", "20:00", "22:00"];
const TIPOS_SUGERIDOS = ["Consulta", "Exame de sangue", "Exame de urina", "Ultrassom", "Fluidoterapia"];
const DOSE_UNIDADES = ["mg", "g", "ml"];

const FREQ_LABEL = { "24h": "24h", "48h": "48h", dias: "Dias fixos" };
const FREQ_VALUE = { "24h": "24h", "48h": "48h", "Dias fixos": "dias" };

// Resumos mostrados na linha "Detalhes" — o que está guardado na segunda
// etapa continua visível na primeira, em uma linha.
function resumoCompromisso(item) {
  const partes = [item.horario || "sem horário"];
  if (item.exames.length) partes.push(`${item.exames.length} exame${item.exames.length > 1 ? "s" : ""}`);
  if (item.jejum) partes.push(`jejum de ${item.jejumHoras}h`);
  partes.push(`avisa ${lembretesLabel(item.lembretes)}`);
  return partes.join(" · ");
}

function resumoRemedio(med) {
  const horarios = med.horarios.filter(Boolean);
  const partes = [];
  if (doseLabel(med)) partes.push(doseLabel(med));
  partes.push(horarios.length ? horarios.join(" · ") : "sem horário");
  if (med.frequencia === "dias") {
    partes.push(med.dias.length === 7
      ? "todos os dias"
      : med.dias.slice().sort().map((d) => WEEKDAY_SHORT[d]).join(", ") || "nenhum dia");
  }
  if (med.jejum) partes.push(`jejum de ${formatDuration(med.jejumMinutos)}`);
  partes.push(avisoLabel(med));
  if (med.duracao === "determinado" && med.dataFim) {
    partes.push(`até ${new Date(med.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}`);
  }
  return partes.join(" · ");
}

function compressImage(file, maxWidth = 360, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downloadPdf(node, filename) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

function WaterBowl({ level }) {
  // level: 0 (menos) | 1 (normal) | 2 (mais) -> fill height
  const fillPct = level === 0 ? 28 : level === 2 ? 88 : 58;
  return (
    <svg width="84" height="70" viewBox="0 0 120 100">
      <ellipse cx="60" cy="82" rx="52" ry="12" fill="#E2D9C8" />
      <path d="M14 40 Q14 78 60 78 Q106 78 106 40 Z" fill="#fff" stroke="#D8CFC0" strokeWidth="2" />
      <clipPath id="bowlClip">
        <path d="M14 40 Q14 78 60 78 Q106 78 106 40 Z" />
      </clipPath>
      <g clipPath="url(#bowlClip)">
        <rect x="10" y={78 - fillPct * 0.6} width="100" height="60" fill={TEAL} opacity="0.85">
          <animate attributeName="y" from="78" to={78 - fillPct * 0.6} dur="0.6s" fill="freeze" />
        </rect>
      </g>
      <ellipse cx="60" cy="40" rx="46" ry="8" fill="none" stroke="#D8CFC0" strokeWidth="2" />
    </svg>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{
      display: "flex", gap: 3, background: "rgba(42,42,42,0.04)", padding: 4, borderRadius: 999,
      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
    }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              flex: 1,
              padding: "9px 8px",
              borderRadius: 999,
              border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? INK : "#9C9789",
              fontWeight: active ? 700 : 500,
              fontSize: 12.5,
              cursor: "pointer",
              boxShadow: active ? "0 3px 8px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.22s cubic-bezier(.4,0,.2,1)",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ChipToggle({ active, onClick, children, color = TERRACOTTA }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 11px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
        border: active ? "none" : "1px solid rgba(42,42,42,0.1)",
        background: active ? `${color}22` : "transparent",
        color: active ? color : GREY,
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

// Antecedência dos avisos: um ou mais dias antes, e quanto antes na hora.
function LembretesPicker({ value, onChange }) {
  const lembretes = value || { diasAntes: [], minutosAntes: 60 };
  const toggleDia = (d) => {
    const dias = lembretes.diasAntes.includes(d)
      ? lembretes.diasAntes.filter((x) => x !== d)
      : [...lembretes.diasAntes, d].sort((a, b) => a - b);
    onChange({ ...lembretes, diasAntes: dias });
  };

  return (
    <div>
      <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Avisar com dias de antecedência</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {DIAS_ANTES_OPCOES.map((d) => (
          <ChipToggle key={d} active={lembretes.diasAntes.includes(d)} onClick={() => toggleDia(d)} color={TEAL}>
            {d === 1 ? "1 dia antes" : d === 7 ? "1 semana antes" : `${d} dias antes`}
          </ChipToggle>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: GREY, marginBottom: 12 }}>
        {lembretes.diasAntes.length === 0
          ? "Nenhum aviso antecipado — só no dia."
          : `Você recebe um aviso ${lembretes.diasAntes.map((d) => (d === 1 ? "1 dia" : `${d} dias`)).join(" e ")} antes, além do aviso no dia.`}
      </div>

      <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>E no dia, avisar antes do horário</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MINUTOS_ANTES_OPCOES.map((m) => (
          <ChipToggle key={m} active={lembretes.minutosAntes === m} onClick={() => onChange({ ...lembretes, minutosAntes: m })} color={TEAL}>
            {formatDuration(m)} antes
          </ChipToggle>
        ))}
      </div>
    </div>
  );
}

// Folha modal que sobe de baixo — mantém o cadastro fora do caminho até
// alguém pedir por ele. O zIndex permite empilhar a folha de detalhes.
function Sheet({ title, subtitle, onClose, children, zIndex = 60 }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.5)", zIndex, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: CREAM, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto",
          borderRadius: "24px 24px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(42,42,42,0.15)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 16 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: GREY, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ border: "none", background: "rgba(42,42,42,0.06)", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: GREY }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Linha que abre a folha de detalhes, resumindo o que já está configurado
// para nada ficar escondido atrás dela.
function DetalhesRow({ resumo, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        background: "#fff", border: "1px solid rgba(42,42,42,0.08)", borderRadius: 16,
        padding: "14px 16px", cursor: "pointer", textAlign: "left", marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, color: INK }}>Detalhes</div>
        <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{resumo}</div>
      </div>
      <ChevronRight size={18} color={GREY} style={{ flexShrink: 0 }} />
    </button>
  );
}

// Como cada resposta do diário se posiciona em relação ao normal. Só descreve
// o que foi registrado — a leitura clínica segue com o veterinário.
const SINAIS = [
  { campo: "agua", rotulo: "Água", neutro: "Normal", abaixo: "Menos" },
  { campo: "apetite", rotulo: "Apetite", neutro: "Normal", abaixo: "Menos" },
  { campo: "humor", rotulo: "Humor", neutro: "Tranquilo", abaixo: "Quieto" },
  { campo: "urina", rotulo: "Urina", neutro: "Normal", abaixo: "Menos" },
];

const SINAL_CORES = {
  neutro: { bg: "rgba(59,110,100,0.18)", label: "como o normal" },
  acima: { bg: "rgba(59,110,100,0.40)", label: "mais que o normal" },
  abaixo: { bg: "rgba(196,98,45,0.42)", label: "menos que o normal" },
  vazio: { bg: "rgba(42,42,42,0.05)", label: "sem registro" },
};

function sinalEstado(entry, sinal) {
  if (!entry) return "vazio";
  const v = entry[sinal.campo];
  if (!v) return "vazio";
  if (v === sinal.neutro) return "neutro";
  if (v === sinal.abaixo) return "abaixo";
  return "acima";
}

// Faixa dos últimos dias: cada linha é uma pergunta do diário, cada coluna um
// dia. É a leitura que nenhuma das duas abas antigas dava sozinha.
function SinaisTimeline({ dias, entries }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: dias.length * 14 + 70 }}>
        {SINAIS.map((sinal) => (
          <div key={sinal.campo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <div style={{ width: 62, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: INK }}>{sinal.rotulo}</div>
            <div style={{ display: "flex", gap: 2, flex: 1 }}>
              {dias.map((d) => {
                const estado = sinalEstado(entries[d], sinal);
                return (
                  <div
                    key={d}
                    title={`${new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${sinal.rotulo}: ${entries[d] && entries[d][sinal.campo] ? entries[d][sinal.campo] : "sem registro"}`}
                    style={{ flex: 1, minWidth: 12, height: 17, borderRadius: 4, background: SINAL_CORES[estado].bg }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <div style={{ width: 62, flexShrink: 0 }} />
          <div style={{ display: "flex", justifyContent: "space-between", flex: 1, fontSize: 9, color: GREY }}>
            <span>{new Date(dias[0] + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
            <span>hoje</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <Icon size={14} color={TEAL} strokeWidth={2.2} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: TEAL }}>{children}</span>
    </div>
  );
}

// Pills sequenced by the emotional/practical journey (Cap. 1), never by clinical stage.
const EARLY_PILLS = [
  "É normal sentir que a informação é demais nos primeiros dias. Você não precisa entender tudo hoje.",
  "O diagnóstico muda a rotina, não muda o gato. Ele continua sendo o mesmo bicho de sempre.",
  "Tente não mudar tudo de uma vez essa semana. Rotina nova vira hábito aos poucos, não de uma vez.",
  "Espalhar potes de água por cômodos diferentes já ajuda — pequeno ajuste, sem nenhuma pressa.",
  "Uma caixinha de areia extra facilita bastante se ele estiver urinando mais.",
  "Anotar o que você observa (sem interpretar) já é a parte mais importante que você pode fazer agora.",
  "Se puder, leve por escrito suas dúvidas para próxima consulta — é fácil esquecer metade na hora.",
  "Culpa por não ter percebido antes é comum e quase nunca justa — os sinais costumam ser sutis mesmo.",
  "Já pensou em montar uma reserva mensal para o cuidado dele? Só o valor de uma consulta por mês já ajuda.",
  "Converse com outro tutor que passa por isso, se puder. Alivia mais do que qualquer texto.",
];
const GENERAL_PILLS = [
  "Fontes de água corrente costumam atrair mais gato renal que pote parado — vale testar.",
  "Se tem mais de um gato em casa, observe se ele acessa água e areia sem disputa.",
  "Um resumo de uma página (horários, telefone do vet) ajuda muito se alguém mais cuidar dele um dia.",
  "Buscar uma segunda opinião veterinária não é falta de lealdade — é cuidado, se algo não estiver fluindo.",
  "Vale preencher a escala de qualidade de vida periodicamente e levar para o veterinário conversar sobre ela.",
  "Luto antecipatório é real e válido, mesmo com o gato bem. Não significa que você está desistindo.",
  "Grupos de tutores de gato renal costumam responder com generosidade genuína — vale participar.",
  "Reavalie o orçamento do cuidado de tempos em tempos — custo muda conforme a rotina muda.",
  "Explique para crianças da casa com frase simples: 'o gatinho precisa de mais cuidado, e vamos ajudar juntos'.",
  "Você não precisa ser um tutor perfeito. Presente já é o suficiente.",
];

function getPhase(daysSince) {
  if (daysSince === null) return null;
  if (daysSince <= 3) return { n: 1, label: "Fase 1 · O choque", desc: "Os primeiros dias são para respirar, não para resolver tudo." };
  if (daysSince <= 14) return { n: 2, label: "Fase 2 · A confusão", desc: "Vá ajustando aos poucos — tentar tudo de uma vez costuma cansar mais." };
  return { n: 3, label: "Fase 3 · A adaptação", desc: "A rotina já começa a virar hábito, não mais um projeto especial." };
}

function getPill(daysSince) {
  if (daysSince === null) return EARLY_PILLS[0];
  if (daysSince <= 14) return EARLY_PILLS[daysSince % EARLY_PILLS.length];
  return GENERAL_PILLS[daysSince % GENERAL_PILLS.length];
}

const QOL_GUIDANCE = {
  dor: "Respiração tranquila, ausência de gemidos ou postura curvada, e capacidade de relaxar.",
  fome: "Capacidade e vontade de comer sozinho, mesmo que seja ração úmida ou sachê.",
  hidratacao: "Elasticidade da pele da nuca e mucosas coradas — sinais que seu veterinário pode te ensinar a observar.",
  higiene: "Pelo limpo e capacidade de usar a caixa de areia sem se sujar.",
  felicidade: "Demonstração de afeto, ronronar, reação à família e interesse pelo ambiente.",
  mobilidade: "Autonomia para se levantar e caminhar até a água ou a caixa de areia sem quedas.",
  diasBons: "Saldo dos últimos 7 a 14 dias — mais momentos tranquilos do que difíceis.",
};

const GLOSSARIO = [
  { termo: "Creatinina", def: "Substância medida no sangue que ajuda a estimar como os rins estão filtrando. É um dos exames mais comuns para acompanhar a doença renal." },
  { termo: "Ureia", def: "Outro marcador medido no sangue, avaliado junto com a creatinina para entender a função renal." },
  { termo: "SDMA", def: "Exame mais recente que ajuda a identificar alteração renal, às vezes antes da creatinina mudar." },
  { termo: "Proteinúria", def: "Presença de proteína na urina, um dado que o veterinário usa junto com outros exames." },
  { termo: "Estágio (IRIS)", def: "Sistema usado por veterinários para classificar a fase da doença renal, de 1 a 4, com base em exames." },
  { termo: "Isostenúria", def: "Termo que aparece em laudo de urina, relacionado à capacidade dos rins de concentrar a urina." },
];

const ARTIGOS = [
  {
    titulo: "Como organizar a primeira semana depois do diagnóstico",
    resumo: "Um roteiro simples para os primeiros dias: o que priorizar, o que pode esperar, e por que não dá — nem precisa — resolver tudo de uma vez.",
    corpo: "Os primeiros dias depois do diagnóstico costumam ser os mais confusos. A tentação é pesquisar tudo, mudar tudo e controlar tudo ao mesmo tempo — mas isso raramente é sustentável, e menos ainda necessário.\n\nComece pelo básico: água acessível em mais de um ponto da casa, uma caixa de areia extra se ele estiver urinando mais, e um lugar tranquilo para descansar. Isso já cobre boa parte do que realmente importa nessa fase.\n\nDeixe para depois: decidir a ração definitiva, montar uma rotina perfeita de horários, ou entender cada termo técnico do exame. Nada disso precisa ser resolvido esta semana. O que ajuda mais agora é ter uma próxima consulta marcada e uma lista de dúvidas anotada para levar.\n\nSe puder, peça para alguém de confiança ficar a par do que está acontecendo — só o fato de dividir a informação já tira um pouco do peso de carregar tudo sozinho."
  },
  {
    titulo: "Como pedir ajuda sem se sentir culpado",
    resumo: "Formas práticas de dividir o cuidado com quem mora com você, e por que aceitar ajuda não é fraqueza.",
    corpo: "Cuidar de um gato com doença crônica é trabalho de verdade, mesmo que pareça pequeno de fora — anotar, observar, lembrar horário, ir a consulta. Dividir isso com quem mora com você não é terceirizar a responsabilidade, é sustentar o cuidado no longo prazo.\n\nUma forma prática: em vez de pedir 'me ajuda com o gato', peça algo específico — 'você consegue lembrar de dar a ração das 20h essa semana?' ou 'pode vir comigo na próxima consulta?'. Pedidos específicos são mais fáceis de aceitar e de cumprir do que um pedido genérico de ajuda.\n\nSe você mora sozinho, vale pensar em quem poderia ser acionado em um dia ruim — um vizinho, um amigo, alguém do grupo de tutores. Ter esse nome definido de antemão poupa energia justamente no momento em que menos sobra energia para decidir.\n\nAceitar ajuda não diminui o quanto você se importa. Pelo contrário: sustenta o cuidado por mais tempo, com menos desgaste."
  },
  {
    titulo: "Conversas difíceis: falando sobre a doença com visita e família",
    resumo: "Frases prontas para quando alguém pergunta \"mas ele não parece doente\" ou minimiza o que você está vivendo.",
    corpo: "É comum ouvir 'mas ele está tão bem' ou 'não parece doente' de quem não convive com a rotina de perto. Não é má intenção — geralmente é só falta de contexto sobre como a doença se manifesta.\n\nUma resposta simples costuma funcionar melhor que uma explicação longa: 'Por fora ele está bem, mas por dentro os rins não funcionam como antes — por isso a rotina que a gente segue.' Isso valida o que a pessoa está vendo sem precisar convencê-la de nada.\n\nSe alguém minimizar o peso emocional ('é só um bicho'), você não precisa disputar. Uma frase como 'para mim faz diferença, e tá tudo bem se para você não fizer' encerra a conversa sem conflito.\n\nCom crianças da casa, frases curtas funcionam melhor que explicação técnica: 'o gatinho precisa de mais cuidado agora, e a gente vai cuidar dele juntos' — sem prometer o que não se pode garantir, mas sem antecipar medo desnecessário também."
  },
  {
    titulo: "Quando o veterinário e você não se entendem",
    resumo: "Sinais de que vale buscar uma segunda opinião, e como fazer essa transição sem culpa.",
    corpo: "A relação com o veterinário é central nessa jornada — e às vezes ela simplesmente não flui bem, por motivos que não têm a ver com competência técnica.\n\nAlguns sinais de que vale considerar uma segunda opinião: você sai da consulta sempre confusa sobre o que fazer; suas perguntas parecem incomodar em vez de serem bem recebidas; ou você sente que está sendo tratado como número, não como alguém que conhece o gato de perto.\n\nBuscar outro profissional não é deslealdade nem exagero. Bons veterinários entendem que a relação de confiança importa tanto quanto o conhecimento técnico, e não se ofendem quando um tutor busca a opinião que faz mais sentido para ele.\n\nSe estiver em dúvida, uma consulta avulsa com outro profissional, sem cortar o vínculo com o atual, já ajuda a comparar sem precisar tomar uma decisão definitiva na hora."
  },
  {
    titulo: "Guardando registros sem virar obsessão",
    resumo: "Como manter o hábito de observação leve, em vez de medir cada detalhe com ansiedade.",
    corpo: "Registrar água, apetite e humor todo dia ajuda — mas existe um ponto em que a observação vira vigilância ansiosa, e isso cansa mais do que protege.\n\nNa primeira semana, é normal (e até esperado) anotar tudo com lupa. Com o tempo, o objetivo é conhecer o padrão do seu gato o suficiente para notar só o que realmente foge do normal — não cada oscilação do dia.\n\nUm sinal de que vale dar um passo atrás: se checar o gato várias vezes ao dia está gerando mais ansiedade do que segurança, ou se um dia de anotação incompleta te deixa em pânico. Registro é ferramenta de apoio, não obrigação rígida.\n\nSe um dia você esquecer de anotar, não tem problema. O hábito existe para te ajudar a ter mais tranquilidade — se ele está fazendo o oposto, vale ajustar a forma como você usa, não abandonar o gato à própria sorte por conta disso."
  },
  {
    titulo: "Como a doença costuma evoluir (visão geral, sem entrar no clínico)",
    resumo: "Um panorama de como a doença renal crônica costuma se comportar ao longo do tempo — para você entender o contexto, sem virar interpretação clínica.",
    corpo: "A doença renal crônica é, como o nome diz, progressiva — ela tende a evoluir aos poucos, não de forma repentina na maioria dos casos. Isso significa que o ritmo varia muito de gato para gato: alguns ficam estáveis por anos, outros progridem mais rápido.\n\nÉ por isso que exames periódicos importam tanto. Eles não servem só para confirmar o diagnóstico — servem para acompanhar a tendência ao longo do tempo, o que ajuda o veterinário a ajustar o plano de cuidado conforme necessário.\n\nComo tutor, o que cabe a você é acompanhar o dia a dia (apetite, água, humor, disposição) e levar essa informação para consulta — não interpretar sozinho se um número específico do exame significa piora ou melhora. Essa leitura é do seu veterinário, que tem o histórico completo e o exame físico como referência.\n\nSe quiser entender com mais profundidade como a doença se classifica e progride, essa é uma boa pergunta para levar direto ao seu veterinário — ele conhece o histórico do seu gato e pode explicar com precisão o que se aplica ao caso específico dele."
  },
  {
    titulo: "Boas práticas de bem-estar no dia a dia",
    resumo: "Um resumo prático do que realmente ajuda no conforto do gato — ambiente, rotina e observação, sem nada que dependa de decisão clínica.",
    corpo: "Boa parte do que melhora o dia a dia de um gato renal não depende de nenhuma decisão médica — depende de ajustes simples no ambiente da casa.\n\nÁgua: espalhe potes por cômodos diferentes, longe da comida. Fontes de água corrente costumam atrair mais que pote parado.\n\nAreia: se ele está urinando mais, uma caixinha extra facilita a vida dele e a sua.\n\nDescanso: um cantinho tranquilo, longe do movimento da casa, ajuda o gato a se sentir seguro quando não está bem.\n\nObservação: notar (sem interpretar) como ele está comendo, bebendo e se comportando é a informação mais valiosa que você pode levar para consulta.\n\nRotina: horário fixo para tudo que se repete — remédio, alimentação — reduz a chance de esquecimento e ajuda o gato a se acostumar.\n\nNenhuma dessas práticas substitui o acompanhamento veterinário — elas só tornam o dia a dia mais leve enquanto esse acompanhamento acontece."
  },
];

const BACKUP_KEYS = [
  "diary-entries", "qol-scores", "budget-data", "exames-data", "gastos-data",
  "peso-fotos-data", "agenda-data", "recorrentes-data", "recorrentes-checks-data",
  "profile-data", "diario-intro-seen", "notif-prefs-data",
];

export default function App() {
  const [tab, setTab] = useState("checkin");
  const [checkinView, setCheckinView] = useState("Hoje");
  const [registrosView, setRegistrosView] = useState("Exames");
  const [selectedDiaryDate, setSelectedDiaryDate] = useState(todayKey());
  const [diaryHistoryLimit, setDiaryHistoryLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState({});
  const [qol, setQol] = useState({});
  const [budget, setBudget] = useState({ items: [], reservaMensal: 100, meses: 0 });
  const [exames, setExames] = useState([]);
  const [novoExame, setNovoExame] = useState({ data: "", tipo: "", valor: "", obs: "", foto: null });
  const [editingExameIndex, setEditingExameIndex] = useState(null);
  const [deleteExameIndex, setDeleteExameIndex] = useState(null);
  const exameFormRef = useRef(null);
  const [gastos, setGastos] = useState([]);
  const [novoGasto, setNovoGasto] = useState({ data: todayKey(), categoria: "Ração", valor: "", frequencia: "Não se repete", vezesPorSemana: 1 });
  const [editingGastoIndex, setEditingGastoIndex] = useState(null);
  const [deleteGastoIndex, setDeleteGastoIndex] = useState(null);
  const gastoFormRef = useRef(null);
  const [registrosPeso, setRegistrosPeso] = useState([]);
  const [novoPeso, setNovoPeso] = useState({ data: todayKey(), peso: "", foto: null });
  const [uploading, setUploading] = useState(false);
  const [agendaItems, setAgendaItems] = useState([]);
  const [novoAgendaItem, setNovoAgendaItem] = useState(EMPTY_AGENDA_ITEM);
  const [editingAgendaId, setEditingAgendaId] = useState(null);
  const [recorrentes, setRecorrentes] = useState([]);
  const [recorrenteChecks, setRecorrenteChecks] = useState({});
  const [editingRecorrenteId, setEditingRecorrenteId] = useState(null);
  const [novoRecorrente, setNovoRecorrente] = useState(EMPTY_RECORRENTE);
  // Visões da agenda: mês (calendário), semana (cumprido/atraso) e lista.
  const [agendaView, setAgendaView] = useState("Semana");
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [calendarMonth, setCalendarMonth] = useState(monthKeyOf(todayKey()));
  const [weekStart, setWeekStart] = useState(startOfWeek(todayKey()));
  const [sheet, setSheet] = useState(null); // null | "menu" | "compromisso" | "remedio" | "notif"
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(DEFAULT_NOTIF_PREFS);
  const [novoExameNome, setNovoExameNome] = useState("");
  const [novoTipoNome, setNovoTipoNome] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [medSavedMsg, setMedSavedMsg] = useState("");
  const [showDiarioIntro, setShowDiarioIntro] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [draftProfile, setDraftProfile] = useState({ nome: "", idade: "", dataDiagnostico: "", estagio: "", vetNome: "", vetTelefone: "", rotinaHorarios: "", contatoEmergencia: "" });
  const [showReport, setShowReport] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(null);
  const reportRef = useRef(null);
  const manualRef = useRef(null);
  const [openQolInfo, setOpenQolInfo] = useState(null);
  const [openArtigo, setOpenArtigo] = useState(null);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushError, setPushError] = useState("");
  const [storageNotice, setStorageNotice] = useState(null);
  const [lastBackupDate, setLastBackupDate] = useState(null);
  const [backupReminderSnoozedUntil, setBackupReminderSnoozedUntil] = useState(null);
  const [backupMsg, setBackupMsg] = useState("");
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const backupFileInputRef = useRef(null);

  const examGroups = {};
  exames.forEach((ex) => {
    const key = (ex.tipo || "Outro").trim().toLowerCase();
    if (!examGroups[key]) examGroups[key] = { label: ex.tipo || "Outro", items: [] };
    examGroups[key].items.push(ex);
  });
  Object.values(examGroups).forEach((g) => g.items.sort((a, b) => (a.data < b.data ? 1 : -1)));

  const gastosPorMes = {};
  gastos.forEach((g) => {
    if (!g.data) return;
    const mesKey = g.data.slice(0, 7);
    gastosPorMes[mesKey] = (gastosPorMes[mesKey] || 0) + (Number(g.valor) || 0);
  });
  const chartMes = Object.keys(gastosPorMes)
    .sort()
    .slice(-6)
    .map((k) => ({
      mes: new Date(k + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short" }),
      total: Math.round(gastosPorMes[k] * 100) / 100,
    }));

  const gastosPorCategoria = {};
  gastos.forEach((g) => {
    const cat = g.categoria || "Outro";
    gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + (Number(g.valor) || 0);
  });
  const chartCategoria = Object.keys(gastosPorCategoria).map((k) => ({
    categoria: k,
    total: Math.round(gastosPorCategoria[k] * 100) / 100,
  }));
  const totalGastoGeral = gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0);

  // Projeção de gastos recorrentes: pega o registro mais recente de cada categoria marcada como recorrente
  const recorrentesPorCategoria = {};
  [...gastos]
    .filter((g) => g.frequencia && g.frequencia !== "Não se repete")
    .sort((a, b) => (a.data > b.data ? 1 : -1))
    .forEach((g) => {
      recorrentesPorCategoria[g.categoria || "Outro"] = g;
    });
  const projecaoItens = Object.values(recorrentesPorCategoria).map((g) => {
    const valor = Number(g.valor) || 0;
    const mensal = g.frequencia === "Semanal" ? valor * (Number(g.vezesPorSemana) || 1) * 4 : valor;
    return { categoria: g.categoria, frequencia: g.frequencia, vezesPorSemana: g.vezesPorSemana, mensal };
  });
  const projecaoTotal = projecaoItens.reduce((s, it) => s + it.mensal, 0);

  const sortedDates = Object.keys(entries).sort((a, b) => (a < b ? 1 : -1));

  const sortedAgenda = [...agendaItems].sort((a, b) => (a.data > b.data ? 1 : -1));

  function buildWhatsAppLink(text, phone) {
    const encoded = encodeURIComponent(text);
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length >= 10) {
      const withCountry = digits.length <= 11 ? `55${digits}` : digits;
      return `https://wa.me/${withCountry}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
  }
  function daysUntilLabel(dateStr) {
    return agendaDaysUntilLabel(dateStr, today);
  }
  const last7Dates = sortedDates.slice(0, 7);
  const hidratacaoOk = last7Dates.filter((d) => entries[d].agua === "Normal" || entries[d].agua === "Mais").length;

  const today = todayKey();
  const selectedEntry = entries[selectedDiaryDate] || { agua: "Normal", apetite: "Normal", humor: "Tranquilo", urina: "Normal", nota: "" };
  const isEditingToday = selectedDiaryDate === today;

  const agendaGroups = { late: [], today: [], future: [], done: [] };
  sortedAgenda.forEach((it) => agendaGroups[agendaStatus(it, today)].push(it));
  agendaGroups.late.reverse();
  agendaGroups.done.reverse();

  // Marcadores do calendário: só o suficiente para o dia "falar" de longe.
  // Dose sem marcação só aparece em vermelho na semana corrente — mais atrás
  // que isso o histórico vira um paredão de alerta que não ajuda ninguém.
  const limiteAtrasoRemedio = addDays(today, -7);
  function marksForDay(key) {
    const compromissosDoDia = agendaItems.filter((it) => it.data === key);
    const remediosDoDia = recorrentes.filter((med) => medOccursOn(med, key));
    const statusRemedios = remediosDoDia.map((med) => medStatus(med, key, recorrenteChecks, today));
    const statusCompromissos = compromissosDoDia.map((it) => agendaStatus(it, today));
    return {
      compromissos: compromissosDoDia.length,
      compromissoLate: statusCompromissos.includes("late"),
      compromissosDone: compromissosDoDia.length > 0 && statusCompromissos.every((s) => s === "done"),
      remedios: remediosDoDia.length,
      remedioLate: key >= limiteAtrasoRemedio && statusRemedios.includes("late"),
      remediosDone: remediosDoDia.length > 0 && statusRemedios.every((s) => s === "done"),
    };
  }

  useEffect(() => {
    track("view_tab", { tab });
  }, [tab]);

  useEffect(() => {
    async function load() {
      try {
        const e = await window.storage.get("diary-entries");
        if (e) setEntries(JSON.parse(e.value));
      } catch (err) {}
      try {
        const q = await window.storage.get("qol-scores");
        if (q) setQol(JSON.parse(q.value));
      } catch (err) {}
      try {
        const b = await window.storage.get("budget-data");
        if (b) setBudget(JSON.parse(b.value));
      } catch (err) {}
      try {
        const ex = await window.storage.get("exames-data");
        if (ex) setExames(JSON.parse(ex.value));
      } catch (err) {}
      try {
        const g = await window.storage.get("gastos-data");
        if (g) setGastos(JSON.parse(g.value));
      } catch (err) {}
      try {
        const rp = await window.storage.get("peso-fotos-data");
        if (rp) setRegistrosPeso(JSON.parse(rp.value));
      } catch (err) {}
      try {
        const ag = await window.storage.get("agenda-data");
        if (ag) setAgendaItems(JSON.parse(ag.value));
      } catch (err) {}
      try {
        const rec = await window.storage.get("recorrentes-data");
        if (rec) setRecorrentes(JSON.parse(rec.value));
      } catch (err) {}
      try {
        const rc = await window.storage.get("recorrentes-checks-data");
        if (rc) setRecorrenteChecks(JSON.parse(rc.value));
      } catch (err) {}
      try {
        const np = await window.storage.get("notif-prefs-data");
        if (np) setNotifPrefs(normalizeNotifPrefs(JSON.parse(np.value)));
      } catch (err) {}
      try {
        const p = await window.storage.get("profile-data");
        if (p) setProfile(JSON.parse(p.value));
        else { setShowOnboarding(true); setOnboardingStep(0); }
      } catch (err) {
        setShowOnboarding(true);
      }
      try {
        const di = await window.storage.get("diario-intro-seen");
        if (!di) setShowDiarioIntro(true);
      } catch (err) {
        setShowDiarioIntro(true);
      }
      try {
        const lb = await window.storage.get("backup-last-export");
        if (lb && lb.value) setLastBackupDate(lb.value);
      } catch (err) {}
      try {
        const sn = await window.storage.get("backup-reminder-snoozed-until");
        if (sn && sn.value) setBackupReminderSnoozedUntil(sn.value);
      } catch (err) {}
      setLoading(false);
    }
    load();

    if (pushSupported()) {
      getPushStatus().then(setPushStatus);
    } else {
      setPushStatus("unsupported");
    }
  }, []);

  async function handleEnableNotifications() {
    setPushStatus("loading");
    setPushError("");
    try {
      await subscribeToPush();
      setPushStatus("subscribed");
      syncSchedule(profile && profile.nome, agendaItems, recorrentes);
    } catch (err) {
      setPushStatus("error");
      setPushError(err.message || "Não foi possível ativar as notificações.");
    }
  }

  async function persist(key, value) {
    try {
      await window.storage.set(key, value);
      setStorageNotice((n) => (n && n.type === "error" ? null : n));
      return true;
    } catch (err) {
      setStorageNotice({
        type: "error",
        message: "Não foi possível salvar — o armazenamento do app está cheio. Exporte um backup e remova fotos antigas.",
      });
      return false;
    }
  }

  function checkStorageBeforeUpload() {
    const { percentUsed } = getStorageEstimate();
    if (percentUsed >= 0.8) {
      setStorageNotice({
        type: "warning",
        message: `O armazenamento do app está quase cheio (${Math.round(percentUsed * 100)}% usado). Exporte um backup e remova fotos antigas antes de adicionar mais.`,
      });
    }
  }

  async function saveEntries(next) {
    setEntries(next);
    if (await persist("diary-entries", JSON.stringify(next))) flashSaved();
  }

  async function saveQol(next) {
    setQol(next);
    if (await persist("qol-scores", JSON.stringify(next))) flashSaved();
  }

  async function saveBudget(next) {
    setBudget(next);
    if (await persist("budget-data", JSON.stringify(next))) flashSaved();
  }

  async function saveProfile(next) {
    setProfile(next);
    await persist("profile-data", JSON.stringify(next));
    setShowOnboarding(false);
  }

  async function saveExames(next) {
    setExames(next);
    if (await persist("exames-data", JSON.stringify(next))) flashSaved();
  }

  function startEditExame(index) {
    const ex = exames[index];
    if (!ex) return;
    setEditingExameIndex(index);
    setNovoExame({ data: ex.data || "", tipo: ex.tipo || "", valor: ex.valor || "", obs: ex.obs || "", foto: ex.foto || null });
    if (exameFormRef.current) exameFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditExame() {
    setEditingExameIndex(null);
    setNovoExame({ data: "", tipo: "", valor: "", obs: "", foto: null });
  }

  function confirmDeleteExame() {
    if (deleteExameIndex === null) return;
    const next = exames.filter((_, i) => i !== deleteExameIndex);
    saveExames(next);
    setEditingExameIndex(null);
    setNovoExame({ data: "", tipo: "", valor: "", obs: "", foto: null });
    setDeleteExameIndex(null);
  }

  async function saveGastos(next) {
    setGastos(next);
    if (await persist("gastos-data", JSON.stringify(next))) flashSaved();
  }

  function startEditGasto(index) {
    const g = gastos[index];
    if (!g) return;
    setEditingGastoIndex(index);
    setNovoGasto({
      data: g.data || todayKey(),
      categoria: g.categoria || "Ração",
      valor: g.valor || "",
      frequencia: g.frequencia || "Não se repete",
      vezesPorSemana: g.vezesPorSemana || 1,
    });
    if (gastoFormRef.current) gastoFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditGasto() {
    setEditingGastoIndex(null);
    setNovoGasto({ data: todayKey(), categoria: "Ração", valor: "", frequencia: "Não se repete", vezesPorSemana: 1 });
  }

  function confirmDeleteGasto() {
    if (deleteGastoIndex === null) return;
    const next = gastos.filter((_, i) => i !== deleteGastoIndex);
    saveGastos(next);
    setEditingGastoIndex(null);
    setNovoGasto({ data: todayKey(), categoria: "Ração", valor: "", frequencia: "Não se repete", vezesPorSemana: 1 });
    setDeleteGastoIndex(null);
  }

  async function saveRegistrosPeso(next) {
    setRegistrosPeso(next);
    if (await persist("peso-fotos-data", JSON.stringify(next))) flashSaved();
  }

  async function saveAgendaItems(next) {
    setAgendaItems(next);
    if (await persist("agenda-data", JSON.stringify(next))) flashSaved();
    syncSchedule(profile && profile.nome, next, recorrentes);
  }

  async function saveRecorrentes(next) {
    setRecorrentes(next);
    if (await persist("recorrentes-data", JSON.stringify(next))) flashSaved();
    syncSchedule(profile && profile.nome, agendaItems, next);
  }

  async function saveNotifPrefs(next) {
    const normalized = normalizeNotifPrefs(next);
    setNotifPrefs(normalized);
    await persist("notif-prefs-data", JSON.stringify(normalized));
  }

  function openNovoCompromisso(dataKey) {
    setEditingAgendaId(null);
    setNovoExameNome("");
    setNovoTipoNome("");
    setNovoAgendaItem({ ...EMPTY_AGENDA_ITEM, data: dataKey || selectedDay, lembretes: normalizeLembretes(notifPrefs) });
    setSheet("compromisso");
  }

  function startEditAgendaItem(item) {
    setEditingAgendaId(item.id);
    setNovoExameNome("");
    setNovoTipoNome("");
    setNovoAgendaItem({
      tipos: agendaTipos(item),
      exames: agendaExames(item),
      data: item.data || "",
      horario: item.horario || "",
      obs: item.obs || "",
      jejum: !!item.jejum,
      jejumHoras: Number(item.jejumHoras) || 8,
      lembretes: normalizeLembretes(item.lembretes),
      concluido: !!item.concluido,
    });
    setSheet("compromisso");
  }

  function cancelEditAgendaItem() {
    setEditingAgendaId(null);
    setNovoAgendaItem(EMPTY_AGENDA_ITEM);
    setNovoExameNome("");
    setNovoTipoNome("");
    setDetalhesAbertos(false);
    setSheet(null);
  }

  function adicionarTipo() {
    const nome = novoTipoNome.trim();
    if (!nome || novoAgendaItem.tipos.includes(nome)) return setNovoTipoNome("");
    setNovoAgendaItem({ ...novoAgendaItem, tipos: [...novoAgendaItem.tipos, nome] });
    setNovoTipoNome("");
  }

  function openNovoRemedio(dataKey) {
    setEditingRecorrenteId(null);
    setNovoRecorrente({
      ...EMPTY_RECORRENTE,
      dataInicio: dataKey || todayKey(),
      avisar: notifPrefs.medAvisar,
      avisoMinutosAntes: notifPrefs.medMinutosAntes,
    });
    setSheet("remedio");
  }

  function startEditRecorrente(med) {
    setEditingRecorrenteId(med.id);
    setNovoRecorrente({
      nome: med.nome || "",
      dose: med.dose || "",
      doseUnidade: med.doseUnidade || "mg",
      horarios: medHorarios(med).length ? medHorarios(med) : [""],
      frequencia: medFrequencia(med),
      dias: med.dias || [0, 1, 2, 3, 4, 5, 6],
      duracao: med.duracao || "continuo",
      dataInicio: med.dataInicio || todayKey(),
      dataFim: med.dataFim || "",
      jejum: !!med.jejum,
      jejumMinutos: Number(med.jejumMinutos) || 60,
      avisar: medAvisar(med),
      avisoMinutosAntes: medAvisoMinutos(med),
      obs: med.obs || "",
    });
    setSheet("remedio");
  }

  function cancelEditRecorrente() {
    setEditingRecorrenteId(null);
    setNovoRecorrente(EMPTY_RECORRENTE);
    setDetalhesAbertos(false);
    setSheet(null);
  }

  // Também aceita datas passadas, para dar conta de marcar o que ficou
  // pendente na visão da semana.
  async function toggleRecorrenteCheck(medId, dateKey) {
    const key = medCheckKey(dateKey || today, medId);
    const next = { ...recorrenteChecks, [key]: !recorrenteChecks[key] };
    if (!next[key]) delete next[key];
    setRecorrenteChecks(next);
    await persist("recorrentes-checks-data", JSON.stringify(next));
  }

  function toggleAgendaConcluido(item) {
    saveAgendaItems(agendaItems.map((it) => (it.id === item.id ? { ...it, concluido: !it.concluido } : it)));
  }

  function saveCompromissoFromForm() {
    const item = { ...novoAgendaItem, lembretes: normalizeLembretes(novoAgendaItem.lembretes) };
    if (!item.data || (item.tipos.length === 0 && item.exames.length === 0)) return;
    if (item.tipos.length === 0) item.tipos = [item.exames.length > 1 ? "Exames" : item.exames[0]];
    // `tipo` continua gravado como texto único: é o que o envio de notificação
    // lê e o que os cadastros anteriores a esta versão esperam encontrar.
    item.tipo = item.tipos.join(" + ");
    if (editingAgendaId !== null) {
      saveAgendaItems(agendaItems.map((it) => (it.id === editingAgendaId ? { ...item, id: editingAgendaId } : it)));
    } else {
      track("add_agenda_item");
      saveAgendaItems([...agendaItems, { ...item, id: Date.now() }]);
    }
    setSelectedDay(item.data);
    setCalendarMonth(monthKeyOf(item.data));
    setWeekStart(startOfWeek(item.data));
    cancelEditAgendaItem();
  }

  function saveRemedioFromForm() {
    const horarios = novoRecorrente.horarios.filter(Boolean);
    if (!novoRecorrente.nome) return;
    if (novoRecorrente.frequencia === "dias" && novoRecorrente.dias.length === 0) return;
    const med = {
      ...novoRecorrente,
      horarios,
      horario: horarios[0] || "", // mantido para compatibilidade com cadastros antigos
      dias: novoRecorrente.frequencia === "dias" ? novoRecorrente.dias : [0, 1, 2, 3, 4, 5, 6],
    };
    if (editingRecorrenteId !== null) {
      saveRecorrentes(recorrentes.map((m) => (m.id === editingRecorrenteId ? { ...med, id: editingRecorrenteId } : m)));
      setMedSavedMsg(`✓ ${med.nome} atualizado`);
    } else {
      track("add_recurring_med");
      saveRecorrentes([...recorrentes, { ...med, id: Date.now() }]);
      setMedSavedMsg(`✓ ${med.nome} incluído na agenda`);
    }
    setTimeout(() => setMedSavedMsg(""), 2800);
    cancelEditRecorrente();
  }

  function goToDay(key) {
    setSelectedDay(key);
    setCalendarMonth(monthKeyOf(key));
    setWeekStart(startOfWeek(key));
  }

  function flashSaved() {
    setSaveMsg("Salvo");
    setTimeout(() => setSaveMsg(""), 1200);
  }

  async function handleSavePdf(type) {
    const ref = type === "report" ? reportRef : manualRef;
    if (!ref.current || pdfLoading) return;
    setPdfLoading(type);
    try {
      const nome = (profile && profile.nome) || "gato";
      const filename = type === "report" ? `resumo-${nome}.pdf` : `manual-do-tutor-${nome}.pdf`;
      await downloadPdf(ref.current, filename);
      track("export_pdf", { type });
    } catch (err) {
    } finally {
      setPdfLoading(null);
    }
  }

  async function handleExportBackup() {
    const data = {};
    for (const key of BACKUP_KEYS) {
      try {
        const item = await window.storage.get(key);
        if (item && item.value !== undefined) data[key] = item.value;
      } catch (err) {}
    }

    const payload = { app: "rotina-renal", version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-rotina-renal-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    try {
      await window.storage.set("backup-last-export", today);
      await window.storage.set("backup-reminder-snoozed-until", "");
    } catch (err) {}
    setLastBackupDate(today);
    setBackupReminderSnoozedUntil(null);
    setBackupMsg("Backup exportado — confira a pasta de downloads do seu celular.");
    setTimeout(() => setBackupMsg(""), 4500);
  }

  function handleImportFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
          setImportError("Esse arquivo não parece ser um backup válido do Rotina Renal.");
          return;
        }
        setPendingImport(parsed);
      } catch (err) {
        setImportError("Não foi possível ler esse arquivo. Confira se é o JSON exportado pelo app.");
      }
    };
    reader.onerror = () => setImportError("Não foi possível ler esse arquivo.");
    reader.readAsText(file);
  }

  async function confirmImportBackup() {
    if (!pendingImport) return;
    let hadFailure = false;
    for (const [key, value] of Object.entries(pendingImport.data)) {
      if (!BACKUP_KEYS.includes(key)) continue;
      try {
        await window.storage.set(key, value);
      } catch (err) {
        hadFailure = true;
      }
    }
    setPendingImport(null);
    if (backupFileInputRef.current) backupFileInputRef.current.value = "";
    if (hadFailure) {
      setImportError("O armazenamento ficou cheio durante a restauração — parte dos dados pode não ter sido salva. Remova fotos antigas e tente importar de novo.");
    } else {
      window.location.reload();
    }
  }

  function cancelImportBackup() {
    setPendingImport(null);
    if (backupFileInputRef.current) backupFileInputRef.current.value = "";
  }

  function snoozeBackupReminder() {
    const snoozeUntil = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setBackupReminderSnoozedUntil(snoozeUntil);
    window.storage.set("backup-reminder-snoozed-until", snoozeUntil).catch(() => {});
  }

  async function dismissDiarioIntro() {
    setShowDiarioIntro(false);
    try {
      await window.storage.set("diario-intro-seen", "true");
    } catch (err) {}
  }

  function updateSelectedEntry(field, value) {
    const next = { ...entries, [selectedDiaryDate]: { ...selectedEntry, [field]: value } };
    saveEntries(next);
  }

  const qolFields = [
    ["dor", "Dor"],
    ["fome", "Fome"],
    ["hidratacao", "Hidratação"],
    ["higiene", "Higiene"],
    ["felicidade", "Felicidade"],
    ["mobilidade", "Mobilidade"],
    ["diasBons", "Mais dias bons"],
  ];
  const todayQol = qol[today] || {};
  const qolTotal = qolFields.reduce((sum, [key]) => sum + (Number(todayQol[key]) || 0), 0);

  // Base da visão de evolução: as respostas do diário e a escala de bem-estar
  // lado a lado, que é o ponto de terem virado uma aba só.
  const ultimos14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const qolSerie = Object.keys(qol)
    .sort()
    .map((data) => ({
      rotulo: new Date(data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      total: qolFields.reduce((s, [key]) => s + (Number(qol[data][key]) || 0), 0),
    }))
    .filter((p) => p.total > 0)
    .slice(-12);

  
  const daysSince = profile && profile.dataDiagnostico
    ? Math.floor((new Date(today + "T12:00:00") - new Date(profile.dataDiagnostico + "T12:00:00")) / 86400000)
    : null;
  const phase = getPhase(daysSince);
  const pillOfDay = getPill(daysSince);

  // Alerta de padrão: 3 dias seguidos de apetite/humor alterado — só sugere contato, nunca diagnostica.
  const last3Dates = sortedDates.slice(0, 3);
  const patternAlert =
    last3Dates.length === 3 &&
    (last3Dates.every((d) => entries[d].apetite === "Menos") || last3Dates.every((d) => entries[d].humor === "Quieto"));

  const isNormalSelected =
    selectedEntry.agua === "Normal" &&
    selectedEntry.apetite === "Normal" &&
    selectedEntry.humor === "Tranquilo" &&
    selectedEntry.urina === "Normal" &&
    (selectedEntry.corUrina || "Normal") === "Normal";

  const daysSinceBackup = lastBackupDate
    ? Math.floor((new Date(today + "T12:00:00") - new Date(lastBackupDate + "T12:00:00")) / 86400000)
    : null;
  const showBackupReminder =
    (daysSinceBackup === null || daysSinceBackup >= 30) &&
    (!backupReminderSnoozedUntil || today > backupReminderSnoozedUntil);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: CREAM, fontFamily: "sans-serif", color: GREY }}>
        Carregando...
      </div>
    );
  }

  const latestPhoto = registrosPeso.find((r) => r.foto);
  const TABS = [
    ["checkin", "Check-in", HeartPulse],
    ["agenda", "Agenda", Calendar],
    ["registros", "Registros", FolderOpen],
    ["recursos", "Acolhimento", BookOpen],
  ];

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Karla', Arial, sans-serif", color: INK, paddingBottom: 120 }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "calc(24px + env(safe-area-inset-top, 0px)) 20px 0" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <label style={{
            width: 58, height: 58, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
            background: SAND, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 16px rgba(42,42,42,0.10)", border: "2px solid #fff", cursor: "pointer", position: "relative",
          }}>
            {profile && profile.fotoPerfil ? (
              <img src={profile.fotoPerfil} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : latestPhoto ? (
              <img src={latestPhoto.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Cat size={28} color={TEAL} strokeWidth={1.8} />
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setUploading(true);
                checkStorageBeforeUpload();
                try {
                  const dataUrl = await compressImage(file);
                  saveProfile({ ...(profile || {}), fotoPerfil: dataUrl });
                } catch (err) {}
                setUploading(false);
              }}
            />
          </label>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 30, margin: 0, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              {profile && profile.nome ? profile.nome : "Seu gato"}
            </h1>
            <p style={{ color: GREY, fontSize: 12.5, margin: "3px 0 0" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>

          {profile && (
            <button
              onClick={() => { setDraftProfile(profile); setShowOnboarding(true); setOnboardingStep(1); }}
              style={{ border: "none", background: "rgba(42,42,42,0.05)", color: GREY, fontSize: 11, cursor: "pointer", padding: "7px 12px", borderRadius: 999, fontWeight: 700 }}
            >
              editar
            </button>
          )}
        </div>

        {phase && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", padding: "7px 14px 7px 8px",
            borderRadius: 999, marginBottom: 18, boxShadow: "0 4px 14px rgba(42,42,42,0.07)", border: "1px solid rgba(42,42,42,0.05)",
          }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: TERRACOTTA, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
              {phase.n}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{phase.label}</span>
            <span style={{ fontSize: 11, color: GREY }}>· dia {daysSince}</span>
          </div>
        )}

        {storageNotice && (
          <div style={{
            background: storageNotice.type === "error" ? "#FBE0DA" : "#FDF4E3",
            border: `1px solid ${storageNotice.type === "error" ? TERRACOTTA : "#F0DBA6"}`,
            borderRadius: 12, padding: "12px 14px", marginBottom: 16,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <div style={{ fontSize: 12, color: INK, lineHeight: 1.45, flex: 1 }}>{storageNotice.message}</div>
            <button
              onClick={() => setStorageNotice(null)}
              style={{ border: "none", background: "none", color: GREY, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {tab === "checkin" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Segmented value={checkinView} onChange={setCheckinView} options={["Hoje", "Bem-estar", "Evolução"]} />
            </div>

            {checkinView === "Hoje" && (
              <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10.5, color: GREY, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>Editando o registro de</div>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 16, color: INK }}>
                  {isEditingToday ? "Hoje" : new Date(selectedDiaryDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!isEditingToday && (
                  <button
                    onClick={() => setSelectedDiaryDate(today)}
                    style={{ border: "none", background: "rgba(59,110,100,0.12)", color: TEAL, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 11.5, padding: "7px 12px", borderRadius: 9, cursor: "pointer" }}
                  >
                    Hoje
                  </button>
                )}
                <input
                  type="date"
                  value={selectedDiaryDate}
                  max={today}
                  onChange={(e) => e.target.value && setSelectedDiaryDate(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid rgba(42,42,42,0.12)", fontSize: 12.5, background: "#fff", color: INK }}
                />
              </div>
            </div>

            {showDiarioIntro && (
              <div style={{ background: SAND, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, color: INK, marginBottom: 6 }}>
                  Como está {profile && profile.nome ? profile.nome : "seu gato"} hoje?
                </div>
                <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.5, marginBottom: 12 }}>
                  Tente preencher diariamente, leva poucos segundos com o botão "marcar dia como normal"; ajuste apenas o que for diferente. É esse hábito que faz o resumo para o veterinário ter valor de verdade.
                </div>
                <button
                  onClick={dismissDiarioIntro}
                  style={{ border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, padding: "8px 16px", borderRadius: 10, cursor: "pointer" }}
                >
                  Entendi
                </button>
              </div>
            )}

            {patternAlert && (
              <div style={{ background: "#FBE0DA", border: `1px solid ${TERRACOTTA}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: INK }}>
                  Notamos que {profile && profile.nome ? profile.nome : "seu gato"} esteve mais quieto ou comendo pouco nos últimos 3 dias. Que tal mandar uma mensagem para o veterinário para checar se vale ajustar alguma coisa?
                </div>
              </div>
            )}

            {showBackupReminder && (
              <div style={{ background: "rgba(42,42,42,0.04)", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: INK, marginBottom: 10 }}>
                  {lastBackupDate
                    ? "Já faz um tempo que você não exporta seu backup — quer fazer agora?"
                    : "Você ainda não exportou um backup dos dados desse app — vale fazer isso de vez em quando."}
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <button
                    onClick={() => setTab("recursos")}
                    style={{ border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 11.5, padding: "7px 14px", borderRadius: 9, cursor: "pointer" }}
                  >
                    Exportar agora
                  </button>
                  <button
                    onClick={snoozeBackupReminder}
                    style={{ border: "none", background: "none", color: GREY, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                  >
                    Lembrar depois
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                track("mark_day_normal");
                saveEntries({ ...entries, [selectedDiaryDate]: { agua: "Normal", apetite: "Normal", humor: "Tranquilo", urina: "Normal", corUrina: "Normal", soro: selectedEntry.soro || "Não fiz", nota: selectedEntry.nota } });
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                padding: "12px 16px", borderRadius: 16, border: "none", cursor: "pointer", marginBottom: 12,
                background: isNormalSelected ? "rgba(59,110,100,0.14)" : "rgba(42,42,42,0.04)",
                transition: "background 0.2s ease",
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isNormalSelected ? TEAL : "transparent",
                border: isNormalSelected ? "none" : "2px solid rgba(42,42,42,0.18)",
                transition: "background 0.2s ease",
              }}>
                {isNormalSelected && <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, color: isNormalSelected ? TEAL : GREY }}>
                Marcar dia como normal
              </span>
            </button>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 18, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <WaterBowl level={selectedEntry.agua === "Menos" ? 0 : selectedEntry.agua === "Mais" ? 2 : 1} />
                <div>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, color: TEAL }}>{isEditingToday ? "Água hoje" : "Água nesse dia"}</div>
                  <div style={{ fontSize: 13, color: GREY }}>{selectedEntry.agua === "Normal" ? "Bebendo normal" : selectedEntry.agua === "Mais" ? "Bebendo mais que o normal" : "Bebendo menos — vale observar"}</div>
                </div>
              </div>
              {last7Dates.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(42,42,42,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: GREY, marginBottom: 6 }}>
                    <span>Consistência de hidratação (7 dias)</span>
                    <span style={{ fontWeight: 700, color: TEAL }}>{hidratacaoOk}/{last7Dates.length}</span>
                  </div>
                  <div style={{ height: 8, background: "#EFE6D8", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(hidratacaoOk / last7Dates.length) * 100}%`, background: TEAL, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: GREY, fontStyle: "italic", marginTop: 6 }}>
                    Dias com água normal ou acima — não é meta de quantidade, só padrão observado.
                  </div>
                </div>
              )}
            </div>

            {phase && (
              <div style={{ background: INK, borderRadius: 22, padding: "16px 18px", marginBottom: 14, color: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TERRACOTTA }}>{phase.label}</span>
                  <span style={{ fontSize: 11, color: "#B8B8B8" }}>dia {daysSince} da jornada</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#D8D8D8", marginBottom: 10 }}>{phase.desc}</div>
                <div style={{ borderTop: "1px solid #3d3d3d", paddingTop: 10, fontSize: 12.5, fontStyle: "italic", color: "#F0EAE0" }}>{pillOfDay}</div>
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <IconLabel icon={Droplet}>Água</IconLabel>
              <Segmented value={selectedEntry.agua} onChange={(v) => updateSelectedEntry("agua", v)} options={["Menos", "Normal", "Mais"]} />

              <div style={{ marginTop: 16 }}>
                <IconLabel icon={UtensilsCrossed}>Apetite</IconLabel>
                <Segmented value={selectedEntry.apetite} onChange={(v) => updateSelectedEntry("apetite", v)} options={["Menos", "Normal", "Mais"]} />
              </div>

              <div style={{ marginTop: 16 }}>
                <IconLabel icon={Smile}>Humor</IconLabel>
                <Segmented value={selectedEntry.humor} onChange={(v) => updateSelectedEntry("humor", v)} options={["Quieto", "Tranquilo", "Brincalhão"]} />
              </div>

              <div style={{ marginTop: 16 }}>
                <IconLabel icon={Waves}>Urina</IconLabel>
                <Segmented value={selectedEntry.urina} onChange={(v) => updateSelectedEntry("urina", v)} options={["Menos", "Normal", "Mais"]} />
              </div>

              <div style={{ marginTop: 16 }}>
                <IconLabel icon={Palette}>Cor da urina</IconLabel>
                <Segmented value={selectedEntry.corUrina || "Normal"} onChange={(v) => updateSelectedEntry("corUrina", v)} options={["Normal", "Mais clara", "Mais escura", "Com sangue"]} />
              </div>
              {selectedEntry.corUrina === "Com sangue" && (
                <div style={{ background: "#FBE0DA", border: `1px solid ${TERRACOTTA}`, borderRadius: 13, padding: "10px 12px", marginTop: 8, fontSize: 12, color: INK, fontWeight: 700 }}>
                  ⚑ Sangue na urina merece contato com o veterinário — não espere a próxima consulta agendada.
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <IconLabel icon={Syringe}>Fluidoterapia / soro {isEditingToday ? "hoje" : "nesse dia"}</IconLabel>
                <Segmented value={selectedEntry.soro || "Não fiz"} onChange={(v) => updateSelectedEntry("soro", v)} options={["Não fiz", "Fiz"]} />
              </div>
              <div style={{ fontSize: 10.5, color: GREY, marginTop: 6, fontStyle: "italic" }}>
                Só um registro de que foi feito — quantidade e frequência seguem sempre a orientação do seu veterinário.
              </div>


              <label style={{ fontSize: 12.5, fontWeight: 700, color: TEAL, display: "block", margin: "14px 0 6px" }}>Observação</label>
              <textarea
                value={selectedEntry.nota}
                onChange={(e) => updateSelectedEntry("nota", e.target.value)}
                placeholder={isEditingToday ? "Algo que valha anotar hoje..." : "Algo que valha anotar nesse dia..."}
                style={{ width: "100%", minHeight: 60, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", padding: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
              />
            </div>

            <div style={{ fontSize: 11, color: GREY, marginBottom: 18, fontStyle: "italic" }}>
              Isto é registro de observação, não diagnóstico. Leve mudanças relevantes para o seu veterinário.
            </div>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 16, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Peso e fotos</div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 14 }}>Um registro semanal já é suficiente para acompanhar a evolução.</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="date"
                  value={novoPeso.data}
                  onChange={(e) => setNovoPeso({ ...novoPeso, data: e.target.value })}
                  style={{ flex: 1, padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5 }}
                />
                <input
                  type="number"
                  step="0.01"
                  value={novoPeso.peso}
                  onChange={(e) => setNovoPeso({ ...novoPeso, peso: e.target.value })}
                  placeholder="Peso (kg)"
                  style={{ width: 100, padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5 }}
                />
              </div>

              <label
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  border: `1.5px dashed ${TEAL}`, borderRadius: 13, padding: 12, fontSize: 12.5,
                  color: TEAL, cursor: "pointer", marginBottom: 10, fontWeight: 700,
                }}
              >
                {uploading ? "Carregando foto..." : novoPeso.foto ? "📷 Foto selecionada — trocar" : "📷 Adicionar foto"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setUploading(true);
                    checkStorageBeforeUpload();
                    try {
                      const dataUrl = await compressImage(file);
                      setNovoPeso((p) => ({ ...p, foto: dataUrl }));
                    } catch (err) {}
                    setUploading(false);
                  }}
                />
              </label>

              {novoPeso.foto && (
                <img src={novoPeso.foto} alt="Prévia" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 13, marginBottom: 10 }} />
              )}

              <button
                onClick={() => {
                  if (!novoPeso.data || (!novoPeso.peso && !novoPeso.foto)) return;
                  saveRegistrosPeso([{ ...novoPeso }, ...registrosPeso]);
                  setNovoPeso({ data: todayKey(), peso: "", foto: null });
                }}
                style={{ width: "100%", padding: 11, borderRadius: 13, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Salvar registro
              </button>

              {registrosPeso.length > 0 && (
                <div style={{ display: "flex", gap: 10, overflowX: "auto", marginTop: 16, paddingBottom: 4 }}>
                  {registrosPeso.map((r, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 96, textAlign: "center" }}>
                      {r.foto ? (
                        <img src={r.foto} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 14, marginBottom: 6 }} />
                      ) : (
                        <div style={{ width: 96, height: 96, borderRadius: 14, background: SAND, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 6 }}>🐾</div>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 700, color: INK }}>{r.peso ? `${r.peso} kg` : "—"}</div>
                      <div style={{ fontSize: 9.5, color: GREY }}>{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </div>
            )}

            {checkinView === "Bem-estar" && (
          <div>
            <div style={{
              background: "linear-gradient(135deg, rgba(59,110,100,0.10), rgba(196,98,45,0.06))",
              border: "1px solid rgba(59,110,100,0.15)", borderRadius: 22, padding: 22, marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Stethoscope size={18} color={TEAL} strokeWidth={2} />
                <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 13.5, color: INK }}>Escala usada em cuidados paliativos</span>
              </div>
              <div style={{ fontSize: 12, color: INK, lineHeight: 1.5, marginBottom: 10 }}>
                Criada pela Dra. Alice Villalobos, veterinária oncologista e criadora do programa Pawspice de cuidados paliativos para pets.
              </div>
              <a
                href="https://www.vetsmall.theclinics.com/article/S0195-5616(11)00038-6/abstract"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: TEAL, textDecoration: "none" }}
              >
                Ver publicação científica <ExternalLink size={12} strokeWidth={2.2} />
              </a>
            </div>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 16, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Como funciona a escala 5H2M?</div>
              <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.55, marginBottom: 10 }}>
                Sete categorias, cada uma avaliada de 0 a 10 pensando nos últimos dias. A soma ajuda você e o veterinário a conversarem sobre o bem-estar do seu gatinho de um jeito mais objetivo, sem depender só da impressão do momento.
              </div>
              <div style={{ fontSize: 10.5, color: TEAL, fontWeight: 600, lineHeight: 1.5, marginBottom: 18 }}>
                Diferente do diário, o preenchimento desse check-in funciona melhor na frequência semanal, assim dá tempo de ver a diferença real entre uma vez e outra.
              </div>

              {qolFields.map(([key, label]) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{label}</span>
                    <span style={{ color: TERRACOTTA, fontWeight: 700 }}>{todayQol[key] || 0}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={todayQol[key] || 0}
                    onChange={(e) => saveQol({ ...qol, [today]: { ...todayQol, [key]: Number(e.target.value) } })}
                    style={{ width: "100%", accentColor: TEAL }}
                  />
                  <button
                    onClick={() => setOpenQolInfo(openQolInfo === key ? null : key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, border: "none", background: "none",
                      color: GREY, fontSize: 10.5, cursor: "pointer", padding: "4px 0 0", fontWeight: 600,
                    }}
                  >
                    <Info size={11} strokeWidth={2.2} /> Como avaliar este item?
                  </button>
                  <div style={{
                    maxHeight: openQolInfo === key ? 100 : 0, overflow: "hidden",
                    transition: "max-height 0.3s ease, opacity 0.25s ease", opacity: openQolInfo === key ? 1 : 0,
                  }}>
                    <div style={{ background: SAND, borderRadius: 12, padding: "10px 12px", marginTop: 6, fontSize: 11.5, color: INK, lineHeight: 1.5 }}>
                      {QOL_GUIDANCE[key]}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: qolTotal >= 35 ? "#EAF4EE" : "#FDF4E3", border: `1px solid ${qolTotal >= 35 ? "#B8DCC3" : "#F0DBA6"}`,
              borderRadius: 22, padding: 24, textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: GREY, marginBottom: 4 }}>Total de hoje</div>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 40, color: INK, marginBottom: 10 }}>{qolTotal}</div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 999,
                background: qolTotal >= 35 ? "#3B6E64" : "#C4922D", color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 10,
              }}>
                {qolTotal >= 35 ? "🟢 Qualidade de vida preservada" : "🟡 Leve este histórico ao veterinário"}
              </div>
              <div>
                <button
                  onClick={() => setShowScoreInfo(true)}
                  style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                >
                  Entenda a regra dos 35 pontos
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 12, fontStyle: "italic" }}>
              Esta escala organiza a conversa com seu veterinário — não substitui a avaliação clínica dele.
            </div>
          </div>
            )}

            {checkinView === "Evolução" && (
              <div>
            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 22, marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>Sinais dos últimos 14 dias</div>
              <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>
                O que você respondeu no dia a dia, lado a lado. Serve para enxergar tendência — a leitura do que isso significa segue com seu veterinário.
              </div>
              <SinaisTimeline dias={ultimos14} entries={entries} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(42,42,42,0.06)" }}>
                {["neutro", "acima", "abaixo", "vazio"].map((estado) => (
                  <span key={estado} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: GREY }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: SINAL_CORES[estado].bg }} />
                    {SINAL_CORES[estado].label}
                  </span>
                ))}
              </div>
            </div>

            {hidratacaoOk > 0 && last7Dates.length > 0 && (
              <div style={{ background: "rgba(59,110,100,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 14, fontSize: 12.5, color: TEAL }}>
                Em {hidratacaoOk} dos últimos {last7Dates.length} dias registrados, a água estava normal ou acima.
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 22, marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>Bem-estar ao longo do tempo</div>
              <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>
                Cada ponto é um preenchimento da escala 5H2M. A linha marca os 35 pontos.
              </div>
              {qolSerie.length < 2 ? (
                <div style={{ fontSize: 12, color: GREY, padding: "8px 0" }}>
                  {qolSerie.length === 0
                    ? "Você ainda não preencheu a escala. Ela fica na aba Bem-estar, aqui em cima."
                    : "Com mais de um preenchimento dá para ver a tendência. Vale repetir a escala daqui a alguns dias."}
                </div>
              ) : (
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qolSerie} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,42,0.08)" vertical={false} />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: GREY }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 70]} tick={{ fontSize: 10, fill: GREY }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v} pontos`, "Total"]} />
                      <ReferenceLine y={35} stroke={TERRACOTTA} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="total" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3, fill: TEAL }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {sortedDates.length > 0 && (
              <>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 2, color: INK }}>Histórico</div>
                <div style={{ fontSize: 10.5, color: GREY, marginBottom: 8 }}>Toque em um dia para abrir e editar o registro.</div>
                {sortedDates.slice(0, diaryHistoryLimit).map((date) => {
                  const e = entries[date];
                  const isSelected = date === selectedDiaryDate;
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDiaryDate(date);
                        setCheckinView("Hoje");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={{
                        width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                        background: isSelected ? "rgba(59,110,100,0.10)" : "#fff",
                        border: isSelected ? `1px solid ${TEAL}` : "1px solid rgba(42,42,42,0.06)",
                        borderRadius: 14, padding: "10px 14px", marginBottom: 6, fontSize: 12.5,
                        display: "flex", justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: isSelected ? TEAL : INK }}>{new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                      <span style={{ color: e.corUrina === "Com sangue" ? TERRACOTTA : GREY, fontWeight: e.corUrina === "Com sangue" ? 700 : 400 }}>
                        água {e.agua.toLowerCase()} · apetite {e.apetite.toLowerCase()} · {e.humor.toLowerCase()}{e.soro === "Fiz" ? " · soro feito" : ""}{e.corUrina === "Com sangue" ? " · ⚑ sangue na urina" : ""}
                      </span>
                    </button>
                  );
                })}
                {sortedDates.length > diaryHistoryLimit && (
                  <button
                    onClick={() => setDiaryHistoryLimit((n) => n + 10)}
                    style={{ width: "100%", padding: 10, borderRadius: 14, border: "1px solid rgba(42,42,42,0.1)", background: "none", color: TEAL, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", marginTop: 2, marginBottom: 6 }}
                  >
                    Ver mais dias ({sortedDates.length - diaryHistoryLimit} restantes)
                  </button>
                )}
                {diaryHistoryLimit > 10 && sortedDates.length <= diaryHistoryLimit && (
                  <button
                    onClick={() => setDiaryHistoryLimit(10)}
                    style={{ width: "100%", padding: 8, borderRadius: 14, border: "none", background: "none", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 11.5, cursor: "pointer", marginBottom: 6 }}
                  >
                    Mostrar menos
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setShowReport(true)}
              style={{ width: "100%", padding: 12, borderRadius: 14, border: "none", background: INK, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 16 }}
            >
              📄 Exportar resumo para o veterinário
            </button>

            <button
              onClick={() => setShowManual(true)}
              style={{ width: "100%", padding: 12, borderRadius: 14, border: `1.5px solid ${TERRACOTTA}`, background: "#fff", color: TERRACOTTA, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 10 }}
            >
              🐾 Manual do Tutor (para deixar com quem cuidar dele)
            </button>
              </div>
            )}
          </div>
        )}

        {tab === "agenda" && (
          <div>
            {pushSupported() && pushStatus !== "subscribed" && (
              <div style={{ background: "rgba(59,110,100,0.10)", border: `1px solid rgba(59,110,100,0.2)`, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: INK, marginBottom: 10 }}>
                  Ative as notificações para receber um aviso no celular na hora do remédio e antes dos compromissos — mesmo com o app fechado.
                </div>
                <button
                  onClick={handleEnableNotifications}
                  disabled={pushStatus === "loading"}
                  style={{ border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, padding: "9px 16px", borderRadius: 10, cursor: pushStatus === "loading" ? "wait" : "pointer" }}
                >
                  {pushStatus === "loading" ? "Ativando..." : "🔔 Ativar notificações"}
                </button>
                {pushStatus === "error" && (
                  <div style={{ fontSize: 11, color: TERRACOTTA, marginTop: 8 }}>{pushError}</div>
                )}
              </div>
            )}
            {pushStatus === "subscribed" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                  <Bell size={13} /> Notificações ativadas neste aparelho
                </div>
                <button
                  onClick={() => setSheet("notif")}
                  style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  ajustar avisos
                </button>
              </div>
            )}

            {/* Sem nada cadastrado, o caminho de entrada precisa estar no topo —
                o + flutuante sozinho demora a ser notado. */}
            {agendaItems.length === 0 && recorrentes.length === 0 && (
              <div style={{
                background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: "20px 20px 18px",
                marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  Comece pela rotina{profile && profile.nome ? ` de ${profile.nome}` : ""}
                </div>
                <div style={{ fontSize: 11.5, color: GREY, lineHeight: 1.5, marginBottom: 14 }}>
                  O que você cadastrar aqui aparece no calendário e vira lembrete no celular.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openNovoCompromisso(selectedDay)}
                    style={{ flex: 1, padding: "11px 10px", borderRadius: 12, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                  >
                    + compromisso
                  </button>
                  <button
                    onClick={() => openNovoRemedio(selectedDay)}
                    style={{ flex: 1, padding: "11px 10px", borderRadius: 12, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                  >
                    + remédio
                  </button>
                </div>
              </div>
            )}

            <TodaySummary
              todayKey={today}
              agendaItems={agendaItems}
              recorrentes={recorrentes}
              checks={recorrenteChecks}
              onSelectDay={goToDay}
            />

            <div style={{ marginBottom: 14 }}>
              <Segmented value={agendaView} onChange={setAgendaView} options={["Semana", "Mês", "Lista"]} />
            </div>

            {agendaView === "Mês" && (
              <MonthCalendar
                monthKey={calendarMonth}
                selected={selectedDay}
                todayKey={today}
                marksFor={marksForDay}
                onSelect={(k) => { setSelectedDay(k); setWeekStart(startOfWeek(k)); setCalendarMonth(monthKeyOf(k)); }}
                onMonthChange={(delta) => setCalendarMonth(addMonths(calendarMonth, delta))}
              />
            )}

            {agendaView === "Semana" && (
              <WeekOverview
                weekStartKey={weekStart}
                todayKey={today}
                recorrentes={recorrentes}
                agendaItems={agendaItems}
                checks={recorrenteChecks}
                selected={selectedDay}
                onToggleMed={(key, medId) => toggleRecorrenteCheck(medId, key)}
                onWeekChange={(delta) => setWeekStart(addDays(weekStart, delta * 7))}
                onSelectDay={(k) => { setSelectedDay(k); setCalendarMonth(monthKeyOf(k)); }}
              />
            )}

            {agendaView !== "Lista" && (
              <DayPanel
                dayKey={selectedDay}
                todayKey={today}
                agendaItems={agendaItems}
                recorrentes={recorrentes}
                checks={recorrenteChecks}
                onToggleMed={(key, medId) => toggleRecorrenteCheck(medId, key)}
                onToggleCompromisso={toggleAgendaConcluido}
                onEditCompromisso={startEditAgendaItem}
                onEditMed={startEditRecorrente}
                onAddCompromisso={openNovoCompromisso}
                onAddMed={openNovoRemedio}
              />
            )}

            {agendaView === "Lista" && (
              <>
                {agendaItems.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: GREY, textAlign: "center", padding: "20px 0" }}>
                    Nada agendado ainda. Toque no + para incluir o primeiro compromisso.
                  </div>
                ) : (
                  [
                    ["Em atraso", agendaGroups.late],
                    ["Hoje", agendaGroups.today],
                    ["Próximos", agendaGroups.future],
                    ["Já concluídos", agendaGroups.done],
                  ].map(([titulo, itens]) => (
                    itens.length === 0 ? null : (
                      <div key={titulo} style={{ marginBottom: 16 }}>
                        <div style={{
                          fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: "0.04em",
                          textTransform: "uppercase", color: titulo === "Em atraso" ? TERRACOTTA : GREY, marginBottom: 8,
                        }}>
                          {titulo}
                        </div>
                        {itens.map((item) => {
                          const jejum = jejumInfo(item);
                          const exames = agendaExames(item);
                          return (
                            <div key={item.id} style={{
                              background: "#fff", borderRadius: 14, padding: "13px 15px", marginBottom: 8,
                              border: `1px solid ${agendaStatus(item, today) === "late" ? "#E8B4A0" : "rgba(42,42,42,0.06)"}`,
                              display: "flex", alignItems: "flex-start", gap: 11,
                            }}>
                              <button
                                onClick={() => toggleAgendaConcluido(item)}
                                aria-label={item.concluido ? "Desmarcar compromisso" : "Marcar como feito"}
                                style={{
                                  width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                                  border: item.concluido ? "none" : "2px solid rgba(42,42,42,0.15)",
                                  background: item.concluido ? TERRACOTTA : "transparent", color: "#fff",
                                  fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                {item.concluido ? "✓" : ""}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: item.concluido ? GREY : INK, textDecoration: item.concluido ? "line-through" : "none" }}>
                                  {agendaTitulo(item)}
                                </div>
                                <div style={{ fontSize: 11.5, color: GREY }}>
                                  {new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                                  {item.horario ? ` · ${item.horario}` : ""} · {daysUntilLabel(item.data)}
                                </div>
                                {exames.length > 1 && (
                                  <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{exames.length} exames: {exames.join(", ")}</div>
                                )}
                                {jejum && (
                                  <div style={{ fontSize: 11, color: TERRACOTTA, fontWeight: 700, marginTop: 3 }}>{jejum.texto}</div>
                                )}
                                <div style={{ fontSize: 10.5, color: GREY, marginTop: 3 }}>
                                  Avisa {lembretesLabel(item.lembretes)}
                                </div>
                                {item.obs && <div style={{ fontSize: 11, color: GREY, fontStyle: "italic", marginTop: 3 }}>{item.obs}</div>}
                              </div>
                              <button
                                onClick={() => startEditAgendaItem(item)}
                                style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, padding: 0 }}
                              >
                                editar
                              </button>
                              <button
                                onClick={() => saveAgendaItems(agendaItems.filter((it) => it.id !== item.id))}
                                aria-label="Apagar compromisso"
                                style={{ border: "none", background: "none", color: GREY, fontSize: 16, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ))
                )}

                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: TEAL, margin: "20px 0 8px" }}>
                  Remédios cadastrados
                </div>
                {recorrentes.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: GREY, textAlign: "center", padding: "12px 0" }}>
                    Nenhum remédio cadastrado ainda.
                  </div>
                ) : (
                  recorrentes.map((med) => (
                    <div key={med.id} style={{ background: "#fff", borderRadius: 12, padding: "11px 14px", marginBottom: 6, border: "1px solid rgba(42,42,42,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{med.nome}</div>
                        <div style={{ fontSize: 11, color: GREY }}>
                          {doseLabel(med) ? `${doseLabel(med)} · ` : ""}{medHorarios(med).join(" · ") || "sem horário"} · {medFrequenciaLabel(med)}
                          {med.duracao === "determinado" && med.dataFim
                            ? ` · até ${new Date(med.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}`
                            : ""}
                        </div>
                        {med.jejum && (
                          <div style={{ fontSize: 10.5, color: TERRACOTTA, fontWeight: 700, marginTop: 2 }}>
                            jejum de {formatDuration(med.jejumMinutos)} antes
                          </div>
                        )}
                        {med.obs && (
                          <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginTop: 2 }}>{med.obs}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <button
                          onClick={() => startEditRecorrente(med)}
                          style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
                        >
                          editar
                        </button>
                        <button
                          onClick={() => saveRecorrentes(recorrentes.filter((m) => m.id !== med.id))}
                          aria-label="Apagar remédio"
                          style={{ border: "none", background: "none", color: GREY, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {medSavedMsg && (
              <div style={{
                marginTop: 10, padding: "9px 14px", borderRadius: 10, background: "rgba(59,110,100,0.14)",
                color: TEAL, fontSize: 12.5, fontWeight: 700, textAlign: "center",
              }}>
                {medSavedMsg}
              </div>
            )}
          </div>
        )}
        {tab === "registros" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Segmented value={registrosView} onChange={setRegistrosView} options={["Exames", "Gastos"]} />
            </div>

            {registrosView === "Exames" && (
          <div>
            <div ref={exameFormRef} style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{editingExameIndex !== null ? "Editar registro" : "Novo registro"}</div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 14 }}>Guarde o resultado do jeito que veio — o app não interpreta se o valor está bom ou ruim, só organiza.</div>

              <label style={{ fontSize: 12, color: GREY }}>Data</label>
              <input
                type="date"
                value={novoExame.data}
                onChange={(e) => setNovoExame({ ...novoExame, data: e.target.value })}
                style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, margin: "4px 0 10px" }}
              />
              <label style={{ fontSize: 12, color: GREY }}>Tipo de exame</label>
              <input
                value={novoExame.tipo}
                onChange={(e) => setNovoExame({ ...novoExame, tipo: e.target.value })}
                placeholder="Ex: Creatinina, Ureia, Hemograma..."
                style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, margin: "4px 0 10px" }}
              />
              <label style={{ fontSize: 12, color: GREY }}>Resultado</label>
              <input
                value={novoExame.valor}
                onChange={(e) => setNovoExame({ ...novoExame, valor: e.target.value })}
                placeholder="Ex: 2.1 mg/dL"
                style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, margin: "4px 0 10px" }}
              />
              <label style={{ fontSize: 12, color: GREY }}>Observações</label>
              <textarea
                value={novoExame.obs}
                onChange={(e) => setNovoExame({ ...novoExame, obs: e.target.value })}
                placeholder="O que o veterinário comentou, próximos passos combinados..."
                style={{ width: "100%", minHeight: 50, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", padding: 8, fontSize: 13, fontFamily: "inherit", margin: "4px 0 12px", resize: "vertical" }}
              />

              <label
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  border: `1.5px dashed ${TEAL}`, borderRadius: 12, padding: 11, fontSize: 12.5,
                  color: TEAL, cursor: "pointer", marginBottom: 12, fontWeight: 700,
                }}
              >
                {uploading ? "Carregando foto..." : novoExame.foto ? "📎 Laudo anexado — trocar" : "📎 Anexar foto do laudo"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setUploading(true);
                    checkStorageBeforeUpload();
                    try {
                      const dataUrl = await compressImage(file);
                      setNovoExame((p) => ({ ...p, foto: dataUrl }));
                    } catch (err) {}
                    setUploading(false);
                  }}
                />
              </label>
              {novoExame.foto && (
                <img src={novoExame.foto} alt="Prévia do laudo" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, marginBottom: 12 }} />
              )}

              <button
                onClick={() => {
                  if (!novoExame.data || !novoExame.tipo) return;
                  if (editingExameIndex !== null) {
                    const next = exames.map((ex, i) => (i === editingExameIndex ? { ...novoExame } : ex));
                    saveExames(next);
                    setEditingExameIndex(null);
                  } else {
                    saveExames([{ ...novoExame }, ...exames]);
                  }
                  setNovoExame({ data: "", tipo: "", valor: "", obs: "", foto: null });
                }}
                style={{ width: "100%", padding: 11, borderRadius: 13, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {editingExameIndex !== null ? "Salvar alterações" : "Salvar registro"}
              </button>
              {editingExameIndex !== null && (
                <button
                  onClick={cancelEditExame}
                  style={{ width: "100%", padding: 10, borderRadius: 13, border: "none", background: "none", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}
                >
                  Cancelar edição
                </button>
              )}
            </div>

            {exames.length > 0 && (
              <>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Histórico, agrupado por exame</div>
                <div style={{ fontSize: 10.5, color: GREY, marginBottom: 10 }}>Toque no ✏️ para editar ou no 🗑 para apagar</div>
                {Object.values(examGroups).map((group, gi) => (
                  <div key={gi} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 12, border: "1px solid rgba(42,42,42,0.06)" }}>
                    <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 16, color: TEAL, marginBottom: 10, textTransform: "capitalize" }}>
                      {group.label}
                    </div>
                    {group.items.map((ex, i) => {
                      const exameIndex = exames.indexOf(ex);
                      return (
                        <div
                          key={i}
                          onClick={() => startEditExame(exameIndex)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < group.items.length - 1 ? "1px solid #F2EEE4" : "none", cursor: "pointer" }}
                        >
                          <span style={{ fontSize: 12, color: GREY }}>
                            {ex.data && new Date(ex.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                            {ex.foto ? " 📎" : ""}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 19, fontWeight: 800, color: INK, fontFamily: "'Poppins', sans-serif" }}>{ex.valor || "—"}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditExame(exameIndex); }}
                              style={{ border: "none", background: "none", color: TEAL, fontSize: 15, cursor: "pointer", padding: 4, lineHeight: 1 }}
                              aria-label="Editar exame"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteExameIndex(exameIndex); }}
                              style={{ border: "none", background: "none", color: GREY, fontSize: 15, cursor: "pointer", padding: 4, lineHeight: 1 }}
                              aria-label="Apagar exame"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {group.items.some((ex) => ex.obs) && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F2EEE4" }}>
                        {group.items.filter((ex) => ex.obs).map((ex, i) => (
                          <div key={i} style={{ fontSize: 11.5, color: GREY, fontStyle: "italic", marginBottom: 2 }}>
                            {ex.data && new Date(ex.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}: {ex.obs}
                          </div>
                        ))}
                      </div>
                    )}
                    {group.items.some((ex) => ex.foto) && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 10, paddingTop: 10, borderTop: "1px solid #F2EEE4" }}>
                        {group.items.filter((ex) => ex.foto).map((ex, i) => (
                          <img
                            key={i}
                            src={ex.foto}
                            alt="Laudo"
                            style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginBottom: 4 }}>
                  Valores organizados por tipo de exame para facilitar a consulta — a leitura e o significado seguem sempre com seu veterinário.
                </div>
              </>
            )}
          </div>
            )}

            {registrosView === "Gastos" && (
          <div>
            <div ref={gastoFormRef} style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{editingGastoIndex !== null ? "Editar gasto" : "Registrar gastos"}</div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 14 }}>Organize e controle suas despesas. Com base nessas informações o app poderá apresentar uma projeção de gastos para os próximos meses.</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="date"
                  value={novoGasto.data}
                  onChange={(e) => setNovoGasto({ ...novoGasto, data: e.target.value })}
                  style={{ flex: 1, padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5 }}
                />
                <input
                  type="number"
                  value={novoGasto.valor}
                  onChange={(e) => setNovoGasto({ ...novoGasto, valor: e.target.value })}
                  placeholder="R$"
                  style={{ width: 90, padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5 }}
                />
              </div>
              <input
                value={novoGasto.categoria}
                onChange={(e) => setNovoGasto({ ...novoGasto, categoria: e.target.value })}
                placeholder="Categoria (ex: Ração, Consulta com nefro...)"
                style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5, marginBottom: 8, background: "#fff" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {["Ração", "Areia", "Consulta", "Exame", "Medicamento", "Fluidoterapia", "Outro"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setNovoGasto({ ...novoGasto, categoria: cat })}
                    style={{
                      padding: "5px 11px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                      border: novoGasto.categoria === cat ? "none" : "1px solid rgba(42,42,42,0.1)",
                      background: novoGasto.categoria === cat ? TEAL : "transparent",
                      color: novoGasto.categoria === cat ? "#fff" : GREY,
                      fontWeight: novoGasto.categoria === cat ? 700 : 500,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Isso se repete?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: novoGasto.frequencia === "Semanal" ? 10 : 12 }}>
                {["Não se repete", "Semanal", "Mensal"].map((freq) => (
                  <button
                    key={freq}
                    onClick={() => setNovoGasto({ ...novoGasto, frequencia: freq })}
                    style={{
                      padding: "7px 12px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                      border: novoGasto.frequencia === freq ? "none" : "1px solid rgba(42,42,42,0.1)",
                      background: novoGasto.frequencia === freq ? "rgba(59,110,100,0.12)" : "transparent",
                      color: novoGasto.frequencia === freq ? TEAL : GREY,
                      fontWeight: novoGasto.frequencia === freq ? 700 : 500,
                    }}
                  >
                    {freq}
                  </button>
                ))}
              </div>

              {novoGasto.frequencia === "Semanal" && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11.5, color: GREY }}>Quantas vezes por semana? <span style={{ color: TEAL }}>(ex: fluidoterapia 3x)</span></label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={novoGasto.vezesPorSemana}
                    onChange={(e) => setNovoGasto({ ...novoGasto, vezesPorSemana: e.target.value })}
                    style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, marginTop: 4 }}
                  />
                </div>
              )}

              <button
                onClick={() => {
                  if (!novoGasto.data || !novoGasto.valor) return;
                  if (editingGastoIndex !== null) {
                    const next = gastos.map((g, i) => (i === editingGastoIndex ? { ...novoGasto } : g));
                    saveGastos(next);
                    setEditingGastoIndex(null);
                  } else {
                    saveGastos([{ ...novoGasto }, ...gastos]);
                  }
                  setNovoGasto({ data: todayKey(), categoria: "Ração", valor: "", frequencia: "Não se repete", vezesPorSemana: 1 });
                }}
                style={{ width: "100%", padding: 10, borderRadius: 13, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                {editingGastoIndex !== null ? "Salvar alterações" : "+ Registrar"}
              </button>
              {editingGastoIndex !== null && (
                <button
                  onClick={cancelEditGasto}
                  style={{ width: "100%", padding: 9, borderRadius: 13, border: "none", background: "none", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", marginTop: 4 }}
                >
                  Cancelar edição
                </button>
              )}
            </div>

            {gastos.length > 0 && (
              <>
                <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: "20px 14px 10px", marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4, paddingLeft: 6 }}>Gastos por mês</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartMes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: GREY }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: GREY }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`R$ ${v}`, "Total"]} contentStyle={{ fontSize: 12, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)" }} />
                      <Bar dataKey="total" fill={TERRACOTTA} radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: "20px 14px 10px", marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4, paddingLeft: 6 }}>Gastos por categoria</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartCategoria} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EFE6D8" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: GREY }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11.5, fill: INK }} axisLine={false} tickLine={false} width={78} />
                      <Tooltip formatter={(v) => [`R$ ${v}`, "Total"]} contentStyle={{ fontSize: 12, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)" }} />
                      <Bar dataKey="total" fill={TEAL} radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ background: INK, borderRadius: 22, padding: "16px 20px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#D8D8D8", fontSize: 12.5 }}>Total gasto registrado</span>
                  <span style={{ color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 20 }}>R$ {totalGastoGeral.toFixed(2)}</span>
                </div>

                <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 20, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Histórico de gastos</div>
                  <div style={{ fontSize: 10.5, color: GREY, marginBottom: 10 }}>Toque no ✏️ para editar ou no 🗑 para apagar</div>
                  {gastos.map((g, i) => (
                    <div
                      key={i}
                      onClick={() => startEditGasto(i)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0",
                        borderBottom: i < gastos.length - 1 ? "1px solid #F2EEE4" : "none", cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{g.categoria || "Outro"}</div>
                        <div style={{ fontSize: 11, color: GREY }}>
                          {g.data && new Date(g.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                          {g.frequencia && g.frequencia !== "Não se repete" ? ` · ${g.frequencia === "Semanal" ? `${g.vezesPorSemana}x/semana` : "mensal"}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: INK, fontFamily: "'Poppins', sans-serif" }}>R$ {(Number(g.valor) || 0).toFixed(2)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditGasto(i); }}
                          style={{ border: "none", background: "none", color: TEAL, fontSize: 15, cursor: "pointer", padding: 4, lineHeight: 1 }}
                          aria-label="Editar gasto"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteGastoIndex(i); }}
                          style={{ border: "none", background: "none", color: GREY, fontSize: 15, cursor: "pointer", padding: 4, lineHeight: 1 }}
                          aria-label="Apagar gasto"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {projecaoItens.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 12, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Projeção de gastos recorrentes</div>
                    <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>Baseada no último registro marcado como recorrente em cada categoria</div>
                    {projecaoItens.map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(42,42,42,0.06)", fontSize: 12.5 }}>
                        <span>
                          {it.categoria}
                          <span style={{ color: GREY, fontSize: 11 }}> · {it.frequencia === "Semanal" ? `${it.vezesPorSemana}x/semana` : "mensal"}</span>
                        </span>
                        <span style={{ fontWeight: 700 }}>R$ {it.mensal.toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, marginTop: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Estimativa por mês</span>
                      <span style={{ fontWeight: 800, color: TERRACOTTA, fontSize: 16 }}>R$ {projecaoTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
            )}
          </div>
        )}

        {tab === "recursos" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Respire Fundo</div>
              <div style={{ fontSize: 12.5, color: GREY, lineHeight: 1.5 }}>Um espaço para explicar os principais termos, dúvidas frequentes e te lembrar que você não está sozinho nessa jornada. Esse espaço será atualizado constantemente.</div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Backup dos dados</div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 14 }}>
                Todos os dados ficam guardados só neste aparelho. Exporte de vez em quando pra não correr risco de perder — e pra poder restaurar se trocar de celular.
              </div>

              <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>
                {lastBackupDate
                  ? `Último backup: ${new Date(lastBackupDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`
                  : "Você ainda não fez nenhum backup."}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleExportBackup}
                  style={{ flex: 1, padding: 11, borderRadius: 13, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                >
                  ⬇️ Exportar backup
                </button>
                <button
                  onClick={() => backupFileInputRef.current && backupFileInputRef.current.click()}
                  style={{ flex: 1, padding: 11, borderRadius: 13, border: `1.5px solid ${TEAL}`, background: "#fff", color: TEAL, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                >
                  ⬆️ Importar backup
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={handleImportFileSelected}
                />
              </div>

              {backupMsg && (
                <div style={{ marginTop: 10, padding: "9px 14px", borderRadius: 10, background: "rgba(59,110,100,0.14)", color: TEAL, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
                  {backupMsg}
                </div>
              )}
              {importError && (
                <div style={{ marginTop: 10, padding: "9px 14px", borderRadius: 10, background: "#FBE0DA", color: TERRACOTTA, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
                  {importError}
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Glossário</div>
              {GLOSSARIO.map((g, i) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < GLOSSARIO.length - 1 ? "1px solid rgba(42,42,42,0.06)" : "none" }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: TEAL }}>{g.termo}</div>
                  <div style={{ fontSize: 12, color: INK, marginTop: 2 }}>{g.def}</div>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginTop: 4 }}>
                Explicações gerais, sem relação com nenhum resultado seu. Converse com seu veterinário sobre o que cada exame significa no caso do seu gato.
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 22, padding: 24, marginBottom: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.04)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Artigos para você, tutor</div>
              <div style={{ fontSize: 11, color: GREY, marginBottom: 14 }}>Conteúdo original, escrito para este app — toque para ler</div>
              {ARTIGOS.map((a, i) => {
                const open = openArtigo === i;
                return (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < ARTIGOS.length - 1 ? "1px solid rgba(42,42,42,0.06)" : "none" }}>
                    <button
                      onClick={() => setOpenArtigo(open ? null : i)}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: INK }}>{a.titulo}</div>
                        <span style={{ color: TEAL, fontSize: 14, flexShrink: 0, transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
                      </div>
                      <div style={{ fontSize: 12, color: GREY, marginTop: 3 }}>{a.resumo}</div>
                    </button>
                    <div style={{
                      maxHeight: open ? 600 : 0, overflow: "hidden",
                      transition: "max-height 0.35s ease, opacity 0.25s ease", opacity: open ? 1 : 0,
                    }}>
                      <div style={{ background: SAND, borderRadius: 12, padding: "12px 14px", marginTop: 10, fontSize: 12.5, color: INK, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                        {a.corpo}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: SAND, borderRadius: 22, padding: 20 }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 8, color: TEAL }}>Onde buscar mais apoio</div>
              <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.6 }}>
                Grupos de tutores de gato renal no Facebook, comunidades de WhatsApp indicadas por veterinários, e perfis de Instagram de outros tutores contando a própria jornada costumam ser os lugares mais acolhedores para trocar experiência.
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 24, textAlign: "center", fontSize: 11, color: TEAL, opacity: saveMsg ? 1 : 0, transition: "opacity 0.3s" }}>{saveMsg}</div>

        <div style={{ fontSize: 9.5, color: GREY, textAlign: "left", lineHeight: 1.5, padding: "12px 6px 4px", borderTop: "1px solid rgba(42,42,42,0.08)", marginTop: 8 }}>
          O Rotina Renal é uma ferramenta de organização e apoio pessoal do tutor. Não realiza diagnósticos, não prescreve tratamentos e não substitui a consulta com um médico-veterinário.
        </div>
      </div>

      {/* Cadastro rápido — discreto, só aparece na agenda */}
      {tab === "agenda" && !sheet && (
        <button
          onClick={() => setSheet("menu")}
          aria-label="Adicionar à agenda"
          style={{
            position: "fixed", right: 22, zIndex: 41,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
            width: 50, height: 50, borderRadius: "50%", border: "none",
            background: TERRACOTTA, color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 10px 24px rgba(196,98,45,0.38)",
          }}
        >
          <Plus size={24} strokeWidth={2.4} />
        </button>
      )}

      {/* Bottom Navigation */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        display: "flex", justifyContent: "center",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        pointerEvents: "none",
      }}>
        <div style={{
          pointerEvents: "auto",
          maxWidth: 430, width: "calc(100% - 28px)", margin: "0 auto",
          display: "flex", padding: "8px 10px",
          background: "rgba(255,255,255,0.78)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderRadius: 26, border: "1px solid rgba(255,255,255,0.9)",
          boxShadow: "0 16px 40px rgba(42,42,42,0.14)",
        }}>
          {TABS.map(([key, label, Icon]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  border: "none", background: "none", padding: "8px 2px", cursor: "pointer", position: "relative",
                }}
              >
                <div style={{
                  width: 40, height: 26, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(59,110,100,0.12)" : "transparent", transition: "background 0.25s ease",
                }}>
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.7} color={active ? TEAL : "#B0AB9E"} />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, color: active ? TEAL : "#B0AB9E" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {sheet === "menu" && (
        <Sheet title="O que você quer incluir?" onClose={() => setSheet(null)}>
          <button
            onClick={() => openNovoCompromisso(selectedDay)}
            style={{ width: "100%", textAlign: "left", padding: "15px 16px", borderRadius: 15, border: "1px solid rgba(196,98,45,0.25)", background: "#fff", cursor: "pointer", marginBottom: 10 }}
          >
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, color: TERRACOTTA }}>Compromisso ou exame</div>
            <div style={{ fontSize: 11.5, color: GREY, marginTop: 2 }}>Consulta, coleta, ultrassom — com jejum e mais de um exame no mesmo dia, se precisar.</div>
          </button>
          <button
            onClick={() => openNovoRemedio(selectedDay)}
            style={{ width: "100%", textAlign: "left", padding: "15px 16px", borderRadius: 15, border: "1px solid rgba(59,110,100,0.25)", background: "#fff", cursor: "pointer" }}
          >
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, color: TEAL }}>Remédio da rotina</div>
            <div style={{ fontSize: 11.5, color: GREY, marginTop: 2 }}>A cada 24h, a cada 48h ou em dias específicos.</div>
          </button>
        </Sheet>
      )}

      {sheet === "notif" && (
        <Sheet
          title="Avisos"
          subtitle="Isso vale para os próximos cadastros. O que já está na agenda guarda o ajuste que você escolheu na hora."
          onClose={() => setSheet(null)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12, color: TERRACOTTA }}>
              Compromissos e exames
            </div>
            <LembretesPicker value={notifPrefs} onChange={(l) => saveNotifPrefs({ ...notifPrefs, ...l })} />
          </div>

          <div style={{ background: "#fff", borderRadius: 16, padding: 18 }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12, color: TEAL }}>
              Remédios
            </div>

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Avisar na hora da dose?</label>
            <Segmented
              value={notifPrefs.medAvisar ? "Sim" : "Não"}
              onChange={(v) => saveNotifPrefs({ ...notifPrefs, medAvisar: v === "Sim" })}
              options={["Não", "Sim"]}
            />

            {notifPrefs.medAvisar && (
              <>
                <label style={{ fontSize: 12, color: GREY, display: "block", margin: "14px 0 6px" }}>Com quanta antecedência</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {AVISO_MED_OPCOES.map((m) => (
                    <ChipToggle
                      key={m}
                      active={Number(notifPrefs.medMinutosAntes) === m}
                      color={TEAL}
                      onClick={() => saveNotifPrefs({ ...notifPrefs, medMinutosAntes: m })}
                    >
                      {m === 0 ? "Na hora" : `${formatDuration(m)} antes`}
                    </ChipToggle>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 10.5, color: GREY, marginTop: 12, lineHeight: 1.5 }}>
              {notifPrefs.medAvisar
                ? `Cada remédio novo já vem com esse ajuste, e dá para mudar um por um nos detalhes dele. O aviso de início de jejum${" "}continua saindo sempre que você marcar jejum no remédio.`
                : "Remédios novos vão entrar sem aviso no celular. Você ainda pode ligar um por um nos detalhes de cada remédio."}
            </div>
          </div>

          <button
            onClick={() => setSheet(null)}
            style={{ width: "100%", padding: 12, borderRadius: 14, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 14 }}
          >
            Pronto
          </button>
        </Sheet>
      )}

      {sheet === "compromisso" && (
        <Sheet
          title={editingAgendaId !== null ? "Editar compromisso" : "Novo compromisso"}
          subtitle="De acordo com a orientação do seu veterinário — o app só ajuda a lembrar."
          onClose={cancelEditAgendaItem}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: GREY, display: "block" }}>O que é?</label>
            <div style={{ fontSize: 10.5, color: GREY, margin: "3px 0 8px" }}>
              Dá para marcar mais de um — no mesmo dia costuma sair ultrassom e coleta de sangue juntos.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {[...new Set([...TIPOS_SUGERIDOS, ...novoAgendaItem.tipos])].map((tipo) => {
                const ativo = novoAgendaItem.tipos.includes(tipo);
                return (
                  <ChipToggle
                    key={tipo}
                    active={ativo}
                    onClick={() => setNovoAgendaItem({
                      ...novoAgendaItem,
                      tipos: ativo
                        ? novoAgendaItem.tipos.filter((t) => t !== tipo)
                        : [...novoAgendaItem.tipos, tipo],
                    })}
                  >
                    {tipo}
                  </ChipToggle>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <input
                value={novoTipoNome}
                onChange={(e) => setNovoTipoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !novoTipoNome.trim()) return;
                  e.preventDefault();
                  adicionarTipo();
                }}
                placeholder="Outro tipo..."
                style={{ flex: 1, padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, boxSizing: "border-box", minWidth: 0 }}
              />
              <button
                onClick={adicionarTipo}
                style={{ border: "none", background: "rgba(196,98,45,0.14)", color: TERRACOTTA, borderRadius: 12, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
              >
                Incluir
              </button>
            </div>

            <label style={{ fontSize: 12, color: GREY }}>Data</label>
            <input
              type="date"
              value={novoAgendaItem.data}
              onChange={(e) => setNovoAgendaItem({ ...novoAgendaItem, data: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, marginTop: 4, background: "#fff", boxSizing: "border-box" }}
            />
          </div>

          <DetalhesRow resumo={resumoCompromisso(novoAgendaItem)} onClick={() => setDetalhesAbertos(true)} />

          <button
            onClick={saveCompromissoFromForm}
            style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            {editingAgendaId !== null ? "Salvar alterações" : "Adicionar à agenda"}
          </button>
          {editingAgendaId !== null && (
            <button
              onClick={() => {
                saveAgendaItems(agendaItems.filter((it) => it.id !== editingAgendaId));
                cancelEditAgendaItem();
              }}
              style={{ width: "100%", padding: 11, borderRadius: 14, border: "none", background: "none", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}
            >
              Apagar compromisso
            </button>
          )}
        </Sheet>
      )}

      {sheet === "compromisso" && detalhesAbertos && (
        <Sheet
          title="Detalhes do compromisso"
          subtitle={novoAgendaItem.tipos.length ? novoAgendaItem.tipos.join(" + ") : "Compromisso sem tipo ainda"}
          onClose={() => setDetalhesAbertos(false)}
          zIndex={70}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: GREY }}>Horário</label>
            <input
              type="time"
              value={novoAgendaItem.horario}
              onChange={(e) => setNovoAgendaItem({ ...novoAgendaItem, horario: e.target.value })}
              style={{ width: "100%", padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, margin: "4px 0 16px", background: "#fff", boxSizing: "border-box" }}
            />

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 4 }}>Exames desse dia</label>
            <div style={{ fontSize: 10.5, color: GREY, marginBottom: 8 }}>
              Dá para marcar quantos precisar para a mesma data — é comum sair mais de um na mesma coleta.
            </div>
            {novoAgendaItem.exames.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {novoAgendaItem.exames.map((ex, i) => (
                  <span key={`${ex}-${i}`} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 8px 5px 11px",
                    borderRadius: 999, background: "rgba(196,98,45,0.14)", color: TERRACOTTA, fontSize: 11.5, fontWeight: 700,
                  }}>
                    {ex}
                    <button
                      onClick={() => setNovoAgendaItem({ ...novoAgendaItem, exames: novoAgendaItem.exames.filter((_, j) => j !== i) })}
                      aria-label={`Remover ${ex}`}
                      style={{ border: "none", background: "none", color: TERRACOTTA, cursor: "pointer", padding: 0, display: "flex" }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {["Hemograma", "Creatinina", "Ureia", "SDMA", "Urina tipo I", "Fósforo", "Pressão arterial"]
                .filter((ex) => !novoAgendaItem.exames.includes(ex))
                .map((ex) => (
                  <ChipToggle key={ex} active={false} onClick={() => setNovoAgendaItem({ ...novoAgendaItem, exames: [...novoAgendaItem.exames, ex] })}>
                    + {ex}
                  </ChipToggle>
                ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <input
                value={novoExameNome}
                onChange={(e) => setNovoExameNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !novoExameNome.trim()) return;
                  e.preventDefault();
                  setNovoAgendaItem({ ...novoAgendaItem, exames: [...novoAgendaItem.exames, novoExameNome.trim()] });
                  setNovoExameNome("");
                }}
                placeholder="Outro exame..."
                style={{ flex: 1, padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, boxSizing: "border-box", minWidth: 0 }}
              />
              <button
                onClick={() => {
                  if (!novoExameNome.trim()) return;
                  setNovoAgendaItem({ ...novoAgendaItem, exames: [...novoAgendaItem.exames, novoExameNome.trim()] });
                  setNovoExameNome("");
                }}
                style={{ border: "none", background: "rgba(196,98,45,0.14)", color: TERRACOTTA, borderRadius: 12, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}
              >
                Incluir
              </button>
            </div>

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Precisa de jejum?</label>
            <Segmented
              value={novoAgendaItem.jejum ? "Sim" : "Não"}
              onChange={(v) => setNovoAgendaItem({ ...novoAgendaItem, jejum: v === "Sim" })}
              options={["Não", "Sim"]}
            />
            {novoAgendaItem.jejum && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Quantas horas de jejum?</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {JEJUM_HORAS_OPCOES.map((h) => (
                    <ChipToggle key={h} active={Number(novoAgendaItem.jejumHoras) === h} onClick={() => setNovoAgendaItem({ ...novoAgendaItem, jejumHoras: h })}>
                      {h}h
                    </ChipToggle>
                  ))}
                </div>
                {jejumInfo(novoAgendaItem) && jejumInfo(novoAgendaItem).inicio && (
                  <div style={{ fontSize: 11, color: TERRACOTTA, fontWeight: 700, marginTop: 8 }}>
                    {jejumInfo(novoAgendaItem).texto}
                  </div>
                )}
              </div>
            )}

            <label style={{ fontSize: 12, color: GREY, display: "block", margin: "16px 0 4px" }}>Observações</label>
            <textarea
              value={novoAgendaItem.obs}
              onChange={(e) => setNovoAgendaItem({ ...novoAgendaItem, obs: e.target.value })}
              placeholder="Alguma nota extra sobre esse compromisso..."
              style={{ width: "100%", minHeight: 50, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", padding: 9, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={14} color={TEAL} /> Quando avisar
            </div>
            <LembretesPicker
              value={novoAgendaItem.lembretes}
              onChange={(lembretes) => setNovoAgendaItem({ ...novoAgendaItem, lembretes })}
            />
          </div>

          <button
            onClick={() => setDetalhesAbertos(false)}
            style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Pronto
          </button>
        </Sheet>
      )}

      {sheet === "remedio" && (
        <Sheet
          title={editingRecorrenteId !== null ? "Editar remédio" : "Novo remédio"}
          subtitle="Datas e frequência conforme a orientação do seu veterinário."
          onClose={cancelEditRecorrente}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: GREY }}>Nome</label>
            <input
              value={novoRecorrente.nome}
              onChange={(e) => setNovoRecorrente({ ...novoRecorrente, nome: e.target.value })}
              placeholder="Ex: Antibiótico"
              style={{ width: "100%", padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, margin: "4px 0 16px", boxSizing: "border-box" }}
            />

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>De quanto em quanto tempo?</label>
            <Segmented
              value={FREQ_LABEL[novoRecorrente.frequencia] || FREQ_LABEL["24h"]}
              onChange={(v) => setNovoRecorrente({ ...novoRecorrente, frequencia: FREQ_VALUE[v] })}
              options={["24h", "48h", "Dias fixos"]}
            />
            <div style={{ fontSize: 10.5, color: GREY, marginTop: 8 }}>
              {novoRecorrente.frequencia === "24h" && "Todo dia, no mesmo horário."}
              {novoRecorrente.frequencia === "48h" && "Dia sim, dia não, contando a partir da primeira dose."}
              {novoRecorrente.frequencia === "dias" && "Você escolhe os dias da semana nos detalhes."}
            </div>
          </div>

          <DetalhesRow resumo={resumoRemedio(novoRecorrente)} onClick={() => setDetalhesAbertos(true)} />

          <button
            onClick={saveRemedioFromForm}
            style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            {editingRecorrenteId !== null ? "Salvar alterações" : "Salvar remédio"}
          </button>
          {editingRecorrenteId !== null && (
            <button
              onClick={() => {
                saveRecorrentes(recorrentes.filter((m) => m.id !== editingRecorrenteId));
                cancelEditRecorrente();
              }}
              style={{ width: "100%", padding: 11, borderRadius: 14, border: "none", background: "none", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}
            >
              Apagar remédio
            </button>
          )}
        </Sheet>
      )}

      {sheet === "remedio" && detalhesAbertos && (
        <Sheet
          title="Detalhes do remédio"
          subtitle={novoRecorrente.nome || "Remédio sem nome ainda"}
          onClose={() => setDetalhesAbertos(false)}
          zIndex={70}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Dosagem por vez</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input
                value={novoRecorrente.dose}
                onChange={(e) => setNovoRecorrente({ ...novoRecorrente, dose: e.target.value })}
                inputMode="decimal"
                placeholder="Ex: 2,5"
                style={{ flex: 1, padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, boxSizing: "border-box", minWidth: 0 }}
              />
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {DOSE_UNIDADES.map((u) => (
                  <ChipToggle
                    key={u}
                    active={novoRecorrente.doseUnidade === u}
                    color={TEAL}
                    onClick={() => setNovoRecorrente({ ...novoRecorrente, doseUnidade: u })}
                  >
                    {u}
                  </ChipToggle>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: GREY, marginBottom: 12 }}>
              Opcional. Conforme a prescrição do seu veterinário — o app só repete o que você anotar.
            </div>

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 4 }}>Observação</label>
            <textarea
              value={novoRecorrente.obs}
              onChange={(e) => setNovoRecorrente({ ...novoRecorrente, obs: e.target.value })}
              placeholder="Ex: meio comprimido, dar junto com a comida..."
              style={{ width: "100%", minHeight: 46, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", padding: 9, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }}
            />

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>
              {novoRecorrente.horarios.length > 1 ? "Horários" : "Horário"}
            </label>
            {novoRecorrente.horarios.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input
                  type="time"
                  value={h}
                  onChange={(e) => {
                    const horarios = [...novoRecorrente.horarios];
                    horarios[i] = e.target.value;
                    setNovoRecorrente({ ...novoRecorrente, horarios });
                  }}
                  style={{ flex: 1, padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, boxSizing: "border-box", minWidth: 0 }}
                />
                {novoRecorrente.horarios.length > 1 && (
                  <button
                    onClick={() => setNovoRecorrente({ ...novoRecorrente, horarios: novoRecorrente.horarios.filter((_, j) => j !== i) })}
                    aria-label="Remover horário"
                    style={{ border: "none", background: "none", color: GREY, cursor: "pointer", padding: 6, display: "flex", flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {HORARIOS_SUGERIDOS.filter((h) => !novoRecorrente.horarios.includes(h)).map((h) => (
                <ChipToggle
                  key={h}
                  active={false}
                  color={TEAL}
                  onClick={() => {
                    const vazio = novoRecorrente.horarios.findIndex((x) => !x);
                    const horarios = [...novoRecorrente.horarios];
                    if (vazio >= 0) horarios[vazio] = h;
                    else horarios.push(h);
                    setNovoRecorrente({ ...novoRecorrente, horarios });
                  }}
                >
                  {h}
                </ChipToggle>
              ))}
            </div>
            <button
              onClick={() => setNovoRecorrente({ ...novoRecorrente, horarios: [...novoRecorrente.horarios, ""] })}
              style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 16, textDecoration: "underline" }}
            >
              + outro horário no mesmo dia
            </button>

            {novoRecorrente.frequencia === "dias" && (
              <>
                <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Dias da semana</label>
                <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
                  {["D", "S", "T", "Q", "Q", "S", "S"].map((letra, idx) => {
                    const active = novoRecorrente.dias.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          const dias = active ? novoRecorrente.dias.filter((d) => d !== idx) : [...novoRecorrente.dias, idx];
                          setNovoRecorrente({ ...novoRecorrente, dias });
                        }}
                        style={{
                          width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                          background: active ? TEAL : "rgba(42,42,42,0.06)", color: active ? "#fff" : GREY,
                          fontWeight: 700, fontSize: 12,
                        }}
                      >
                        {letra}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const allSelected = novoRecorrente.dias.length === 7;
                    setNovoRecorrente({ ...novoRecorrente, dias: allSelected ? [] : [0, 1, 2, 3, 4, 5, 6] });
                  }}
                  style={{ border: "none", background: "none", color: TEAL, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 16, textDecoration: "underline" }}
                >
                  {novoRecorrente.dias.length === 7 ? "Desmarcar todos" : "Marcar todos os dias"}
                </button>
              </>
            )}

            <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Precisa de jejum?</label>
            <Segmented
              value={novoRecorrente.jejum ? "Sim" : "Não"}
              onChange={(v) => setNovoRecorrente({ ...novoRecorrente, jejum: v === "Sim" })}
              options={["Não", "Sim"]}
            />
            {novoRecorrente.jejum && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: GREY, display: "block", marginBottom: 6 }}>Quanto tempo sem comer antes da dose?</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {JEJUM_MINUTOS_MED_OPCOES.map((m) => (
                    <ChipToggle key={m} active={Number(novoRecorrente.jejumMinutos) === m} onClick={() => setNovoRecorrente({ ...novoRecorrente, jejumMinutos: m })} color={TEAL}>
                      {formatDuration(m)}
                    </ChipToggle>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(42,42,42,0.08)" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Bell size={14} color={TEAL} /> Quando avisar
              </div>

              <Segmented
                value={novoRecorrente.avisar ? "Sim" : "Não"}
                onChange={(v) => setNovoRecorrente({ ...novoRecorrente, avisar: v === "Sim" })}
                options={["Não", "Sim"]}
              />

              {novoRecorrente.avisar && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {AVISO_MED_OPCOES.map((m) => (
                    <ChipToggle
                      key={m}
                      active={Number(novoRecorrente.avisoMinutosAntes) === m}
                      color={TEAL}
                      onClick={() => setNovoRecorrente({ ...novoRecorrente, avisoMinutosAntes: m })}
                    >
                      {m === 0 ? "Na hora" : `${formatDuration(m)} antes`}
                    </ChipToggle>
                  ))}
                </div>
              )}

              <div style={{
                marginTop: 12, padding: "11px 13px", borderRadius: 12,
                background: novoRecorrente.avisar ? "rgba(59,110,100,0.09)" : "rgba(42,42,42,0.05)",
                fontSize: 11.5, lineHeight: 1.5, color: novoRecorrente.avisar ? TEAL : GREY,
              }}>
                {explicaAvisoRemedio(novoRecorrente)}
              </div>

              {novoRecorrente.avisar && pushStatus !== "subscribed" && (
                <div style={{ marginTop: 8, fontSize: 11, color: TERRACOTTA, lineHeight: 1.5 }}>
                  {pushSupported()
                    ? "As notificações ainda não estão ativadas neste aparelho — sem isso o aviso não chega. Dá para ativar no topo da Agenda."
                    : "Este navegador não envia notificações. O remédio continua aparecendo na agenda, mas sem aviso no celular."}
                </div>
              )}
            </div>

            <label style={{ fontSize: 12, color: GREY, display: "block", margin: "16px 0 6px" }}>Duração</label>
            <Segmented
              value={novoRecorrente.duracao === "continuo" ? "Contínuo" : "Por tempo determinado"}
              onChange={(v) => setNovoRecorrente({ ...novoRecorrente, duracao: v === "Contínuo" ? "continuo" : "determinado" })}
              options={["Contínuo", "Por tempo determinado"]}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, color: GREY }}>
                  {novoRecorrente.frequencia === "48h" ? "Primeira dose" : "Início"}
                </label>
                <input
                  type="date"
                  value={novoRecorrente.dataInicio}
                  onChange={(e) => setNovoRecorrente({ ...novoRecorrente, dataInicio: e.target.value })}
                  style={{ width: "100%", padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5, marginTop: 4, boxSizing: "border-box" }}
                />
              </div>
              {novoRecorrente.duracao === "determinado" && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: GREY }}>Fim</label>
                  <input
                    type="date"
                    value={novoRecorrente.dataFim}
                    onChange={(e) => setNovoRecorrente({ ...novoRecorrente, dataFim: e.target.value })}
                    style={{ width: "100%", padding: 9, borderRadius: 12, border: "1px solid rgba(42,42,42,0.08)", fontSize: 12.5, marginTop: 4, boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setDetalhesAbertos(false)}
            style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Pronto
          </button>
        </Sheet>
      )}
      {showOnboarding && onboardingStep === 0 && (
        <div style={{ position: "fixed", inset: 0, background: CREAM, zIndex: 50 }}>
          <div style={{
            position: "absolute", inset: 0, bottom: 118, overflowY: "auto",
          }}>
          <div style={{
            padding: "calc(24px + env(safe-area-inset-top, 0px)) 24px 32px", display: "flex", flexDirection: "column",
            alignItems: "flex-start", maxWidth: 440, margin: "0 auto", width: "100%",
          }}>
            <h1 style={{
              fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 24, color: INK,
              textAlign: "left", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 12px",
            }}>
              Respire. Você e seu gatinho não estão sozinhos.
            </h1>
            <p style={{
              fontSize: 15, color: GREY, textAlign: "left", lineHeight: 1.55,
              marginBottom: 18, maxWidth: 320,
            }}>
              Organize a rotina renal do seu gatinho com leveza e compartilhe todo o histórico quando precisar.
            </p>

            {/* Hero: destaque real, com o motivo de página pautada da marca */}
            <div style={{
              position: "relative", overflow: "hidden", borderRadius: 20, marginBottom: 16,
              background: "#fff",
              backgroundImage: "repeating-linear-gradient(#fff 0 27px, rgba(196,98,45,0.10) 27px 28px)",
              backgroundPosition: "0 46px",
              boxShadow: "0 14px 30px rgba(42,42,42,0.08)",
              padding: "18px 18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, position: "relative", zIndex: 1 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "rgba(196,98,45,0.14)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Stethoscope size={17} color={TERRACOTTA} strokeWidth={1.9} />
                </div>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 16, color: INK }}>
                  Ponte direta com o veterinário
                </div>
              </div>
              <p style={{ fontSize: 13, color: GREY, lineHeight: 1.45, marginBottom: 14, maxWidth: 280, position: "relative", zIndex: 1 }}>
                Gere relatórios e envie ao vet com 1 clique antes das consultas.
              </p>

              <div style={{
                display: "flex", alignItems: "center", gap: 10, background: SAND, borderRadius: 12,
                padding: "10px 12px", position: "relative", zIndex: 1, maxWidth: 240,
              }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 30, height: 36, background: "#fff", borderRadius: 4,
                    boxShadow: "0 2px 6px rgba(42,42,42,0.10)", padding: "5px 4px", display: "flex", flexDirection: "column", gap: 3,
                  }}>
                    <div style={{ height: 2, background: "rgba(42,42,42,0.14)", borderRadius: 1 }} />
                    <div style={{ height: 2, background: "rgba(42,42,42,0.14)", borderRadius: 1, width: "80%" }} />
                    <div style={{ height: 2, background: "rgba(42,42,42,0.14)", borderRadius: 1 }} />
                    <div style={{ height: 2, background: "rgba(42,42,42,0.14)", borderRadius: 1, width: "60%" }} />
                  </div>
                  <div style={{
                    position: "absolute", bottom: -5, right: -6, width: 18, height: 18, borderRadius: "50%",
                    background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.15)", border: "2px solid #fff",
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff">
                      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39c1.44.79 3.07 1.2 4.72 1.2h.01c5.46 0 9.91-4.45 9.91-9.91.01-5.45-4.44-9.9-9.89-9.9zm5.78 14.04c-.24.68-1.19 1.24-1.95 1.4-.52.11-1.2.2-3.48-.75-2.92-1.21-4.8-4.16-4.94-4.35-.14-.19-1.19-1.58-1.19-3.01 0-1.43.75-2.13 1.02-2.42.27-.29.58-.36.78-.36.2 0 .39.002.56.01.18.008.42-.07.65.5.24.58.83 2.01.9 2.16.07.15.12.32.02.52-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.07.95 1.96 1.25 2.24 1.39.28.14.44.12.6-.07.16-.19.68-.79.86-1.07.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.87.26.14.44.2.5.32.06.11.06.66-.18 1.34z"/>
                    </svg>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: INK, fontWeight: 600 }}>Resumo.pdf<br /><span style={{ color: "#25D366", fontWeight: 700 }}>✓ enviado no WhatsApp</span></div>
              </div>
            </div>

            {/* Lista compacta — os outros pilares, sem repetir a mesma caixa grande */}
            <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 18, overflow: "hidden" }}>
              {[
                { Icon: HeartPulse, titulo: "Check-in diário e escala de bem-estar", color: TEAL },
                { Icon: Calendar, titulo: "Agenda e lembretes", color: TERRACOTTA },
                { Icon: FolderOpen, titulo: "Exames e gastos guardados", color: TEAL },
                { Icon: BookOpen, titulo: "Acolhimento e conteúdo de apoio", color: TERRACOTTA },
              ].map(({ Icon, titulo, color }, i, arr) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(42,42,42,0.06)" : "none",
                }}>
                  <Icon size={16} color={color} strokeWidth={1.9} />
                  <div style={{ fontSize: 13.5, color: INK, fontWeight: 600 }}>{titulo}</div>
                </div>
              ))}
            </div>
          </div>
          </div>

          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            background: `linear-gradient(180deg, rgba(244,241,234,0) 0%, ${CREAM} 40%)`,
            padding: "14px 24px 10px",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          }}>
            <div style={{ maxWidth: 440, margin: "0 auto", width: "100%" }}>
              <button
                onClick={() => setOnboardingStep(1)}
                style={{
                  width: "100%", padding: 15, borderRadius: 16, border: "none",
                  background: TERRACOTTA, color: "#fff",
                  fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 16, cursor: "pointer",
                  boxShadow: "0 10px 24px rgba(196,98,45,0.28)", marginBottom: 8,
                }}
              >
                Começar Jornada →
              </button>
              <p style={{ fontSize: 11.5, color: GREY, textAlign: "left", lineHeight: 1.4 }}>
                Este app é uma ferramenta de apoio e organização, não substituindo o acompanhamento com o seu veterinário.
              </p>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && onboardingStep > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 380, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 3, background: onboardingStep >= 0 ? TERRACOTTA : "rgba(42,42,42,0.1)" }} />
              <div style={{ flex: 1, height: 4, borderRadius: 3, background: onboardingStep >= 1 ? TERRACOTTA : "rgba(42,42,42,0.1)" }} />
              <div style={{ flex: 1, height: 4, borderRadius: 3, background: onboardingStep >= 2 ? TERRACOTTA : "rgba(42,42,42,0.1)" }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GREY, marginBottom: 4 }}>Passo {onboardingStep + 1} de 3</div>

            {onboardingStep === 1 && (
              <>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Vamos conhecer seu gatinho?</div>
                <div style={{ fontSize: 12.5, color: GREY, marginBottom: 18 }}>Só o essencial para essa jornada fazer sentido para vocês dois. Nada aqui é usado para dar orientação clínica — apenas para facilitar sua rotina.</div>

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 5 }}>Nome do gato</label>
                <input
                  value={draftProfile.nome}
                  onChange={(e) => setDraftProfile({ ...draftProfile, nome: e.target.value })}
                  placeholder="Ex: Mel"
                  style={{ width: "100%", padding: 10, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 14 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 5 }}>Idade (anos)</label>
                <input
                  type="number"
                  value={draftProfile.idade}
                  onChange={(e) => setDraftProfile({ ...draftProfile, idade: e.target.value })}
                  placeholder="Ex: 14"
                  style={{ width: "100%", padding: 10, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 14 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 5 }}>Data do diagnóstico</label>
                <input
                  type="date"
                  value={draftProfile.dataDiagnostico}
                  onChange={(e) => setDraftProfile({ ...draftProfile, dataDiagnostico: e.target.value })}
                  style={{ width: "100%", padding: 10, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 14 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 5 }}>Estágio informado pelo veterinário</label>
                <select
                  value={draftProfile.estagio}
                  onChange={(e) => setDraftProfile({ ...draftProfile, estagio: e.target.value })}
                  style={{ width: "100%", padding: 10, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 6, background: "#fff" }}
                >
                  <option value="">Prefiro não informar</option>
                  <option value="1">Estágio 1</option>
                  <option value="2">Estágio 2</option>
                  <option value="3">Estágio 3</option>
                  <option value="4">Estágio 4</option>
                  <option value="nao-sei">Ainda não sei</option>
                </select>
                <div style={{ fontSize: 10.5, color: GREY, fontStyle: "italic", marginBottom: 20 }}>
                  As informações ficam salvas apenas como referência. Decisões clínicas continuam sendo entre você e seu veterinário.
                </div>

                <button
                  onClick={() => setOnboardingStep(2)}
                  disabled={!draftProfile.nome}
                  style={{
                    width: "100%", padding: 13, borderRadius: 14, border: "none",
                    background: draftProfile.nome ? TERRACOTTA : "#E2D9C8", color: "#fff",
                    fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14,
                    cursor: draftProfile.nome ? "pointer" : "not-allowed",
                  }}
                >
                  Continuar
                </button>
              </>
            )}

            {onboardingStep === 2 && (
              <>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Manual do Tutor</div>
                <div style={{ fontSize: 11.5, color: GREY, marginBottom: 12 }}>Guia rápido para deixar com quem for cuidar do seu gatinho em algum momento.</div>

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 4 }}>Nome do veterinário/clínica</label>
                <input
                  value={draftProfile.vetNome}
                  onChange={(e) => setDraftProfile({ ...draftProfile, vetNome: e.target.value })}
                  placeholder="Ex: Dra. Ana / Clínica Pata Feliz"
                  style={{ width: "100%", padding: 8, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 10 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 4 }}>Telefone do veterinário</label>
                <input
                  value={draftProfile.vetTelefone}
                  onChange={(e) => setDraftProfile({ ...draftProfile, vetTelefone: e.target.value })}
                  placeholder="Ex: (11) 99999-9999"
                  style={{ width: "100%", padding: 8, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 10 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 4 }}>Contato de emergência</label>
                <input
                  value={draftProfile.contatoEmergencia}
                  onChange={(e) => setDraftProfile({ ...draftProfile, contatoEmergencia: e.target.value })}
                  placeholder="Ex: Hospital 24h — (11) 98888-8888"
                  style={{ width: "100%", padding: 8, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13.5, marginBottom: 10 }}
                />

                <label style={{ fontSize: 12, fontWeight: 700, color: TEAL, display: "block", marginBottom: 4 }}>Rotina de horários (livre)</label>
                <textarea
                  value={draftProfile.rotinaHorarios}
                  onChange={(e) => setDraftProfile({ ...draftProfile, rotinaHorarios: e.target.value })}
                  placeholder={"Ex: 8h - remédio X\n13h - ração renal\n20h - remédio Y"}
                  style={{ width: "100%", minHeight: 54, padding: 8, borderRadius: 13, border: "1px solid rgba(42,42,42,0.08)", fontSize: 13, fontFamily: "inherit", marginBottom: 12, resize: "vertical" }}
                />

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setOnboardingStep(1)}
                    style={{
                      flex: 1, padding: 11, borderRadius: 14, border: "1px solid rgba(42,42,42,0.12)",
                      background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => saveProfile(draftProfile)}
                    style={{
                      flex: 1, padding: 11, borderRadius: 14, border: "none",
                      background: "rgba(42,42,42,0.06)", color: GREY, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                    }}
                  >
                    Pular agora
                  </button>
                </div>
                <button
                  onClick={() => saveProfile(draftProfile)}
                  style={{
                    width: "100%", padding: 12, borderRadius: 14, border: "none", marginTop: 8,
                    background: TERRACOTTA, color: "#fff",
                    fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}
                >
                  Salvar e começar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div ref={reportRef} style={{ background: "#fff" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 2 }}>
                Resumo — {profile && profile.nome ? profile.nome : "seu gato"}
              </div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 16 }}>Últimos 30 dias · gerado em {new Date().toLocaleDateString("pt-BR")}</div>

              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TEAL, marginBottom: 6 }}>Diário ({sortedDates.length} registros no total)</div>
              {sortedDates.slice(0, 30).length === 0 && <div style={{ fontSize: 12, color: GREY, marginBottom: 14 }}>Nenhum registro ainda.</div>}
              {sortedDates.slice(0, 30).map((date) => {
                const e = entries[date];
                return (
                  <div key={date} style={{ fontSize: 11.5, color: INK, marginBottom: 3 }}>
                    <strong>{new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}:</strong>{" "}
                    água {e.agua.toLowerCase()}, apetite {e.apetite.toLowerCase()}, humor {e.humor.toLowerCase()}, urina {e.urina.toLowerCase()}
                    {e.corUrina && e.corUrina !== "Normal" ? `, cor da urina: ${e.corUrina.toLowerCase()}` : ""}
                    {e.soro === "Fiz" ? ", soro: feito" : ""}
                    {e.nota ? ` — "${e.nota}"` : ""}
                  </div>
                );
              })}

              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TEAL, margin: "16px 0 6px" }}>Exames registrados</div>
              {exames.length === 0 && <div style={{ fontSize: 12, color: GREY, marginBottom: 14 }}>Nenhum exame registrado ainda.</div>}
              {exames.slice(0, 15).map((ex, i) => (
                <div key={i} style={{ fontSize: 11.5, color: INK, marginBottom: 3 }}>
                  <strong>{ex.data && new Date(ex.data + "T12:00:00").toLocaleDateString("pt-BR")}:</strong> {ex.tipo} {ex.valor ? `— ${ex.valor}` : ""}{ex.obs ? ` (${ex.obs})` : ""}
                </div>
              ))}

              <div style={{ fontSize: 10, color: GREY, fontStyle: "italic", margin: "16px 0", borderTop: "1px solid rgba(42,42,42,0.06)", paddingTop: 12 }}>
                Resumo gerado pelo tutor a partir de observações registradas no app. Não constitui avaliação clínica.
              </div>
            </div>

            <a
              href={buildWhatsAppLink(
                `Resumo — ${profile && profile.nome ? profile.nome : "meu gato"}\nÚltimos 30 dias · gerado em ${new Date().toLocaleDateString("pt-BR")}\n\n` +
                sortedDates.slice(0, 30).map((date) => {
                  const e = entries[date];
                  return `${new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}: água ${e.agua.toLowerCase()}, apetite ${e.apetite.toLowerCase()}, humor ${e.humor.toLowerCase()}${e.corUrina && e.corUrina !== "Normal" ? `, urina: ${e.corUrina.toLowerCase()}` : ""}`;
                }).join("\n") +
                (exames.length > 0 ? `\n\nExames:\n` + exames.slice(0, 15).map((ex) => `${ex.data ? new Date(ex.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}: ${ex.tipo}${ex.valor ? ` — ${ex.valor}` : ""}`).join("\n") : ""),
                profile && profile.vetTelefone
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", textAlign: "center", padding: 12, borderRadius: 14, border: "none", background: "#25D366", color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: "none", marginBottom: 8 }}
            >
              📲 Enviar por WhatsApp
            </a>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleSavePdf("report")}
                disabled={pdfLoading === "report"}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: pdfLoading === "report" ? "wait" : "pointer", opacity: pdfLoading === "report" ? 0.7 : 1 }}
              >
                {pdfLoading === "report" ? "Gerando PDF..." : "Salvar PDF"}
              </button>
              <button
                onClick={() => setShowReport(false)}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${GREY}`, background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div ref={manualRef} style={{ background: "#fff" }}>
              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 2 }}>
                Manual do Tutor — {profile && profile.nome ? profile.nome : "seu gato"}
              </div>
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 18 }}>Folha única para deixar com quem cuidar dele</div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TEAL, marginBottom: 4 }}>Rotina de horários</div>
                <div style={{ fontSize: 13, color: INK, whiteSpace: "pre-line" }}>
                  {(profile && profile.rotinaHorarios) || "Nenhuma rotina cadastrada ainda — edite o perfil para adicionar."}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TEAL, marginBottom: 4 }}>Veterinário</div>
                <div style={{ fontSize: 13, color: INK }}>
                  {(profile && profile.vetNome) || "Não informado"}{profile && profile.vetTelefone ? ` — ${profile.vetTelefone}` : ""}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: TEAL, marginBottom: 4 }}>Contato de emergência</div>
                <div style={{ fontSize: 13, color: INK }}>
                  {(profile && profile.contatoEmergencia) || "Não informado"}
                </div>
              </div>

              <div style={{ fontSize: 10, color: GREY, fontStyle: "italic", margin: "0 0 16px", borderTop: "1px solid rgba(42,42,42,0.06)", paddingTop: 12 }}>
                Em qualquer dúvida ou mudança de comportamento, ligue para o veterinário. Este material é só organização — não substitui orientação profissional.
              </div>
            </div>

            <a
              href={buildWhatsAppLink(
                `Manual do Tutor — ${profile && profile.nome ? profile.nome : "meu gato"}\n\n` +
                `Rotina de horários:\n${(profile && profile.rotinaHorarios) || "Nenhuma rotina cadastrada"}\n\n` +
                `Veterinário: ${(profile && profile.vetNome) || "Não informado"}${profile && profile.vetTelefone ? ` — ${profile.vetTelefone}` : ""}\n\n` +
                `Contato de emergência: ${(profile && profile.contatoEmergencia) || "Não informado"}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", textAlign: "center", padding: 12, borderRadius: 14, border: "none", background: "#25D366", color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, textDecoration: "none", marginBottom: 8 }}
            >
              📲 Enviar por WhatsApp
            </a>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleSavePdf("manual")}
                disabled={pdfLoading === "manual"}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: pdfLoading === "manual" ? "wait" : "pointer", opacity: pdfLoading === "manual" ? 0.7 : 1 }}
              >
                {pdfLoading === "manual" ? "Gerando PDF..." : "Salvar PDF"}
              </button>
              <button
                onClick={() => setShowManual(false)}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${GREY}`, background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showScoreInfo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 360, width: "100%" }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>A regra dos 35 pontos</div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginBottom: 14 }}>
              A escala tem 7 categorias, cada uma de 0 a 10 — o total máximo é 70. Na proposta original da Dra. Villalobos, uma pontuação a partir de <strong>35</strong> (metade do total) costuma indicar que a rotina atual está mantendo conforto e dignidade razoáveis para o pet.
            </div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginBottom: 18 }}>
              Pontuação abaixo disso não é um diagnóstico — é um sinal para conversar com seu veterinário sobre como as coisas estão indo.
            </div>
            <button
              onClick={() => setShowScoreInfo(false)}
              style={{ width: "100%", padding: 12, borderRadius: 14, border: "none", background: TEAL, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 380, width: "100%" }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Restaurar este backup?</div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginBottom: 10 }}>
              Isso vai <strong>substituir os dados atuais</strong> pelos deste arquivo — diário, exames, agenda, remédios, gastos e perfil. Não dá pra desfazer depois.
            </div>
            {pendingImport.exportedAt && (
              <div style={{ fontSize: 11.5, color: GREY, marginBottom: 18 }}>
                Backup gerado em {new Date(pendingImport.exportedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={cancelImportBackup}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${GREY}`, background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmImportBackup}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Sim, restaurar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteExameIndex !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 360, width: "100%" }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Apagar esse exame?</div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginBottom: 18 }}>
              {exames[deleteExameIndex] && (
                <>
                  <strong>{exames[deleteExameIndex].tipo}</strong>
                  {exames[deleteExameIndex].valor ? ` — ${exames[deleteExameIndex].valor}` : ""}
                  {exames[deleteExameIndex].data ? ` (${new Date(exames[deleteExameIndex].data + "T12:00:00").toLocaleDateString("pt-BR")})` : ""}
                  {" "}vai ser apagado. Essa ação não pode ser desfeita.
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteExameIndex(null)}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${GREY}`, background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteExame}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteGastoIndex !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(35,35,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, maxWidth: 360, width: "100%" }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Apagar esse gasto?</div>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginBottom: 18 }}>
              {gastos[deleteGastoIndex] && (
                <>
                  <strong>{gastos[deleteGastoIndex].categoria || "Outro"}</strong>
                  {gastos[deleteGastoIndex].valor ? ` — R$ ${Number(gastos[deleteGastoIndex].valor).toFixed(2)}` : ""}
                  {gastos[deleteGastoIndex].data ? ` (${new Date(gastos[deleteGastoIndex].data + "T12:00:00").toLocaleDateString("pt-BR")})` : ""}
                  {" "}vai ser apagado. Essa ação não pode ser desfeita.
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteGastoIndex(null)}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${GREY}`, background: "#fff", color: INK, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteGasto}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: TERRACOTTA, color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

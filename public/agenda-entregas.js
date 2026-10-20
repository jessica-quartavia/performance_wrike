import { formatPersonName } from "./person-format.js";
import { personColorStyle } from "./person-color.js";
import { formatSquadLabel, squadsFromTask } from "./squad-format.js";

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[c]);
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatDateISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDisplayDate(iso) {
  const date = parseISO(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function weekRangeLabel(segundaIso, sextaIso) {
  return `${formatDisplayDate(segundaIso)} – ${formatDisplayDate(sextaIso)}`;
}

function statusBadge(tarefa) {
  if (tarefa.cancelada) return `<span class="agenda-badge is-cancelled">Cancelada</span>`;
  if (tarefa.concluida) return `<span class="agenda-badge is-done">Concluída</span>`;
  if (tarefa.atrasada) return `<span class="agenda-badge is-late">Atrasada</span>`;
  const st = (tarefa.nome_status || "").toLowerCase();
  if (st.includes("progress") || st === "active") return `<span class="agenda-badge is-progress">Em andamento</span>`;
  return `<span class="agenda-badge is-open">${escapeHtml(tarefa.nome_status || "Pendente")}</span>`;
}

function squadTag(raw) {
  const { display, original, isEmpty } = formatSquadLabel(raw);
  const title = original && original !== display ? escapeHtml(original) : "";
  const cls = isEmpty ? "agenda-squad-tag is-empty" : "agenda-squad-tag";
  return `<span class="${cls}"${title ? ` title="${title}"` : ""}><span class="agenda-squad-tag-icon" aria-hidden="true">◫</span>${escapeHtml(display)}</span>`;
}

function squadTagsRow(tarefa) {
  const squads = squadsFromTask(tarefa);
  if (!squads.length) return `<div class="agenda-squad-tags">${squadTag("Sem squad")}</div>`;
  return `<div class="agenda-squad-tags">${squads.map((s) => squadTag(s)).join("")}</div>`;
}

function taskMeta(tarefa) {
  if (!tarefa.importancia) return "";
  return `<p class="agenda-task-meta">${escapeHtml(tarefa.importancia)}</p>`;
}

function taskCard(tarefa, personNome) {
  const cls = ["agenda-task"];
  if (tarefa.atrasada) cls.push("is-late");
  if (tarefa.concluida) cls.push("is-done");
  const href = tarefa.link_wrike || "#";
  const style = personColorStyle(personNome || "Sem responsável");
  const desc = tarefa.descricao_resumo
    ? `<p class="agenda-task-desc">${escapeHtml(tarefa.descricao_resumo)}${tarefa.descricao_resumo.length >= 120 ? "…" : ""}</p>`
    : "";
  const prazo = tarefa.prazo ? `<span class="agenda-task-prazo">${formatDisplayDate(tarefa.prazo)}</span>` : "";
  return `<a class="${cls.join(" ")}" style="${style}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" title="Abrir no Wrike: ${escapeHtml(tarefa.titulo)}">
    <span class="agenda-task-title">${escapeHtml(tarefa.titulo)}</span>
    ${squadTagsRow(tarefa)}
    ${taskMeta(tarefa)}
    ${desc}
    <div class="agenda-task-foot">${statusBadge(tarefa)}${prazo}</div>
  </a>`;
}

function renderSemPrazo(items) {
  if (!items?.length) return "";
  const cards = items.map((t) => taskCard(t, t._person || "Sem responsável")).join("");
  return `<section class="agenda-unscheduled">
    <header class="section-head section-head-compact"><h3>Sem prazo na semana</h3><p class="note-muted">Tarefas pendentes sem data de vencimento (amostra)</p></header>
    <div class="agenda-list-flat">${cards}</div>
  </section>`;
}

function renderListView(dias) {
  const rows = [];
  for (const dia of dias) {
    for (const grupo of dia.grupos || []) {
      for (const tarefa of grupo.tarefas || []) {
        rows.push({ dia, grupo, tarefa });
      }
    }
  }
  rows.sort((a, b) => {
    const d = a.dia.data.localeCompare(b.dia.data);
    if (d) return d;
    const p = a.grupo.nome.localeCompare(b.grupo.nome, "pt-BR");
    if (p) return p;
    return a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR");
  });
  if (!rows.length) {
    return `<div class="agenda-empty-state"><p>Nenhuma entrega com prazo nesta semana.</p><span class="note-muted">Ajuste filtros ou navegue para outra semana.</span></div>`;
  }
  return `<div class="agenda-list-table-wrap"><table class="agenda-list-table">
    <thead><tr><th>Dia</th><th>Responsável</th><th>Tarefa</th><th>Status</th><th>Prazo</th></tr></thead>
    <tbody>${rows
      .map(
        ({ dia, grupo, tarefa }) => `<tr class="${tarefa.atrasada ? "is-late-row" : ""}" style="${personColorStyle(grupo.nome)}">
      <td>${formatDisplayDate(dia.data)}</td>
      <td>${formatPersonName(grupo.nome, escapeHtml)}</td>
      <td><a class="agenda-list-link" href="${escapeHtml(tarefa.link_wrike || "#")}" target="_blank" rel="noreferrer">${escapeHtml(tarefa.titulo)}</a>${squadTagsRow(tarefa)}</td>
      <td>${statusBadge(tarefa)}</td>
      <td>${tarefa.prazo ? formatDisplayDate(tarefa.prazo) : "—"}</td>
    </tr>`,
      )
      .join("")}</tbody></table></div>`;
}

function agendaKpiCard({ title, value, note, tone }) {
  const icons = { previstas: "◫", concluidas: "✓", pendentes: "◷", atrasadas: "!" };
  return `<article class="agenda-stat-card agenda-stat-${tone}">
    <header class="agenda-stat-head">
      <h3 class="agenda-stat-title">${escapeHtml(title)}</h3>
      <span class="agenda-stat-icon" aria-hidden="true">${icons[tone]}</span>
    </header>
    <p class="agenda-stat-value">${escapeHtml(String(value))}</p>
    ${note ? `<p class="agenda-stat-note">${escapeHtml(note)}</p>` : ""}
  </article>`;
}

export function renderAgendaBoard(data, { mobileDayIndex = 0, viewMode = "week" } = {}) {
  const dias = data.dias || [];
  const m = data.metricas || {};
  const semana = data.semana || {};
  const meta = data.meta || {};
  const fmt = (v) => (v == null ? "0" : new Intl.NumberFormat("pt-BR").format(v));
  const fonte =
    meta.fonte === "wrike"
      ? "API Wrike (servidor)"
      : meta.fonte === "supabase"
        ? "Supabase · prazo_em"
        : "Agenda";
  const diag = meta.aviso_integracao
    ? `<details class="agenda-source-diag"><summary>Diagnóstico da integração</summary><p>${escapeHtml(meta.aviso_integracao)}</p></details>`
    : "";

  const kpi = `<div class="agenda-kpi-row">
    ${agendaKpiCard({ title: "Entregas previstas", value: fmt(m.previstas), note: "Tarefas únicas na semana", tone: "previstas" })}
    ${agendaKpiCard({ title: "Concluídas", value: fmt(m.concluidas), note: "Com prazo nesta semana", tone: "concluidas" })}
    ${agendaKpiCard({ title: "Pendentes", value: fmt(m.pendentes), note: "Ainda em aberto", tone: "pendentes" })}
    ${agendaKpiCard({ title: "Atrasadas", value: fmt(m.atrasadas), note: "Prazo vencido", tone: "atrasadas" })}
  </div>`;

  const columns = dias.map((dia, index) => {
    const groups = (dia.grupos || []).map((grupo) => {
      const tasks = (grupo.tarefas || []).map((t) => taskCard(t, grupo.nome)).join("");
      return `<div class="agenda-group" style="${personColorStyle(grupo.nome)}">
        <h4 class="agenda-person">${formatPersonName(grupo.nome, escapeHtml)}</h4>
        <div class="agenda-tasks">${tasks}</div>
      </div>`;
    }).join("");
    const classes = ["agenda-day-col"];
    if (dia.is_hoje) classes.push("is-today");
    if (index === mobileDayIndex) classes.push("is-mobile-active");
    const respCount = new Set((dia.grupos || []).map((g) => g.nome)).size;
    const empty = !groups
      ? `<div class="agenda-day-empty"><span class="agenda-day-empty-icon" aria-hidden="true">—</span><p>Sem entregas</p></div>`
      : groups;
    return `<article class="${classes.join(" ")}" data-day-index="${index}">
      <header class="agenda-day-head">
        <div class="agenda-day-head-top">
          <h3>${escapeHtml(dia.dia_semana?.replace("-feira", "") || "")}</h3>
          ${dia.is_hoje ? `<span class="agenda-today-pill">Hoje</span>` : ""}
        </div>
        <p class="agenda-day-date">${formatDisplayDate(dia.data)}</p>
        <span class="agenda-day-count"><strong>${fmt(dia.quantidade)}</strong> entrega(s) · ${respCount} resp.</span>
      </header>
      <div class="agenda-day-body">${empty}</div>
    </article>`;
  }).join("");

  const mobileTabs =
    dias.length > 1 && viewMode === "week"
      ? `<div class="agenda-mobile-tabs" role="tablist">${dias
          .map(
            (dia, i) =>
              `<button type="button" class="agenda-mobile-tab${i === mobileDayIndex ? " is-active" : ""}${dia.is_hoje ? " is-today-tab" : ""}" data-mobile-day="${i}" role="tab">${escapeHtml(dia.dia_semana?.slice(0, 3) || "")}</button>`,
          )
          .join("")}</div>`
      : "";

  const board =
    viewMode === "list"
      ? `<div class="agenda-panel agenda-panel-list">${renderListView(dias)}</div>`
      : `<div class="agenda-panel agenda-panel-week"><div class="agenda-board">${columns}</div></div>`;

  return `<section id="sec-agenda" class="section-block agenda-section">
    <header class="agenda-page-head">
      <div>
        <p class="agenda-eyebrow">Planejamento semanal</p>
        <h2 class="agenda-title">Agenda de entregas</h2>
        <p class="agenda-week-range">${weekRangeLabel(semana.segunda, semana.sexta)}</p>
        <p class="agenda-source note-muted" title="Origem dos dados da semana">Fonte: ${escapeHtml(fonte)} ${diag}</p>
      </div>
    </header>
    ${kpi}
    ${mobileTabs}
    ${board}
    ${renderSemPrazo(data.sem_prazo)}
  </section>`;
}

export function renderAgendaSkeleton() {
  return `<div class="loading-state"><div class="skeleton skeleton-title"></div><div class="skeleton-row">${"<div class='skeleton skeleton-kpi'></div>".repeat(4)}</div><div class="skeleton skeleton-chart"></div></div>`;
}

export function buildAgendaQuery({ segunda, squad, pessoa, busca, apenasPendentes }) {
  const params = new URLSearchParams();
  params.set("segunda", segunda);
  if (squad) {
    if (/^\d+$/.test(String(squad))) params.set("squad", squad);
    else params.set("squad_nome", squad);
  }
  if (pessoa) params.set("pessoa", pessoa);
  if (busca?.trim()) params.set("busca", busca.trim());
  if (apenasPendentes) params.set("apenas_pendentes", "1");
  return params;
}

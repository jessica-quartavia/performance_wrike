import { DateRangePicker, formatDateISO, presetRange } from "./date-range-picker.js";
import {
  isApiV2,
  kpiScopeKind,
  kpiSubtext,
  peopleTableFootnote,
  periodPartialNoticeHtml,
  resumoSectionLead,
  sectionSubtext,
  SCOPE_KIND,
} from "./period-scope.js";
import { formatPersonName } from "./person-format.js";
import {
  addDays,
  buildAgendaQuery,
  formatDateISO as agendaFormatISO,
  mondayOf,
  renderAgendaBoard,
  renderAgendaSkeleton,
  weekRangeLabel,
} from "./agenda-entregas.js";

const STORAGE_KEY = "perf_wrike_ui_v2";
const $ = (selector) => document.querySelector(selector);
const dashboard = $("#dashboard");
const formatNumber = new Intl.NumberFormat("pt-BR");

let dimensionsLoaded = false;
let loadSeq = 0;
let loadAgendaSeq = 0;
let lastPayload = null;
let lastAgendaPayload = null;
let lastAgendaFilterCatalog = { pessoas: [], squads: [] };
let activeView = "performance";
let agendaMobileDay = 0;
let agendaViewMode = "week";
const auditPageSize = 10;
let auditPage = 1;
let auditRows = [];
let auditSearch = "";
let peopleSort = { key: "em_andamento", dir: -1 };

const state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const period = parsed.period?.todoPeriodo
      ? presetRange("todo")
      : {
          todoPeriodo: false,
          preset: parsed.period?.preset || "30d",
          start: parsed.period?.startISO ? new Date(parsed.period.startISO) : presetRange("30d").start,
          end: parsed.period?.endISO ? new Date(parsed.period.endISO) : presetRange("30d").end,
        };
    return {
      pinned: parsed.pinned !== false,
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      period,
      squad: parsed.squad || "",
      pessoa: parsed.pessoa || "",
      agendaSegunda: parsed.agendaSegunda || agendaFormatISO(mondayOf(new Date())),
      agendaBusca: parsed.agendaBusca || "",
      agendaPendentes: Boolean(parsed.agendaPendentes),
      agendaViewMode: parsed.agendaViewMode === "list" ? "list" : "week",
      agendaPessoa: parsed.agendaPessoa ?? parsed.pessoa ?? "",
      agendaSquad: parsed.agendaSquad ?? parsed.squad ?? "",
    };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    pinned: true,
    sidebarCollapsed: false,
    period: presetRange("30d"),
    squad: "",
    pessoa: "",
    agendaSegunda: agendaFormatISO(mondayOf(new Date())),
    agendaBusca: "",
    agendaPendentes: false,
    agendaViewMode: "week",
    agendaPessoa: "",
    agendaSquad: "",
  };
}

function saveState() {
  const period = state.period;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      pinned: state.pinned,
      sidebarCollapsed: state.sidebarCollapsed,
      squad: state.squad,
      pessoa: state.pessoa,
      agendaSegunda: state.agendaSegunda,
      agendaBusca: state.agendaBusca,
      agendaPendentes: state.agendaPendentes,
      agendaViewMode: state.agendaViewMode,
      agendaPessoa: state.agendaPessoa,
      agendaSquad: state.agendaSquad,
      period: {
        todoPeriodo: period.todoPeriodo,
        preset: period.preset,
        startISO: period.start && !period.todoPeriodo ? formatDateISO(period.start) : null,
        endISO: period.end && !period.todoPeriodo ? formatDateISO(period.end) : null,
      },
    }),
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]);
}

function formatValue(value) {
  return value == null ? "—" : formatNumber.format(value);
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function kpiCard(label, value, note, options = {}) {
  const classes = ["kpi-card"];
  if (options.featured) classes.push("kpi-card-featured");
  if (options.highlight) classes.push("kpi-card-highlight");
  const noteClasses = ["kpi-note"];
  if (options.scopeKind === SCOPE_KIND.PERIOD) noteClasses.push("kpi-note-period");
  else if (options.scopeKind === SCOPE_KIND.BACKLOG_CURRENT) noteClasses.push("kpi-note-current");
  else if (options.scopeKind === SCOPE_KIND.BACKLOG) noteClasses.push("kpi-note-backlog");
  const tip = options.tooltip
    ? `<span class="kpi-help" tabindex="0" title="${escapeHtml(options.tooltip)}">?</span>`
    : "";
  return `<article class="${classes.join(" ")}"${options.tooltip ? ` title="${escapeHtml(options.tooltip)}"` : ""}>
    <div class="kpi-top"><div class="kpi-label">${escapeHtml(label)}</div>${tip}</div>
    <div class="kpi-value">${formatValue(value)}</div>
    <div class="${noteClasses.join(" ")}">${escapeHtml(note)}</div>
  </article>`;
}

function kpiOpts(metricKey, data, extra = {}) {
  return { scopeKind: kpiScopeKind(metricKey, data), ...extra };
}

const CHART_COLORS = ["#e85d3a", "#2f6fed", "#0d9488", "#9333ea", "#ca8a04", "#64748b", "#db2777", "#0891b2"];

function bars(items, total, labelKey = "nome", valueKey = "quantidade", empty = "Sem dados neste recorte.", suffix = "") {
  if (!items?.length) return `<p class="placeholder-note">${escapeHtml(empty)}</p>`;
  const max = Math.max(total || 0, ...items.map((item) => Number(item[valueKey]) || 0), 1);
  return `<div class="bar-list">${items.map((item, index) => {
    const val = Number(item[valueKey]) || 0;
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return `<div class="bar-row" title="${escapeHtml(item[labelKey])}: ${formatValue(val)}${suffix}">
      <div class="bar-heading"><span>${escapeHtml(item[labelKey])}</span><strong>${formatValue(val)}${suffix}</strong></div>
      <div class="bar-track"><span class="bar-fill" style="width:${percent(val, max)}%;background:${color}"></span></div>
    </div>`;
  }).join("")}</div>`;
}

function notice(text) {
  return `<div class="sc-methodology-banner">${escapeHtml(text)}</div>`;
}

function limitation(text) {
  return `<div class="limitation-banner">${escapeHtml(text)}</div>`;
}

function apiConsultaVersao2(data) {
  return isApiV2(data);
}

function validarCoerenciaPeriodo(data) {
  const diag = data?.meta?.diagnostico_periodo;
  if (!diag) return;
  if (diag.versao_sql === 1) {
    console.warn(
      "[Performance Wrike] API SQL legada: gráficos e tabelas usam backlog completo; apenas alguns KPIs de fluxo mudam com o período.",
      diag,
    );
    return;
  }
  if (diag.coerente_escopo_status === false) {
    console.warn("[Performance Wrike] Inconsistência: soma de status difere do escopo temporal.", diag);
  }
}

function bannerPeriodoParcial(data) {
  if (apiConsultaVersao2(data)) return "";
  return periodPartialNoticeHtml(escapeHtml);
}

function table(headers, rows, empty = "Nenhum registro.", options = {}) {
  if (!rows?.length) return `<p class="placeholder-note">${escapeHtml(empty)}</p>`;
  const head = headers.map((header) => {
    if (header && typeof header === "object" && header.html) return `<th class="${header.className || ""}">${header.html}</th>`;
    return `<th>${escapeHtml(String(header))}</th>`;
  }).join("");
  const colgroup = options.colgroup ? `<colgroup>${options.colgroup}</colgroup>` : "";
  return `<div class="table-wrap ${options.wrapClass || ""}"><table class="gd-table ${options.className || ""}">${colgroup}<thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function peopleHeader(key, label) {
  const active = peopleSort.key === key;
  const arrow = active ? (peopleSort.dir > 0 ? "↑" : "↓") : "↕";
  return {
    className: key === "nome" ? "th-sortable" : "th-sortable num",
    html: `<button type="button" class="th-sort${active ? " is-active" : ""}" data-people-sort="${key}"><span>${escapeHtml(label)}</span><span class="sort-arrow" aria-hidden="true">${arrow}</span></button>`,
  };
}

function taskLink(item) {
  return item.link_wrike ? `<a href="${escapeHtml(item.link_wrike)}" target="_blank" rel="noreferrer">${escapeHtml(item.titulo)}</a>` : escapeHtml(item.titulo);
}

function periodHint(data) {
  const p = data.periodo || {};
  if (p.todo_periodo) return "Todo o histórico";
  if (p.inicio && p.fim) return `${p.inicio} a ${p.fim}`;
  return "Período atual";
}

function sortedPeople(pessoas) {
  const rows = [...(pessoas || [])];
  rows.sort((a, b) => {
    const av = a[peopleSort.key];
    const bv = b[peopleSort.key];
    if (typeof av === "string") return peopleSort.dir * av.localeCompare(bv, "pt-BR");
    return peopleSort.dir * ((Number(av) || 0) - (Number(bv) || 0));
  });
  return rows;
}

function filteredAuditRows() {
  let rows = [...auditRows];
  if (auditSearch.trim()) {
    const q = auditSearch.trim().toLowerCase();
    rows = rows.filter((row) => row.titulo?.toLowerCase().includes(q) || row.problemas?.toLowerCase().includes(q));
  }
  rows.sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"));
  return rows;
}

function renderAuditTable() {
  const rowsAll = filteredAuditRows();
  if (!rowsAll.length) {
    return auditSearch
      ? `<p class="placeholder-note">Nenhum resultado para a busca.</p>`
      : table(["Tarefa", "Pendência"], [], "Nenhuma pendência no recorte.");
  }
  const totalPages = Math.max(1, Math.ceil(rowsAll.length / auditPageSize));
  auditPage = Math.min(Math.max(auditPage, 1), totalPages);
  const start = (auditPage - 1) * auditPageSize;
  const currentRows = rowsAll.slice(start, start + auditPageSize);
  const rows = currentRows.map((item) => `<tr><td>${taskLink(item)}</td><td><span class="badge badge-frozen">${escapeHtml(item.problemas)}</span></td></tr>`);
  const rangeEnd = start + currentRows.length;
  return `
    <div class="table-toolbar">
      <input type="search" class="table-search" placeholder="Buscar…" value="${escapeHtml(auditSearch)}" aria-label="Buscar na auditoria" />
    </div>
    ${table(["Tarefa", "Pendência"], rows)}
    <nav class="table-pagination" aria-label="Paginação da auditoria">
      <span aria-live="polite">${start + 1}–${rangeEnd} de ${rowsAll.length}</span>
      <div class="pagination-controls">
        <button class="btn btn-ghost btn-sm" type="button" data-audit-page="${auditPage - 1}" ${auditPage === 1 ? "disabled" : ""}>Anterior</button>
        <span>${auditPage}/${totalPages}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-audit-page="${auditPage + 1}" ${auditPage === totalPages ? "disabled" : ""}>Próxima</button>
      </div>
    </nav>`;
}

function updateDimensions(data) {
  if (dimensionsLoaded) return;
  for (const [selector, rows] of [
    ["#squad", data.squads],
    ["#pessoa", data.pessoas],
  ]) {
    const select = $(selector);
    if (!select) continue;
    select.insertAdjacentHTML("beforeend", (rows || []).map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.nome)}</option>`).join(""));
  }
  dimensionsLoaded = true;
}

function fillFilterSelect(select, placeholder, rows, selectedValue) {
  if (!select || !rows?.length) return;
  const current = selectedValue ?? select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...rows.map((row) => `<option value="${escapeHtml(String(row.id))}">${escapeHtml(row.nome)}</option>`),
  ].join("");
  if (current && rows.some((row) => String(row.id) === String(current))) select.value = current;
  else select.value = "";
}

function syncAgendaFilterOptions(data) {
  const fallbackPessoas = lastPayload?.pessoas?.map((p) => ({ id: String(p.id), nome: p.nome })) || [];
  const fallbackSquads = lastPayload?.squads?.map((s) => ({ id: String(s.id), nome: s.nome })) || [];
  const pessoas = data.responsaveis?.length
    ? data.responsaveis
    : lastAgendaFilterCatalog.pessoas.length
      ? lastAgendaFilterCatalog.pessoas
      : fallbackPessoas;
  const squads = data.squads?.length
    ? data.squads
    : lastAgendaFilterCatalog.squads.length
      ? lastAgendaFilterCatalog.squads
      : fallbackSquads;
  if (data.responsaveis?.length || data.squads?.length) {
    lastAgendaFilterCatalog = {
      pessoas: data.responsaveis?.length ? data.responsaveis : lastAgendaFilterCatalog.pessoas,
      squads: data.squads?.length ? data.squads : lastAgendaFilterCatalog.squads,
    };
  }
  fillFilterSelect($("#agenda-pessoa"), "Todos", pessoas, state.agendaPessoa);
  fillFilterSelect($("#agenda-squad"), "Todas", squads, state.agendaSquad);
}

function paintAgendaViewToggle() {
  $("#agenda-view-week")?.classList.toggle("is-active", state.agendaViewMode === "week");
  $("#agenda-view-list")?.classList.toggle("is-active", state.agendaViewMode === "list");
  $("#agenda-view-week")?.classList.toggle("btn-primary", state.agendaViewMode === "week");
  $("#agenda-view-week")?.classList.toggle("btn-ghost", state.agendaViewMode !== "week");
  $("#agenda-view-list")?.classList.toggle("btn-primary", state.agendaViewMode === "list");
  $("#agenda-view-list")?.classList.toggle("btn-ghost", state.agendaViewMode !== "list");
}

function refreshAgendaBoard() {
  if (!lastAgendaPayload) return;
  dashboard.innerHTML = renderAgendaBoard(lastAgendaPayload, { mobileDayIndex: agendaMobileDay, viewMode: state.agendaViewMode });
  paintAgendaViewToggle();
}

function renderEmptyPeriod(data) {
  const hint = periodHint(data);
  return `<div class="empty-period">
    <h2>Recorte vazio</h2>
    <p>Nenhuma tarefa em <strong>${escapeHtml(hint)}</strong> com os filtros atuais.</p>
    <p class="note-muted">Amplie o período ou remova filtros de squad e responsável.</p>
  </div>`;
}

function render(data) {
  updateDimensions(data);
  lastPayload = data;
  const { metricas = {}, squads = [], pessoas = [], status = [], auditoria = [], avisos = [], definicoes = {}, limitacoes = [] } = data;
  const cobertura = percent(metricas.com_okr, metricas.total);
  auditRows = auditoria;
  auditPage = 1;
  const ph = periodHint(data);
  const defs = definicoes || {};

  $("#subtitulo").textContent = data.periodo?.todo_periodo
    ? "Base completa sincronizada do Wrike."
    : `Recorte: ${data.periodo?.inicio || "—"} → ${data.periodo?.fim || "—"}`;
  $("#atualizado-em").textContent = `Atualizado ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date())}`;

  datePicker.setPeriodFilterCapability(apiConsultaVersao2(data));
  if ((metricas.total || 0) === 0) {
    dashboard.innerHTML = `${bannerPeriodoParcial(data)}${(avisos || []).slice(0, 1).map(notice).join("")}${renderEmptyPeriod(data)}`;
    return;
  }

  const peopleRows = sortedPeople(pessoas).map(
    (item) => `<tr>
      <td>${formatPersonName(item.nome, escapeHtml)}</td>
      <td class="num">${formatValue(item.em_andamento)}</td>
      <td class="num">${formatValue(item.entregues)}</td>
      <td class="num">${item.dias_ciclo_medio == null ? "—" : `${escapeHtml(item.dias_ciclo_medio)} d`}</td>
    </tr>`,
  );

  const totalLabel = apiConsultaVersao2(data) ? "No escopo" : "Total de tarefas";
  dashboard.innerHTML = `
    ${bannerPeriodoParcial(data)}
    ${(limitacoes || []).slice(0, 2).map(limitation).join("")}
    <section id="sec-resumo" class="section-block">
      <header class="section-head"><h2>Indicadores principais</h2><p class="section-lead">${escapeHtml(ph)} · ${escapeHtml(resumoSectionLead(data))}</p></header>
      <div class="kpi-row">
        ${kpiCard(totalLabel, metricas.total, kpiSubtext("total", data), kpiOpts("total", data, { featured: true, tooltip: defs.total }))}
        ${kpiCard("Criadas", metricas.criadas ?? 0, kpiSubtext("criadas", data), kpiOpts("criadas", data, { tooltip: defs.criadas }))}
        ${kpiCard("Entregues", metricas.entregues, kpiSubtext("entregues", data), kpiOpts("entregues", data, { tooltip: defs.entregues }))}
        ${kpiCard("Em andamento", metricas.em_andamento, kpiSubtext("em_andamento", data), kpiOpts("em_andamento", data, { tooltip: defs.em_andamento }))}
        ${kpiCard("Canceladas", metricas.cancelados, kpiSubtext("cancelados", data), kpiOpts("cancelados", data, { tooltip: defs.cancelados }))}
        ${kpiCard("Pendências", metricas.itens_com_problema, kpiSubtext("itens_com_problema", data), kpiOpts("itens_com_problema", data, { highlight: true, tooltip: defs.itens_com_problema }))}
      </div>
    </section>
    <section id="sec-esforco" class="section-block">
      <header class="section-head section-head-compact"><h2>Distribuição do trabalho</h2></header>
      <div class="chart-grid">
      <article class="chart-card">
        <header class="card-heading"><h3>Carga por squad</h3><p class="scope-note">${escapeHtml(sectionSubtext("squads_carga", data))}</p></header>
        ${bars(squads.filter((s) => s.em_andamento > 0), metricas.em_andamento, "nome", "em_andamento", "Sem carga em andamento.")}
      </article>
      <article class="chart-card">
        <header class="card-heading"><h3>Distribuição por status</h3><p class="scope-note">${escapeHtml(sectionSubtext("status", data))}</p></header>
        ${bars(status, metricas.total)}
      </article>
      </div>
    </section>
    <section id="sec-okr" class="section-block">
      <header class="section-head"><h2>OKRs</h2><p class="section-lead">Cobertura estratégica (não causal) · ${escapeHtml(sectionSubtext("squads_okr", data))}</p></header>
      <div class="kpi-row kpi-row-compact">
        ${kpiCard("Com OKR", metricas.com_okr, kpiSubtext("com_okr", data), kpiOpts("com_okr", data, { featured: true, tooltip: defs.com_okr }))}
        ${kpiCard("Sem OKR", (metricas.total || 0) - (metricas.com_okr || 0), kpiSubtext("com_okr", data), kpiOpts("com_okr", data, { highlight: true }))}
      </div>
      <article class="chart-card chart-card-inline">
        <header class="card-heading"><h3>Cobertura por squad</h3><p class="scope-note">${escapeHtml(sectionSubtext("squads_okr", data))}</p></header>
        ${bars(squads.map((item) => ({ nome: item.nome, quantidade: item.cobertura_okr || 0 })), 100, "nome", "quantidade", "—", "%")}
      </article>
    </section>
    <section id="sec-pessoas" class="section-block">
      <article class="chart-card chart-card-people">
        <header class="card-heading"><h2>Performance por responsável</h2><p class="scope-note">${escapeHtml(peopleTableFootnote(data))}</p></header>
        ${table(
          [
            peopleHeader("nome", "Responsável"),
            peopleHeader("em_andamento", "Em andamento"),
            peopleHeader("entregues", "Entregues"),
            peopleHeader("dias_ciclo_medio", "Cycle time médio"),
          ],
          peopleRows,
          "Sem responsáveis no recorte.",
          {
            className: "people-table",
            wrapClass: "table-wrap-compact",
            colgroup: '<col class="col-person" /><col class="col-num" /><col class="col-num" /><col class="col-num" />',
          },
        )}
      </article>
    </section>
    <section id="sec-auditoria" class="section-block">
      <article class="chart-card">
        <header class="card-heading"><h2>Qualidade das tarefas</h2><p class="scope-note">Auditoria · até 50 itens · ${escapeHtml(sectionSubtext("auditoria", data))}</p></header>
        <div id="auditoria-paginada">${renderAuditTable()}</div>
      </article>
    </section>`;

}

function buildQueryParams() {
  const params = new URLSearchParams();
  const period = state.period;
  if (period.todoPeriodo) params.set("periodo", "todo");
  else if (period.start && period.end) {
    params.set("inicio", formatDateISO(period.start));
    params.set("fim", formatDateISO(period.end));
  }
  if (state.squad) params.set("squad", state.squad);
  if (state.pessoa) params.set("pessoa", state.pessoa);
  return params;
}

function showLoading() {
  dashboard.innerHTML = `<div class="loading-state" aria-busy="true">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton-row">${"<div class='skeleton skeleton-kpi'></div>".repeat(4)}</div>
    <p class="note-muted">Atualizando…</p>
  </div>`;
}

function updateActiveFiltersBadge() {
  const badge = $("#filtros-ativos");
  badge.hidden = !(state.period.todoPeriodo || state.period.preset !== "30d" || state.squad || state.pessoa);
}

function setActiveView(view) {
  activeView = view;
  document.body.classList.toggle("view-agenda", view === "agenda");
  $("#filtros-host").hidden = view === "agenda";
  $("#agenda-filters").hidden = view !== "agenda";
  for (const link of document.querySelectorAll(".nav-link")) link.classList.remove("is-active");
  const navKey = view === "agenda" ? "agenda" : "performance";
  document.querySelector(`.nav-link[data-view='${navKey}']`)?.classList.add("is-active");
  if (view === "agenda") {
    $("#page-title").textContent = "Agenda de entregas";
    $("#subtitulo").textContent = `Semana ${weekRangeLabel(state.agendaSegunda, agendaFormatISO(addDays(parseAgendaDate(state.agendaSegunda), 4)))} · prazos do Wrike`;
    paintAgendaViewToggle();
    loadAgenda();
  } else {
    $("#page-title").textContent = "Performance da equipe";
    loadDashboard();
  }
}

function parseAgendaDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function loadAgenda() {
  const seq = ++loadAgendaSeq;
  dashboard.innerHTML = renderAgendaSkeleton();
  saveState();
  state.agendaSquad = $("#agenda-squad")?.value ?? state.agendaSquad ?? "";
  state.agendaPessoa = $("#agenda-pessoa")?.value ?? state.agendaPessoa ?? "";
  const query = buildAgendaQuery({
    segunda: state.agendaSegunda,
    squad: state.agendaSquad,
    pessoa: state.agendaPessoa,
    busca: state.agendaBusca,
    apenasPendentes: state.agendaPendentes,
  });
  try {
    const response = await fetch(`/api/agenda-entregas?${query}`);
    const data = await response.json();
    if (seq !== loadAgendaSeq) return;
    if (!response.ok) {
      const parts = [data.erro || "Falha ao carregar a agenda.", data.detalhe].filter(Boolean);
      if (data.supabase_status) parts.push(`Supabase: HTTP ${data.supabase_status}.`);
      throw new Error(parts.join(" "));
    }
    if (!data.meta?.versao_agenda || !Array.isArray(data.dias)) {
      throw new Error("Resposta da agenda em formato inesperado.");
    }
    lastAgendaPayload = data;
    state.agendaViewMode = state.agendaViewMode || "week";
    syncAgendaFilterOptions(data);
    refreshAgendaBoard();
  } catch (error) {
    if (seq !== loadAgendaSeq) return;
    dashboard.innerHTML = `<div class="page-inline-error"><h2>Agenda indisponível</h2><p>${escapeHtml(error.message)}</p><p class="note-muted">Verifique WRIKE_ACCESS_TOKEN no .env local ou aplique a migração <code>20261020183000</code> e o deploy de <code>consultar-agenda-entregas</code>.</p></div>`;
  }
}

async function loadDashboard() {
  if (activeView === "agenda") return loadAgenda();
  const seq = ++loadSeq;
  let query = buildQueryParams();
  $("#atualizar").disabled = true;
  showLoading();
  updateActiveFiltersBadge();
  saveState();
  try {
    let response = await fetch(`/api/performance?${query}`);
    let data = await response.json();
    if (seq !== loadSeq) return;
    if (!response.ok) throw new Error(data.erro || "Falha ao carregar indicadores.");
    validarCoerenciaPeriodo(data);
    render(data);
  } catch (error) {
    if (seq !== loadSeq) return;
    dashboard.innerHTML = `<div class="page-inline-error"><h2>Indisponível</h2><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    if (seq === loadSeq) $("#atualizar").disabled = false;
  }
}

function applyPinPreference() {
  $("#filtros-host").classList.toggle("is-pinned", state.pinned);
  $("#fixar-filtros").checked = state.pinned;
}

function applySidebarPreference() {
  $("#app-shell").classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  const toggle = $("#sidebar-toggle");
  toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  toggle.textContent = state.sidebarCollapsed ? "›" : "‹";
  toggle.title = state.sidebarCollapsed ? "Expandir menu" : "Recolher menu";
}

const datePicker = new DateRangePicker($("#date-range-root"), {
  onApply: (range) => {
    state.period = range;
    loadDashboard();
  },
});
datePicker.setApplied(state.period);
$("#squad").value = state.squad;
$("#pessoa").value = state.pessoa;
applyPinPreference();
applySidebarPreference();

function reloadActiveView() {
  if (activeView === "agenda") loadAgenda();
  else loadDashboard();
}

$("#atualizar").addEventListener("click", reloadActiveView);
$("#exportar-xlsx").addEventListener("click", () => window.location.assign("/api/exportar-tarefas.xlsx"));
$("#squad").addEventListener("change", (e) => { state.squad = e.target.value; reloadActiveView(); });
$("#pessoa").addEventListener("change", (e) => { state.pessoa = e.target.value; reloadActiveView(); });
$("#agenda-semana-anterior").addEventListener("click", () => {
  state.agendaSegunda = agendaFormatISO(addDays(parseAgendaDate(state.agendaSegunda), -7));
  agendaMobileDay = 0;
  loadAgenda();
});
$("#agenda-proxima-semana").addEventListener("click", () => {
  state.agendaSegunda = agendaFormatISO(addDays(parseAgendaDate(state.agendaSegunda), 7));
  agendaMobileDay = 0;
  loadAgenda();
});
$("#agenda-esta-semana").addEventListener("click", () => {
  state.agendaSegunda = agendaFormatISO(mondayOf(new Date()));
  agendaMobileDay = 0;
  loadAgenda();
});
$("#agenda-busca").addEventListener("input", (e) => {
  state.agendaBusca = e.target.value;
  loadAgenda();
});
$("#agenda-pendentes").addEventListener("change", (e) => {
  state.agendaPendentes = e.target.checked;
  loadAgenda();
});
$("#agenda-squad")?.addEventListener("change", (e) => {
  state.agendaSquad = e.target.value;
  loadAgenda();
});
$("#agenda-pessoa")?.addEventListener("change", (e) => {
  state.agendaPessoa = e.target.value;
  loadAgenda();
});
$("#agenda-view-week")?.addEventListener("click", () => {
  state.agendaViewMode = "week";
  saveState();
  refreshAgendaBoard();
});
$("#agenda-view-list")?.addEventListener("click", () => {
  state.agendaViewMode = "list";
  saveState();
  refreshAgendaBoard();
});
$("#fixar-filtros").addEventListener("change", (e) => { state.pinned = e.target.checked; applyPinPreference(); saveState(); });
$("#sidebar-toggle").addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarPreference();
  saveState();
});
$("#limpar").addEventListener("click", () => {
  state.period = presetRange("30d");
  state.squad = "";
  state.pessoa = "";
  $("#squad").value = "";
  $("#pessoa").value = "";
  datePicker.setApplied(state.period);
  loadDashboard();
});

dashboard.addEventListener("click", (event) => {
  const auditBtn = event.target.closest("[data-audit-page]");
  if (auditBtn && !auditBtn.disabled) {
    auditPage = Number(auditBtn.dataset.auditPage);
    const auditContainer = $("#auditoria-paginada");
    if (auditContainer) auditContainer.innerHTML = renderAuditTable();
    return;
  }
  const sortBtn = event.target.closest("[data-people-sort]");
  if (sortBtn && lastPayload) {
    const key = sortBtn.dataset.peopleSort;
    peopleSort = { key, dir: peopleSort.key === key ? -peopleSort.dir : key === "nome" ? 1 : -1 };
    render(lastPayload);
  }
});

dashboard.addEventListener("input", (event) => {
  if (event.target.matches(".table-search")) {
    auditSearch = event.target.value;
    auditPage = 1;
    const auditContainer = $("#auditoria-paginada");
    if (auditContainer) auditContainer.innerHTML = renderAuditTable();
  }
});

for (const link of document.querySelectorAll(".nav-link[data-view]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.view === "agenda" ? "agenda" : "performance");
  });
}

dashboard.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-mobile-day]");
  if (!tab || !lastAgendaPayload) return;
  agendaMobileDay = Number(tab.dataset.mobileDay);
  refreshAgendaBoard();
});

if ($("#agenda-busca")) $("#agenda-busca").value = state.agendaBusca;
if ($("#agenda-pendentes")) $("#agenda-pendentes").checked = state.agendaPendentes;
state.agendaViewMode = state.agendaViewMode || "week";

loadDashboard();

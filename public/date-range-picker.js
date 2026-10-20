const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatDateISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISO(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatDisplayRange(start, end, todoPeriodo) {
  if (todoPeriodo) return "Todo o histórico";
  if (!start || !end) return "Selecionar datas";
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const a = fmt.format(start);
  const b = fmt.format(end);
  return a === b ? a : `${a} – ${b}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

export function presetRange(id) {
  const hoje = startOfDay(new Date());
  switch (id) {
    case "todo":
      return { todoPeriodo: true, start: null, end: null, preset: id };
    case "hoje":
      return { todoPeriodo: false, start: hoje, end: hoje, preset: id };
    case "7d":
      return { todoPeriodo: false, start: addDays(hoje, -6), end: hoje, preset: id };
    case "30d":
      return { todoPeriodo: false, start: addDays(hoje, -29), end: hoje, preset: id };
    case "90d":
      return { todoPeriodo: false, start: addDays(hoje, -89), end: hoje, preset: id };
    case "6m":
      return { todoPeriodo: false, start: addDays(hoje, -182), end: hoje, preset: id };
    case "12m":
      return { todoPeriodo: false, start: addDays(hoje, -364), end: hoje, preset: id };
    case "mes":
      return { todoPeriodo: false, start: startOfMonth(hoje), end: hoje, preset: id };
    case "ano":
      return { todoPeriodo: false, start: startOfYear(hoje), end: hoje, preset: id };
    default:
      return { todoPeriodo: false, start: addDays(hoje, -29), end: hoje, preset: "30d" };
  }
}

/** Atalhos habilitados quando a API SQL v2 está implantada (escopo temporal unificado). */
export const PRESETS = [
  { id: "todo", label: "Todo o período" },
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "mes", label: "Este mês" },
  { id: "ano", label: "Este ano" },
];

export class DateRangePicker {
  constructor(root, { onApply }) {
    this.root = root;
    this.onApply = onApply;
    this.open = false;
    this.periodFilterFull = null;
    this.viewMonth = startOfMonth(new Date());
    this.draft = presetRange("30d");
    this.draftStart = null;
    this.draftEnd = null;
    this.renderShell();
    this.bindGlobal();
  }

  /** Registra versão da API (v2) para diagnóstico; não bloqueia o seletor. */
  setPeriodFilterCapability(full) {
    this.periodFilterFull = full;
    this.root.classList.remove("drp-capability-locked");
    if (this.limitBanner) this.limitBanner.hidden = true;
    if (this.chipsHost) this.chipsHost.hidden = false;
    if (this.grid) this.grid.closest(".drp-calendar-block")?.classList.remove("is-disabled");
    const applyBtn = this.popover?.querySelector('[data-action="apply"]');
    if (applyBtn) applyBtn.disabled = false;
  }

  getApplied() {
    return this.applied || presetRange("30d");
  }

  setApplied(state) {
    this.applied = { ...state };
    if (!state.todoPeriodo && state.start) this.viewMonth = startOfMonth(state.start);
    this.syncTrigger();
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="drp-wrap">
        <button type="button" class="drp-trigger" aria-haspopup="dialog" aria-expanded="false">
          <span class="drp-icon" aria-hidden="true">◷</span>
          <span class="drp-text">
            <span class="drp-label">Período</span>
            <span class="drp-value"></span>
          </span>
          <span class="drp-chevron" aria-hidden="true">▾</span>
        </button>
      </div>`;
    this.trigger = this.root.querySelector(".drp-trigger");
    this.popover = document.createElement("div");
    this.popover.className = "drp-popover";
    this.popover.setAttribute("role", "dialog");
    this.popover.setAttribute("aria-label", "Selecionar período");
    this.popover.hidden = true;
    this.popover.innerHTML = `
      <div class="drp-popover-inner">
        <p class="drp-limit-banner" hidden></p>
        <p class="drp-hint">Escolha um atalho ou clique duas datas no calendário.</p>
        <div class="drp-chips"></div>
        <div class="drp-calendar-block">
        <p class="drp-selection" aria-live="polite"></p>
        <div class="drp-calendar-head">
          <button type="button" class="btn btn-ghost btn-icon drp-nav" data-nav="-1" aria-label="Mês anterior">‹</button>
          <strong class="drp-month-label"></strong>
          <button type="button" class="btn btn-ghost btn-icon drp-nav" data-nav="1" aria-label="Próximo mês">›</button>
        </div>
        <div class="drp-weekdays"></div>
        <div class="drp-grid"></div>
        </div>
        <div class="drp-actions">
          <button type="button" class="btn btn-ghost" data-action="clear">Limpar</button>
          <button type="button" class="btn btn-primary" data-action="apply">Aplicar</button>
        </div>
      </div>`;
    document.body.appendChild(this.popover);

    this.limitBanner = this.popover.querySelector(".drp-limit-banner");
    this.chipsHost = this.popover.querySelector(".drp-chips");
    this.grid = this.popover.querySelector(".drp-grid");
    this.monthLabel = this.popover.querySelector(".drp-month-label");
    this.selectionLabel = this.popover.querySelector(".drp-selection");
    this.popover.querySelector(".drp-weekdays").innerHTML = ["D", "S", "T", "Q", "Q", "S", "S"]
      .map((d) => `<span>${d}</span>`).join("");
    this.chipsHost.innerHTML = PRESETS.map((p) => `<button type="button" class="drp-chip" data-preset="${p.id}">${p.label}</button>`).join("");

    this.trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggle(true);
    });
    this.popover.addEventListener("click", (event) => event.stopPropagation());
    this.popover.querySelector('[data-action="apply"]').addEventListener("click", () => this.apply());
    this.popover.querySelector('[data-action="clear"]').addEventListener("click", () => this.clear());
    for (const btn of this.popover.querySelectorAll(".drp-nav")) {
      btn.addEventListener("click", () => this.shiftMonth(Number(btn.dataset.nav)));
    }
    this.chipsHost.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-preset]");
      if (!chip || chip.disabled) return;
      const preset = chip.dataset.preset;
      this.draft = presetRange(preset);
      this.draftStart = this.draft.todoPeriodo ? null : this.draft.start;
      this.draftEnd = this.draft.todoPeriodo ? null : this.draft.end;
      if (this.draftStart) this.viewMonth = startOfMonth(this.draftStart);
      this.highlightChips();
      this.updateSelectionLabel();
      this.paintCalendar();
    });
    this.grid.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-day]");
      if (!cell || cell.disabled) return;
      const date = parseISO(cell.dataset.day);
      if (!date) return;
      this.draft.preset = "custom";
      if (!this.draftStart || (this.draftStart && this.draftEnd)) {
        this.draftStart = date;
        this.draftEnd = null;
      } else if (date < this.draftStart) {
        this.draftEnd = this.draftStart;
        this.draftStart = date;
      } else {
        this.draftEnd = date;
      }
      this.highlightChips();
      this.updateSelectionLabel();
      this.paintCalendar();
    });
  }

  bindGlobal() {
    document.addEventListener("click", () => { if (this.open) this.toggle(false); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open) this.toggle(false);
    });
    window.addEventListener("resize", () => { if (this.open) this.positionPopover(); });
    window.addEventListener("scroll", () => { if (this.open) this.positionPopover(); }, true);
  }

  positionPopover() {
    const rect = this.trigger.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 16);
    this.popover.style.width = `${width}px`;
    let top = rect.bottom + 8;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    const estimatedHeight = 480;
    if (top + estimatedHeight > window.innerHeight - 8) top = Math.max(8, rect.top - estimatedHeight - 8);
    this.popover.style.top = `${top}px`;
    this.popover.style.left = `${left}px`;
  }

  toggle(forceOpen) {
    this.open = typeof forceOpen === "boolean" ? forceOpen : !this.open;
    this.popover.hidden = !this.open;
    this.trigger.setAttribute("aria-expanded", String(this.open));
    if (this.open) {
      const applied = this.getApplied();
      this.draft = { ...applied };
      this.draftStart = applied.todoPeriodo ? null : applied.start;
      this.draftEnd = applied.todoPeriodo ? null : applied.end;
      if (this.draftStart) this.viewMonth = startOfMonth(this.draftStart);
      this.highlightChips();
      this.updateSelectionLabel();
      this.paintCalendar();
      this.positionPopover();
    }
  }

  shiftMonth(delta) {
    this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + delta, 1);
    this.paintCalendar();
  }

  highlightChips() {
    for (const chip of this.chipsHost.querySelectorAll(".drp-chip")) {
      chip.classList.toggle("is-active", chip.dataset.preset === this.draft.preset);
    }
  }

  updateSelectionLabel() {
    if (this.draft.preset === "todo" || this.draft.todoPeriodo) {
      this.selectionLabel.textContent = "Seleção: todo o histórico sincronizado";
      return;
    }
    if (this.draft.preset && this.draft.preset !== "custom") {
      const p = PRESETS.find((x) => x.id === this.draft.preset);
      this.selectionLabel.textContent = p ? `Seleção: ${p.label}` : "";
      return;
    }
    if (!this.draftStart) {
      this.selectionLabel.textContent = "Seleção: clique a data inicial";
      return;
    }
    if (!this.draftEnd) {
      this.selectionLabel.textContent = `Início ${formatDisplayRange(this.draftStart, this.draftStart, false)} — escolha o fim`;
      return;
    }
    this.selectionLabel.textContent = `Intervalo: ${formatDisplayRange(this.draftStart, this.draftEnd, false)}`;
  }

  paintCalendar() {
    this.monthLabel.textContent = `${MESES[this.viewMonth.getMonth()]} ${this.viewMonth.getFullYear()}`;
    const first = startOfMonth(this.viewMonth);
    const offset = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const todayIso = formatDateISO(startOfDay(new Date()));
    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push("<span class='drp-day is-empty' aria-hidden='true'></span>");
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const iso = formatDateISO(date);
      const classes = ["drp-day"];
      if (iso === todayIso) classes.push("is-today");
      if (this.draftStart && formatDateISO(this.draftStart) === iso) classes.push("is-start");
      if (this.draftEnd && formatDateISO(this.draftEnd) === iso) classes.push("is-end");
      if (this.draftStart && this.draftEnd && date > this.draftStart && date < this.draftEnd) classes.push("in-range");
      if (this.draftStart && !this.draftEnd && formatDateISO(this.draftStart) === iso) classes.push("is-end");
      cells.push(`<button type="button" class="${classes.join(" ")}" data-day="${iso}">${day}</button>`);
    }
    this.grid.innerHTML = cells.join("");
  }

  syncTrigger() {
    const applied = this.getApplied();
    const active = applied.todoPeriodo || applied.preset !== "30d";
    this.trigger.classList.toggle("is-active", active);
    this.trigger.classList.remove("is-locked");
    this.trigger.disabled = false;
    this.root.querySelector(".drp-value").textContent = formatDisplayRange(applied.start, applied.end, applied.todoPeriodo);
  }

  clear() {
    this.draft = presetRange("30d");
    this.draftStart = this.draft.start;
    this.draftEnd = this.draft.end;
    this.viewMonth = startOfMonth(this.draft.start);
    this.highlightChips();
    this.updateSelectionLabel();
    this.paintCalendar();
  }

  apply() {
    let next;
    if (this.draft.preset && this.draft.preset !== "custom") {
      next = presetRange(this.draft.preset);
    } else {
      if (!this.draftStart) return;
      const start = this.draftStart;
      const end = this.draftEnd || this.draftStart;
      next = {
        todoPeriodo: false,
        start: start <= end ? start : end,
        end: start <= end ? end : start,
        preset: "custom",
      };
    }
    this.applied = next;
    this.syncTrigger();
    this.toggle(false);
    this.onApply(next);
  }
}

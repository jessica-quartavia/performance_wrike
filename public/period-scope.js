/** Escopo temporal exibido na UI (não altera valores da API). */

export const SCOPE_KIND = {
  PERIOD: "period",
  BACKLOG: "backlog",
  BACKLOG_CURRENT: "backlog_current",
};

export function isApiV2(data) {
  return Boolean(data?.definicoes) || Number(data?.meta?.versao_consulta) >= 2;
}

/** v1_legacy: derivado de `consultar_performance` original (itens_filtrados). */
const LEGACY_KPI_SCOPE = {
  total: SCOPE_KIND.BACKLOG,
  criadas: SCOPE_KIND.BACKLOG,
  entregues: SCOPE_KIND.PERIOD,
  em_andamento: SCOPE_KIND.BACKLOG_CURRENT,
  cancelados: SCOPE_KIND.PERIOD,
  com_okr: SCOPE_KIND.BACKLOG,
  itens_com_problema: SCOPE_KIND.BACKLOG,
};

/** v2: escopo unificado (itens_escopo) + fluxo onde aplicável. */
const V2_KPI_SCOPE = {
  total: SCOPE_KIND.PERIOD,
  criadas: SCOPE_KIND.PERIOD,
  entregues: SCOPE_KIND.PERIOD,
  em_andamento: SCOPE_KIND.PERIOD,
  cancelados: SCOPE_KIND.PERIOD,
  com_okr: SCOPE_KIND.PERIOD,
  itens_com_problema: SCOPE_KIND.PERIOD,
};

const LEGACY_SECTION_SCOPE = {
  status: SCOPE_KIND.BACKLOG,
  squads_carga: SCOPE_KIND.BACKLOG,
  squads_okr: SCOPE_KIND.BACKLOG,
  pessoas: SCOPE_KIND.BACKLOG,
  pessoas_entregues: SCOPE_KIND.PERIOD,
  auditoria: SCOPE_KIND.BACKLOG,
};

const V2_SECTION_SCOPE = {
  status: SCOPE_KIND.PERIOD,
  squads_carga: SCOPE_KIND.PERIOD,
  squads_okr: SCOPE_KIND.PERIOD,
  pessoas: SCOPE_KIND.PERIOD,
  pessoas_entregues: SCOPE_KIND.PERIOD,
  auditoria: SCOPE_KIND.PERIOD,
};

export function scopeLabel(kind, data) {
  const v2 = isApiV2(data);
  const todo = Boolean(data?.periodo?.todo_periodo);

  if (v2) {
    if (kind === SCOPE_KIND.BACKLOG_CURRENT) return "Backlog atual";
    if (todo && kind === SCOPE_KIND.PERIOD) return "Todo o histórico";
    return "No período selecionado";
  }

  switch (kind) {
    case SCOPE_KIND.PERIOD:
      return "No período selecionado";
    case SCOPE_KIND.BACKLOG_CURRENT:
      return "Backlog atual";
    case SCOPE_KIND.BACKLOG:
    default:
      return "Backlog completo";
  }
}

export function kpiScopeKind(metricKey, data) {
  const map = isApiV2(data) ? V2_KPI_SCOPE : LEGACY_KPI_SCOPE;
  return map[metricKey] ?? SCOPE_KIND.BACKLOG;
}

export function kpiSubtext(metricKey, data) {
  return scopeLabel(kpiScopeKind(metricKey, data), data);
}

export function sectionScopeKind(sectionKey, data) {
  const map = isApiV2(data) ? V2_SECTION_SCOPE : LEGACY_SECTION_SCOPE;
  return map[sectionKey] ?? SCOPE_KIND.BACKLOG;
}

export function sectionSubtext(sectionKey, data) {
  return scopeLabel(sectionScopeKind(sectionKey, data), data);
}

export function peopleTableFootnote(data) {
  if (isApiV2(data)) return "Em andamento, entregues e cycle time no recorte selecionado.";
  return "Em andamento e cycle time: backlog completo. Entregues: no período selecionado.";
}

export function resumoSectionLead(data) {
  if (isApiV2(data)) return "Indicadores alinhados ao recorte temporal da consulta.";
  return "Alguns cards respeitam o período; demais refletem o backlog completo (veja o subtexto).";
}

export const PERIOD_PARTIAL_NOTICE =
  "Atualmente, o período selecionado é aplicado a alguns indicadores, como tarefas entregues e canceladas. Os gráficos e tabelas continuam considerando o backlog completo, devido às limitações dos dados históricos e da consulta atual.";

export function periodPartialNoticeHtml(escapeHtml) {
  return `<div class="period-info-banner" role="status">
    <span class="period-info-icon" aria-hidden="true">ℹ</span>
    <div class="period-info-body">
      <strong class="period-info-title">Sobre o filtro de período</strong>
      <p>${escapeHtml(PERIOD_PARTIAL_NOTICE)}</p>
    </div>
  </div>`;
}

/** Resposta mínima compatível com contrato v2 (testes de transição). */
export function mockApiV2Payload(base = {}) {
  return {
    meta: { versao_consulta: 2 },
    definicoes: {
      total: "Escopo temporal.",
      entregues: "Fluxo no intervalo.",
    },
    periodo: { todo_periodo: false, inicio: "2026-10-01", fim: "2026-10-31", inclui_hoje: true },
    metricas: { total: 10, entregues: 3, ...(base.metricas || {}) },
    ...base,
  };
}

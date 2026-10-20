import assert from "node:assert/strict";
import test from "node:test";
import {
  isApiV2,
  kpiSubtext,
  mockApiV2Payload,
  periodPartialNoticeHtml,
  sectionSubtext,
  SCOPE_KIND,
} from "../public/period-scope.js";

const legacyPayload = {
  meta: { diagnostico_periodo: { versao_sql: 1 } },
  periodo: { inicio: "2026-10-01", fim: "2026-10-31", todo_periodo: false },
  metricas: { total: 271, entregues: 75, em_andamento: 164, cancelados: 2 },
};

test("legacy: entregues e cancelados no período; demais backlog", () => {
  assert.equal(isApiV2(legacyPayload), false);
  assert.equal(kpiSubtext("entregues", legacyPayload), "No período selecionado");
  assert.equal(kpiSubtext("cancelados", legacyPayload), "No período selecionado");
  assert.equal(kpiSubtext("em_andamento", legacyPayload), "Backlog atual");
  assert.equal(kpiSubtext("itens_com_problema", legacyPayload), "Backlog completo");
  assert.equal(kpiSubtext("total", legacyPayload), "Backlog completo");
  assert.equal(sectionSubtext("status", legacyPayload), "Backlog completo");
});

test("v2 simulada: nomenclatura de recorte temporal", () => {
  const v2 = mockApiV2Payload();
  assert.equal(isApiV2(v2), true);
  assert.equal(kpiSubtext("total", v2), "No período selecionado");
  assert.equal(kpiSubtext("entregues", v2), "No período selecionado");
  assert.equal(sectionSubtext("status", v2), "No período selecionado");
});

test("v2 todo_periodo: histórico completo nos rótulos de período", () => {
  const v2 = mockApiV2Payload({ periodo: { todo_periodo: true, inicio: "2020-01-01", fim: "2026-10-20" } });
  assert.equal(kpiSubtext("entregues", v2), "Todo o histórico");
});

test("aviso parcial só na API legada", () => {
  assert.match(periodPartialNoticeHtml((s) => s), /Sobre o filtro de período/);
  assert.doesNotMatch(periodPartialNoticeHtml((s) => s), /erro/i);
});

test("SCOPE_KIND exportado para extensões", () => {
  assert.equal(SCOPE_KIND.PERIOD, "period");
});

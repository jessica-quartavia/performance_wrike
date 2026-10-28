import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");
const webhook = await read("../supabase/functions/receber-webhook-wrike/index.ts");
const synchronization = await read("../supabase/functions/_shared/sincronizar.ts");
const interfaceCode = await read("../public/app.js");

test("webhook valida assinatura e evita eventos duplicados", () => {
  assert.match(webhook, /tempoSeguro\(assinatura/);
  assert.match(webhook, /x-hook-secret/);
  assert.match(webhook, /on_conflict=chave_idempotencia/);
});

test("sincronização usa a hierarquia atual e os campos OKR e Itens", () => {
  assert.match(synchronization, /startsWith\("squad_"\)/);
  assert.match(synchronization, /porCampo\.get\("okr"\)/);
  assert.match(synchronization, /porCampo\.get\("itens"\)/);
  assert.match(synchronization, /mapeamentos_status/);
  assert.match(synchronization, /resolveTaskSquadIds/);
  assert.match(synchronization, /itens_trabalho_squads/);
});

test("interface informa limites de classificação em vez de exibir métricas falsas", () => {
  assert.match(interfaceCode, /limitation-banner/);
  assert.match(interfaceCode, /periodPartialNoticeHtml/);
  assert.match(interfaceCode, /kpiSubtext/);
  assert.match(interfaceCode, /Qualidade das tarefas/);
  assert.match(interfaceCode, /DateRangePicker/);
  assert.match(interfaceCode, /peopleHeader/);
});

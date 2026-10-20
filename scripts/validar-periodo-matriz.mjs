/**
 * Matriz de validação: compara componentes da API entre recortes temporais.
 * Uso: node scripts/validar-periodo-matriz.mjs [URL_BASE]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envPath = join(root, "..", ".env");

function loadEnvUrl() {
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("SUPABASE_FUNCAO_PERFORMANCE_URL=")) {
      return t.slice("SUPABASE_FUNCAO_PERFORMANCE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return null;
}

const base =
  process.argv[2]?.trim() ||
  loadEnvUrl() ||
  "https://rckpuebaiswrxzmywllv.supabase.co/functions/v1/consultar-performance";

const casos = [
  { id: "set-2026", inicio: "2026-09-01", fim: "2026-09-30", label: "Setembro/2026" },
  { id: "out-2026", inicio: "2026-10-01", fim: "2026-10-31", label: "Outubro/2026" },
  { id: "vazio", inicio: "2020-01-01", fim: "2020-01-07", label: "Sem registros" },
];

function sumStatus(status) {
  return (status || []).reduce((acc, row) => acc + (Number(row.quantidade) || 0), 0);
}

function sumSquadsEmAndamento(squads) {
  return (squads || []).reduce((acc, row) => acc + (Number(row.em_andamento) || 0), 0);
}

function sumPessoasEntregues(pessoas) {
  return (pessoas || []).reduce((acc, row) => acc + (Number(row.entregues) || 0), 0);
}

function coberturaOkr(metricas) {
  const total = Number(metricas?.total) || 0;
  const com = Number(metricas?.com_okr) || 0;
  return total ? Math.round((com / total) * 100) : 0;
}

async function consultar(caso) {
  const url = new URL(base);
  url.searchParams.set("inicio", caso.inicio);
  url.searchParams.set("fim", caso.fim);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${caso.id}: HTTP ${res.status} ${body.erro || ""}`);
  return body;
}

const linhas = [];
for (const caso of casos) {
  const body = await consultar(caso);
  const m = body.metricas || {};
  linhas.push({
    periodo: caso.label,
    versao2: Boolean(body.definicoes || body.meta?.versao_consulta >= 2),
    escopo: m.total,
    criadas: m.criadas ?? null,
    entregues: m.entregues,
    em_andamento: m.em_andamento,
    soma_status: sumStatus(body.status),
    carga_squad: sumSquadsEmAndamento(body.squads),
    okr_pct: coberturaOkr(m),
    pessoas_entregues: sumPessoasEntregues(body.pessoas),
    auditoria: (body.auditoria || []).length,
  });
}

console.log("\n=== Matriz filtro de período (API real) ===\n");
console.table(linhas);

const versao2 = linhas.every((l) => l.versao2);
const escopos = new Set(linhas.map((l) => l.escopo));
const statusSomas = new Set(linhas.map((l) => l.soma_status));
const escopoVaria = escopos.size > 1 || linhas.find((l) => l.periodo.startsWith("Sem"))?.escopo === 0;

let ok = true;
const falhas = [];

if (!versao2) {
  ok = false;
  falhas.push("SQL/Edge antigos: resposta sem `definicoes` / versao_consulta 2.");
}

for (const l of linhas) {
  if (versao2 && l.soma_status !== l.escopo) {
    ok = false;
    falhas.push(`${l.periodo}: soma status (${l.soma_status}) ≠ escopo (${l.escopo}).`);
  }
}

if (!versao2 && escopos.size === 1 && linhas.some((l, i, arr) => l.entregues !== arr[0].entregues)) {
  ok = false;
  falhas.push("Padrão legado: escopo/status fixos enquanto entregues varia — gráficos não acompanham KPIs de fluxo.");
}

if (versao2 && !escopoVaria && linhas.find((l) => l.periodo.startsWith("Sem"))?.escopo !== 0) {
  falhas.push("Aviso: escopo não varia entre set/out; confira se dados existem nos meses.");
}

console.log("\n--- Diagnóstico ---");
if (falhas.length) for (const f of falhas) console.log("✖", f);
else console.log("✔ API versão 2 coerente entre componentes.");

console.log("\nResultado:", ok ? "PASSOU" : "FALHOU");
process.exit(ok ? 0 : 1);

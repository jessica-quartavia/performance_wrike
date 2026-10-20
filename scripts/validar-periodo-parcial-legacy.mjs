/**
 * Valida comportamento esperado da API v1_legacy: fluxo (entregues/cancelados) varia; backlog fixo.
 * Uso: node scripts/validar-periodo-parcial-legacy.mjs [URL_BASE]
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
  { id: "todo", periodo: "todo" },
  { id: "set-2026", inicio: "2026-09-01", fim: "2026-09-30" },
  { id: "out-2026", inicio: "2026-10-01", fim: "2026-10-31" },
  { id: "custom", inicio: "2026-10-14", fim: "2026-10-20" },
];

async function consultar(caso) {
  const url = new URL(base);
  if (caso.periodo) url.searchParams.set("periodo", caso.periodo);
  else {
    url.searchParams.set("inicio", caso.inicio);
    url.searchParams.set("fim", caso.fim);
  }
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`${caso.id}: HTTP ${res.status}`);
  return body;
}

const rows = [];
for (const caso of casos) {
  const body = await consultar(caso);
  const m = body.metricas || {};
  rows.push({
    caso: caso.id,
    v2: Boolean(body.definicoes),
    total: m.total,
    entregues: m.entregues,
    cancelados: m.cancelados,
    em_andamento: m.em_andamento,
  });
}

console.log("\n=== Validação parcial (legacy) ===\n");
console.table(rows);

const v2 = rows.every((r) => r.v2);
const totais = new Set(rows.map((r) => r.total));
const entregues = new Set(rows.map((r) => r.entregues));
const andamento = new Set(rows.map((r) => r.em_andamento));

let ok = true;
const checks = [];

if (v2) {
  checks.push("✔ API v2 detectada — use test:periodo para escopo completo.");
} else {
  if (totais.size === 1 && entregues.size > 1) checks.push("✔ entregues varia com período; total fixo (backlog).");
  else {
    ok = false;
    checks.push("✖ esperado: total estável e entregues variável na v1.");
  }
  if (andamento.size === 1) checks.push("✔ em_andamento estável (backlog atual).");
  else {
    ok = false;
    checks.push("✖ em_andamento deveria ser estável na v1.");
  }
}

for (const c of checks) console.log(c);
console.log("\nResultado:", ok || v2 ? "PASSOU" : "FALHOU");
process.exit(ok || v2 ? 0 : 1);

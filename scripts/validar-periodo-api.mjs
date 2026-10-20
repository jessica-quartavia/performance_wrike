/**
 * Valida se a API de performance aplica o filtro de período (versão 2 da consulta SQL).
 * Uso: node scripts/validar-periodo-api.mjs [URL_BASE]
 * URL_BASE default: SUPABASE_FUNCAO_PERFORMANCE_URL do .env ou função pública do projeto.
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
  { id: "out-2026", inicio: "2026-10-01", fim: "2026-10-31" },
  { id: "set-2026", inicio: "2026-09-01", fim: "2026-09-30" },
  { id: "7-dias", inicio: "2026-10-14", fim: "2026-10-20" },
  { id: "estreito", inicio: "2026-10-20", fim: "2026-10-20" },
  { id: "todo", periodo: "todo" },
];

async function consultar(caso) {
  const url = new URL(base);
  if (caso.periodo) url.searchParams.set("periodo", caso.periodo);
  else {
    url.searchParams.set("inicio", caso.inicio);
    url.searchParams.set("fim", caso.fim);
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${caso.id}: HTTP ${res.status} ${body.erro || JSON.stringify(body)}`);
  return { url: url.toString(), body };
}

function sumStatus(status) {
  return (status || []).reduce((acc, row) => acc + (Number(row.quantidade) || 0), 0);
}

const resultados = [];
for (const caso of casos) {
  const { url, body } = await consultar(caso);
  const m = body.metricas || {};
  resultados.push({
    caso: caso.id,
    url,
    periodo: body.periodo,
    versao2: Boolean(body.definicoes),
    total: m.total,
    criadas: m.criadas,
    entregues: m.entregues,
    em_andamento: m.em_andamento,
    soma_status: sumStatus(body.status),
  });
}

console.log("\n=== Validação filtro de período ===\n");
console.table(
  resultados.map((r) => ({
    caso: r.caso,
    versao2: r.versao2,
    total: r.total,
    criadas: r.criadas ?? "—",
    entregues: r.entregues,
    em_andamento: r.em_andamento,
    soma_status: r.soma_status,
    inicio: r.periodo?.inicio,
    fim: r.periodo?.fim,
    todo: r.periodo?.todo_periodo ?? false,
  })),
);

const versao2 = resultados.every((r) => r.versao2);
const totais = resultados.map((r) => r.total);
const totalVaria = new Set(totais).size > 1;
const entreguesVariam = new Set(resultados.map((r) => r.entregues)).size > 1;

let ok = true;
const falhas = [];

if (!versao2) {
  ok = false;
  falhas.push("API sem campo `definicoes` → função SQL antiga ainda implantada (migração 20261020180000 não aplicada).");
}

if (!totalVaria && entreguesVariam) {
  ok = false;
  falhas.push("`metricas.total` e soma de status iguais em todos os recortes, mas `entregues` muda → escopo temporal não aplicado ao agregado (bug da versão antiga).");
}

if (resultados.find((r) => r.caso === "todo") && !resultados.find((r) => r.caso === "todo")?.periodo?.todo_periodo && versao2 === false) {
  falhas.push("`periodo=todo` não retorna todo_periodo:true (Edge/SQL desatualizados).");
}

console.log("\n--- Diagnóstico ---");
if (falhas.length) for (const f of falhas) console.log("✖", f);
else console.log("✔ Recortes distintos produzem totais coerentes e API versão 2 ativa.");

console.log("\nResultado:", ok ? "PASSOU" : "FALHOU");
process.exit(ok ? 0 : 1);

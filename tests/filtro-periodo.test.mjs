import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatDateISO, parseISO, presetRange } from "../public/date-range-picker.js";

const migrationPath = new URL("../supabase/migrations/20261020180000_corrigir_filtro_periodo_consultar_performance.sql", import.meta.url);
const migration = await readFile(migrationPath, "utf8");

/** Espelha a regra de interseção do SQL para testes unitários locais. */
export function itemIntersectaPeriodo(item, inicio, fim) {
  const criado = item.criado ? item.criado : inicio;
  const concluido = item.concluido ?? "9999-12-31";
  const canceladoAntes =
    item.grupo_status === "Cancelled" &&
    (item.atualizado ?? item.criado ?? inicio) < inicio;
  return criado <= fim && concluido >= inicio && !canceladoAntes;
}

test("migração define escopo temporal itens_escopo e parâmetro todo_periodo", () => {
  assert.match(migration, /p_todo_periodo boolean default false/);
  assert.match(migration, /itens_escopo as/);
  assert.match(migration, /'definicoes'/);
  assert.match(migration, /'limitacoes'/);
  assert.match(migration, /as criadas/);
});

test("status, squads, auditoria e gargalos usam itens_escopo ou histórico filtrado", () => {
  assert.match(migration, /from itens_escopo group by nome_status/);
  assert.match(migration, /from itens_escopo i/);
  assert.match(migration, /from itens_escopo i[\s\S]*cross join lateral/);
  assert.match(migration, /where h\.ocorrido_em::date between p\.inicio and p\.fim/);
  assert.match(migration, /join itens_escopo i on i\.id = ri\.id_item_trabalho/);
  assert.match(migration, /from \(select \* from auditoria order by titulo limit 50\) a/);
  assert.match(migration, /from itens_escopo i[\s\S]*group by i\.id_squad/);
});

test("interseção de período exclui canceladas antes do início", () => {
  assert.equal(
    itemIntersectaPeriodo({ criado: "2025-01-01", grupo_status: "Cancelled", atualizado: "2024-12-01" }, "2025-06-01", "2025-06-30"),
    false,
  );
  assert.equal(
    itemIntersectaPeriodo({ criado: "2025-06-10", concluido: "2025-06-20" }, "2025-06-01", "2025-06-30"),
    true,
  );
  assert.equal(
    itemIntersectaPeriodo({ criado: "2025-05-01", concluido: null, grupo_status: "Active" }, "2025-06-01", "2025-06-30"),
    true,
  );
});

test("presets de data cobrem atalhos obrigatórios", () => {
  const ids = ["todo", "hoje", "7d", "30d", "90d", "6m", "12m", "mes", "ano"]; // presetRange ainda aceita 6m/12m; UI expõe subset via PRESETS
  for (const id of ids) {
    const range = presetRange(id);
    if (id === "todo") assert.equal(range.todoPeriodo, true);
    else {
      assert.equal(range.todoPeriodo, false);
      assert.ok(range.start instanceof Date);
      assert.ok(range.end instanceof Date);
      assert.ok(range.start <= range.end);
    }
  }
});

test("formatDateISO e parseISO são inversos estáveis", () => {
  const iso = "2025-10-15";
  assert.equal(formatDateISO(parseISO(iso)), iso);
});

test("coerência esperada: entregues ⊆ escopo em amostra sintética", () => {
  const inicio = "2025-06-01";
  const fim = "2025-06-30";
  const itens = [
    { id: 1, criado: "2025-06-05", concluido: "2025-06-10", grupo_status: "Completed" },
    { id: 2, criado: "2025-06-12", concluido: null, grupo_status: "Active" },
    { id: 3, criado: "2025-01-01", concluido: "2025-06-28", grupo_status: "Completed" },
    { id: 4, criado: "2025-01-01", concluido: "2025-03-01", grupo_status: "Completed" },
  ];
  const escopo = itens.filter((i) => itemIntersectaPeriodo(i, inicio, fim));
  const entregues = escopo.filter((i) => i.concluido >= inicio && i.concluido <= fim);
  assert.ok(entregues.length <= escopo.length);
  assert.deepEqual(
    entregues.map((i) => i.id).sort(),
    [1, 3],
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAgendaFromWrike } from "../lib/agenda-build.mjs";
import {
  buildFolderParentMap,
  createSquadResolver,
  resolveTaskSquadNames,
} from "../lib/wrike-squad-resolve.mjs";

const nnMigration = await readFile(
  new URL("../supabase/migrations/20261028173000_itens_trabalho_squads_nn.sql", import.meta.url),
  "utf8",
);

const squadA = "SQUAD_A";
const squadF = "SQUAD_F";
const subA = "SUB_A1";
const root = "ROOT";

function fixtureResolver() {
  const parentOf = buildFolderParentMap(root, [squadA, squadF], [
    { id: subA, parentIds: [squadA] },
  ]);
  const squadWrikeToDbId = new Map([
    [squadA, 1],
    [squadF, 2],
  ]);
  return createSquadResolver(squadWrikeToDbId, parentOf);
}

test("migração N:N cria itens_trabalho_squads e usa count distinct por squad", () => {
  assert.match(nnMigration, /create table if not exists _performance_wrike\.itens_trabalho_squads/);
  assert.match(nnMigration, /primary key \(id_item_trabalho, id_squad\)/);
  assert.match(nnMigration, /inner join itens_trabalho_squads its/);
  assert.match(nnMigration, /count\(distinct i\.id\)/);
});

test("tarefa em um squad", () => {
  const r = fixtureResolver();
  assert.deepEqual(r.resolveTaskSquadIds([subA]), [1]);
});

test("tarefa em dois squads (boards distintos)", () => {
  const r = fixtureResolver();
  assert.deepEqual(r.resolveTaskSquadIds([squadA, squadF]).sort(), [1, 2]);
});

test("tarefa em três squads", () => {
  const squadC = "SQUAD_C";
  const parentOf = buildFolderParentMap(root, [squadA, squadF, squadC], []);
  const r = createSquadResolver(
    new Map([
      [squadA, 1],
      [squadF, 2],
      [squadC, 3],
    ]),
    parentOf,
  );
  assert.deepEqual(r.resolveTaskSquadIds([squadA, squadF, squadC]).sort(), [1, 2, 3]);
});

test("subpastas do mesmo squad deduplicam associação", () => {
  const subA2 = "SUB_A2";
  const parentOf = buildFolderParentMap(root, [squadA], [
    { id: subA, parentIds: [squadA] },
    { id: subA2, parentIds: [squadA] },
  ]);
  const r = createSquadResolver(new Map([[squadA, 1]]), parentOf);
  assert.deepEqual(r.resolveTaskSquadIds([subA, subA2]), [1]);
});

test("tarefa sem squad reconhecido", () => {
  const r = fixtureResolver();
  assert.deepEqual(r.resolveTaskSquadIds(["UNKNOWN_FOLDER"]), []);
});

test("tarefa movida: parentIds diferentes alteram squads resolvidos", () => {
  const r = fixtureResolver();
  assert.deepEqual(r.resolveTaskSquadIds([squadA]), [1]);
  assert.deepEqual(r.resolveTaskSquadIds([squadF]), [2]);
});

test("removida de um board, mantida em outro", () => {
  const r = fixtureResolver();
  assert.deepEqual(r.resolveTaskSquadIds([squadF]), [2]);
});

test("sincronização idempotente: pares únicos por item+squad", () => {
  const r = fixtureResolver();
  const parentIds = [squadA, squadF, squadA];
  const pairs = r.resolveTaskSquadIds(parentIds).map((id_squad) => ({ id_item_trabalho: 99, id_squad }));
  const uniq = new Set(pairs.map((p) => `${p.id_item_trabalho}:${p.id_squad}`));
  assert.equal(uniq.size, 2);
});

test("agenda: filtro por squad e KPIs por tarefa única com multi-board", () => {
  const parentOf = buildFolderParentMap(root, [squadA, squadF], []);
  const squadWrikeToName = new Map([
    [squadA, "Squad A"],
    [squadF, "Squad F"],
  ]);
  const squadContext = { parentOf, squadWrikeToName };
  const contatos = new Map([["u1", { firstName: "Ana", lastName: "" }]]);
  const tarefas = [
    {
      id: "t-multi",
      title: "Atualizar Dashboard",
      status: "Active",
      responsibleIds: ["u1"],
      parentIds: [squadA, squadF],
      dates: { due: "2026-10-21T12:00:00Z" },
    },
  ];
  const data = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId: new Map(),
    segundaISO: "2026-10-19",
    squadContext,
  });
  assert.equal(data.metricas.previstas, 1);
  assert.deepEqual(resolveTaskSquadNames([squadA, squadF], squadWrikeToName, parentOf).sort(), ["Squad A", "Squad F"]);

  const filtroA = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId: new Map(),
    segundaISO: "2026-10-19",
    filtroSquadNome: "Squad A",
    squadContext,
  });
  assert.equal(filtroA.metricas.previstas, 1);

  const filtroF = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId: new Map(),
    segundaISO: "2026-10-19",
    filtroSquadNome: "Squad F",
    squadContext,
  });
  assert.equal(filtroF.metricas.previstas, 1);
});

test("agenda: múltiplos responsáveis não duplicam KPI previstas", () => {
  const contatos = new Map([
    ["u1", { firstName: "A", lastName: "" }],
    ["u2", { firstName: "B", lastName: "" }],
  ]);
  const tarefas = [
    {
      id: "t1",
      title: "Compartilhada",
      status: "Active",
      responsibleIds: ["u1", "u2"],
      parentIds: ["f1"],
      dates: { due: "2026-10-21T12:00:00Z" },
    },
  ];
  const data = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId: new Map([["f1", "Squad X"]]),
    segundaISO: "2026-10-19",
  });
  assert.equal(data.metricas.previstas, 1);
  assert.equal(data.dias[2].quantidade, 1);
  assert.equal(data.dias[2].grupos.length, 2);
});

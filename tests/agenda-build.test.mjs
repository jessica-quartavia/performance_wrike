import assert from "node:assert/strict";
import test from "node:test";
import { buildAgendaFromWrike } from "../lib/agenda-build.mjs";

test("agenda Wrike agrupa por prazo e conta tarefas únicas", () => {
  const contatos = new Map([["u1", { firstName: "Ana", lastName: "Silva" }]]);
  const folderPorId = new Map([["f1", "Squad Alpha"]]);
  const tarefas = [
    {
      id: "t1",
      title: "Entrega A",
      status: "Active",
      permalink: "https://wrike.com/t1",
      responsibleIds: ["u1"],
      parentIds: ["f1"],
      dates: { due: "2026-10-21T12:00:00Z" },
    },
    {
      id: "t2",
      title: "Entrega B",
      status: "Completed",
      completedDate: "2026-10-20T10:00:00Z",
      responsibleIds: ["u1"],
      parentIds: ["f1"],
      dates: { due: "2026-10-22T12:00:00Z" },
    },
  ];
  const data = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId,
    segundaISO: "2026-10-19",
  });
  assert.equal(data.meta.versao_agenda, 1);
  assert.equal(data.metricas.previstas, 2);
  assert.equal(data.metricas.concluidas, 1);
  assert.equal(data.dias[2].quantidade, 1);
  assert.equal(data.dias[2].grupos[0].tarefas[0].squad, "Squad Alpha");
});

test("filtro por ID Wrike do responsável reduz tarefas e KPIs", () => {
  const contatos = new Map([
    ["u1", { firstName: "Jessica", lastName: "Carvalho" }],
    ["u2", { firstName: "Thássya", lastName: "Silva" }],
  ]);
  const tarefas = [
    {
      id: "t1",
      title: "A",
      status: "Active",
      responsibleIds: ["u1"],
      dates: { due: "2026-10-21T12:00:00Z" },
    },
    {
      id: "t2",
      title: "B",
      status: "Active",
      responsibleIds: ["u2"],
      dates: { due: "2026-10-21T12:00:00Z" },
    },
  ];
  const filtrada = buildAgendaFromWrike({
    tarefas,
    contatos,
    folderPorId: new Map(),
    segundaISO: "2026-10-19",
    filtroPessoaId: "u1",
  });
  assert.equal(filtrada.metricas.previstas, 1);
  assert.equal(filtrada.dias[2].quantidade, 1);
  assert.equal(filtrada.responsaveis.length, 2);
});

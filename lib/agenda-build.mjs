const DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toISODateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function addDaysDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function nomeContato(contato) {
  if (!contato) return "Sem responsável";
  return [contato.firstName, contato.lastName].filter(Boolean).join(" ") || contato.email || "Sem responsável";
}

function dueISO(tarefa) {
  const due = tarefa.dates?.due || tarefa.dates?.dueDate;
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.valueOf())) return null;
  return toISODateLocal(d);
}

function startISO(tarefa) {
  const start = tarefa.dates?.start || tarefa.dates?.startDate;
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.valueOf())) return null;
  return toISODateLocal(d);
}

function classificar(tarefa, hojeISO) {
  const cancelada = tarefa.status === "Cancelled";
  const concluida = Boolean(tarefa.completedDate) || tarefa.status === "Completed";
  const due = dueISO(tarefa);
  const atrasada = Boolean(due && due < hojeISO && !concluida && !cancelada);
  const pendente = !concluida && !cancelada;
  return { cancelada, concluida, atrasada, pendente, due };
}

function mapImportance(v) {
  const map = { High: "Alta", Normal: "Normal", Low: "Baixa" };
  return map[v] || v || null;
}

export function listResponsaveisCatalog(tarefas, contatos) {
  const map = new Map();
  let semResponsavel = false;
  for (const tarefa of tarefas) {
    const ids = tarefa.responsibleIds || [];
    if (!ids.length) semResponsavel = true;
    for (const id of ids) {
      if (!map.has(id)) map.set(id, nomeContato(contatos.get(id)));
    }
  }
  const lista = [...map.entries()].map(([id, nome]) => ({ id, nome }));
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (semResponsavel) lista.unshift({ id: "0", nome: "Sem responsável" });
  return lista;
}

export function listSquadsCatalog(tarefas, folderPorId) {
  const nomes = new Set();
  for (const tarefa of tarefas) {
    const squad = (tarefa.parentIds || []).map((id) => folderPorId.get(id)).find(Boolean);
    if (squad) nomes.add(squad);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map((nome) => ({ id: nome, nome }));
}

function tarefaPassaFiltroPessoa(tarefa, filtroPessoaId) {
  if (!filtroPessoaId) return true;
  const ids = tarefa.responsibleIds || [];
  if (filtroPessoaId === "0") return ids.length === 0;
  return ids.some((id) => String(id) === String(filtroPessoaId));
}

export function buildAgendaFromWrike({
  tarefas,
  contatos,
  folderPorId,
  segundaISO,
  busca = "",
  apenasPendentes = false,
  filtroPessoaId = "",
  filtroPessoaNome = "",
  filtroSquadNome = "",
}) {
  const segunda = parseISODate(segundaISO);
  const sexta = addDaysDate(segunda, 4);
  const segundaS = toISODateLocal(segunda);
  const sextaS = toISODateLocal(sexta);
  const hojeS = toISODateLocal(new Date());
  const buscaL = busca.trim().toLowerCase();

  const dias = [];
  for (let i = 0; i < 5; i += 1) {
    const data = toISODateLocal(addDaysDate(segunda, i));
    dias.push({ data, dia_semana: DIAS[i], is_hoje: data === hojeS, quantidade: 0, grupos: [] });
  }
  const diaIndex = new Map(dias.map((d, i) => [d.data, i]));

  const semPrazo = [];
  const weekTasks = new Map();

  for (const tarefa of tarefas) {
    const titulo = tarefa.title || "Sem título";
    if (buscaL && !titulo.toLowerCase().includes(buscaL)) continue;

    const { cancelada, concluida, atrasada, pendente, due } = classificar(tarefa, hojeS);
    if (apenasPendentes && !pendente) continue;

    const squadsLista = [
      ...new Set((tarefa.parentIds || []).map((id) => folderPorId.get(id)).filter(Boolean)),
    ];
    const squad = squadsLista[0] || null;
    if (
      filtroSquadNome
      && !squadsLista.some((s) => s.toLowerCase() === filtroSquadNome.toLowerCase())
    ) {
      continue;
    }

    const responsaveis = (tarefa.responsibleIds || []).length
      ? tarefa.responsibleIds.map((id) => ({ id, nome: nomeContato(contatos.get(id)) }))
      : [{ id: "0", nome: "Sem responsável" }];

    if (filtroPessoaId) {
      if (!tarefaPassaFiltroPessoa(tarefa, filtroPessoaId)) continue;
    } else if (filtroPessoaNome) {
      const ok = responsaveis.some((r) => r.nome.toLowerCase() === filtroPessoaNome.toLowerCase());
      if (!ok) continue;
    }

    const item = {
      id_wrike: tarefa.id,
      titulo,
      link_wrike: tarefa.permalink || null,
      nome_status: tarefa.status || "Active",
      concluida,
      cancelada,
      pendente,
      atrasada,
      prazo: due,
      inicio_planejado: startISO(tarefa),
      criado_em: tarefa.createdDate ? toISODateLocal(new Date(tarefa.createdDate)) : null,
      concluido_em: tarefa.completedDate ? toISODateLocal(new Date(tarefa.completedDate)) : null,
      importancia: mapImportance(tarefa.importance),
      squad: squad || "Sem squad",
      squads: squadsLista,
      descricao_resumo: (tarefa.briefDescription || tarefa.description || "").slice(0, 120) || null,
    };

    if (!due) {
      if (pendente || !apenasPendentes) semPrazo.push(item);
      continue;
    }
    if (due < segundaS || due > sextaS) continue;

    weekTasks.set(tarefa.id, item);
    const idx = diaIndex.get(due);
    if (idx == null) continue;
    dias[idx].quantidade += 1;

    for (const resp of responsaveis) {
      if (filtroPessoaId === "0" && resp.id !== "0") continue;
      if (filtroPessoaId && filtroPessoaId !== "0" && String(resp.id) !== String(filtroPessoaId)) continue;
      if (!filtroPessoaId && filtroPessoaNome && resp.nome.toLowerCase() !== filtroPessoaNome.toLowerCase()) continue;
      let grupo = dias[idx].grupos.find((g) => g.nome === resp.nome);
      if (!grupo) {
        grupo = { pessoa_id: resp.id, nome: resp.nome, tarefas: [] };
        dias[idx].grupos.push(grupo);
      }
      grupo.tarefas.push(item);
    }
  }

  for (const d of dias) {
    d.grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    for (const g of d.grupos) g.tarefas.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  }

  const valores = [...weekTasks.values()];
  const metricas = {
    previstas: valores.length,
    concluidas: valores.filter((t) => t.concluida).length,
    pendentes: valores.filter((t) => t.pendente).length,
    atrasadas: valores.filter((t) => t.atrasada).length,
  };

  return {
    meta: { versao_agenda: 1, fonte: "wrike", gerado_em: new Date().toISOString() },
    semana: { segunda: segundaS, sexta: sextaS },
    metricas,
    dias,
    sem_prazo: semPrazo.slice(0, 30),
    responsaveis: listResponsaveisCatalog(tarefas, contatos),
    squads: listSquadsCatalog(tarefas, folderPorId),
  };
}

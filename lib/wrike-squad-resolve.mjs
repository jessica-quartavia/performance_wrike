/**
 * Resolve pastas Wrike (parentIds de tarefas) para squads cadastrados.
 * Sobe a árvore de parentIds até encontrar um folder raiz mapeado em squadWrikeToId.
 */

export function buildFolderParentMap(rootFolderId, rootChildIds, folders = []) {
  const parentOf = new Map();
  if (rootFolderId) {
    for (const childId of rootChildIds || []) {
      parentOf.set(String(childId), String(rootFolderId));
    }
  }
  for (const folder of folders) {
    const id = String(folder.id);
    const parents = folder.parentIds || [];
    if (parents.length) parentOf.set(id, String(parents[0]));
    else if (rootFolderId && !parentOf.has(id)) parentOf.set(id, String(rootFolderId));
  }
  return parentOf;
}

export function createSquadResolver(squadWrikeToId, parentOf) {
  const squadMap = squadWrikeToId instanceof Map ? squadWrikeToId : new Map(Object.entries(squadWrikeToId || {}));

  function resolveFolderToSquadId(folderId) {
    let cur = folderId ? String(folderId) : null;
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      if (squadMap.has(cur)) return Number(squadMap.get(cur));
      cur = parentOf.get(cur) ?? null;
    }
    return null;
  }

  /** IDs de squad distintos para uma tarefa (deduplica subpastas do mesmo squad). */
  function resolveTaskSquadIds(parentIds) {
    const ids = new Set();
    for (const pid of parentIds || []) {
      const squadId = resolveFolderToSquadId(pid);
      if (squadId != null) ids.add(squadId);
    }
    return [...ids];
  }

  function primarySquadId(parentIds) {
    const list = resolveTaskSquadIds(parentIds);
    return list.length ? list[0] : null;
  }

  return { resolveFolderToSquadId, resolveTaskSquadIds, primarySquadId };
}

/** Nomes de squad para exibição (Agenda) a partir de parentIds e mapa wrikeId→nome. */
export function resolveTaskSquadNames(parentIds, squadWrikeToName, parentOf) {
  const squadMap = squadWrikeToName instanceof Map ? squadWrikeToName : new Map(Object.entries(squadWrikeToName || {}));
  const names = new Set();
  for (const pid of parentIds || []) {
    let cur = String(pid);
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const name = squadMap.get(cur);
      if (name) {
        names.add(name);
        break;
      }
      cur = parentOf.get(cur) ?? null;
    }
  }
  return [...names];
}

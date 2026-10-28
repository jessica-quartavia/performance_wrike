export type FolderWrike = { id: string; parentIds?: string[] };

export function buildFolderParentMap(rootFolderId: string | undefined, rootChildIds: string[], folders: FolderWrike[]) {
  const parentOf = new Map<string, string>();
  if (rootFolderId) {
    for (const childId of rootChildIds || []) parentOf.set(String(childId), String(rootFolderId));
  }
  for (const folder of folders) {
    const id = String(folder.id);
    const parents = folder.parentIds || [];
    if (parents.length) parentOf.set(id, String(parents[0]));
    else if (rootFolderId && !parentOf.has(id)) parentOf.set(id, String(rootFolderId));
  }
  return parentOf;
}

export function createSquadResolver(squadWrikeToDbId: Map<string, number>, parentOf: Map<string, string>) {
  function resolveFolderToSquadId(folderId: string): number | null {
    let cur: string | null = folderId ? String(folderId) : null;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const squadId = squadWrikeToDbId.get(cur);
      if (squadId != null) return squadId;
      cur = parentOf.get(cur) ?? null;
    }
    return null;
  }

  function resolveTaskSquadIds(parentIds: string[] | undefined): number[] {
    const ids = new Set<number>();
    for (const pid of parentIds || []) {
      const squadId = resolveFolderToSquadId(pid);
      if (squadId != null) ids.add(squadId);
    }
    return [...ids];
  }

  function primarySquadId(parentIds: string[] | undefined): number | null {
    const list = resolveTaskSquadIds(parentIds);
    return list.length ? list[0] : null;
  }

  return { resolveFolderToSquadId, resolveTaskSquadIds, primarySquadId };
}

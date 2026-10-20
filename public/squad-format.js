/** Formata rótulo de squad/área para exibição (Wrike/Supabase). */

function titleCaseWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR"))
    .join(" ");
}

/**
 * @param {string} raw Nome bruto da pasta/squad
 * @returns {{ display: string, original: string|null, isEmpty: boolean }}
 */
export function formatSquadLabel(raw) {
  const original = String(raw ?? "").trim();
  if (!original || original.toLowerCase() === "sem squad") {
    return { display: "Sem squad", original: null, isEmpty: true };
  }

  const paren = original.match(/\(([^)]+)\)/);
  if (paren?.[1]) {
    return { display: titleCaseWords(paren[1]), original, isEmpty: false };
  }

  const stripped = original.replace(/^squad_[A-Za-z0-9]+[\s_-]*/i, "").trim();
  const display = stripped && stripped !== original ? titleCaseWords(stripped) : titleCaseWords(original);
  return { display, original, isEmpty: false };
}

/** @returns {string[]} */
export function squadsFromTask(tarefa) {
  if (Array.isArray(tarefa?.squads) && tarefa.squads.length) {
    return [...new Set(tarefa.squads.map((s) => String(s).trim()).filter(Boolean))];
  }
  const one = tarefa?.squad;
  if (one && String(one).trim() && String(one).toLowerCase() !== "sem squad") {
    return [String(one).trim()];
  }
  return [];
}

import { personColorStyle } from "./person-color.js";

/** Destaque visual exclusivo para Matt Lacerda (regra de negócio UI). */
export function isMattLacerda(nome) {
  return String(nome ?? "").trim().toLowerCase() === "matt lacerda";
}

export function formatPersonName(nome, escapeHtml, { showDot = true } = {}) {
  const texto = String(nome ?? "");
  const muted = isMattLacerda(texto) ? " person-name-muted" : "";
  const dot = showDot ? `<span class="person-dot" aria-hidden="true"></span>` : "";
  return `<span class="person-label${muted}" style="${personColorStyle(texto)}">${dot}${escapeHtml(texto)}</span>`;
}

export { getPersonColor, personColorStyle } from "./person-color.js";

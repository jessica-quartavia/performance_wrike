/** Cores fixas por regra de negócio (accent, soft bg, text). */
const FIXED_BY_KEY = {
  jessica: { accent: "#db2777", soft: "#fdf2f8", text: "#9d174d" },
  thassya: { accent: "#dc2626", soft: "#fef2f2", text: "#991b1b" },
  matt: { accent: "#9ca3af", soft: "#f3f4f6", text: "#6b7280" },
};

/** Paleta determinística para demais nomes (tons médios, bom contraste). */
const AUTO_PALETTE = [
  { accent: "#0d9488", soft: "#f0fdfa", text: "#115e59" },
  { accent: "#2563eb", soft: "#eff6ff", text: "#1e40af" },
  { accent: "#7c3aed", soft: "#f5f3ff", text: "#5b21b6" },
  { accent: "#ca8a04", soft: "#fefce8", text: "#854d0e" },
  { accent: "#0891b2", soft: "#ecfeff", text: "#155e75" },
  { accent: "#059669", soft: "#ecfdf5", text: "#047857" },
  { accent: "#c026d3", soft: "#fdf4ff", text: "#86198f" },
  { accent: "#ea580c", soft: "#fff7ed", text: "#9a3412" },
  { accent: "#4f46e5", soft: "#eef2ff", text: "#3730a3" },
  { accent: "#64748b", soft: "#f8fafc", text: "#475569" },
];

export function normalizePersonKey(nome) {
  return String(nome ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function isMattLacerda(nome) {
  return normalizePersonKey(nome) === "matt lacerda";
}

function isJessica(nome) {
  return normalizePersonKey(nome).includes("jessica");
}

function isThassya(nome) {
  const k = normalizePersonKey(nome);
  return k.includes("thassya") || k.includes("thassia");
}

function hashPerson(nome) {
  const s = normalizePersonKey(nome);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @returns {{ accent: string, soft: string, text: string, fixed: boolean }}
 */
export function getPersonColor(nome) {
  if (isMattLacerda(nome)) return { ...FIXED_BY_KEY.matt, fixed: true };
  if (isJessica(nome)) return { ...FIXED_BY_KEY.jessica, fixed: true };
  if (isThassya(nome)) return { ...FIXED_BY_KEY.thassya, fixed: true };
  const idx = hashPerson(nome) % AUTO_PALETTE.length;
  return { ...AUTO_PALETTE[idx], fixed: false };
}

export function personColorStyle(nome) {
  const c = getPersonColor(nome);
  return `--person-accent:${c.accent};--person-soft:${c.soft};--person-text:${c.text}`;
}

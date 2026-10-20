import assert from "node:assert/strict";
import test from "node:test";
import { addDays, formatDateISO, mondayOf, parseISO } from "../public/agenda-entregas.js";
import { formatPersonName, isMattLacerda } from "../public/person-format.js";
import { readFile } from "node:fs/promises";

test("segunda-feira da semana local (ISO: semana começa na segunda)", () => {
  const dom = new Date(2026, 9, 18);
  assert.equal(formatDateISO(mondayOf(dom)), "2026-10-12");
  const seg = new Date(2026, 9, 19);
  assert.equal(formatDateISO(mondayOf(seg)), "2026-10-19");
});

test("navegação entre semanas", () => {
  const seg = parseISO("2026-10-20");
  assert.equal(formatDateISO(addDays(seg, -7)), "2026-10-13");
  assert.equal(formatDateISO(addDays(seg, 7)), "2026-10-27");
});

test("Matt Lacerda recebe classe exclusiva", () => {
  assert.equal(isMattLacerda("Matt Lacerda"), true);
  assert.equal(isMattLacerda("Jessica Carvalho"), false);
  assert.match(formatPersonName("Matt Lacerda", (s) => s), /person-name-muted/);
  assert.doesNotMatch(formatPersonName("Matt Lacerda", (s) => s), /person-name-highlight/);
});

test("migração agenda usa prazo_em e métricas distintas", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261020183000_criar_agenda_entregas.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /consultar_agenda_entregas/);
  assert.match(sql, /i\.prazo_em is not null/);
  assert.match(sql, /count\(distinct id\)/);
  assert.match(sql, /versao_agenda/);
});

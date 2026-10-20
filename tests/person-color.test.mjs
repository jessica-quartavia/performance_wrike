import assert from "node:assert/strict";
import test from "node:test";
import { getPersonColor, normalizePersonKey } from "../public/person-color.js";

test("cores fixas: Jessica rosa, Thássya vermelho, Matt cinza", () => {
  assert.equal(getPersonColor("Jessica Carvalho").accent, "#db2777");
  assert.equal(getPersonColor("Thássya Souza").accent, "#dc2626");
  assert.equal(getPersonColor("Thassya Souza").accent, "#dc2626");
  assert.equal(getPersonColor("Matt Lacerda").accent, "#9ca3af");
});

test("cor automática é determinística por nome", () => {
  const a = getPersonColor("Fulano de Tal");
  const b = getPersonColor("Fulano de Tal");
  const c = getPersonColor("Ciclano");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.accent, c.accent);
});

test("normalização remove acentos para matching", () => {
  assert.equal(normalizePersonKey("Thássya"), "thassya");
});

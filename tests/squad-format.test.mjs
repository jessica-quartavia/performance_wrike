import assert from "node:assert/strict";
import test from "node:test";
import { formatSquadLabel, squadsFromTask } from "../public/squad-format.js";

test("formata nome entre parênteses para título legível", () => {
  const r = formatSquadLabel("squad_F (inteligência analytics)");
  assert.equal(r.display, "Inteligência Analytics");
  assert.equal(r.original, "squad_F (inteligência analytics)");
  assert.equal(r.isEmpty, false);
});

test("Sem squad permanece neutro", () => {
  assert.equal(formatSquadLabel("Sem squad").isEmpty, true);
  assert.equal(formatSquadLabel("").display, "Sem squad");
});

test("squadsFromTask usa array squads quando disponível", () => {
  assert.deepEqual(squadsFromTask({ squads: ["A", "B"] }), ["A", "B"]);
  assert.deepEqual(squadsFromTask({ squad: "X" }), ["X"]);
  assert.deepEqual(squadsFromTask({}), []);
});

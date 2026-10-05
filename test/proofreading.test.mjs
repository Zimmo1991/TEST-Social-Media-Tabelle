import test from "node:test";
import assert from "node:assert/strict";
import { localProofread, proofreadText } from "../backend/proofreading.mjs";

test("findet eindeutige deutsche und englische Schreibfehler", () => {
  assert.deepEqual(localProofread("Das wier vieleicht schön.", "de").map(issue => issue.text), ["wier", "vieleicht"]);
  assert.deepEqual(localProofread("We recieve teh guests.", "en").map(issue => issue.text), ["recieve", "teh"]);
});

test("findet allgemeine deutsche Wörterbuchfehler lokal", async () => {
  assert.deepEqual((await proofreadText("Ahrntal Fleeisch und Wohnnort", "de", ["Ahrntal"])).issues.map(issue => issue.text), ["Fleeisch", "Wohnnort"]);
  assert.deepEqual((await proofreadText("Das ist wudnerbar.", "de")).issues.map(issue => issue.text), ["wudnerbar"]);
});

test("prüft Italienisch und Englisch mit lokalen Wörterbüchern", async () => {
  assert.deepEqual((await proofreadText("Questa è un abitazzione bellisima.", "it")).issues.map(issue => issue.text), ["abitazzione", "bellisima"]);
  assert.deepEqual((await proofreadText("This is definately an adddress.", "en")).issues.map(issue => issue.text), ["definately", "adddress"]);
});

test("lässt bekannte Eigennamen unangetastet", async () => {
  assert.equal((await proofreadText("Ahrntal Valle Aurina", "auto", ["Ahrntal", "Valle", "Aurina"])).issues.length, 0);
});

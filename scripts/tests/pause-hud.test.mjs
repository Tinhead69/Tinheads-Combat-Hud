/** Run: node scripts/tests/pause-hud.test.mjs */
import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {
  on(name, fn) {
    if (!hooks.has(name)) hooks.set(name, new Set());
    hooks.get(name).add(fn);
  },
  off(name, fn) { hooks.get(name)?.delete(fn); }
};
function emit(name, ...args) {
  for (const fn of [...(hooks.get(name) ?? [])]) fn(...args);
}
globalThis.game = {
  paused: true,
  user: { isGM: false, getFlag: () => null },
  i18n: { format: key => key }
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener() {}, removeEventListener() {}
};
const roots = new Set();
function element() {
  return {
    dataset: {}, classList: { add() {} },
    appendChild() {}, addEventListener() {}, setAttribute() {},
    remove() { roots.delete(this); }
  };
}
globalThis.document = {
  createElement: element, createElementNS: element,
  body: { appendChild(root) { roots.add(root); } }
};

const { CombatHud } = await import("../ui/combat-hud.mjs");
const { registerTokenEntry } = await import("../hooks/token-entry.mjs");
// Keep real render/close and hook lifecycle; omit radial artwork and placement.
CombatHud.prototype._draw = () => {};
CombatHud.prototype._applyStagePosition = () => {};
CombatHud.prototype._clampToViewport = () => {};
const actor = { isOwner: true };
const token = { actor };

for (const isGM of [false, true]) {
  game.user.isGM = isGM;
  assert.equal(CombatHud.openForActor(actor), null);
  assert.equal(CombatHud.openForToken(token), null);
  new CombatHud(actor).render();
  assert.equal(roots.size, 0, "paused opening never attaches a HUD");
}

registerTokenEntry();
emit("renderTokenHUD", { object: token }, {
  querySelector() { throw new Error("Paused token HUD must not add its button"); }
});
for (const name of ["getActorContextOptions", "getCombatantContextOptions"]) {
  const entries = [];
  emit(name, {}, entries);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].condition({}), false, "paused context option is hidden");
}

game.paused = false;
const hud = CombatHud.openForToken(token);
assert.ok(hud);
assert.equal(roots.size, 1);
assert.equal(hooks.get("pauseGame").size, 1);
emit("pauseGame", false);
assert.equal(roots.size, 1, "unpausing leaves an open HUD alone");
game.paused = true;
emit("pauseGame", true);
assert.equal(roots.size, 0, "pausing immediately removes the open HUD");
assert.equal(hooks.get("pauseGame").size, 0, "close removes its pause listener");
CombatHud.closeActive();

// Queued clicks must stop before resolving an option or advancing a turn.
await hud._onLeafClick({});
await hud._onEndTurnClick();
assert.equal(roots.size, 0);

game.paused = false;
const reopened = CombatHud.openForActor(actor);
assert.ok(reopened);
assert.equal(roots.size, 1, "HUD can be opened again after unpausing");
CombatHud.closeActive();
assert.equal(roots.size, 0);
assert.equal(hooks.get("pauseGame").size, 0);
console.log("Passed pause HUD regression checks.");

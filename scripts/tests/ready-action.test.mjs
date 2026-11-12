import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULE_ID } from "../data/actor-options.mjs";
import { readyHudOption, registerReadyHooks, releaseReadyAction } from "../data/ready-action.mjs";
import { CombatHud } from "../ui/combat-hud.mjs";
import { getReadyNestEntries } from "../data/basic-actions.mjs";

let nextMessageId = 0;

function setup() {
  const hooks = new Map();
  const windows = [];
  const calls = [];
  const actor = { id: "caster", uuid: "Actor.caster", name: "Caster", isOwner: true };
  const combatant = { id: "caster-turn", actorId: actor.id };
  const combat = { id: "combat", started: true, round: 2, turn: 1, combatant,
    turns: [{ id: "first" }, combatant, { id: "last" }] };
  const user = { id: "player", active: true, targets: new Set() };
  const messages = [];
  const item = { uuid: "Actor.caster.Item.spell", name: "Spell", actor };
  const activity = {
    id: "activity",
    item,
    _prepareUsageConfig: config => ({ ...config, spell: { slot: "spell1" }, scaling: 0 }),
    async consume(config) { calls.push(["spend", config]); return {}; },
    async use(config) { calls.push(["release", config]); return {}; }
  };
  item.system = { activities: new Map([[activity.id, activity]]) };
  const option = { item, activity, name: "Spell <test>" };
  globalThis.game = { user, combat, messages, combats: new Map([[combat.id, combat]]), users: {},
    modules: new Map(), i18n: { format: key => key } };
  globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
  globalThis.CONFIG = {};
  globalThis.ui = { notifications: { warn: () => {} } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : uuid === item.uuid ? item : null;
  globalThis.foundry = { applications: { api: { DialogV2: class {
    static async wait() { return { trigger: "Enemy enters <range>" }; }
    addEventListener(event, listener) { if (event === "close") this.onClose = listener; }
    render() { windows.push(this); }
    async close() { this.closed = true; this.onClose?.(); }
  } } } };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ actor: actor.id }),
    async create(data) {
      const ready = data.flags[MODULE_ID].readyAction;
      const message = { id: String(++nextMessageId), author: user, content: data.content,
        getFlag: () => ready,
        async update(updates) {
          ready.state = updates[`flags.${MODULE_ID}.readyAction.state`];
          this.content = updates.content;
        }
      };
      messages.push(message);
      return message;
    }
  };
  registerReadyHooks();
  return { actor, combat, option, calls, messages, hooks, windows };
}

test("Ready spends once, then releases the held spell during a later turn of the same round", async () => {
  const { actor, combat, option, calls, messages, windows } = setup();
  const hud = new CombatHud(actor);
  hud.state.readyOpen = true;
  await hud._onLeafClick(option);
  assert.equal(windows.length, 1);
  assert.deepEqual(calls.map(([event]) => event), ["spend"]);
  assert.match(messages[0].content, /Enemy enters &lt;range&gt;/);
  assert.equal(await readyHudOption(option, actor), false);
  combat.turn = 2;
  assert(await releaseReadyAction(messages[0]));
  assert.deepEqual(calls[1], ["release", { consume: false, spell: { slot: "spell1" }, scaling: 0 }]);
  assert.equal(messages[0].getFlag().state, "completed");
  assert.equal(await releaseReadyAction(messages[0]), false);
  assert.equal(calls.length, 2);
});

test("the round counter expires the hold before the actor's next turn and closes its window", async () => {
  const { actor, combat, option, calls, messages, hooks, windows } = setup();
  assert(await readyHudOption(option, actor));
  combat.turn = 2;
  hooks.get("updateCombat")(combat);
  assert.equal(messages[0].getFlag().state, "held");
  combat.round += 1;
  combat.turn = 0;
  hooks.get("updateCombat")(combat);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages[0].getFlag().state, "expired");
  assert(windows[0].closed);
  assert.equal(await releaseReadyAction(messages[0]), false);
  assert.deepEqual(calls.map(([event]) => event), ["spend"]);
});

test("Ready weapon releases use Midi-QOL and the targets selected at release", async () => {
  const { actor, option, calls, messages } = setup();
  option.kind = "weapon";
  game.modules.set("midi-qol", { active: true });
  assert(await readyHudOption(option, actor));
  game.user.targets.add({ document: { uuid: "Scene.scene.Token.target" } });
  globalThis.MidiQOL = { async completeActivityUse(activity, usage) {
    assert.equal(activity, option.activity);
    assert.equal(usage.consume, false);
    assert.deepEqual(usage.midiOptions.targetUuids, ["Scene.scene.Token.target"]);
    calls.push(["midi"]);
    return {};
  } };
  try {
    assert(await releaseReadyAction(messages[0]));
    assert.deepEqual(calls.map(([event]) => event), ["spend", "midi"]);
  } finally {
    delete globalThis.MidiQOL;
  }
});

test("cancelling the declaration spends nothing and cancelling a release keeps the hold", async () => {
  const { actor, option, calls, messages } = setup();
  const Dialog = foundry.applications.api.DialogV2;
  const confirm = Dialog.wait;
  Dialog.wait = async () => null;
  assert.equal(await readyHudOption(option, actor), false);
  assert.deepEqual(calls, []);
  assert.equal(messages.length, 0);
  Dialog.wait = confirm;
  assert(await readyHudOption(option, actor));
  option.activity.use = async () => undefined;
  assert.equal(await releaseReadyAction(messages[0]), false);
  assert.equal(messages[0].getFlag().state, "held");
  assert.deepEqual(calls.map(([event]) => event), ["spend"]);
});

test("the HUD handles Ready even when an automated Ready item is present on the sheet", async () => {
  const { actor, option, calls, messages, windows } = setup();
  const ready = { id: "ready", name: "Ready", activation: { type: "action" } };
  const release = { id: "release", name: "Release", activation: { type: "reaction" } };
  actor.items = [
    { id: "legacy", name: "Ready Spell", type: "feat", system: { activities: [ready] } },
    { id: "unified", name: "Ready", type: "feat", isOwner: true, img: "icons/ready.webp",
      system: { activities: [release, ready] } }
  ];
  game.modules.set("midi-qol", { active: true });
  game.modules.set("cat", { active: true });
  globalThis.MidiQOL = { completeActivityUse: () => assert.fail("Ready declaration must stay in the HUD") };
  try {
    assert.deepEqual(getReadyNestEntries(actor).map(entry => entry.kind), ["cast", "attack", "basic"]);
    const hud = new CombatHud(actor);
    hud.state.readyOpen = true;
    await hud._onLeafClick(option);
    assert.deepEqual(calls.map(([event]) => event), ["spend"]);
    assert.equal(messages[0].getFlag().state, "held");
    assert.equal(windows.length, 1);
  } finally {
    delete globalThis.MidiQOL;
  }
});

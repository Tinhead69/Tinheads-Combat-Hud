import assert from "node:assert/strict";
import { test } from "node:test";

const hooks = new Map();
const warnings = [], cards = [], remote = [];
globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
globalThis.game = {
  user: { id: "player", isGM: true, targets: new Set() },
  i18n: { format: key => key }, modules: new Map([["socketlib", { active: true }]])
};
globalThis.ui = { notifications: { warn: text => warnings.push(text), error: text => warnings.push(text) } };
globalThis.CONFIG = {};
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async data => cards.push(data) };
const helper = { uuid: "Actor.helper", name: "Helper", isOwner: true };
const ally = {
  uuid: "Actor.ally", name: "Ally", isOwner: false, effects: [],
  createEmbeddedDocuments: async (type, data) => {
    assert.equal(type, "ActiveEffect");
    ally.effects.push(...data.map((effect, i) => ({ ...effect, id: `help${i}` })));
  },
  deleteEmbeddedDocuments: async (type, ids) => {
    assert.equal(type, "ActiveEffect");
    ally.effects = ally.effects.filter(effect => !ids.includes(effect.id));
  }
};
const token = { uuid: "Scene.scene.Token.ally", documentName: "Token", disposition: 1, actor: ally };
globalThis.fromUuid = async uuid => uuid === token.uuid ? token : null;
globalThis.socketlib = { registerModule: () => ({
  register: () => {}, executeAsGM: async (handler, payload) => { remote.push(payload); return { ok: true }; }
}) };
const { grantHelp, registerHelpHooks } = await import("../data/help-action.mjs");
const { resolveHudOption, executeResolvePayload } = await import("../data/resolve.mjs");
const { registerSocket } = await import("../net/socket.mjs");
const help = { kind: "basic", basicId: "help", name: "Help", actor: helper };
registerHelpHooks();

test("Help rejects absent, multiple, hostile, self and invalid targets without chat/effects", async () => {
  for (const targets of [[], [token.uuid, token.uuid], ["missing"]]) {
    assert.equal(await grantHelp(helper, targets), false);
  }
  token.disposition = -1;
  assert.equal(await grantHelp(helper, [token.uuid]), false);
  token.disposition = 1;
  assert.equal(await grantHelp(ally, [token.uuid]), false);
  assert.deepEqual(await resolveHudOption(help), { closed: false, ok: false });
  assert.equal(cards.length, 0);
  assert.equal(ally.effects.length, 0);
});

test("Help creates one visible effect and announces the recipient, bypassing sheet automation", async () => {
  game.user.targets = new Set([{ document: token, actor: ally }]);
  const option = { ...help, activity: { use: () => assert.fail("duplicate sheet use") } };
  assert.equal((await resolveHudOption(option)).ok, true);
  assert.equal((await resolveHudOption(option)).ok, true);
  assert.equal(ally.effects.length, 1);
  assert.equal(ally.effects[0].type, "base");
  assert.match(cards[0].content, /Ally/);
});

test("skill hook grants advantage while preserving disadvantage and cancelled/unevaluated checks keep Help", async () => {
  const config = { subject: ally, disadvantage: true, rolls: [{ options: {} }] };
  hooks.get("dnd5e.preRollSkillV2")(config);
  assert.equal(config.advantage, true);
  assert.equal(config.disadvantage, true);
  await hooks.get("dnd5e.rollSkillV2")([], { subject: ally });
  await hooks.get("dnd5e.rollSkillV2")([{ options: config.rolls[0].options }], { subject: ally });
  assert.equal(ally.effects.length, 1);
  await hooks.get("dnd5e.rollSkillV2")([{ _evaluated: true, options: config.rolls[0].options }], { subject: ally });
  assert.equal(ally.effects.length, 0);
  const next = { subject: ally, rolls: [{ options: {} }] };
  hooks.get("dnd5e.preRollSkillV2")(next);
  assert.equal(next.advantage, undefined);
  assert.equal(hooks.has("dnd5e.preRollSavingThrowV2"), false);
  assert.equal(hooks.has("dnd5e.preRollAbilityCheckV2"), false);
});

test("proxy uses supplied targets, never the GM's current selection", async () => {
  game.user.targets.clear();
  assert.equal((await executeResolvePayload({ ...help, actor: undefined, targetUuids: [token.uuid] }, { actor: helper })).ok, true);
  assert.equal(ally.effects.length, 1);
  game.user.targets.add({ document: token, actor: ally });
  assert.equal((await executeResolvePayload({ ...help, actor: undefined, targetUuids: [] }, { actor: helper })).ok, false);
});

test("an owner Helping an unowned ally routes through socketlib", async () => {
  registerSocket();
  game.user.isGM = false;
  assert.equal((await resolveHudOption(help)).ok, true);
  assert.equal(remote.length, 1);
  assert.deepEqual(remote[0].targetUuids, [token.uuid]);
  assert.equal(remote[0].actorUuid, helper.uuid);
});

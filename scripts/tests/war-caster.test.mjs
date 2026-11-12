import assert from "node:assert/strict";
import { test } from "node:test";
import { getWarCasterSpellOptions } from "../data/war-caster.mjs";
import { resolveHudOption } from "../data/resolve.mjs";

const actorUuid = "Actor.caster";
const target = { uuid: "Scene.test.Token.foe", documentName: "Token", actor: { uuid: "Actor.foe" } };
const feat = { type: "feat", name: "War Caster (2024)" };
const singleCreature = { affects: { type: "creature", count: "1" } };

globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} } } };
globalThis.game = {
  i18n: { localize: key => key, format: (key, data) => `${data.spell} (War Caster)` },
  user: { isGM: true, targets: new Set() },
  modules: new Map()
};

function makeSpell(id, { type = "action", target = singleCreature, level = 0 } = {}) {
  const activity = { id: "cast", activation: { type, value: 1 }, target };
  return {
    id, uuid: `${actorUuid}.Item.${id}`, name: id, type: "spell", isOwner: true,
    system: { level, method: "spell", prepared: 1, activities: [activity] }
  };
}

function makeActor(items) {
  return { uuid: actorUuid, isOwner: true, items, system: { spells: {} } };
}

test("War Caster lists available one-action spells configured for one creature", () => {
  const fireBolt = makeSpell("Fire Bolt", { target: { affects: { type: "creatureOrObject", count: "1" } } });
  const spells = [
    fireBolt,
    makeSpell("Counterspell", { type: "reaction" }),
    makeSpell("Area", { target: { ...singleCreature, template: { type: "sphere" } } }),
    makeSpell("Two creatures", { target: { affects: { type: "creature", count: "2" } } }),
    makeSpell("No slot", { level: 1 })
  ];

  assert.deepEqual(getWarCasterSpellOptions(makeActor(spells)), []);
  const options = getWarCasterSpellOptions(makeActor([feat, ...spells]));
  assert.deepEqual(options.map(option => option.item), [fireBolt]);
  assert.equal(options[0].name, "Fire Bolt (War Caster)");
});

test("War Caster requires one selected token and passes a temporary reaction to the casting workflow", async () => {
  const spell = makeSpell("Fire Bolt");
  const actor = makeActor([feat, spell]);
  const [option] = getWarCasterSpellOptions(actor);
  const casts = [];
  const warnings = [];
  globalThis.fromUuid = async uuid => uuid === target.uuid ? target : null;
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  spell.clone = (changes, context) => {
    assert.deepEqual(context, { keepId: true, parent: actor });
    const activity = {
      activation: changes.system.activities.cast.activation,
      use: (...args) => casts.push(args)
    };
    return { system: { activities: new Map([["cast", activity]]) } };
  };

  assert.deepEqual(await resolveHudOption(option, { actor }), { ok: false, closed: false });
  assert.equal(casts.length, 0);
  assert.equal(warnings.length, 1);

  game.user.targets = new Set([target]);
  assert.deepEqual(await resolveHudOption(option, { actor }), { ok: true, closed: true });
  assert.equal(casts[0][2].data.system.targets[0].token, target.uuid);

  game.modules.set("midi-qol", { active: true });
  globalThis.MidiQOL = { completeActivityUse: (...args) => casts.push(args) };
  assert.deepEqual(await resolveHudOption(option, { actor }), { ok: true, closed: true });
  assert.equal(casts[1][0].activation.type, "reaction");
  assert.deepEqual(casts[1][1].midiOptions.targetUuids, [target.uuid]);
  assert.equal(casts[1][1].midiOptions.proceedChecks.checkAoO, false);
  assert.equal(spell.system.activities[0].activation.type, "action");
});

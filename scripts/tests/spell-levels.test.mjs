/**
 * Lightweight node checks for available spell-level ring sizing.
 * Run: node --input-type=module scripts/tests/spell-levels.test.mjs
 */

import {
  equalSegments
} from "../ui/radial-geometry.mjs";

// Minimal Foundry stubs used by actor-options
globalThis.game = {
  i18n: { format: (key) => key },
  user: { isGM: true, targets: new Set() }
};
globalThis.foundry = {
  utils: {
    duplicate: (v) => JSON.parse(JSON.stringify(v))
  }
};
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} } } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const {
  getSpellLevels,
  isSpellAvailableForHud,
  hasSpellSlotForLevel
} = await import("../data/actor-options.mjs");

function spell(partial) {
  return {
    id: partial.id || partial.name,
    type: "spell",
    name: partial.name,
    img: "",
    isOwner: true,
    system: {
      level: partial.level,
      preparation: {
        mode: partial.mode ?? "prepared",
        prepared: partial.prepared ?? true
      },
      description: { value: "" },
      ...(partial.system || {})
    },
    ...partial
  };
}

function actorWith(items, slots = {}) {
  const spells = {
    spell1: { value: 0, max: 0 },
    spell2: { value: 0, max: 0 },
    spell3: { value: 0, max: 0 },
    spell4: { value: 0, max: 0 },
    spell5: { value: 0, max: 0 },
    spell6: { value: 0, max: 0 },
    spell7: { value: 0, max: 0 },
    spell8: { value: 0, max: 0 },
    spell9: { value: 0, max: 0 },
    pact: { value: 0, max: 0, level: 0 },
    ...slots
  };
  return {
    id: "ActorTest",
    items,
    system: { spells, favorites: [] },
    isOwner: true,
    testUserPermission: () => true
  };
}

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

const fireBolt = spell({ name: "Fire Bolt", level: 0 });
const magicMissile = spell({ name: "Magic Missile", level: 1, prepared: true });
const unprepared = spell({ name: "Detect Magic", level: 1, prepared: false });
const scorching = spell({ name: "Scorching Ray", level: 2, prepared: true });
const misty = spell({ name: "Misty Step", level: 2, mode: "always", prepared: true });
const eldritch = spell({ name: "Hex", level: 1, mode: "pact" });
const guidance = spell({ name: "Guidance", level: 0, mode: "atwill" });

// Slots only for 1st — 2nd prepared spell must not create a 2nd-level section
{
  const actor = actorWith(
    [fireBolt, magicMissile, unprepared, scorching],
    { spell1: { value: 2, max: 2 } }
  );
  assert(isSpellAvailableForHud(actor, fireBolt), "cantrip available");
  assert(isSpellAvailableForHud(actor, magicMissile), "prepared 1st with slots");
  assert(!isSpellAvailableForHud(actor, unprepared), "unprepared excluded");
  assert(!isSpellAvailableForHud(actor, scorching), "2nd without slots excluded");

  const { levels, empty } = getSpellLevels(actor);
  assert(!empty, "not empty");
  assert(levels.length === 2, `expected 2 levels, got ${levels.length}`);
  assert(levels.map(l => l.level).join(",") === "0,1", "levels are cantrip+1st only");
  assert(equalSegments(levels.length).length === 2, "ring has 2 even sections");
}

// Higher slots unlock lower upcast path — 1st spells count when only spell2 max>0
{
  const actor = actorWith([magicMissile], { spell2: { value: 1, max: 1 } });
  assert(hasSpellSlotForLevel(actor, 1), "higher slot covers lower level");
  assert(getSpellLevels(actor).levels.length === 1, "one level section");
}

// Always-prepared still needs a slot source
{
  const actor = actorWith([misty], { spell1: { value: 1, max: 1 } });
  // misty is level 2; only spell1 slots — should exclude
  assert(!isSpellAvailableForHud(actor, misty), "always L2 without L2+ slots excluded");
  const actor2 = actorWith([misty], { spell2: { value: 1, max: 1 } });
  assert(isSpellAvailableForHud(actor2, misty), "always L2 with L2 slots included");
}

// Pact
{
  const actor = actorWith([eldritch], { pact: { value: 1, max: 1, level: 1 } });
  assert(isSpellAvailableForHud(actor, eldritch), "pact spell with pact slots");
  const none = actorWith([eldritch], { pact: { value: 0, max: 0, level: 0 } });
  assert(!isSpellAvailableForHud(none, eldritch), "pact spell without pact slots excluded");
}

// At-will ignores slots
{
  const actor = actorWith([guidance], {});
  assert(isSpellAvailableForHud(actor, guidance), "at-will cantrip/spell counts without slots");
}

console.log(`\n${passed} assertions passed`);

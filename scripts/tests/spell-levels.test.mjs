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
  const mode = partial.mode ?? "spell";
  const numeric = partial.prepared;
  let method = mode;
  let prepared = 1;
  if (mode === "always" || mode === "prepared") method = "spell";
  if (mode === "always" || numeric === 2) prepared = 2;
  else if (numeric === false || numeric === 0) prepared = 0;
  else if (typeof numeric === "number") prepared = numeric;
  else if (mode === "atwill" || mode === "innate" || mode === "ritual") prepared = 2;
  return {
    id: partial.id || partial.name,
    type: "spell",
    name: partial.name,
    img: "",
    isOwner: true,
    system: {
      level: partial.level,
      method,
      prepared,
      description: { value: "" },
      ...(partial.activities ? { activities: partial.activities } : {}),
      ...(partial.system || {}),
      ...(partial.activation ? { activation: { type: partial.activation } } : {})
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
  assert(levels.find(l => l.level === 0).slots == null, "cantrips show no slot count");
  assert(levels.find(l => l.level === 1).slots === "2/2", "1st shows remaining spell slots");
}

{
  const actor = actorWith([magicMissile], { spell1: { value: 1, max: 4 } });
  assert(getSpellLevels(actor).levels[0].slots === "1/4", "spent slots show remaining over max");
  const empty = actorWith([magicMissile], { spell1: { value: 0, max: 4 } });
  assert(getSpellLevels(empty).levels[0].slots === "0/4", "empty pool still shows zero available");
  const overridden = actorWith([magicMissile], { spell1: { value: 3, max: 2, override: 4 } });
  assert(getSpellLevels(overridden).levels[0].slots === "3/4", "slot override replaces max");
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
  const pactLevels = getSpellLevels(actor).levels;
  assert(pactLevels.map(level => level.level).join(",") === "pact", "pact spells are their own wedge");
  assert(pactLevels[0].slots === "1/1", "pact slots show on Pact Magic");
  const none = actorWith([eldritch], { pact: { value: 0, max: 0, level: 0 } });
  assert(!isSpellAvailableForHud(none, eldritch), "pact spell without pact slots excluded");
  const both = actorWith(
    [magicMissile, eldritch],
    { spell1: { value: 3, max: 4 }, pact: { value: 1, max: 2, level: 1 } }
  );
  const mixed = getSpellLevels(both).levels;
  assert(mixed.find(level => level.level === 1).slots === "3/4", "regular slots stay on the spell level");
  assert(mixed.find(level => level.level === "pact").slots === "1/2", "pact slots stay on Pact Magic");
}

{
  const hellish = spell({ name: "Hellish Rebuke", level: 1, mode: "innate" });
  const actor = actorWith([fireBolt, hellish, magicMissile], { spell1: { value: 2, max: 2 } });
  const levels = getSpellLevels(actor).levels;
  assert(levels.map(level => level.level).join(",") === "innate,0,1", "innate spellcasting is its own wedge");
  assert(levels.find(level => level.level === "innate").spells.map(spell => spell.name).join(",") === "Hellish Rebuke", "the innate wedge lists the innate spell");
  assert(!levels.find(level => level.level === 1).spells.some(spell => spell.name === "Hellish Rebuke"), "an innate spell is not filed under its slot level");
}

// At-will ignores slots
{
  const actor = actorWith([guidance], {});
  assert(isSpellAvailableForHud(actor, guidance), "at-will cantrip/spell counts without slots");
}

// Action, bonus, and reaction spells stay on their own rings.
{
  const bless = spell({ name: "Bless", level: 1, prepared: 1 });
  const hunters = spell({
    name: "Hunter's Mark",
    level: 1,
    prepared: 1,
    activation: "bonus",
    activities: [{ type: "cast", activation: { type: "action" } }]
  });
  const shield = spell({ name: "Shield", level: 1, prepared: 1, activation: "reaction" });
  const actor = actorWith([bless, hunters, shield], { spell1: { value: 3, max: 4 } });
  const names = (economy) => getSpellLevels(actor, economy).levels.flatMap(level => level.spells.map(spell => spell.name));
  assert(names("action").join(",") === "Bless", "only action spells are on the action cast ring");
  assert(names("bonus").join(",") === "Hunter's Mark", "item activation keeps Hunter's Mark on bonus");
  assert(names("reaction").join(",") === "Shield", "reaction spells stay on the reaction ring");
}

console.log(`\n${passed} assertions passed`);

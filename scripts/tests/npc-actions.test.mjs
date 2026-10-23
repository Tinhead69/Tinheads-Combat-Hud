/**
 * Current monster HUD API: actor classification and activation-specific attacks.
 * Run: node scripts/tests/npc-actions.test.mjs
 */

globalThis.game = {
  i18n: { format: (key) => key, localize: (key) => key },
  user: { isGM: true, targets: new Set() }
};
globalThis.foundry = { utils: { duplicate: (value) => JSON.parse(JSON.stringify(value)) } };
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} }, abilities: {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const {
  getMonsterAttackNestOptions,
  getMonsterAttackOptions,
  isMonsterActor
} = await import("../data/monster-hud.mjs");
const { mainSectionAngles } = await import("../ui/radial-geometry.mjs");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log("ok:", message);
}

function item({ id, name, type = "feat", activation = "", activities = [] }) {
  return {
    id,
    name,
    type,
    isOwner: true,
    system: {
      activation: { type: activation },
      activities
    }
  };
}

assert(isMonsterActor({ type: "npc", system: { details: { cr: 0 } } }), "CR 0 NPC uses the Monster HUD");
assert(isMonsterActor({ type: "npc", system: { details: { cr: "1/4" } } }), "fractional CR NPC uses the Monster HUD");
assert(!isMonsterActor({ type: "npc", system: { details: { cr: null } } }), "NPC without a CR keeps the Character HUD");
assert(!isMonsterActor({ type: "character", system: { details: { cr: 5 } } }), "player characters keep the Character HUD");
assert(mainSectionAngles().map(section => section.id).join(",") === "action,checks,bonus,reaction", "main radial uses Action, Checks, Bonus, and Reaction sections");

const goblin = {
  id: "goblin",
  type: "npc",
  system: { details: { cr: "1/4" } },
  items: [
    item({
      id: "scimitar",
      name: "Scimitar",
      type: "weapon",
      activities: [{ id: "attack", name: "Attack", type: "attack", activation: { type: "" } }]
    }),
    item({
      id: "quick-stab",
      name: "Quick Stab",
      type: "weapon",
      activities: [{ id: "bonus", name: "Quick Stab", type: "attack", activation: { type: "bonus" } }]
    }),
    item({
      id: "parry",
      name: "Parry",
      activities: [{ id: "reaction", name: "Parry", type: "utility", activation: { type: "reaction" } }]
    })
  ]
};

const action = getMonsterAttackOptions(goblin, "action");
assert(action.some(entry => entry.kind === "attack"), "NPC Action ring has an Attack hub");
assert(getMonsterAttackNestOptions(goblin).map(entry => entry.name).join(",") === "Scimitar", "Attack nest contains only Action attacks");
assert(getMonsterAttackOptions(goblin, "bonus").map(entry => entry.name).join(",") === "Quick Stab", "Bonus attacks stay on the Bonus ring");
const reactions = getMonsterAttackOptions(goblin, "reaction");
assert(reactions.some(entry => entry.name === "Parry"), "reaction features stay on the Reaction ring");
assert(!reactions.some(entry => entry.name === "Quick Stab"), "Bonus attacks do not leak onto the Reaction ring");

console.log(`\n${passed} assertions passed`);


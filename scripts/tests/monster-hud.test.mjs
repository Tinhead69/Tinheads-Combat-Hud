/**
 * Monster sheet: action attacks and bonus-action attacks, separate from the character HUD.
 * Run: node scripts/tests/monster-hud.test.mjs
 */

globalThis.game = {
  i18n: { format: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key), localize: (k) => k },
  user: { isGM: true, targets: new Set() }
};
globalThis.foundry = { utils: { duplicate: (v) => JSON.parse(JSON.stringify(v)) } };
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} }, abilities: {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const { getMonsterAttackOptions, isMonsterActor } = await import("../data/monster-hud.mjs");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

function weapon(partial) {
  return {
    id: partial.id || partial.name,
    type: partial.type || "weapon",
    name: partial.name,
    img: partial.img || "",
    system: {
      activation: partial.activation || { type: "" },
      activities: partial.activities || null
    }
  };
}

const wolf = {
  type: "npc",
  system: { details: { cr: 0.25 } },
  items: [
    weapon({
      name: "Bite",
      activities: [{ id: "bite", name: "Attack", type: "attack", activation: { type: "action" } }]
    }),
    weapon({
      name: "Claw",
      activities: [{ id: "claw", name: "Claw", type: "attack", activation: { type: "bonus" } }]
    }),
    weapon({
      name: "Tail",
      activities: [{ id: "tail", name: "Tail", type: "attack", activation: { type: "reaction" } }]
    }),
    {
      id: "fright",
      type: "feat",
      name: "Frightful Presence",
      system: {
        activation: { type: "action" },
        activities: [{ id: "fp", name: "Frightful Presence", type: "save", activation: { type: "action" } }]
      }
    },
    weapon({
      name: "Gore",
      activities: [
        { id: "gore", name: "Gore", type: "attack", activation: { type: "action" } },
        { id: "rider", name: "Auto", type: "attack", activation: { type: "action" }, flags: { "midi-qol": { automationOnly: true } } }
      ]
    })
  ]
};

assert(isMonsterActor(wolf), "an npc with a challenge rating is a monster");
assert(isMonsterActor({ type: "npc", system: { details: { cr: 0 } } }), "CR 0 still counts as a monster");
assert(isMonsterActor({ type: "npc", system: { details: { cr: "1/4" } } }), "a fractional CR string still counts");
assert(!isMonsterActor({ type: "character", system: { details: { cr: 5 } } }), "a player character keeps the full sheet");
assert(!isMonsterActor({ type: "npc", system: { details: { cr: null } } }), "an npc with no CR keeps the full sheet");
assert(!isMonsterActor({
  type: "npc",
  system: { details: {} },
  items: [{ type: "class", name: "Fighter", system: {} }]
}), "homebrew without a CR keeps the full sheet");

const actions = getMonsterAttackOptions(wolf, "action");
assert(actions.map(entry => entry.name).join(",") === "Bite,Gore", "action attacks are Bite and Gore");
assert(actions.every(entry => entry.kind === "weapon-attack"), "monster attacks resolve as attacks");
assert(!actions.some(entry => entry.name === "Frightful Presence"), "a save is not an attack");
assert(!actions.some(entry => entry.name === "Auto"), "automation-only riders stay off the ring");

const bonus = getMonsterAttackOptions(wolf, "bonus");
assert(bonus.map(entry => entry.name).join(",") === "Claw", "bonus action attacks sit on the bonus ring");

const reactions = getMonsterAttackOptions(wolf, "reaction");
assert(reactions.map(entry => entry.name).join(",") === "Tail", "reaction attacks sit on the reaction ring");

const bare = {
  type: "npc",
  system: { details: { cr: 1 } },
  items: [
    weapon({ name: "Slam", activation: { type: "action" } })
  ]
};
assert(getMonsterAttackOptions(bare, "action").map(entry => entry.name).join(",") === "Slam", "a weapon with no activities still counts as an action attack");

console.log(`\n${passed} assertions passed`);

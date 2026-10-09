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

const { getMonsterAttackNestOptions, getMonsterAttackOptions, getMonsterOpportunityAttacks, isMonsterActor } = await import("../data/monster-hud.mjs");
const { getChecksMenuOptions } = await import("../data/ability-checks.mjs");

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
assert(
  getChecksMenuOptions(wolf).every(entry => entry.kind !== "death-save"),
  "monsters do not get death saves"
);
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
assert(reactions[0]?.kind === "opportunity" && reactions[0]?.id === "attack-of-opportunity", "every monster gets an attack of opportunity");
assert(reactions.slice(1).map(entry => entry.name).join(",") === "Tail", "reaction attacks sit beside the opportunity attack");

const listedOpportunity = {
  type: "npc",
  system: { details: { cr: 2 } },
  items: [
    weapon({
      name: "Attack of Opportunity",
      activities: [{ id: "oa", name: "Attack of Opportunity", type: "attack", activation: { type: "reaction" } }]
    })
  ]
};
const listedReactions = getMonsterAttackOptions(listedOpportunity, "reaction");
assert(listedReactions.filter(entry => entry.kind === "opportunity").length === 0, "a sheet opportunity attack is not repeated");
assert(listedReactions.length === 1, "the sheet opportunity attack is the reaction");

const dragon = {
  type: "npc",
  system: { details: { cr: 17 } },
  items: [
    weapon({
      name: "Bite",
      activities: [{ id: "bite", name: "Bite", type: "attack", activation: { type: "action" } }]
    }),
    weapon({
      name: "Claw",
      activities: [{ id: "claw", name: "Claw", type: "attack", activation: { type: "bonus" } }]
    }),
    {
      id: "wing",
      type: "feat",
      name: "Wing Attack",
      system: {
        activation: { type: "legendary" },
        activities: [{ id: "wing", name: "Wing Attack", type: "attack", activation: { type: "legendary" } }]
      }
    },
    {
      id: "detect",
      type: "feat",
      name: "Detect",
      system: {
        activation: { type: "legendary" },
        activities: [{ id: "detect", name: "Detect", type: "utility", activation: { type: "legendary" } }]
      }
    },
    {
      id: "torrent",
      type: "feat",
      name: "Torrent",
      system: {
        activation: { type: "lair" },
        activities: [{ id: "torrent", name: "Torrent", type: "save", activation: { type: "lair" } }]
      }
    },
    {
      id: "mythic",
      type: "feat",
      name: "Restore",
      system: {
        activation: { type: "mythic" },
        activities: [{ id: "restore", name: "Restore", type: "utility", activation: { type: "mythic" } }]
      }
    }
  ]
};
const dragonActions = getMonsterAttackOptions(dragon, "action");
assert(dragonActions[0]?.kind === "attack" && dragonActions[0]?.id === "monster-attack", "legendary actions nest under Attack");
assert(dragonActions.slice(1).map(entry => entry.name).join(",") === "Torrent", "lair actions stay on the action ring");
const dragonNest = getMonsterAttackNestOptions(dragon);
assert(dragonNest.map(entry => entry.name).join(",") === "Bite,Detect,Wing Attack", "legendary actions sit with the other attacks");
assert(dragonNest.find(entry => entry.name === "Wing Attack")?.kind === "weapon-attack", "a legendary attack still resolves as an attack");
assert(dragonNest.find(entry => entry.name === "Detect")?.kind === "feature", "a legendary save resolves as its activity");
assert(dragonActions.find(entry => entry.name === "Torrent")?.kind === "feature", "a lair save resolves as its activity");
assert(!dragonNest.some(entry => entry.name === "Claw"), "a bonus attack stays off the attack nest");
assert(!dragonActions.some(entry => entry.name === "Restore") && !dragonNest.some(entry => entry.name === "Restore"), "mythic actions stay off the attack list");
assert(
  getMonsterOpportunityAttacks(dragon).map(entry => entry.name).join(",") === "Bite",
  "an opportunity attack uses the creature's action attacks"
);

const quiet = {
  type: "npc",
  system: { details: { cr: 0 } },
  items: []
};
assert(getMonsterAttackOptions(quiet, "reaction")[0]?.id === "attack-of-opportunity", "a monster with no reaction on its sheet still gets an opportunity attack");

const bare = {
  type: "npc",
  system: { details: { cr: 1 } },
  items: [
    weapon({ name: "Slam", activation: { type: "action" } })
  ]
};
assert(getMonsterAttackOptions(bare, "action").map(entry => entry.name).join(",") === "Slam", "a weapon with no activities still counts as an action attack");

console.log(`\n${passed} assertions passed`);

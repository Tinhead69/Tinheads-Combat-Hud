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

const {
  getMonsterAttackNestOptions,
  getMonsterAttackOptions,
  getMonsterFeatureOptions,
  getMonsterOpportunityAttacks,
  getMonsterSpellGroups,
  isMonsterActor
} = await import("../data/monster-hud.mjs");
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
assert(actions.map(entry => entry.kind).join(",") === "attack,abilities", "a save action opens Attack and Features");
assert(getMonsterAttackNestOptions(wolf).map(entry => entry.name).join(",") === "Bite,Gore", "action attacks are Bite and Gore");
assert(getMonsterAttackNestOptions(wolf).every(entry => entry.kind === "weapon-attack"), "monster attacks resolve as attacks");
assert(getMonsterFeatureOptions(wolf).map(entry => entry.name).join(",") === "Frightful Presence", "a save action sits under Features");
assert(!getMonsterFeatureOptions(wolf).some(entry => entry.name === "Auto"), "automation-only riders stay off the ring");

const bonus = getMonsterAttackOptions(wolf, "bonus");
assert(bonus.map(entry => entry.name).join(",") === "Claw", "bonus action attacks sit on the bonus ring");

const reactions = getMonsterAttackOptions(wolf, "reaction");
assert(reactions[0]?.kind === "opportunity" && reactions[0]?.id === "attack-of-opportunity", "every monster gets an attack of opportunity");
assert(reactions.slice(1).map(entry => entry.name).join(",") === "Tail", "reaction attacks sit beside the opportunity attack");

const amnizu = {
  type: "npc",
  system: { details: { cr: 18 } },
  items: [
    {
      id: "charm",
      type: "feat",
      name: "Instinctive Charm",
      system: {
        activation: { type: "reaction" },
        activities: [{ id: "charm", name: "Instinctive Charm", type: "save", activation: { type: "reaction" } }]
      }
    }
  ]
};
const amnizuReactions = getMonsterAttackOptions(amnizu, "reaction");
assert(amnizuReactions[0]?.id === "attack-of-opportunity", "a save reaction still keeps the opportunity attack");
assert(amnizuReactions[1]?.name === "Instinctive Charm" && amnizuReactions[1]?.kind === "feature", "a reaction save is listed on the reaction ring");

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
assert(dragonActions[1]?.kind === "abilities" && dragonActions[1]?.id === "monster-features", "lair actions sit under Features");
assert(getMonsterFeatureOptions(dragon).map(entry => entry.name).join(",") === "Torrent", "a lair action is a feature");
const dragonNest = getMonsterAttackNestOptions(dragon);
assert(dragonNest.map(entry => entry.name).join(",") === "Bite,Detect,Wing Attack", "legendary actions sit with the other attacks");
assert(dragonNest.find(entry => entry.name === "Wing Attack")?.kind === "weapon-attack", "a legendary attack still resolves as an attack");
assert(dragonNest.find(entry => entry.name === "Detect")?.kind === "feature", "a legendary save resolves as its activity");
assert(getMonsterFeatureOptions(dragon).find(entry => entry.name === "Torrent")?.kind === "feature", "a lair save resolves as its activity");
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

const caster = {
  type: "npc",
  system: { details: { cr: 18 } },
  items: [
    weapon({
      name: "Taskmaster Whip",
      activities: [{ id: "whip", name: "Taskmaster Whip", type: "attack", activation: { type: "action" } }]
    }),
    {
      id: "forget",
      type: "feat",
      name: "Forgetfulness",
      system: {
        activation: { type: "action" },
        activities: [{ id: "forget", name: "Forgetfulness", type: "save", activation: { type: "action" } }]
      }
    },
    {
      id: "multi",
      type: "feat",
      name: "Multiattack",
      system: {
        activation: { type: "action" },
        activities: [{ id: "multi", name: "Multiattack", type: "utility", activation: { type: "action" } }]
      }
    },
    {
      id: "casting",
      type: "feat",
      name: "Spellcasting",
      system: { activation: { type: "action" }, activities: [] }
    },
    {
      id: "command",
      type: "spell",
      name: "Command",
      system: { level: 1, method: "atwill", prepared: 2, activation: { type: "action" } }
    },
    {
      id: "feeblemind",
      type: "spell",
      name: "Feeblemind",
      system: { level: 8, method: "atwill", prepared: 2, activation: { type: "action" } }
    },
    {
      id: "fireball",
      type: "spell",
      name: "Burning Hands",
      system: { level: 3, method: "innate", prepared: 2, activation: { type: "action" } }
    }
  ]
};
const casterRing = getMonsterAttackOptions(caster, "action");
assert(casterRing.map(entry => entry.kind).join(",") === "attack,cast,abilities", "Action is Attack, Cast Spell, and Features");
assert(getMonsterAttackNestOptions(caster).map(entry => entry.name).join(",") === "Taskmaster Whip", "the attack nest is the weapon attack");
assert(
  getMonsterFeatureOptions(caster).map(entry => entry.name).join(",") === "Forgetfulness,Multiattack",
  "special abilities sit under Features and Spellcasting does not"
);
const groups = getMonsterSpellGroups(caster);
assert(groups.map(entry => entry.id).join(",") === "atwill,innate", "at-will and innate spells are not grouped by slot level");
assert(groups[0].spells.map(entry => entry.name).join(",") === "Command,Feeblemind", "at-will spells stay together");
assert(groups[1].spells.map(entry => entry.name).join(",") === "Burning Hands", "an innate spell stays in the innate group");

console.log(`\n${passed} assertions passed`);

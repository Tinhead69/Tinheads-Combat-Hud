/**
 * Weapon special abilities + End Turn + Checks + class features.
 * Run: node scripts/tests/hud-nests.test.mjs
 */

globalThis.game = {
  i18n: { format: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key), localize: (k) => k },
  user: { isGM: false, id: "U1", targets: new Set() },
  combat: null
};
globalThis.foundry = { utils: { duplicate: (v) => JSON.parse(JSON.stringify(v)) } };
globalThis.CONFIG = {
  DND5E: {
    abilities: {
      str: { label: "Strength" },
      dex: { label: "Dexterity" },
      con: { label: "Constitution" },
      int: { label: "Intelligence" },
      wis: { label: "Wisdom" },
      cha: { label: "Charisma" }
    },
    defaultArtwork: { Item: {} }
  }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const { enrichWeaponOption, getWeaponMenuOptions, getWeaponAbilityOptions } =
  await import("../data/weapon-abilities.mjs");
const { getEndTurnState, endCombatTurn } = await import("../data/combat-turn.mjs");
const { getAbilityOptions, getAbilityRollOptions, rollAbilityHudOption } =
  await import("../data/ability-checks.mjs");
const { getActionFeatureOptions, getFeatureModeOptions, formatUses } =
  await import("../data/action-features.mjs");
const { buildActionRingEntries } = await import("../data/basic-actions.mjs");
const { mainSectionAngles } = await import("../ui/radial-geometry.mjs");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

// --- Weapon nests ---
const plain = enrichWeaponOption({
  id: "w1",
  name: "Longsword",
  img: "",
  item: {
    id: "w1",
    name: "Longsword",
    type: "weapon",
    img: "",
    isOwner: true,
    system: {
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } }
      ]
    }
  },
  activity: null
});
assert(plain.hasSpecial === false, "plain weapon has no special nest");

const wave = enrichWeaponOption({
  id: "wave",
  name: "Wave",
  img: "",
  item: {
    id: "wave",
    name: "Wave",
    type: "weapon",
    img: "",
    isOwner: true,
    system: {
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } },
        { id: "cube1", name: "Cube — Wall", type: "utility", activation: { type: "action" } },
        { id: "cube2", name: "Cube — Cage", type: "utility", activation: { type: "action" } }
      ]
    }
  },
  activity: null
});
assert(wave.hasSpecial === true, "Wave has special abilities");
const menu = getWeaponMenuOptions(wave);
assert(menu.length === 2, "Attack + Use Ability");
assert(menu[0].kind === "weapon-attack", "first is attack");
assert(menu[1].kind === "weapon-use-ability", "second is use ability");
const modes = getWeaponAbilityOptions(wave);
assert(modes.length === 2, "two cube modes");

// --- End Turn ---
game.combat = null;
assert(getEndTurnState().enabled === false, "no combat disables end turn");

game.combat = {
  combatant: { isOwner: true, actor: { isOwner: true } },
  nextTurn: async () => ({ ok: true })
};
game.user.isGM = false;
assert(getEndTurnState().enabled === true, "owner can end turn");
const advanced = await endCombatTurn();
assert(advanced.ok === true, "nextTurn called");

game.combat.combatant = { isOwner: false, actor: { isOwner: false }, testUserPermission: () => false };
assert(getEndTurnState().enabled === false, "non-owner blocked");
game.user.isGM = true;
assert(getEndTurnState().enabled === true, "GM can always end turn");

// --- Checks ---
const actor = {
  system: {
    abilities: {
      str: { mod: 3, save: 5 },
      dex: { mod: 2, save: 2 },
      con: { mod: 1, save: 1 },
      int: { mod: 0, save: 0 },
      wis: { mod: 2, save: 4 },
      cha: { mod: -1, save: -1 }
    }
  },
  items: [],
  rollAbilityCheck: async (cfg) => ({ type: "check", ability: cfg.ability }),
  rollSavingThrow: async (cfg) => ({ type: "save", ability: cfg.ability })
};
const abs = getAbilityOptions(actor);
assert(abs.length === 6, "six abilities");
assert(abs[0].abilityId === "str", "STR first");
const rolls = getAbilityRollOptions(abs[0]);
assert(rolls.map(r => r.kind).join(",") === "ability-check,ability-save", "check and save");
const checkRoll = await rollAbilityHudOption(actor, rolls[0]);
assert(checkRoll.type === "check" && checkRoll.ability === "str", "rollAbilityCheck used");
const saveRoll = await rollAbilityHudOption(actor, rolls[1]);
assert(saveRoll.type === "save" && saveRoll.ability === "str", "rollSavingThrow used");

// --- Class features ---
const paladin = {
  id: "P1",
  items: [
    {
      id: "loh",
      name: "Lay on Hands",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        activation: { type: "action" },
        uses: { value: 25, max: 25 },
        activities: [
          { id: "heal", name: "Lay on Hands", type: "heal", activation: { type: "action" }, uses: { value: 25, max: 25 } }
        ]
      }
    },
    {
      id: "cd",
      name: "Channel Divinity",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        uses: { value: 1, max: 1 },
        activities: [
          { id: "tu", name: "Turn Undead", type: "save", activation: { type: "action" } },
          { id: "pl", name: "Preserve Life", type: "heal", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "dodge",
      name: "Dodge",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        identifier: "dodge",
        activation: { type: "action" },
        activities: [{ id: "d", name: "Dodge", type: "utility", activation: { type: "action" } }]
      }
    }
  ],
  system: { favorites: [], spells: {}, abilities: actor.system.abilities },
  isOwner: true
};

const features = getActionFeatureOptions(paladin);
assert(features.some(f => f.name === "Lay on Hands"), "Lay on Hands on Action ring");
assert(features.some(f => f.name === "Channel Divinity"), "Channel Divinity on Action ring");
assert(!features.some(f => f.name === "Dodge"), "Dodge stays on basics only");
const loh = features.find(f => f.name === "Lay on Hands");
assert(loh.hasNest === false, "Lay on Hands is a leaf");
assert(formatUses(loh.item, loh.activity) === "25/25", "uses pool shown");
const cd = features.find(f => f.name === "Channel Divinity");
assert(cd.hasNest === true, "Channel Divinity nests modes");
assert(getFeatureModeOptions(cd).length === 2, "two divinity modes");

const ring = buildActionRingEntries(paladin, []);
assert(ring.some(e => e.kind === "feature"), "features in Action ring entries");
assert(ring.filter(e => e.kind === "basic").length === 4, "still four basics");

// --- Main radial 4 wedges ---
const mains = mainSectionAngles();
assert(mains.length === 4, "four main wedges");
assert(mains.map(m => m.id).join(",") === "action,checks,bonus,reaction", "Action Checks Bonus Reaction");

console.log(`\n${passed} assertions passed`);

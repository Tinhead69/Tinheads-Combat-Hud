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
const { getActionFeatureOptions, getClassFeatureOptions, getFeatureModeOptions, formatUses, isSuppressedActionFeature } =
  await import("../data/action-features.mjs");
const { buildActionRingEntries, getAttackNestEntries } = await import("../data/basic-actions.mjs");
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

const hazirawn = enrichWeaponOption({
  id: "hazirawn",
  name: "Hazirawn",
  img: "",
  item: {
    id: "hazirawn",
    name: "Hazirawn",
    type: "weapon",
    img: "",
    isOwner: true,
    system: {
      description: { value: "<p><strong>Increased Potency.</strong> Bonus while attuned.</p><p><strong>Wounding.</strong> Target cannot regain hit points.</p>" },
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } },
        { id: "potency", name: "Increased Potency", type: "utility", activation: { type: "none" } },
        {
          id: "detect",
          name: "Detect Magic",
          type: "utility",
          activation: { type: "none" },
          flags: { "midi-qol": { automationOnly: false, onUseMacroName: "ItemMacro" } }
        },
        {
          id: "wound",
          name: "Wounding",
          type: "damage",
          activation: { type: "special" },
          flags: { "midi-qol": { automationOnly: true } }
        }
      ]
    }
  },
  activity: null
});
assert(hazirawn.hasSpecial === true, "Hazirawn midi activity opens Use Ability");
const hazModes = getWeaponAbilityOptions(hazirawn).map(mode => mode.name);
assert(hazModes.includes("Detect Magic"), "midi-qol activity is an action");
assert(!hazModes.includes("Increased Potency"), "passive rider is not an action");
assert(!hazModes.includes("Wounding"), "automation-only midi rider is not a button");
assert(!hazModes.includes("Attack"), "attack stays off the ability list");

const spentStaff = enrichWeaponOption({
  id: "staff",
  name: "Staff of Frost",
  img: "",
  item: {
    id: "staff",
    name: "Staff of Frost",
    type: "weapon",
    img: "",
    isOwner: true,
    system: {
      uses: { spent: 10, max: 10 },
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } },
        {
          id: "cone",
          name: "Cone of Cold",
          type: "save",
          activation: { type: "action" },
          consumption: { targets: [{ type: "itemUses", value: "1" }] }
        },
        {
          id: "fog",
          name: "Fog Cloud",
          type: "utility",
          activation: { type: "action" },
          consumption: { targets: [{ type: "itemUses", value: "1" }] }
        }
      ]
    }
  },
  activity: null
});
assert(spentStaff.hasSpecial === true, "spent weapon still opens Use Ability");
const spentModes = getWeaponAbilityOptions(spentStaff);
assert(spentModes.map(mode => mode.name).join(",") === "Cone of Cold,Fog Cloud", "spent abilities stay listed");
assert(spentModes.every(mode => mode.available === false), "spent abilities are not usable");
assert(spentModes.every(mode => mode.usesLabel === "0/10"), "spent pool still shows");

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

const layOnHands = {
  name: "Lay on Hands Pool",
  actor: { getRollData: () => ({ classes: { paladin: { levels: 6 } } }) },
  system: { uses: { spent: 10, max: "@classes.paladin.levels * 5" } }
};
const layActivity = {
  uses: { spent: 0, max: "", value: 0 },
  consumption: { targets: [{ type: "itemUses", value: "1" }] }
};
assert(formatUses(layOnHands, layActivity) === "20/30", "lay on hands shows remaining pool, not the activity's 0");
const cd = features.find(f => f.name === "Channel Divinity");
assert(cd.hasNest === true, "Channel Divinity nests modes");
assert(getFeatureModeOptions(cd).length === 2, "two divinity modes");

const splitPaladin = {
  ...paladin,
  items: [
    ...paladin.items,
    {
      id: "abjure",
      name: "Channel Divinity: Abjure Enemies",
      type: "feat",
      img: "icons/abjure.webp",
      isOwner: true,
      system: {
        activation: { type: "action" },
        activities: [
          { id: "abj", name: "Abjure Enemies", type: "save", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "weapon",
      name: "Channel Divinity: Sacred Weapon",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        type: { value: "class", subtype: "channelDivinity" },
        activities: [
          { id: "sw", name: "Channel Divinity", type: "utility", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "vow",
      name: "Channel Divinity: Vow of Enmity",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        activation: { type: "bonus" },
        activities: [
          { id: "vow", name: "Channel Divinity", type: "utility", activation: { type: "bonus" } }
        ]
      }
    }
  ]
};
const splitFeatures = getActionFeatureOptions(splitPaladin);
assert(splitFeatures.filter(f => /channel divinity/i.test(f.name)).length === 1, "one Channel Divinity button");
const splitCd = splitFeatures.find(f => f.name === "Channel Divinity");
assert(splitCd.hasNest === true, "split Channel Divinity opens a nest");
const splitModes = getFeatureModeOptions(splitCd).map(mode => mode.name);
assert(splitModes.includes("Turn Undead"), "parent modes stay in the nest");
assert(splitModes.includes("Abjure Enemies"), "named option is nested");
assert(splitModes.includes("Sacred Weapon"), "feature title wins over a generic activity name");
assert(splitModes.includes("Vow of Enmity"), "bonus divinity is listed with its own title");
assert(!splitModes.some(name => name === "Channel Divinity"), "generic activity is not a divinity title");
assert(!splitFeatures.some(f => f.name.includes("Abjure") || f.name.includes("Vow")), "options are not their own wedges");
const bonusFeatures = getClassFeatureOptions(splitPaladin, "bonus");
assert(!bonusFeatures.some(f => /channel divinity|vow of enmity/i.test(f.name)), "divinities stay off the bonus ring");

const ring = buildActionRingEntries(paladin, []);
assert(ring.some(e => e.kind === "abilities"), "abilities hub on the Action ring");
assert(ring.filter(e => e.kind === "basic").length === 3, "Dodge Dash Disengage stay leaves");
assert(getClassFeatureOptions(paladin, "action").some(f => f.name === "Lay on Hands"), "Lay on Hands is an ability");
const noisy = {
  ...paladin,
  items: [
    ...paladin.items,
    {
      id: "ea",
      name: "Extra Attack",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        identifier: "extra-attack",
        activation: { type: "action" },
        activities: [{ id: "ea", name: "Extra Attack", type: "attack", activation: { type: "action" } }]
      }
    },
    {
      id: "midi",
      name: "Midi Use",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        activation: { type: "action" },
        activities: [{ id: "mu", name: "Midi Use", type: "utility", activation: { type: "action" }, flags: { "midi-qol": { automationOnly: false } } }]
      }
    },
    {
      id: "unarmed",
      name: "Unarmed Strike",
      type: "weapon",
      img: "",
      isOwner: true,
      system: { equipped: false, type: { value: "unarmed" }, activities: [{ id: "ua", name: "Unarmed Strike", type: "attack", activation: { type: "action" } }] }
    }
  ]
};
assert(isSuppressedActionFeature(noisy.items.find(i => i.name === "Extra Attack")), "Extra Attack is not a button");
assert(!getClassFeatureOptions(noisy, "action").some(f => f.name === "Extra Attack"), "Extra Attack stays off Abilities");
assert(!getClassFeatureOptions(noisy, "action").some(f => f.name === "Midi Use"), "Midi Use stays off Abilities");
const attacks = getAttackNestEntries(noisy, []);
assert(attacks.some(e => e.name === "Unarmed Strike"), "sheet Unarmed Strike is on the Attack nest");
assert(!attacks.some(e => e.name === "Extra Attack"), "Extra Attack is not an attack choice");

// --- Main radial 4 wedges ---
const mains = mainSectionAngles();
assert(mains.length === 4, "four main wedges");
assert(mains.map(m => m.id).join(",") === "action,checks,bonus,reaction", "Action Checks Bonus Reaction");

console.log(`\n${passed} assertions passed`);

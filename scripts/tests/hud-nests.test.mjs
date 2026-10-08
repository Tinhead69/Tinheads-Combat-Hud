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
const { getAbilityOptions, getAbilityRollOptions, getChecksMenuOptions, getSavingThrowOptions, getSkillOptions, rollAbilityHudOption } =
  await import("../data/ability-checks.mjs");
const { getActionFeatureOptions, getClassFeatureOptions, getOtherActionOptions, getFeatureModeOptions, formatUses, isSuppressedActionFeature } =
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
assert(hazirawn.tooltip?.description?.includes("cannot regain hit points"), "weapon tooltip includes the item description");
assert(!hazirawn.tooltip.description.includes("<"), "weapon tooltip description is plain text");
const hazModes = getWeaponAbilityOptions(hazirawn).map(mode => mode.name);
assert(hazModes.includes("Detect Magic"), "midi-qol activity is an action");
assert(!hazModes.includes("Increased Potency"), "passive rider is not an action");
assert(!hazModes.includes("Wounding"), "automation-only midi rider is not a button");
assert(!hazModes.includes("Attack"), "attack stays off the ability list");

const mixedBlade = enrichWeaponOption({
  id: "mixed-blade",
  name: "Mixed Blade",
  img: "",
  item: {
    id: "mixed-blade",
    name: "Mixed Blade",
    type: "weapon",
    img: "",
    isOwner: true,
    system: {
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } },
        { id: "cleave", name: "Cleave", type: "damage", activation: { type: "action" } },
        { id: "riposte", name: "Riposte", type: "damage", activation: { type: "bonus" } }
      ]
    }
  },
  activity: null
});
const mixedModes = getWeaponAbilityOptions(mixedBlade).map(mode => mode.name);
assert(mixedModes.join(",") === "Cleave", "Use Ability lists action activities");
assert(!mixedModes.includes("Riposte"), "bonus weapon activities stay off Use Ability");

const midiStaff = enrichWeaponOption({
  id: "midi-staff",
  name: "Staff of Frost",
  img: "",
  type: "weapon",
  isOwner: true,
  system: {
    description: { value: "<p>A frost staff.</p>" },
    activities: [
      { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } },
      {
        id: "cone",
        name: "Midi - Cone of Cold",
        type: "save",
        activation: { type: "action" },
        description: { value: "<p>Midi activity blurb.</p>" }
      }
    ]
  },
  activity: null
});
const midiAbility = getWeaponAbilityOptions(midiStaff)[0];
assert(midiAbility?.name === "Staff of Frost", "Midi -* ability title uses the item name");
assert(midiAbility?.tooltip?.title === "Staff of Frost", "Midi -* tooltip title uses the item name");
assert(midiAbility?.tooltip?.description?.includes("frost staff"), "Midi -* tooltip uses the item description");
assert(!midiAbility?.tooltip?.description?.toLowerCase().includes("midi"), "Midi activity blurb stays off the tooltip");
assert(midiAbility?.activity?.name === "Midi - Cone of Cold", "midi activity still resolves");

const midiFeatureModes = getFeatureModeOptions({
  id: "feature:lay",
  name: "Lay on Hands",
  img: "",
  item: {
    id: "lay",
    name: "Lay on Hands",
    type: "feat",
    isOwner: true,
    system: { description: { value: "<p>Heal with a touch.</p>" } }
  },
  nestActivities: [
    { id: "m1", name: "Midi - Heal", type: "heal", description: { value: "<p>Midi heal blurb.</p>" } },
    { id: "m2", name: "Cure Wounds", type: "heal" }
  ]
});
const midiHeal = midiFeatureModes.find(mode => mode.activity.name === "Midi - Heal");
assert(midiHeal?.name === "Lay on Hands", "Midi -* feature mode uses the item name");
assert(midiFeatureModes.find(mode => mode.activity.name === "Cure Wounds")?.name === "Cure Wounds", "real feature mode names stay");
assert(midiHeal?.tooltip?.description?.includes("Heal with a touch"), "Midi -* feature tooltip uses the item description");
assert(!midiHeal?.tooltip?.description?.toLowerCase().includes("midi"), "Midi feature blurb stays off the tooltip");

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

const activeToken = { id: "tok-active", documentName: "Token", actor: { id: "act-1", isOwner: true } };
game.combat = {
  combatant: { isOwner: true, tokenId: "tok-active", actorId: "act-1", actor: activeToken.actor },
  nextTurn: async () => ({ ok: true })
};
game.user.isGM = false;
assert(getEndTurnState(activeToken).enabled === true, "active token owner can end turn");
const advanced = await endCombatTurn(activeToken);
assert(advanced.ok === true, "nextTurn called");
assert(getEndTurnState({ id: "tok-other", documentName: "Token", actor: { id: "act-2", isOwner: true } }).enabled === false, "another token cannot end turn");
assert(getEndTurnState().enabled === false, "no token cannot end turn");

game.combat.combatant = { isOwner: false, tokenId: "tok-active", actorId: "act-1", actor: { id: "act-1", isOwner: false }, testUserPermission: () => false };
assert(getEndTurnState(activeToken).enabled === false, "non-owner blocked on the active token");
game.user.isGM = true;
assert(getEndTurnState(activeToken).enabled === true, "GM can end the active token's turn");
assert(getEndTurnState({ id: "tok-other", documentName: "Token", actor: { id: "act-2" } }).enabled === false, "GM cannot end turn from a different token");
game.user.isGM = false;

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
const menu = getChecksMenuOptions({
  system: { attributes: { death: { success: 2, failure: 1 } } }
});
assert(menu.map(entry => entry.branch || entry.kind).join(",") === "saves,skills,death-save", "Checks opens Saves, Skills, and Death Saves");
const saves = getSavingThrowOptions(actor);
assert(saves.length === 6 && saves.every(entry => entry.kind === "ability-save"), "saves ring is the six saving throws");
const skilled = {
  system: {
    skills: {
      ath: { value: 2, ability: "str", total: 9 },
      prc: { value: 1, ability: "wis", total: 5 },
      ste: { value: 0.5, ability: "dex", total: 3 },
      arc: { value: 0, ability: "int", total: 1 },
      lockpicking: { value: 1, ability: "dex", label: "Lockpicking" }
    }
  }
};
const skills = getSkillOptions(skilled);
assert(skills[0].skillId === "acr" && skills.some(entry => entry.skillId === "sur"), "skills follow the standard list");
assert(skills.find(entry => entry.skillId === "ath").proficiency === "expertise", "expertise is marked");
assert(skills.find(entry => entry.skillId === "prc").proficiency === "proficient", "proficiency is marked");
assert(skills.find(entry => entry.skillId === "ste").proficiency == null, "half proficiency stays unmarked");
assert(skills.some(entry => entry.skillId === "lockpicking"), "custom skills are included");
const deathRoll = await rollAbilityHudOption({ rollDeathSave: async () => ({ type: "death" }) }, { kind: "death-save" });
assert(deathRoll.type === "death", "death save uses rollDeathSave");

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
        description: { value: "<p>Your blessed touch can heal wounds.</p>" },
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
        description: { value: "<p>Channel divinity to turn undead or preserve life.</p>" },
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
assert(loh.tooltip?.description?.includes("blessed touch"), "feature tooltip includes the item description");
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
assert(cd.tooltip?.description?.includes("turn undead or preserve life"), "nested feature tooltip uses the sheet description");
assert(!cd.tooltip?.description?.includes("Hover for options"), "sheet description is not prefixed with the nest hint");
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
assert(!splitModes.includes("Vow of Enmity"), "bonus divinity stays off the action nest");
assert(!splitModes.some(name => name === "Channel Divinity"), "generic activity is not a divinity title");
assert(!splitFeatures.some(f => f.name.includes("Abjure") || f.name.includes("Vow")), "options are not their own wedges");
const bonusFeatures = getClassFeatureOptions(splitPaladin, "bonus");
const bonusCd = bonusFeatures.find(f => f.name === "Channel Divinity");
assert(bonusCd?.hasNest === true, "bonus divinities open from the bonus ring");
const bonusModes = getFeatureModeOptions(bonusCd).map(mode => mode.name);
assert(bonusModes.join(",") === "Vow of Enmity", "only the bonus divinity is on that nest");

const sorcerer = {
  id: "S1",
  items: [
    {
      id: "mm",
      name: "Metamagic",
      type: "feat",
      img: "icons/mm.webp",
      isOwner: true,
      system: {
        identifier: "metamagic",
        uses: { value: 2, max: 2 },
        activation: { type: "action" },
        activities: [
          { id: "use", name: "Metamagic", type: "utility", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "heightened",
      name: "Metamagic: Heightened Spell",
      type: "feat",
      img: "icons/heightened.webp",
      isOwner: true,
      system: {
        activities: [
          { id: "hs", name: "Heightened Spell", type: "utility", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "twinned",
      name: "Metamagic: Twinned Spell",
      type: "feat",
      img: "icons/twinned.webp",
      isOwner: true,
      system: {
        type: { subtype: "metamagic" },
        activities: [
          { id: "ts", name: "Twinned Spell", type: "utility", activation: { type: "bonus" } }
        ]
      }
    },
    {
      id: "adept",
      name: "Metamagic Adept",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        activation: { type: "action" },
        activities: [
          { id: "adept", name: "Metamagic Adept", type: "utility", activation: { type: "action" } }
        ]
      }
    }
  ],
  system: { favorites: [], spells: {} },
  isOwner: true
};
const metamagicRing = getClassFeatureOptions(sorcerer, "action");
assert(metamagicRing.filter(f => f.name === "Metamagic").length === 1, "one Metamagic button");
assert(metamagicRing.some(f => f.name === "Metamagic Adept"), "Metamagic Adept stays its own feature");
assert(!metamagicRing.some(f => /heightened|twinned/i.test(f.name)), "metamagic options are not their own wedges");
const metamagic = metamagicRing.find(f => f.name === "Metamagic");
assert(metamagic.hasNest === true, "Metamagic opens a nest");
const metamagicModes = getFeatureModeOptions(metamagic).map(mode => mode.name);
assert(metamagicModes.includes("Heightened Spell"), "Heightened Spell is in the Metamagic nest");
assert(!metamagicModes.includes("Twinned Spell"), "bonus metamagic stays off the action nest");
assert(!metamagicModes.includes("Metamagic"), "generic Metamagic activity is not a nest title");
const metamagicBonus = getClassFeatureOptions(sorcerer, "bonus");
const bonusMeta = metamagicBonus.find(f => f.name === "Metamagic");
assert(getFeatureModeOptions(bonusMeta).map(mode => mode.name).join(",") === "Twinned Spell", "Twinned Spell is on the bonus ring");

const ring = buildActionRingEntries(paladin, []);
assert(ring.some(e => e.kind === "abilities"), "abilities hub on the Action ring");
assert(ring.filter(e => e.kind === "basic").length === 4, "Dodge Dash Disengage Help stay leaves");
assert(ring.some(e => e.basicId === "help"), "Help is on the Action ring");
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
const withMagic = {
  ...noisy,
  items: [
    ...noisy.items,
      {
      id: "magic",
      name: "Magic",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        identifier: "magic",
        activation: { type: "action" },
        activities: [
          { id: "cantrip", name: "Fire Bolt", type: "cast", activation: { type: "action" } },
          { id: "spell", name: "Hex", type: "cast", activation: { type: "action" } }
        ]
      }
    },
    {
      id: "magic-weapon",
      name: "Magic Weapon",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        activation: { type: "action" },
        activities: [
          { id: "mw", name: "Magic Weapon", type: "enchant", activation: { type: "action" } }
        ]
      }
    }
  ]
};
assert(isSuppressedActionFeature(withMagic.items.find(i => i.name === "Magic")), "Magic is not an ability button");
assert(!getClassFeatureOptions(withMagic, "action").some(f => f.name === "Magic"), "Magic stays off Abilities");
assert(getClassFeatureOptions(withMagic, "action").some(f => f.name === "Magic Weapon"), "Magic Weapon stays on Abilities");
const withReadySpell = {
  ...withMagic,
  items: [
    ...withMagic.items,
    {
      id: "ready-spell",
      name: "Ready Spell",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        identifier: "ready-spell",
        activation: { type: "action" },
        activities: [{ id: "rs", name: "Ready Spell", type: "utility", activation: { type: "action" } }]
      }
    }
  ]
};
assert(isSuppressedActionFeature(withReadySpell.items.find(i => i.name === "Ready Spell")), "Ready Spell is not an ability button");
assert(!getClassFeatureOptions(withReadySpell, "action").some(f => f.name === "Ready Spell"), "Ready Spell stays off Abilities");

const maneuvers = {
  id: "M1",
  items: [
    featAction("shove", "Shove"),
    featAction("grapple", "Grapple"),
    featAction("mount", "Mount"),
    featAction("help", "Help"),
    featAction("loh2", "Lay on Hands")
  ],
  system: { favorites: [], spells: {} },
  isOwner: true
};
function featAction(id, name) {
  return {
    id,
    name,
    type: "feat",
    img: "",
    isOwner: true,
    system: {
      identifier: id,
      activation: { type: "action" },
      activities: [{ id, name, type: "utility", activation: { type: "action" } }]
    }
  };
}
const other = getOtherActionOptions(maneuvers);
assert(other.map(entry => entry.name).sort().join(",") === "Grapple,Mount,Shove", "Other lists shove, grapple, and mount");
assert(!other.some(entry => entry.name === "Help"), "Help stays off Other");
assert(!getClassFeatureOptions(maneuvers, "action").some(entry => ["Shove", "Grapple", "Mount", "Help"].includes(entry.name)), "maneuvers stay off Abilities");
assert(getClassFeatureOptions(maneuvers, "action").some(entry => entry.name === "Lay on Hands"), "class features stay on Abilities");
const attacks = getAttackNestEntries(noisy, []);
assert(attacks.some(e => e.name === "Unarmed Strike"), "sheet Unarmed Strike is on the Attack nest");
assert(!attacks.some(e => e.name === "Extra Attack"), "Extra Attack is not an attack choice");

// --- Main radial 4 wedges ---
const mains = mainSectionAngles();
assert(mains.length === 4, "four main wedges");
assert(mains.map(m => m.id).join(",") === "action,checks,bonus,reaction", "Action Checks Bonus Reaction");

console.log(`\n${passed} assertions passed`);

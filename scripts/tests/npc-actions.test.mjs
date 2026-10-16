/**
 * NPC / monster combat options → correct economy radial by activation.
 * Run: node scripts/tests/npc-actions.test.mjs
 */

globalThis.game = {
  i18n: { format: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key), localize: (k) => k },
  user: { isGM: true, targets: new Set() }
};
globalThis.foundry = { utils: { duplicate: (v) => JSON.parse(JSON.stringify(v)) } };
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} } } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const {
  getActionRingAttacks,
  getActivationOptions,
  getFavoritedWeapons,
  getHudProfile,
  getNpcSheetActions,
  getNpcSheetAttacks,
  hasChallengeRating,
  isMonsterHudActor,
  isNpcActor,
  isNpcActionActivation,
  npcActivationMatchesRadial
} = await import("../data/actor-options.mjs");
const {
  getClassFeatureOptions,
  isPassiveFeature,
  matchesActivation
} = await import("../data/action-features.mjs");
const { buildActionRingEntries } = await import("../data/basic-actions.mjs");
const { enrichWeaponOption } = await import("../data/weapon-abilities.mjs");
const { mainSectionAngles } = await import("../ui/radial-geometry.mjs");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

function item(partial) {
  return {
    id: partial.id || partial.name,
    type: partial.type || "feat",
    name: partial.name,
    img: partial.img || "icons/bite.webp",
    sort: partial.sort ?? 0,
    isOwner: true,
    system: {
      identifier: partial.identifier || "",
      activation: partial.activation || { type: "" },
      activities: partial.activities || null,
      ...(partial.system || {})
    }
  };
}

assert(isNpcActor({ type: "npc" }) === true, "npc type detected");
assert(isNpcActor({ type: "character" }) === false, "character is not npc");

// CR → Monster HUD (CR 0 counts; missing/null/empty does not)
assert(hasChallengeRating({ system: { details: { cr: 0 } } }) === true, "CR 0 has challenge rating");
assert(hasChallengeRating({ system: { details: { cr: "0" } } }) === true, "CR string 0 counts");
assert(hasChallengeRating({ system: { details: { cr: 1 } } }) === true, "CR 1 counts");
assert(hasChallengeRating({ system: { details: { cr: "1/4" } } }) === true, "fractional CR counts");
assert(hasChallengeRating({ system: { details: { cr: null } } }) === false, "null CR is missing");
assert(hasChallengeRating({ system: { details: { cr: undefined } } }) === false, "undefined CR is missing");
assert(hasChallengeRating({ system: { details: { cr: "" } } }) === false, "empty string CR is missing");
assert(hasChallengeRating({ system: { details: {} } }) === false, "absent CR field is missing");
assert(hasChallengeRating({ system: {} }) === false, "no details → no CR");
assert(isMonsterHudActor({ type: "npc", system: { details: { cr: 0 } } }) === true, "CR 0 → Monster HUD");
assert(isMonsterHudActor({ type: "npc", system: { details: { cr: null } } }) === false, "no CR NPC → Character HUD");
assert(isMonsterHudActor({ type: "character", system: { details: {} } }) === false, "PC → Character HUD");
assert(getHudProfile({ system: { details: { cr: 2 } } }) === "monster", "profile monster");
assert(getHudProfile({ type: "character", system: { details: {} } }) === "character", "profile character");

const monsterMains = mainSectionAngles("monster");
assert(monsterMains.length === 3, "Monster HUD has 3 main wedges");
assert(monsterMains.map(m => m.id).join(",") === "action,bonus,reaction", "Monster: Action Bonus Reaction");
assert(!monsterMains.some(m => m.id === "checks"), "Monster HUD omits Checks");
const charMains = mainSectionAngles("character");
assert(charMains.length === 4, "Character HUD has 4 main wedges");
assert(charMains.map(m => m.id).join(",") === "action,checks,bonus,reaction", "Character: Action Checks Bonus Reaction");

assert(isNpcActionActivation("action") === true, "action activation ok");
assert(isNpcActionActivation("") === true, "blank activation ok for NPC Actions");
assert(isNpcActionActivation("legendary") === true, "legendary under Action economy");
assert(isNpcActionActivation("lair") === true, "lair under Action economy");
assert(isNpcActionActivation("bonus") === false, "bonus not Action");
assert(isNpcActionActivation("reaction") === false, "reaction not Action");

// Activation → radial matrix
assert(npcActivationMatchesRadial("action", "action"), "matrix: action → Action");
assert(npcActivationMatchesRadial("", "action"), "matrix: blank → Action");
assert(npcActivationMatchesRadial("special", "action"), "matrix: special → Action");
assert(npcActivationMatchesRadial("legendary", "action"), "matrix: legendary → Action");
assert(npcActivationMatchesRadial("lair", "action"), "matrix: lair → Action");
assert(npcActivationMatchesRadial("mythic", "action"), "matrix: mythic → Action");
assert(npcActivationMatchesRadial("bonus", "bonus"), "matrix: bonus → Bonus");
assert(npcActivationMatchesRadial("reaction", "reaction"), "matrix: reaction → Reaction");
assert(!npcActivationMatchesRadial("bonus", "action"), "matrix: bonus ↛ Action");
assert(!npcActivationMatchesRadial("reaction", "action"), "matrix: reaction ↛ Action");
assert(!npcActivationMatchesRadial("action", "bonus"), "matrix: action ↛ Bonus");
assert(!npcActivationMatchesRadial("action", "reaction"), "matrix: action ↛ Reaction");

const goblin = {
  id: "G1",
  type: "npc",
  system: { favorites: [], spells: {}, details: { cr: 1 / 4 } },
  items: [
    item({
      id: "scimitar",
      name: "Scimitar",
      type: "weapon",
      sort: 1,
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } }
      ]
    }),
    item({
      id: "shortbow",
      name: "Shortbow",
      type: "weapon",
      sort: 2,
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } }
      ]
    }),
    item({
      id: "bite-feat",
      name: "Bite",
      type: "feat",
      sort: 3,
      activities: [
        { id: "atk", name: "Bite", type: "attack", activation: { type: "action" } }
      ]
    }),
    item({
      id: "multi",
      name: "Multiattack",
      type: "feat",
      sort: 0,
      activities: [
        // Blank activation is common on NPC packs — still Action-economy
        { id: "ma", name: "Multiattack", type: "utility", activation: { type: "" } }
      ]
    }),
    item({
      id: "breath",
      name: "Fire Breath",
      type: "feat",
      sort: 0.5,
      activities: [
        { id: "fb", name: "Fire Breath", type: "save", activation: { type: "action" } }
      ],
      system: { uses: { value: 1, max: 1 } }
    }),
    item({
      id: "pack",
      name: "Pack Tactics",
      type: "feat",
      sort: 0.6,
      activation: { type: "" },
      activities: null,
      system: { type: { value: "monster" }, description: { value: "Advantage when ally is near." } }
    }),
    item({
      id: "lair-quake",
      name: "Volcanic Tremor",
      type: "feat",
      sort: 0.7,
      activities: [
        { id: "vt", name: "Volcanic Tremor", type: "damage", activation: { type: "lair" } }
      ]
    }),
    item({
      id: "nimble",
      name: "Nimble Escape",
      type: "feat",
      sort: 4,
      activities: [
        { id: "dis", name: "Disengage", type: "utility", activation: { type: "bonus" } }
      ]
    }),
    item({
      id: "bonus-stab",
      name: "Quick Stab",
      type: "weapon",
      sort: 4.5,
      activities: [
        { id: "stab", name: "Quick Stab", type: "attack", activation: { type: "bonus" } }
      ]
    }),
    item({
      id: "bonus-claw",
      name: "Offhand Claw",
      type: "feat",
      sort: 4.6,
      activities: [
        { id: "claw", name: "Offhand Claw", type: "attack", activation: { type: "bonus" } }
      ]
    }),
    item({
      id: "parry",
      name: "Parry",
      type: "feat",
      sort: 5,
      activities: [
        { id: "p", name: "Parry", type: "utility", activation: { type: "reaction" } }
      ]
    }),
    item({
      id: "riposte",
      name: "Riposte",
      type: "weapon",
      sort: 5.5,
      activities: [
        { id: "r", name: "Riposte", type: "attack", activation: { type: "reaction" } }
      ]
    }),
    item({
      id: "leg",
      name: "Tail Sweep",
      type: "feat",
      sort: 6,
      activities: [
        { id: "ts", name: "Tail Sweep", type: "save", activation: { type: "legendary" } }
      ]
    }),
    // Mixed activations on one weapon — each strike must stay on its own radial
    item({
      id: "mixed-blade",
      name: "Mixed Blade",
      type: "weapon",
      sort: 7,
      activities: [
        { id: "main", name: "Main Attack", type: "attack", activation: { type: "action" } },
        { id: "off", name: "Offhand Attack", type: "attack", activation: { type: "bonus" } }
      ]
    })
  ],
  isOwner: true
};

assert(isMonsterHudActor(goblin) === true, "goblin with CR is Monster HUD");

assert(getFavoritedWeapons(goblin).length === 0, "NPC favorites empty (no favorites set)");

const actionAttacks = getNpcSheetAttacks(goblin, "action");
assert(actionAttacks.some(a => a.name === "Scimitar"), "Scimitar on Action attacks");
assert(actionAttacks.some(a => a.name === "Shortbow"), "Shortbow on Action attacks");
assert(actionAttacks.some(a => a.name === "Bite"), "Bite attack feat on Action attacks");
assert(actionAttacks.some(a => a.name === "Mixed Blade"), "Mixed Blade Action strike on Action");
assert(actionAttacks.find(a => a.name === "Mixed Blade")?.activity?.id === "main", "Mixed Blade Action binds main attack");
assert(!actionAttacks.some(a => a.name === "Multiattack"), "Multiattack stays off attack list");
assert(!actionAttacks.some(a => a.name === "Nimble Escape"), "bonus utility not on Action attacks");
assert(!actionAttacks.some(a => a.name === "Quick Stab"), "bonus weapon not on Action");
assert(!actionAttacks.some(a => a.name === "Offhand Claw"), "bonus attack feat not on Action");
assert(!actionAttacks.some(a => a.name === "Parry"), "reaction utility not on Action attacks");
assert(!actionAttacks.some(a => a.name === "Riposte"), "reaction weapon not on Action");

assert(getNpcSheetActions(goblin).length === actionAttacks.length, "getNpcSheetActions aliases action");

const bonusAttacks = getNpcSheetAttacks(goblin, "bonus");
assert(bonusAttacks.some(a => a.name === "Quick Stab"), "Quick Stab on Bonus attacks");
assert(bonusAttacks.some(a => a.name === "Offhand Claw"), "Offhand Claw on Bonus attacks");
assert(bonusAttacks.some(a => a.name === "Mixed Blade"), "Mixed Blade bonus strike on Bonus");
assert(bonusAttacks.find(a => a.name === "Mixed Blade")?.activity?.id === "off", "Mixed Blade Bonus binds offhand");
assert(!bonusAttacks.some(a => a.name === "Scimitar"), "Action weapon not on Bonus attacks");
assert(!bonusAttacks.some(a => a.name === "Riposte"), "reaction not on Bonus attacks");

const reactionAttacks = getNpcSheetAttacks(goblin, "reaction");
assert(reactionAttacks.some(a => a.name === "Riposte"), "Riposte on Reaction attacks");
assert(!reactionAttacks.some(a => a.name === "Scimitar"), "Action weapon not on Reaction");
assert(!reactionAttacks.some(a => a.name === "Quick Stab"), "bonus weapon not on Reaction");

const ringAttacks = getActionRingAttacks(goblin);
assert(ringAttacks.length === actionAttacks.length, "getActionRingAttacks uses Action activation only");
assert(ringAttacks.every(a => a.id.startsWith("weapon:")), "attack leaves use weapon: ids");
assert(!ringAttacks.some(a => a.name === "Quick Stab"), "Action ring excludes bonus attacks");

const enriched = enrichWeaponOption({ kind: "weapon", ...ringAttacks.find(a => a.name === "Scimitar") });
assert(enriched.kind === "weapon", "NPC weapon enriches like PC favorite");
assert(enriched.hasSpecial === false, "plain NPC weapon is direct attack leaf");

assert(isPassiveFeature(goblin.items.find(i => i.name === "Pack Tactics")), "Pack Tactics is passive");
assert(!isPassiveFeature(goblin.items.find(i => i.name === "Fire Breath")), "Fire Breath not passive");

const actionFeats = getClassFeatureOptions(goblin, "action");
assert(actionFeats.some(f => f.name === "Multiattack"), "Multiattack (blank act.) on Action features");
assert(actionFeats.some(f => f.name === "Fire Breath"), "breath weapon feature on Action");
assert(actionFeats.some(f => f.name === "Volcanic Tremor"), "lair feature on Action economy");
assert(actionFeats.some(f => f.name === "Tail Sweep"), "legendary on Action features for NPC");
assert(!actionFeats.some(f => f.name === "Pack Tactics"), "passive Pack Tactics excluded");
assert(!actionFeats.some(f => f.name === "Bite"), "Bite not duplicated as feature");
assert(!actionFeats.some(f => f.name === "Nimble Escape"), "bonus feat not on Action");
assert(!actionFeats.some(f => f.name === "Parry"), "reaction feat not on Action");
assert(!actionFeats.some(f => f.name === "Offhand Claw"), "bonus attack feat not on Action features");

const bonusFeats = getClassFeatureOptions(goblin, "bonus");
assert(bonusFeats.some(f => f.name === "Nimble Escape"), "Nimble Escape on Bonus");
assert(!bonusFeats.some(f => f.name === "Fire Breath"), "Action breath not on Bonus");
assert(!bonusFeats.some(f => f.name === "Offhand Claw"), "Offhand Claw not duplicated as Bonus feature");
assert(!bonusFeats.some(f => f.name === "Scimitar"), "weapons not dumped into Bonus features");

const reactionFeats = getClassFeatureOptions(goblin, "reaction");
assert(reactionFeats.some(f => f.name === "Parry"), "Parry on Reaction");
assert(!reactionFeats.some(f => f.name === "Multiattack"), "Action feature not on Reaction");
assert(!reactionFeats.some(f => f.name === "Riposte"), "Riposte not duplicated as Reaction feature");

// Economy "others" must not re-list NPC attack weapons already on attack leaves
const bonusOthers = getActivationOptions(goblin, "bonus");
assert(!bonusOthers.some(o => o.name === "Quick Stab"), "Quick Stab not duplicated in activation options");
assert(!bonusOthers.some(o => o.item?.id === "mixed-blade"), "Mixed Blade bonus not duplicated in others");

const entries = buildActionRingEntries(goblin, ringAttacks);
assert(entries.some(e => e.kind === "weapon" && e.name === "Scimitar"), "Scimitar in Action ring");
assert(entries.some(e => e.kind === "weapon" && e.name === "Bite"), "Bite in Action ring as attack");
assert(entries.some(e => e.kind === "feature" && e.name === "Multiattack"), "Multiattack in Action ring");
assert(entries.some(e => e.kind === "feature" && e.name === "Fire Breath"), "Fire Breath in Action ring");
assert(!entries.some(e => e.name === "Pack Tactics"), "passive not in Action ring");
assert(!entries.some(e => e.name === "Quick Stab"), "bonus attack not in Action ring entries");
assert(entries.filter(e => e.name === "Bite").length === 1, "Bite not duplicated");
assert(!entries.some(e => e.kind === "cast"), "Monster HUD omits Cast Spell hub");
assert(!entries.some(e => e.kind === "useItem"), "Monster HUD omits Use Item hub");
assert(!entries.some(e => e.kind === "basic" && e.source === "module"), "Monster HUD omits module Dash chrome");

// PC path unchanged: still favorites-only
const pc = {
  id: "P1",
  type: "character",
  items: [
    item({
      id: "ls",
      name: "Longsword",
      type: "weapon",
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } }
      ]
    })
  ],
  system: {
    favorites: [],
    spells: {},
    details: {}
  },
  isOwner: true
};
assert(getHudProfile(pc) === "character", "PC uses Character HUD");
assert(getActionRingAttacks(pc).length === 0, "PC without favorites gets no attack leaves");
assert(getNpcSheetAttacks(pc, "bonus").length === 0, "PC skips NPC attack helper");
assert(matchesActivation("", "action", { npc: false }) === false, "PC blank activation not Action");
assert(matchesActivation("", "action", { npc: true }) === true, "NPC blank activation is Action");
const pcRing = buildActionRingEntries(pc, []);
assert(pcRing.some(e => e.kind === "cast"), "Character HUD keeps Cast Spell");
assert(pcRing.some(e => e.kind === "useItem"), "Character HUD keeps Use Item");
assert(pcRing.filter(e => e.kind === "basic").length === 4, "Character HUD keeps four basics");

// Non-CR NPC → Character HUD chrome, but sheet attacks/features still populate
const allyNpc = {
  id: "A1",
  type: "npc",
  system: { favorites: [], spells: {}, details: { cr: null } },
  items: [
    item({
      id: "club",
      name: "Club",
      type: "weapon",
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "action" } }
      ]
    }),
    item({
      id: "help",
      name: "Helpful Shove",
      type: "feat",
      activities: [
        { id: "h", name: "Helpful Shove", type: "utility", activation: { type: "action" } }
      ]
    })
  ],
  isOwner: true
};
assert(isMonsterHudActor(allyNpc) === false, "non-CR NPC is Character HUD");
assert(getHudProfile(allyNpc) === "character", "non-CR NPC profile character");
assert(getActionRingAttacks(allyNpc).some(a => a.name === "Club"), "non-CR NPC still gets sheet attacks");
const allyRing = buildActionRingEntries(allyNpc, getActionRingAttacks(allyNpc));
assert(allyRing.some(e => e.kind === "cast"), "non-CR NPC Character path keeps Cast Spell");
assert(allyRing.some(e => e.name === "Helpful Shove"), "non-CR NPC sheet feature on Action");

// Blank-activation natural weapon (common on NPC sheets) — CR 0 monster
const wolf = {
  id: "W1",
  type: "npc",
  items: [
    item({
      id: "bite",
      name: "Bite",
      type: "weapon",
      activation: { type: "" },
      activities: [
        { id: "atk", name: "Attack", type: "attack", activation: { type: "" } }
      ]
    })
  ],
  system: { favorites: [], details: { cr: 0 } },
  isOwner: true
};
assert(isMonsterHudActor(wolf) === true, "CR 0 wolf is Monster HUD");
assert(getActionRingAttacks(wolf).some(a => a.name === "Bite"), "blank-activation NPC weapon appears on Action");
assert(getNpcSheetAttacks(wolf, "bonus").length === 0, "blank activation not Bonus");
const wolfRing = buildActionRingEntries(wolf, getActionRingAttacks(wolf));
assert(!wolfRing.some(e => e.kind === "cast"), "CR 0 Monster HUD omits Cast Spell");

console.log(`\n${passed} assertions passed`);

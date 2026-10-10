/**
 * Simplified combat sheet for monsters.
 * A monster is an NPC with a challenge rating. Homebrew creatures with no CR
 * stay on the full sheet. Monster attacks are listed by the activation they spend.
 */

import {
  activityOptionName,
  buildSpellTooltipData,
  canAttemptUse,
  getActivities,
  getActivationType,
  getCastActivity,
  getDefaultIcon,
  isSpellAvailableForHud,
  isGenericMidiActivityName,
  itemArtwork,
  optionRequiresTarget,
  sheetItemTooltip,
  spellCastingMethod,
  spellEconomy,
  t
} from "./actor-options.mjs";
import { CHROME } from "./module-icons.mjs";
import { isAttackActivity } from "./weapon-abilities.mjs";

const GENERIC_ATTACK_NAMES = new Set([
  "attack",
  "attack roll",
  "melee attack",
  "ranged attack",
  "melee weapon attack",
  "ranged weapon attack"
]);

const OPPORTUNITY_NAMES = new Set([
  "attack of opportunity",
  "opportunity attack",
  "opportunity attacks"
]);

/**
 * NPCs with a challenge rating use the monster sheet.
 * CR 0 counts. A blank CR does not, so homebrew without one keeps the full sheet.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isMonsterActor(actor) {
  if (actor?.type !== "npc") return false;
  return hasChallengeRating(actor?.system?.details?.cr);
}

/**
 * dnd5e stores CR as a number. 0 is a real rating. Null means it was left blank.
 * @param {number|string|object|null|undefined} cr
 * @returns {boolean}
 */
function hasChallengeRating(cr) {
  if (cr == null || cr === "") return false;
  if (typeof cr === "number") return Number.isFinite(cr) && cr >= 0;
  if (typeof cr === "string") return parseChallengeRating(cr) != null;
  if (typeof cr === "object") {
    const value = cr.value ?? cr.cr ?? cr.rating;
    if (value == null || value === "") return false;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0;
    return parseChallengeRating(value) != null;
  }
  return false;
}

/**
 * @param {string|number} raw
 * @returns {number|null}
 */
function parseChallengeRating(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (!denominator) return null;
    const value = Number(fraction[1]) / denominator;
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Attack activities that spend this activation.
 * An empty activation on a weapon counts as an action.
 * When the creature has more than attacks, Action is Attack, Legendary, Cast Spell, and Features.
 * Legendary is its own wedge when the creature has legendary actions.
 * Special abilities sit under Features.
 * The reaction ring lists every reaction on the sheet, including saves,
 * always offers Attack of Opportunity, and lists Legendary Resistance
 * when the creature has that trait.
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getMonsterAttackOptions(actor, activation) {
  const wanted = String(activation || "").toLowerCase();
  const seen = new Set();
  const options = collectAttacks(actor, wanted, seen);
  if (wanted === "reaction") options.push(...collectSheetReactions(actor, seen));
  options.sort((a, b) => a.name.localeCompare(b.name));
  if (wanted === "action") return actionRingOptions(actor, options, seen);
  if (wanted === "reaction") {
    ensureOpportunityAttack(options);
    ensureLegendaryResistance(actor, options);
  }
  return options;
}

/**
 * Action attacks for the Attack nest. Legendary actions have their own wedge.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getMonsterAttackNestOptions(actor) {
  const attacks = collectAttacks(actor, "action", new Set());
  attacks.sort((a, b) => a.name.localeCompare(b.name));
  return attacks;
}

/**
 * Legendary actions for the Legendary wedge.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getMonsterLegendaryOptions(actor) {
  const { legendary } = legendaryAndLairOptions(actor, new Set());
  return legendary;
}

/**
 * Melee-style action attacks a monster can use for an opportunity attack.
 * Legendary and lair actions stay out of that nest.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getMonsterOpportunityAttacks(actor) {
  return getMonsterAttackNestOptions(actor)
    .filter(entry => entry.kind === "weapon-attack" && entry.activation === "action");
}

/**
 * @param {Actor} actor
 * @param {Array<object>} attacks
 * @param {Set<string>} seen
 * @returns {Array<object>}
 */
function actionRingOptions(actor, attacks, seen) {
  const { legendary } = legendaryAndLairOptions(actor, seen);
  const features = getMonsterFeatureOptions(actor);
  const cast = monsterOffersCastSpell(actor);
  if (!cast && !features.length && !legendary.length) return attacks;
  const ring = [];
  if (attacks.length) ring.push(monsterAttackHub());
  if (legendary.length) ring.push(monsterLegendaryHub());
  if (cast) ring.push(monsterCastHub());
  if (features.length) ring.push(monsterFeaturesHub());
  return ring.length ? ring : attacks;
}

/**
 * Special abilities and other non-attack actions, including lair actions.
 * Spellcasting itself is the Cast Spell wedge.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getMonsterFeatureOptions(actor) {
  const seen = new Set();
  collectAttacks(actor, "action", seen);
  const features = collectActionFeatures(actor, seen);
  const { lair } = legendaryAndLairOptions(actor, seen);
  features.push(...lair);
  features.sort((a, b) => a.name.localeCompare(b.name));
  return features;
}

/**
 * Spellbook groups for a monster's Cast Spell wedge.
 * At-will and innate spells stay in those groups instead of a slot level.
 * @param {Actor} actor
 * @returns {Array<{ id: string, level: number|null, label: string, spells: Array<object> }>}
 */
export function getMonsterSpellGroups(actor) {
  const atwill = [];
  const innate = [];
  const pact = [];
  const byLevel = new Map();

  for (const item of actor?.items ?? []) {
    if (item?.type !== "spell") continue;
    if (spellEconomy(item) !== "action") continue;
    if (!isSpellAvailableForHud(actor, item)) continue;
    const spell = monsterSpellOption(item);
    const method = spellCastingMethod(item);
    if (method === "atwill") atwill.push(spell);
    else if (method === "innate") innate.push(spell);
    else if (method === "pact") pact.push(spell);
    else {
      const level = Number(item.system?.level ?? 0);
      const key = Number.isFinite(level) && level >= 0 ? level : 0;
      if (!byLevel.has(key)) byLevel.set(key, []);
      byLevel.get(key).push(spell);
    }
  }

  const groups = [];
  if (atwill.length) {
    atwill.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ id: "atwill", level: null, label: t("SpellLevels.AtWill"), spells: atwill });
  }
  if (innate.length) {
    innate.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ id: "innate", level: null, label: t("SpellLevels.Innate"), spells: innate });
  }
  if (pact.length) {
    pact.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ id: "pact", level: null, label: t("SpellLevels.Pact"), spells: pact });
  }
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const spells = byLevel.get(level).sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ id: `level:${level}`, level, label: monsterSpellLevelLabel(level), spells });
  }
  return groups;
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function monsterOffersCastSpell(actor) {
  if (getMonsterSpellGroups(actor).length) return true;
  for (const item of actor?.items ?? []) {
    if (!isSpellcastingFeature(item)) continue;
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    if (!activities.length) {
      const type = attackActivation(null, item);
      if (type === "action" || type === "special") return true;
      continue;
    }
    if (activities.some(activity => {
      const type = attackActivation(activity, item);
      return type === "action" || type === "special";
    })) return true;
  }
  return false;
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
function isSpellcastingFeature(item) {
  const name = normalizeMonsterName(item?.name);
  const ident = normalizeMonsterName(item?.system?.identifier);
  return name === "spellcasting"
    || name === "innate spellcasting"
    || ident === "spellcasting"
    || ident === "innate spellcasting";
}

/**
 * @param {string} name
 * @returns {string}
 */
function normalizeMonsterName(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Non-attack actions. Legendary and lair actions have their own wedges.
 * @param {Actor} actor
 * @param {Set<string>} seen
 * @returns {Array<object>}
 */
function collectActionFeatures(actor, seen) {
  const options = [];
  for (const item of actor?.items ?? []) {
    if (item?.type === "spell" || isSpellcastingFeature(item)) continue;
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const features = activities.filter(activity => {
      if (isAttackActivity(activity)) return false;
      const type = attackActivation(activity, item);
      if (type !== "action" && type !== "special") return false;
      if (type === "special" && hostsLegendaryOrLair(item)) return false;
      return true;
    });

    if (!features.length) {
      if (activities.length || item?.type === "weapon") continue;
      const type = attackActivation(null, item);
      if (type !== "action" && type !== "special") continue;
      const key = activityKey(item, null);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(monsterSpecialOption(item, null, type));
      continue;
    }

    for (const activity of features) {
      const key = activityKey(item, activity);
      if (seen.has(key)) continue;
      seen.add(key);
      const type = attackActivation(activity, item);
      options.push(monsterSpecialOption(item, activity, type));
    }
  }
  return options;
}

/**
 * @param {Item} item
 */
function monsterSpellOption(item) {
  const cast = getCastActivity(item);
  const available = canAttemptUse(cast, item);
  return {
    id: `spell:${item.id}`,
    kind: "spell",
    name: item.name,
    img: itemArtwork(item, cast) || getDefaultIcon("spell"),
    item,
    activity: cast,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(cast, item),
    tooltip: buildSpellTooltipData(item, cast)
  };
}

/**
 * @param {number} level
 * @returns {string}
 */
function monsterSpellLevelLabel(level) {
  const key = `SpellLevels.${level}`;
  const localized = t(key);
  if (localized && !String(localized).includes(`SpellLevels.${level}`)) return localized;
  if (level === 0) return "Cantrip";
  if (level === 1) return "1st";
  if (level === 2) return "2nd";
  if (level === 3) return "3rd";
  return `${level}th`;
}

function monsterCastHub() {
  return {
    kind: "cast",
    id: "cast-spell",
    economy: "action",
    name: t("Sections.CastSpell"),
    img: CHROME.castSpell,
    available: true,
    activation: "action",
    tooltip: {
      title: t("Sections.CastSpell"),
      description: t("Sections.CastSpellHint")
    }
  };
}

function monsterFeaturesHub() {
  return {
    kind: "abilities",
    id: "monster-features",
    name: t("Features.Label"),
    img: CHROME.classFeature,
    available: true,
    activation: "action",
    tooltip: {
      title: t("Features.Label"),
      description: t("Features.Hint")
    }
  };
}

/**
 * @param {Actor} actor
 * @param {string} wanted
 * @param {Set<string>} seen
 * @returns {Array<object>}
 */
function collectAttacks(actor, wanted, seen) {
  const options = [];
  for (const item of actor?.items ?? []) {
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const attacks = activities.filter(activity => isAttackActivity(activity));
    const pool = attacks.length ? attacks : (item?.type === "weapon" ? [null] : []);

    for (const activity of pool) {
      if (attackActivation(activity, item) !== wanted) continue;
      const key = activityKey(item, activity);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(monsterAttackOption(item, activity));
    }
  }
  return options;
}

/**
 * Reaction saves and other non-attack reactions from the sheet.
 * Spells stay on Cast Spell. Attack reactions are collected separately.
 * @param {Actor} actor
 * @param {Set<string>} seen
 * @returns {Array<object>}
 */
function collectSheetReactions(actor, seen) {
  const options = [];
  for (const item of actor?.items ?? []) {
    if (item?.type === "spell") continue;
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const reactions = activities.filter(activity => {
      if (isAttackActivity(activity)) return false;
      return attackActivation(activity, item) === "reaction";
    });

    if (!reactions.length) {
      if (activities.length || item?.type === "weapon") continue;
      if (attackActivation(null, item) !== "reaction") continue;
      const key = activityKey(item, null);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(monsterSpecialOption(item, null, "reaction"));
      continue;
    }

    for (const activity of reactions) {
      const key = activityKey(item, activity);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(monsterSpecialOption(item, activity, "reaction"));
    }
  }
  return options;
}

/**
 * @param {object|null} activity
 * @param {Item} item
 * @returns {string}
 */
function attackActivation(activity, item) {
  const raw = String(getActivationType(activity, item) || "").toLowerCase().trim();
  if (raw) return raw;
  if (item?.type === "weapon") return "action";
  return "";
}

/**
 * @param {object} activity
 * @returns {boolean}
 */
function isAutomationOnly(activity) {
  const flags = activity?.flags?.["midi-qol"]
    ?? activity?.system?.midiProperties
    ?? activity?.midiProperties
    ?? null;
  return flags?.automationOnly === true;
}

/**
 * @param {Item} item
 * @param {object|null} activity
 */
function monsterAttackOption(item, activity) {
  const name = monsterAttackLabel(item, activity);
  const available = canAttemptUse(activity, item);
  return {
    id: `monster:${item.id}:${activity?.id ?? activity?._id ?? "item"}`,
    kind: "weapon-attack",
    name,
    img: itemArtwork(item, activity) || getDefaultIcon(item?.type || "weapon"),
    item,
    activity,
    activation: attackActivation(activity, item),
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(activity, item),
    tooltip: sheetItemTooltip(item, {
      title: name,
      activity,
      reason: available.ok ? "" : available.reason
    })
  };
}

/**
 * Legendary actions and lair actions.
 * Saves and other non-attack activities are included. Attack activities stay attacks.
 * @param {Actor} actor
 * @param {Set<string>} seen
 * @returns {{ legendary: Array<object>, lair: Array<object> }}
 */
function legendaryAndLairOptions(actor, seen) {
  const legendary = [];
  const lair = [];

  for (const item of actor?.items ?? []) {
    if (isLegendaryResistanceItem(item)) continue;
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const itemType = attackActivation(null, item);
    let special = activities.filter(activity => {
      const type = attackActivation(activity, item);
      return type === "legendary" || type === "lair";
    });

    // A legendary item whose activities were not tagged still lists each activity.
    if (!special.length && (itemType === "legendary" || itemType === "lair")) {
      special = activities.filter(activity => {
        const type = attackActivation(activity, item);
        return type !== "action" && type !== "bonus" && type !== "reaction" && type !== "mythic";
      });
    }

    if (!special.length) {
      if (activities.length || isEconomyBlurb(item)) continue;
      if (itemType !== "legendary" && itemType !== "lair") continue;
      const key = activityKey(item, null);
      if (seen.has(key)) continue;
      seen.add(key);
      (itemType === "lair" ? lair : legendary).push(monsterSpecialOption(item, null, itemType));
      continue;
    }

    for (const activity of special) {
      const type = attackActivation(activity, item);
      const bucket = type === "lair" || (type !== "legendary" && itemType === "lair") ? "lair" : "legendary";
      const key = activityKey(item, activity);
      if (seen.has(key)) continue;
      seen.add(key);
      const option = isAttackActivity(activity)
        ? monsterAttackOption(item, activity)
        : monsterSpecialOption(item, activity, bucket);
      (bucket === "lair" ? lair : legendary).push(option);
    }
  }

  legendary.sort((a, b) => a.name.localeCompare(b.name));
  lair.sort((a, b) => a.name.localeCompare(b.name));
  return { legendary, lair };
}

/**
 * True when this item is a legendary or lair action, so its untyped activities
 * belong on that radial instead of Features.
 * @param {Item} item
 * @returns {boolean}
 */
function hostsLegendaryOrLair(item) {
  if (attackActivation(null, item) === "legendary" || attackActivation(null, item) === "lair") return true;
  return getActivities(item).some(activity => {
    const type = attackActivation(activity, item);
    return type === "legendary" || type === "lair";
  });
}

/**
 * The stat-block intro ("The dragon can take 3 legendary actions…"), not an action.
 * @param {Item} item
 * @returns {boolean}
 */
function isEconomyBlurb(item) {
  const ident = String(item?.system?.identifier || item?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ident === "legendary actions" || ident === "lair actions" || ident === "regional effects";
}

function monsterAttackHub() {
  return {
    kind: "attack",
    id: "monster-attack",
    name: t("AttackNest.Label"),
    img: CHROME.attack,
    available: true,
    activation: "action",
    tooltip: {
      title: t("AttackNest.Label"),
      description: t("AttackNest.MonsterHint")
    }
  };
}

function monsterLegendaryHub() {
  return {
    kind: "legendary",
    id: "monster-legendary",
    name: t("Legendary.Label"),
    img: CHROME.useAbility,
    available: true,
    activation: "legendary",
    tooltip: {
      title: t("Legendary.Label"),
      description: t("Legendary.Hint")
    }
  };
}

/**
 * @param {Item} item
 * @param {object|null} activity
 * @param {string} activation
 */
function monsterSpecialOption(item, activity, activation) {
  const name = monsterAttackLabel(item, activity);
  const available = canAttemptUse(activity, item);
  return {
    id: `monster:${item.id}:${activity?.id ?? activity?._id ?? activation}`,
    kind: "feature",
    name,
    img: itemArtwork(item, activity) || getDefaultIcon(item?.type || "feat"),
    item,
    activity,
    activation,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(activity, item),
    tooltip: sheetItemTooltip(item, {
      title: name,
      activity,
      reason: available.ok ? "" : available.reason
    })
  };
}

/**
 * Every monster can make an opportunity attack, even when the sheet omits one.
 * A sheet entry that is already that attack is kept and not repeated.
 * @param {Array<object>} options
 */
function ensureOpportunityAttack(options) {
  if (options.some(entry => isOpportunityName(entry.name) || entry.kind === "opportunity")) return;
  options.unshift(monsterOpportunityOption());
}

const LEGENDARY_RESISTANCE_NAMES = new Set([
  "legendary resistance",
  "legendary resistances"
]);

/**
 * Legendary Resistance sits on the reaction ring when the creature has the trait.
 * A sheet entry with that name is replaced so the click spends a use on a failed save.
 * @param {Actor} actor
 * @param {Array<object>} options
 */
function ensureLegendaryResistance(actor, options) {
  if (!monsterHasLegendaryResistance(actor)) return;
  const existing = options.findIndex(entry => isLegendaryResistanceName(entry.name));
  if (existing >= 0) options.splice(existing, 1);
  const option = monsterLegendaryResistanceOption(actor);
  const afterOpportunity = options.findIndex(entry =>
    entry.kind === "opportunity" || isOpportunityName(entry.name)
  );
  options.splice(afterOpportunity >= 0 ? afterOpportunity + 1 : 0, 0, option);
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function monsterHasLegendaryResistance(actor) {
  if (legendaryResistancePool(actor).max > 0) return true;
  return (actor?.items ?? []).some(isLegendaryResistanceItem);
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
function isLegendaryResistanceItem(item) {
  const ident = normalizeMonsterName(item?.system?.identifier);
  const name = normalizeMonsterName(item?.name);
  return LEGENDARY_RESISTANCE_NAMES.has(ident) || LEGENDARY_RESISTANCE_NAMES.has(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isLegendaryResistanceName(name) {
  return LEGENDARY_RESISTANCE_NAMES.has(normalizeMonsterName(name));
}

/**
 * Remaining and maximum legendary resistances. `value` is derived in dnd5e 5.3.
 * @param {Actor} actor
 * @returns {{ value: number, max: number }}
 */
function legendaryResistancePool(actor) {
  const pool = actor?.system?.resources?.legres ?? {};
  const max = Number(pool.max ?? 0);
  const spent = Number(pool.spent);
  const rawValue = Number(pool.value);
  const value = Number.isFinite(rawValue)
    ? rawValue
    : (Number.isFinite(spent) ? Math.max(0, max - spent) : max);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 0,
    value: Number.isFinite(value) ? Math.max(0, value) : 0
  };
}

/**
 * @param {Actor} actor
 */
function monsterLegendaryResistanceOption(actor) {
  const item = (actor?.items ?? []).find(isLegendaryResistanceItem) ?? null;
  const pool = legendaryResistancePool(actor);
  const usesLabel = pool.max > 0 ? `${pool.value}/${pool.max}` : "";
  const available = pool.max > 0 ? pool.value > 0 : true;
  return {
    kind: "legendary-resistance",
    id: "legendary-resistance",
    name: t("LegendaryResistance.Label"),
    img: itemArtwork(item, null) || CHROME.save,
    item,
    activity: null,
    actor,
    activation: "reaction",
    usesLabel,
    available,
    reason: available ? "" : t("LegendaryResistance.NoneLeft"),
    tooltip: {
      title: usesLabel ? `${t("LegendaryResistance.Label")} · ${usesLabel}` : t("LegendaryResistance.Label"),
      description: t("LegendaryResistance.Hint")
    }
  };
}

function monsterOpportunityOption() {
  return {
    kind: "opportunity",
    id: "attack-of-opportunity",
    name: t("Opportunity.Label"),
    img: CHROME.attack,
    available: true,
    activation: "reaction",
    tooltip: {
      title: t("Opportunity.Label"),
      description: t("Opportunity.Hint")
    }
  };
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isOpportunityName(name) {
  return OPPORTUNITY_NAMES.has(String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
}

/**
 * @param {Item} item
 * @param {object|null} activity
 * @returns {string}
 */
function activityKey(item, activity) {
  return `${item.id}:${activity?.id ?? activity?._id ?? activity?.name ?? "item"}`;
}

/**
 * One attack on a weapon keeps the weapon name. Distinct activity names stay.
 * @param {Item} item
 * @param {object|null} activity
 * @returns {string}
 */
function monsterAttackLabel(item, activity) {
  const itemName = String(item?.name ?? "").trim();
  const activityName = String(activity?.name ?? "").trim();
  const generic = !activityName
    || isGenericMidiActivityName(activityName)
    || GENERIC_ATTACK_NAMES.has(activityName.toLowerCase());
  if (generic) return itemName || activityOptionName(item, activity);
  return activityOptionName(item, activity);
}

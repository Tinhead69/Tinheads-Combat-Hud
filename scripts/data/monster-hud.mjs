/**
 * Simplified combat sheet for monsters.
 * A monster is an NPC with a challenge rating. Homebrew creatures with no CR
 * stay on the full sheet. Monster attacks are listed by the activation they spend.
 */

import {
  activityOptionName,
  canAttemptUse,
  getActivities,
  getActivationType,
  getDefaultIcon,
  isGenericMidiActivityName,
  itemArtwork,
  optionRequiresTarget,
  sheetItemTooltip,
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
 * When the creature has legendary actions, those share an Attack nest with its
 * action attacks. Lair actions stay on the action ring.
 * The reaction ring always offers Attack of Opportunity.
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getMonsterAttackOptions(actor, activation) {
  const wanted = String(activation || "").toLowerCase();
  const seen = new Set();
  const options = collectAttacks(actor, wanted, seen);
  options.sort((a, b) => a.name.localeCompare(b.name));
  if (wanted === "action") return actionRingOptions(actor, options, seen);
  if (wanted === "reaction") ensureOpportunityAttack(options);
  return options;
}

/**
 * Action attacks and legendary actions, in one nest.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getMonsterAttackNestOptions(actor) {
  const seen = new Set();
  const attacks = collectAttacks(actor, "action", seen);
  attacks.sort((a, b) => a.name.localeCompare(b.name));
  const { legendary } = legendaryAndLairOptions(actor, seen);
  return [...attacks, ...legendary];
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
  const { legendary, lair } = legendaryAndLairOptions(actor, seen);
  if (!legendary.length) return [...attacks, ...lair];
  return [monsterAttackHub(), ...lair];
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
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const special = activities.filter(activity => {
      const type = attackActivation(activity, item);
      return type === "legendary" || type === "lair";
    });

    if (!special.length) {
      if (activities.length) continue;
      const type = attackActivation(null, item);
      if (type !== "legendary" && type !== "lair") continue;
      const key = activityKey(item, null);
      if (seen.has(key)) continue;
      seen.add(key);
      (type === "lair" ? lair : legendary).push(monsterSpecialOption(item, null, type));
      continue;
    }

    for (const activity of special) {
      const type = attackActivation(activity, item);
      const key = activityKey(item, activity);
      if (seen.has(key)) continue;
      seen.add(key);
      const option = isAttackActivity(activity)
        ? monsterAttackOption(item, activity)
        : monsterSpecialOption(item, activity, type);
      (type === "lair" ? lair : legendary).push(option);
    }
  }

  legendary.sort((a, b) => a.name.localeCompare(b.name));
  lair.sort((a, b) => a.name.localeCompare(b.name));
  return { legendary, lair };
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

/**
 * @param {Item} item
 * @param {object|null} activity
 * @param {"legendary"|"lair"} activation
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

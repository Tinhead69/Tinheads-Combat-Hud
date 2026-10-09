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
  sheetItemTooltip
} from "./actor-options.mjs";
import { isAttackActivity } from "./weapon-abilities.mjs";

const GENERIC_ATTACK_NAMES = new Set([
  "attack",
  "attack roll",
  "melee attack",
  "ranged attack",
  "melee weapon attack",
  "ranged weapon attack"
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
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getMonsterAttackOptions(actor, activation) {
  const wanted = String(activation || "").toLowerCase();
  const options = [];
  const seen = new Set();

  for (const item of actor?.items ?? []) {
    const activities = getActivities(item).filter(activity => !isAutomationOnly(activity));
    const attacks = activities.filter(activity => isAttackActivity(activity));
    const pool = attacks.length ? attacks : (item?.type === "weapon" ? [null] : []);

    for (const activity of pool) {
      if (attackActivation(activity, item) !== wanted) continue;
      const key = `${item.id}:${activity?.id ?? activity?._id ?? activity?.name ?? "item"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(monsterAttackOption(item, activity));
    }
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
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

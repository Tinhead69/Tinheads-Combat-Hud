/**
 * Usable inventory for Use Item nests.
 * Consumables only (potions, scrolls, and similar).
 * Action lists action, special, and unset consumables.
 * Bonus lists consumables whose activation is a bonus action.
 */

import {
  canAttemptUse,
  getActivities,
  getActivationType,
  getAttackHandle,
  getDefaultIcon,
  itemArtwork,
  optionRequiresTarget,
  sheetItemTooltip,
  t
} from "./actor-options.mjs";

/** Item types that belong under Use Item. */
const USE_ITEM_TYPES = new Set(["consumable"]);

/**
 * @param {Actor} actor
 * @param {"action"|"bonus"} [economy]
 * @returns {Array<object>}
 */
export function getUsableInventoryItems(actor, economy = "action") {
  const options = [];

  for (const item of actor.items ?? []) {
    if (!USE_ITEM_TYPES.has(item.type)) continue;
    if (!itemMatchesUseEconomy(item, economy)) continue;

    const activities = getActivities(item);
    const activity = pickUseActivity(item, activities, economy);
    const qty = Number(item.system?.quantity ?? 1);
    const depleted = Number.isFinite(qty) && qty <= 0;
    const attempt = depleted
      ? { ok: false, reason: t("Empty.NoItemUses") }
      : canAttemptUse(activity, item);

    options.push({
      id: `use-item:${item.id}`,
      kind: "inventory",
      name: item.name,
      img: itemArtwork(item, activity) || getDefaultIcon(item.type),
      item,
      activity,
      available: attempt.ok,
      reason: attempt.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      tooltip: sheetItemTooltip(item, {
        activity,
        targets: Number.isFinite(qty) && qty >= 0 ? `×${qty}` : null,
        reason: attempt.ok ? "" : attempt.reason
      })
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {Item} item
 * @param {"action"|"bonus"} economy
 * @returns {boolean}
 */
function itemMatchesUseEconomy(item, economy) {
  if (economy === "action") return itemIsActionUsable(item);
  const activities = getActivities(item);
  if (activities.length) {
    return activities.some(activity => getActivationType(activity, item) === economy);
  }
  return (item.system?.activation?.type ?? "") === economy;
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
function itemIsActionUsable(item) {
  const activities = getActivities(item);
  if (activities.length) {
    return activities.some(a => {
      const type = getActivationType(a, item);
      return !type || type === "action" || type === "special" || type === "";
    });
  }

  // Legacy activation on the item
  const type = item.system?.activation?.type ?? "";
  if (type === "action" || type === "special") return true;

  // Potions and other consumables are usable even when activation is blank.
  return item.type === "consumable";
}

/**
 * @param {Item} item
 * @param {object[]} activities
 * @param {"action"|"bonus"} [economy]
 */
function pickUseActivity(item, activities, economy = "action") {
  const matching = activities.filter(activity => {
    const type = getActivationType(activity, item);
    if (economy === "action") return !type || type === "action" || type === "special" || type === "";
    return type === economy;
  });
  const pool = matching.length ? matching : (economy === "action" ? activities : []);
  if (!pool.length) return null;
  return pool.find(activity => activity.type === "utility")
    ?? pool.find(activity => activity.type === "heal")
    ?? pool.find(activity => activity.type === "consume")
    ?? pool.find(activity => activity.type !== "attack")
    ?? pool[0]
    ?? getAttackHandle(item).activity;
}


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
import { CHROME } from "./module-icons.mjs";

/** Item types that belong under Use Item. */
const USE_ITEM_TYPES = new Set(["consumable"]);

/** Use Item stays a flat list until it has more wedges than this. */
export const USE_ITEM_GROUP_LIMIT = 10;

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
 * When a Use Item ring has more than 10 consumables, gather every potion into
 * one wedge and every spell scroll into another. Smaller rings stay flat.
 * A category is only nested when it has at least two items, so a lone potion
 * does not become a ring of one.
 * @param {Array<object>} items from getUsableInventoryItems
 * @returns {Array<object>}
 */
export function layoutUseItemEntries(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= USE_ITEM_GROUP_LIMIT) return list.slice();

  const grouped = { potion: [], scroll: [] };
  const rest = [];
  for (const entry of list) {
    const groupId = useItemGroupId(entry?.item);
    if (groupId) grouped[groupId].push(entry);
    else rest.push(entry);
  }

  const hubs = [];
  for (const groupId of ["potion", "scroll"]) {
    const children = grouped[groupId];
    if (children.length < 2) {
      rest.push(...children);
      continue;
    }
    children.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    hubs.push(useItemGroupHub(groupId, children));
  }

  return [...hubs, ...rest].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {Item|null|undefined} item
 * @returns {"potion"|"scroll"|null}
 */
export function useItemGroupId(item) {
  if (!item) return null;
  const typeValue = String(item.system?.type?.value ?? item.system?.consumableType ?? "").toLowerCase();
  const subtype = String(item.system?.type?.subtype ?? "").toLowerCase();
  const name = String(item.name ?? "");
  if (typeValue === "potion" || /^potion\b/i.test(name)) return "potion";
  if (isSpellScroll(item, typeValue, subtype, name)) return "scroll";
  return null;
}

/**
 * @param {Item} item
 * @param {string} typeValue
 * @param {string} subtype
 * @param {string} name
 * @returns {boolean}
 */
function isSpellScroll(item, typeValue, subtype, name) {
  if (subtype === "protection") return false;
  if (subtype === "spell" || /spell scroll/i.test(name)) return true;
  if (typeValue !== "scroll") return false;
  if (subtype && subtype !== "spell") return false;
  return !!(item.system?.spell || item.system?.linkedSpellUuid);
}

/**
 * @param {"potion"|"scroll"} groupId
 * @param {object[]} children
 */
function useItemGroupHub(groupId, children) {
  const potion = groupId === "potion";
  const name = potion ? t("Sections.Potions") : t("Sections.SpellScrolls");
  return {
    id: `use-item-group:${groupId}`,
    kind: "use-item-group",
    groupId,
    name,
    img: CHROME.useItem,
    children,
    available: children.some(child => child.available !== false),
    requiresTarget: false,
    tooltip: {
      title: name,
      description: potion ? t("Sections.PotionsHint") : t("Sections.SpellScrollsHint")
    }
  };
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


/**
 * Usable inventory items for the Action → Use Item nest.
 * Prefer consumables / tools / equipment (and similar) with an Action-like use.
 */

import {
  canAttemptUse,
  getActivities,
  getActivationType,
  getAttackHandle,
  getDefaultIcon,
  optionRequiresTarget,
  t
} from "./actor-options.mjs";

/** Item types that belong under Use Item (not weapons/spells/class features). */
const USE_ITEM_TYPES = new Set([
  "consumable",
  "tool",
  "equipment",
  "loot",
  "container"
]);

/**
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getUsableInventoryItems(actor) {
  const options = [];

  for (const item of actor.items ?? []) {
    if (!USE_ITEM_TYPES.has(item.type)) continue;
    if (!itemIsActionUsable(item)) continue;

    const activities = getActivities(item);
    const activity = pickUseActivity(item, activities);
    const qty = Number(item.system?.quantity ?? 1);
    const depleted = Number.isFinite(qty) && qty <= 0;
    const attempt = depleted
      ? { ok: false, reason: t("Empty.NoItemUses") }
      : canAttemptUse(activity, item);

    options.push({
      id: `use-item:${item.id}`,
      kind: "inventory",
      name: item.name,
      img: item.img || getDefaultIcon(item.type),
      item,
      activity,
      available: attempt.ok,
      reason: attempt.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      tooltip: {
        title: item.name,
        description: summarizeItem(item),
        targets: qty >= 0 ? `×${qty}` : null
      }
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
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

  // Consumables are typically usable even when activation is blank
  if (item.type === "consumable") return true;

  // Tools / equipment with limited uses
  const uses = item.system?.uses;
  if (uses && (uses.max || uses.value != null)) return true;

  return typeof item.use === "function" && !!item.system?.activities;
}

/**
 * @param {Item} item
 * @param {object[]} activities
 */
function pickUseActivity(item, activities) {
  if (!activities.length) return null;
  // Prefer utility / heal / enchant over attack (weapons are the equipped wedges)
  return activities.find(a => a.type === "utility")
    ?? activities.find(a => a.type === "heal")
    ?? activities.find(a => a.type === "consume")
    ?? activities.find(a => a.type !== "attack")
    ?? activities[0]
    ?? getAttackHandle(item).activity;
}

function summarizeItem(item) {
  const raw = item.system?.description?.value ?? "";
  if (!raw) return t("Tooltip.NoDescription");
  const text = String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return t("Tooltip.NoDescription");
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

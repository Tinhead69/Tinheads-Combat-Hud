/**
 * Class features / limited-use options routed by dnd5e activation.
 * Action → Action ring; Bonus → BA; Reaction → R.
 * Multi-mode feats (Channel Divinity, Font of Magic) nest their modes.
 * Rest-only recovery (e.g. Recover Sorcery Points) is never a combat leaf.
 */

import {
  canAttemptUse,
  getActivities,
  getActivationType,
  getNpcAttackItemIds,
  isNpcActor,
  isNpcActionActivation,
  optionRequiresTarget,
  t
} from "./actor-options.mjs";
import { isAttackActivity } from "./weapon-abilities.mjs";
import { classFeatureChromeIcon, preferDocumentImg } from "./module-icons.mjs";

/** Mirror of core Action names so Dash/etc. stay on the basics wedges only. */
const BASIC_NAMES = new Set([
  "dash",
  "disengage",
  "dodge",
  "ready",
  "ready action",
  "ready an action"
]);

/** Activations that never belong on Action / BA / Reaction combat rings. */
const NON_COMBAT_ACTIVATIONS = new Set([
  "",
  "none",
  "rest",
  "hour",
  "day",
  "minute",
  "week",
  "year",
  "permanent"
]);

/**
 * Class / monster **feature** items for one economy ring (not weapons).
 * PCs: class features by activation. NPCs: sheet feat Actions / BA / Reactions
 * (Multiattack, breath weapons, legendary utilities, Nimble Escape, Parry, …)
 * routed by dnd5e activity/item activation — no name hardcoding.
 *
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getClassFeatureOptions(actor, activation = "action") {
  const options = [];
  const npc = isNpcActor(actor);
  // Skip attack-shaped NPC options already on this same economy radial as weapon leaves.
  const npcAttackIds = npc ? getNpcAttackItemIds(actor, activation) : new Set();

  for (const item of actor.items ?? []) {
    if (item.type !== "feat") continue;
    if (BASIC_NAMES.has(normalize(item.name)) || BASIC_NAMES.has(normalize(item.system?.identifier))) {
      continue;
    }
    // Passive traits (Pack Tactics, Keen Senses, …) are never combat leaves.
    if (isPassiveFeature(item)) continue;
    // NPC attack-shaped options already render as weapon/attack leaves for this activation.
    if (npcAttackIds.has(item.id)) continue;

    const allActivities = getActivities(item);
    const matching = allActivities.filter(a =>
      matchesActivation(getActivationType(a, item), activation, { npc })
      && !isRestOnlyActivity(a, item, { npc })
      && isCombatUsableActivity(a)
    );

    // Legacy sheet activation only when the item has no activities at all.
    const legacyType = item.system?.activation?.type ?? "";
    const legacyMatch = !allActivities.length
      && matchesActivation(legacyType, activation, { npc })
      && !isRestOnlyItem(item, { npc })
      && isLegacyUsableCombatFeature(item, { npc });

    if (!matching.length && !legacyMatch) continue;

    if (!matching.length && legacyMatch) {
      const available = canAttemptUse(null, item);
      options.push(makeLeaf({
        item,
        activity: null,
        hasNest: false,
        nestActivities: [],
        available,
        activation
      }));
      continue;
    }

    // Skip pure attack feats unless that's the only matching activity
    // (NPC attack feats are usually already on the attack ring; this keeps PC edge cases).
    const usable = matching.filter(a => !isAttackActivity(a) || matching.length === 1);
    if (!usable.length) continue;

    const hasNest = usable.length > 1;
    const primary = usable[0];
    const available = canAttemptUse(primary, item);

    options.push(makeLeaf({
      item,
      activity: hasNest ? null : primary,
      hasNest,
      nestActivities: usable,
      available,
      activation
    }));
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** @deprecated Use getClassFeatureOptions(actor, "action") */
export function getActionFeatureOptions(actor) {
  return getClassFeatureOptions(actor, "action");
}

/**
 * Leaves under a multi-mode feature (Channel Divinity / Font of Magic options).
 * @param {object} featureOption
 */
export function getFeatureModeOptions(featureOption) {
  const list = featureOption.nestActivities ?? [];
  return list.map((activity, index) => {
    const available = canAttemptUse(activity, featureOption.item);
    return {
      id: `${featureOption.id}:mode:${activity.id ?? activity._id ?? index}`,
      kind: "feature-mode",
      name: activity.name || featureOption.name,
      img: preferDocumentImg(activity.img || featureOption.item?.img, featureOption.img),
      item: featureOption.item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, featureOption.item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(featureOption.item, activity),
      tooltip: {
        title: activity.name || featureOption.name,
        description: usesLine(featureOption.item, activity)
      }
    };
  });
}

function makeLeaf({ item, activity, hasNest, nestActivities, available, activation }) {
  const usesLabel = formatUses(item, activity ?? nestActivities[0]);
  return {
    id: `feature:${activation}:${item.id}`,
    kind: "feature",
    name: item.name,
    img: preferDocumentImg(item.img, classFeatureChromeIcon(item)),
    item,
    activity,
    hasNest,
    nestActivities,
    activation,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(activity, item),
    usesLabel,
    tooltip: {
      title: item.name,
      description: [
        usesLine(item, activity ?? nestActivities[0]),
        hasNest ? t("Features.OpenModesHint") : t("Features.ClassFeatureHint")
      ].filter(Boolean).join(" ")
    }
  };
}

/**
 * Match combat activation. Action also accepts "special" (common for Channel Divinity shells).
 * Empty / rest / downtime types never match for PCs.
 * NPCs: Action also accepts blank / legendary / lair / mythic (monster sheet Actions block).
 *
 * @param {string} type
 * @param {"action"|"bonus"|"reaction"} wanted
 * @param {{ npc?: boolean }} [opts]
 */
export function matchesActivation(type, wanted, opts = {}) {
  const t = String(type ?? "").toLowerCase().trim();
  if (wanted === "bonus" || wanted === "reaction") {
    return t === wanted;
  }
  if (wanted === "action") {
    if (opts.npc) return isNpcActionActivation(t);
    if (NON_COMBAT_ACTIVATIONS.has(t)) return false;
    return t === "action" || t === "special";
  }
  if (NON_COMBAT_ACTIVATIONS.has(t)) return false;
  return t === wanted;
}

/**
 * Rest-only recovery (Recover Sorcery Points, etc.) — never a combat HUD leaf.
 * NPCs: blank activation on a combat-usable activity is Action-economy, not rest-only
 * (common on Multiattack / breath packs that omit an explicit "action" type).
 *
 * @param {object} activity
 * @param {Item} item
 * @param {{ npc?: boolean }} [opts]
 */
export function isRestOnlyActivity(activity, item, opts = {}) {
  const type = String(getActivationType(activity, item) ?? "").toLowerCase().trim();

  if (type === "") {
    // Blank: NPC combat activities still belong on Action; PC blank stays excluded.
    if (opts.npc && isCombatUsableActivity(activity)) return false;
    return true;
  }

  if (NON_COMBAT_ACTIVATIONS.has(type) || type === "none") return true;

  const name = normalize(activity?.name || "");
  // Explicit recover-sorcery style activities stay off combat rings even if mis-tagged.
  if (
    name.includes("recover sorcery")
    || name.includes("regain sorcery")
    || name === "sorcery points"
    || (name.includes("recover") && name.includes("sorcery"))
    || (name.includes("regain") && name.includes("points") && normalize(item?.name || "").includes("font of magic"))
  ) {
    return true;
  }

  // "During a short/long rest" style names with non combat activations
  if (/(short|long)\s*rest/.test(name) && !["action", "bonus", "reaction"].includes(type)) {
    return true;
  }

  return false;
}

/**
 * @param {Item} item
 * @param {{ npc?: boolean }} [opts]
 */
function isRestOnlyItem(item, opts = {}) {
  const type = String(item?.system?.activation?.type ?? "").toLowerCase().trim();
  if (type === "none") return true;
  if (type === "") {
    // Legacy no-activity blank: only keep for NPCs when clearly actionable (uses/recharge/damage).
    if (opts.npc) return !isLegacyUsableCombatFeature(item, { npc: true });
    return true;
  }
  if (NON_COMBAT_ACTIVATIONS.has(type)) return true;
  const name = normalize(item?.name || "");
  return name.includes("recover sorcery") || name.includes("regain sorcery");
}

/**
 * Passive / always-on monster traits — never mid-combat leaves.
 * Prefer sheet flags (activation none, type passive) over name lists.
 * @param {Item} item
 */
export function isPassiveFeature(item) {
  if (!item || item.type !== "feat") return false;
  const featType = String(item.system?.type?.value ?? "").toLowerCase();
  if (featType === "passive") return true;

  const activation = String(item.system?.activation?.type ?? "").toLowerCase().trim();
  if (activation === "none") return true;

  // No activities + no actionable activation/uses → trait text only (Pack Tactics, etc.)
  const activities = getActivities(item);
  if (!activities.length) {
    if (["action", "bonus", "reaction", "special", "legendary", "lair", "mythic"].includes(activation)) {
      return false;
    }
    const uses = item.system?.uses;
    const hasUses = Number(uses?.max ?? 0) > 0 || uses?.value != null;
    const hasRecharge = !!(item.system?.recharge?.value ?? item.system?.uses?.recovery);
    if (!hasUses && !hasRecharge && !item.system?.damage && !item.system?.attack && !item.system?.save) {
      return true;
    }
  }

  return false;
}

/**
 * dnd5e activity types that can resolve mid-combat via use().
 * @param {object|null} activity
 */
export function isCombatUsableActivity(activity) {
  if (!activity) return false;
  const type = String(activity.type || "").toLowerCase();
  if ([
    "attack",
    "damage",
    "save",
    "heal",
    "utility",
    "cast",
    "check",
    "summon",
    "transform",
    "enchant",
    "forward"
  ].includes(type)) {
    return true;
  }
  return !!(activity.attack || activity.damage || activity.save || activity.healing);
}

/**
 * Legacy feat with no activities — only show when activation/uses imply a usable action.
 * @param {Item} item
 * @param {{ npc?: boolean }} [opts]
 */
function isLegacyUsableCombatFeature(item, opts = {}) {
  if (!item) return false;
  if (isPassiveFeature(item)) return false;
  const activation = String(item.system?.activation?.type ?? "").toLowerCase().trim();
  if (["action", "bonus", "reaction", "special", "legendary", "lair", "mythic"].includes(activation)) {
    return true;
  }
  if (opts.npc && activation === "") {
    const uses = item.system?.uses;
    const hasUses = Number(uses?.max ?? 0) > 0 || uses?.value != null;
    return !!(hasUses || item.system?.damage || item.system?.attack || item.system?.save);
  }
  return false;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @param {Item} item
 * @param {object|null} activity
 * @returns {string|null}
 */
export function formatUses(item, activity) {
  const fromActivity = readUses(activity?.uses);
  if (fromActivity) return fromActivity;

  const fromItem = readUses(item?.system?.uses);
  if (fromItem) return fromItem;

  // Some packs put the pool only on a sibling consumption / limited-use field.
  const consumed = activity?.consumption?.targets;
  if (Array.isArray(consumed)) {
    for (const target of consumed) {
      if (target?.type === "itemUses") {
        const again = readUses(item?.system?.uses);
        if (again) return again;
      }
    }
  }

  return null;
}

function readUses(uses) {
  if (!uses) return null;
  const max = coerceNum(uses.max);
  const value = coerceNum(uses.value);
  if (max == null && value == null) return null;
  if (max != null && max > 0) {
    const v = value != null ? value : max;
    return `${v}/${max}`;
  }
  if (value != null) return String(value);
  return null;
}

function coerceNum(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function usesLine(item, activity) {
  const label = formatUses(item, activity);
  if (label) return t("Features.UsesRemaining", { uses: label });
  return t("Features.ClassFeatureHint");
}

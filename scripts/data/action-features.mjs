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
 * Class features for one economy ring.
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getClassFeatureOptions(actor, activation = "action") {
  const options = [];

  for (const item of actor.items ?? []) {
    if (item.type !== "feat") continue;
    if (BASIC_NAMES.has(normalize(item.name)) || BASIC_NAMES.has(normalize(item.system?.identifier))) {
      continue;
    }

    const allActivities = getActivities(item);
    const matching = allActivities.filter(a =>
      matchesActivation(getActivationType(a, item), activation)
      && !isRestOnlyActivity(a, item)
    );

    // Legacy sheet activation only when the item has no activities at all.
    const legacyType = item.system?.activation?.type ?? "";
    const legacyMatch = !allActivities.length
      && matchesActivation(legacyType, activation)
      && !isRestOnlyItem(item);

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

    // Skip pure attack feats unless that's the only matching activity.
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
 * Empty / rest / downtime types never match.
 */
export function matchesActivation(type, wanted) {
  const t = String(type ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(t)) return false;
  if (wanted === "action") return t === "action" || t === "special";
  return t === wanted;
}

/**
 * Rest-only recovery (Recover Sorcery Points, etc.) — never a combat HUD leaf.
 */
export function isRestOnlyActivity(activity, item) {
  const type = String(getActivationType(activity, item) ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(type)) return true;

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

function isRestOnlyItem(item) {
  const type = String(item?.system?.activation?.type ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(type)) return true;
  const name = normalize(item?.name || "");
  return name.includes("recover sorcery") || name.includes("regain sorcery");
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

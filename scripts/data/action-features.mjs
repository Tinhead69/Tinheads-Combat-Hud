/**
 * Class features / limited-use options routed by dnd5e activation.
 * Action → Action ring; Bonus → BA; Reaction → R.
 * Multi-mode feats (Channel Divinity, Font of Magic) nest their modes.
 * Separate "Channel Divinity: …" feats collapse onto one Channel Divinity button.
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
  const feats = [];
  for (const item of actor.items ?? []) {
    if (item?.type !== "feat") continue;
    if (BASIC_NAMES.has(normalize(item.name)) || BASIC_NAMES.has(normalize(item.system?.identifier))) {
      continue;
    }
    feats.push(item);
  }

  const shells = feats.filter(isChannelDivinityParent);
  const parent = pickChannelParent(shells);
  const childItems = feats.filter(item =>
    isChannelDivinityOption(item, parent) && featureMatchesActivation(item, activation)
  );
  const hiddenIds = new Set([
    ...shells.map(item => item.id),
    ...childItems.map(item => item.id)
  ]);

  const options = [];

  for (const item of feats) {
    if (hiddenIds.has(item.id)) continue;

    const { matching, legacyMatch } = activationMatch(item, activation);
    if (!matching.length && !legacyMatch) continue;

    if (!matching.length && legacyMatch) {
      options.push(makeLeaf({
        item,
        activity: null,
        hasNest: false,
        nestActivities: [],
        childItems: [],
        available: canAttemptUse(null, item),
        activation
      }));
      continue;
    }

    // Skip pure attack feats unless that's the only matching activity.
    const usable = matching.filter(a => !isAttackActivity(a) || matching.length === 1);
    if (!usable.length) continue;

    const hasNest = usable.length > 1;
    const primary = usable[0];
    options.push(makeLeaf({
      item,
      activity: hasNest ? null : primary,
      hasNest,
      nestActivities: usable,
      childItems: [],
      available: canAttemptUse(hasNest ? null : primary, item),
      activation
    }));
  }

  const channelLeaf = buildChannelLeaf(shells, parent, childItems, activation);
  if (channelLeaf) options.push(channelLeaf);

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
  const fromActivities = (featureOption.nestActivities ?? []).map((activity, index) => {
    const available = canAttemptUse(activity, featureOption.item);
    return {
      id: `${featureOption.id}:mode:${activity.id ?? activity._id ?? index}`,
      kind: "feature-mode",
      name: activity.name || featureOption.name,
      img: preferDocumentImg(activity.img || featureOption.item?.img, featureOption.img),
      item: activity?.item ?? activity?.parent ?? featureOption.item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, activity?.item ?? featureOption.item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(featureOption.item, activity),
      tooltip: {
        title: activity.name || featureOption.name,
        description: usesLine(featureOption.item, activity)
      }
    };
  });

  const fromItems = (featureOption.childItems ?? []).map(item => {
    const activity = primaryActivity(item, featureOption.activation);
    const available = canAttemptUse(activity, item);
    const name = channelOptionLabel(item.name);
    return {
      id: `${featureOption.id}:item:${item.id}`,
      kind: "feature-mode",
      name,
      img: preferDocumentImg(activity?.img || item.img, featureOption.img),
      item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(item, activity),
      tooltip: {
        title: name,
        description: usesLine(item, activity)
      }
    };
  });

  return [...fromActivities, ...fromItems];
}

function makeLeaf({ item, activity, hasNest, nestActivities, childItems = [], available, activation, usesLabel = null }) {
  const poolLabel = usesLabel ?? formatUses(item, activity ?? nestActivities[0]);
  return {
    id: `feature:${activation}:${item.id}`,
    kind: "feature",
    name: item.name,
    img: preferDocumentImg(item.img, classFeatureChromeIcon(item)),
    item,
    activity,
    hasNest,
    nestActivities,
    childItems,
    activation,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(activity, item),
    usesLabel: poolLabel,
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

/**
 * One Channel Divinity button. Every same-named shell and "Channel Divinity: …" option
 * hangs off it, so the Action ring never shows two Channel Divinity wedges.
 * @param {Item[]} shells
 * @param {Item|null} parent
 * @param {Item[]} childItems
 * @param {"action"|"bonus"|"reaction"} activation
 */
function buildChannelLeaf(shells, parent, childItems, activation) {
  if (!parent && !childItems.length) return null;

  const activities = [];
  for (const shell of shells) {
    for (const activity of usableActivities(shell, activation)) {
      if (activity && !activity.item && !activity.parent) activity.item = shell;
      activities.push(activity);
    }
  }

  const modes = channelModeActivities(activities, childItems.length > 0);
  const hasNest = childItems.length > 0 || modes.length > 1;
  const host = parent ?? syntheticChannelParent(childItems);
  const primary = modes[0] ?? null;
  const poolMatches = parent ? featureMatchesActivation(parent, activation) : false;
  const anyModes = modes.length > 0 || childItems.length > 0;
  if (!anyModes && !poolMatches && !shells.some(shell => featureMatchesActivation(shell, activation))) {
    return null;
  }

  return makeLeaf({
    item: host,
    activity: hasNest ? null : primary,
    hasNest,
    nestActivities: hasNest ? modes : (primary ? [primary] : []),
    childItems,
    available: canAttemptUse(hasNest ? null : primary, primary?.item ?? host),
    activation,
    usesLabel: formatUses(host, null)
  });
}

function usableActivities(item, activation) {
  const { matching } = activationMatch(item, activation);
  return matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
}

/**
 * Prefer the shell that actually holds the uses pool (the "2/2" button).
 * @param {Item[]} shells
 * @returns {Item|null}
 */
function pickChannelParent(shells) {
  if (!shells.length) return null;
  return [...shells].sort((a, b) => channelPoolScore(b) - channelPoolScore(a))[0];
}

function channelPoolScore(item) {
  const uses = item?.system?.uses;
  if (!uses) return 0;
  const max = Number(uses.max);
  if (Number.isFinite(max) && max > 0) return 100 + max;
  if (typeof uses.max === "string" && uses.max.trim()) return 50;
  if (uses.spent != null || uses.value != null) return 10;
  return 0;
}

/**
 * The Channel Divinity uses pool, not an individual option.
 * @param {Item} item
 */
function isChannelDivinityParent(item) {
  return normalize(item?.name) === "channel divinity"
    || normalize(item?.system?.identifier) === "channel divinity";
}

/**
 * A separate feat that is one Channel Divinity option (e.g. "Channel Divinity: Abjure Enemies").
 * @param {Item} item
 * @param {Item|null} parent
 */
function isChannelDivinityOption(item, parent) {
  if (!item || item.type !== "feat") return false;
  if (parent && item.id === parent.id) return false;
  if (isChannelDivinityParent(item)) return false;

  const name = normalize(item.name);
  const ident = normalize(item.system?.identifier);
  if (name.startsWith("channel divinity ") || ident.startsWith("channel divinity ")) return true;

  const subtype = String(item.system?.type?.subtype ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (subtype === "channeldivinity") return true;

  return !!(parent && consumesItem(item, parent));
}

/**
 * Drop a generic "Channel Divinity" activity once real options exist, so the nest is only those options.
 * @param {object[]} usable
 * @param {boolean} hasChildren
 */
function channelModeActivities(usable, hasChildren) {
  const specific = usable.filter(activity => normalize(activity?.name) !== "channel divinity");
  const source = (hasChildren || specific.length) ? specific : usable;
  const seen = new Set();
  const unique = [];
  for (const activity of source) {
    const key = normalize(activity?.name) || String(activity?.id ?? activity?._id ?? unique.length);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(activity);
  }
  return unique;
}

function syntheticChannelParent(children) {
  return {
    id: "channel-divinity",
    name: "Channel Divinity",
    type: "feat",
    img: children.find(child => child.img)?.img || "",
    system: { identifier: "channel-divinity", uses: children[0]?.system?.uses ?? null }
  };
}

function channelOptionLabel(name) {
  const stripped = String(name ?? "").replace(/^channel divinity\s*[:\-–—]?\s*/i, "").trim();
  return stripped || String(name ?? "Channel Divinity");
}

function featureMatchesActivation(item, activation) {
  const { matching, legacyMatch } = activationMatch(item, activation);
  if (legacyMatch) return true;
  const usable = matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
  return usable.length > 0;
}

function activationMatch(item, activation) {
  const allActivities = getActivities(item);
  const matching = allActivities.filter(activity =>
    matchesActivation(getActivationType(activity, item), activation)
    && !isRestOnlyActivity(activity, item)
  );
  const legacyType = item.system?.activation?.type ?? "";
  const legacyMatch = !allActivities.length
    && matchesActivation(legacyType, activation)
    && !isRestOnlyItem(item);
  return { matching, legacyMatch };
}

function primaryActivity(item, activation) {
  const { matching } = activationMatch(item, activation);
  const usable = matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
  return usable[0] ?? null;
}

function consumesItem(item, parent) {
  const ids = [parent.id, parent.uuid, parent.system?.identifier]
    .filter(Boolean)
    .map(value => String(value));
  if (!ids.length) return false;

  for (const activity of getActivities(item)) {
    const targets = activity?.consumption?.targets ?? [];
    const list = Array.isArray(targets) ? targets : Object.values(targets ?? {});
    for (const target of list) {
      const ref = String(target?.target ?? target?.value ?? "");
      if (ids.some(id => ref.includes(id))) return true;
    }
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
  const actor = item?.actor ?? activity?.item?.actor ?? activity?.actor ?? null;
  const itemLabel = readUses(item?.system?.uses, actor);
  const activityLabel = readUses(activity?.uses, actor);

  // Lay on Hands and similar features spend the item pool. The activity's own
  // uses field is often an empty counter prepared as 0.
  if (spendsItemUses(activity) && itemLabel) return itemLabel;
  if (activityLabel) return activityLabel;
  if (itemLabel) return itemLabel;
  return null;
}

/**
 * Remaining/max for a dnd5e uses block.
 * 3.x stores `value`. 4.x/5.x stores `spent` and a `max` formula (`max - spent` remaining).
 * @param {object|null|undefined} uses
 * @param {Actor|null} actor
 * @returns {string|null}
 */
function readUses(uses, actor) {
  if (!uses) return null;
  const max = resolveUsesMax(uses.max, actor);
  if (max == null || max <= 0) return null;

  const spent = coerceNum(uses.spent);
  const value = coerceNum(uses.value);
  const remaining = spent != null
    ? Math.max(0, max - spent)
    : (value != null ? value : max);
  return `${remaining}/${max}`;
}

/**
 * @param {number|string|null|undefined} raw
 * @param {Actor|null} actor
 * @returns {number|null}
 */
function resolveUsesMax(raw, actor) {
  const direct = coerceNum(raw);
  if (direct != null) return direct;
  if (typeof raw !== "string" || !raw.trim()) return null;

  const rollData = actor?.getRollData?.() ?? {};
  const resolvers = [
    globalThis.dnd5e?.utils?.simplifyBonus,
    globalThis.simplifyBonus
  ];
  for (const fn of resolvers) {
    if (typeof fn !== "function") continue;
    try {
      const n = coerceNum(fn(raw, rollData));
      if (n != null) return n;
    } catch (_) {
      /* try the next resolver */
    }
  }

  let expr = raw;
  try {
    if (typeof Roll !== "undefined" && typeof Roll.replaceFormulaData === "function") {
      expr = Roll.replaceFormulaData(raw, rollData);
    } else {
      expr = raw.replace(/@([a-zA-Z0-9_.]+)/g, (_match, path) => {
        let cur = rollData;
        for (const part of path.split(".")) {
          if (cur == null) return "0";
          cur = cur[part];
        }
        const n = Number(cur);
        return Number.isFinite(n) ? String(n) : "0";
      });
    }
    if (typeof Roll !== "undefined" && typeof Roll.safeEval === "function") {
      const n = coerceNum(Roll.safeEval(expr));
      if (n != null) return n;
    }
  } catch (_) {
    /* fall through to arithmetic */
  }

  const cleaned = String(expr).replace(/\s+/g, "");
  if (!/^[\d.+\-*/()]+$/.test(cleaned)) return null;
  try {
    const n = Function(`"use strict"; return (${cleaned})`)();
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function spendsItemUses(activity) {
  const targets = activity?.consumption?.targets ?? [];
  const list = Array.isArray(targets) ? targets : Object.values(targets ?? {});
  return list.some(target => target?.type === "itemUses");
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

/**
 * Actor / item / activity helpers for Tinhead's Combat Hud.
 * Keeps dnd5e data shaping out of the radial UI.
 */

const MODULE_ID = "tinheads-combat-hud";

/**
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return game.i18n.format(`TINHEADS_COMBAT_HUD.${key}`, data ?? {});
}

/**
 * @param {TokenDocument|Token} tokenLike
 * @returns {Actor|null}
 */
export function actorFromToken(tokenLike) {
  const doc = tokenLike?.document ?? tokenLike;
  const actor = doc?.actor ?? tokenLike?.actor ?? null;
  return actor ?? null;
}

export { canOpenHud, canUseActor, canResolveLocally } from "./permissions.mjs";

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isWeaponItem(item) {
  return item?.type === "weapon";
}

/**
 * Body attacks such as Beard, Bite, and Claw. These are weapons even when
 * the sheet does not mark them equipped.
 * @param {Item} item
 * @returns {boolean}
 */
export function isNaturalWeapon(item) {
  const value = String(item?.system?.type?.value ?? item?.system?.weaponType ?? "").toLowerCase();
  const base = String(item?.system?.type?.baseItem ?? "").toLowerCase();
  return value === "natural" || base === "natural";
}

/**
 * Unarmed Strike is offered on the Attack nest even when it is not equipped.
 * @param {Item} item
 * @returns {boolean}
 */
export function isUnarmedItem(item) {
  const name = String(item?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const ident = String(item?.system?.identifier || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const typeValue = String(item?.system?.type?.value ?? "").toLowerCase();
  const base = String(item?.system?.type?.baseItem ?? "").toLowerCase();
  return name === "unarmed strike"
    || ident === "unarmed strike"
    || typeValue === "unarmed"
    || base === "unarmed";
}

/**
 * dnd5e inventory equipped flag (`item.system.equipped`).
 * @param {Item} item
 * @returns {boolean}
 */
export function isEquippedItem(item) {
  return item?.system?.equipped === true;
}

/**
 * Weapons offered on Attack.
 * Player characters: equipped weapons, plus natural weapons.
 * NPCs: every weapon, so unequipped natural attacks such as Beard still appear.
 * @param {Item} item
 * @param {Actor} [actor]
 * @returns {boolean}
 */
export function isListedAttackWeapon(item, actor) {
  if (!isWeaponItem(item)) return false;
  if (isEquippedItem(item) || isNaturalWeapon(item)) return true;
  return actor?.type === "npc";
}

/**
 * Prefer primary attack activity; fall back to first usable activity / item.
 * @param {Item} item
 * @returns {{ item: Item, activity: object|null }}
 */
export function getAttackHandle(item) {
  const activities = getActivities(item);
  const attack = activities.find(a => a.type === "attack")
    ?? activities.find(a => a.attack)
    ?? activities[0]
    ?? null;
  return { item, activity: attack };
}

/**
 * @param {Item} item
 * @returns {object[]}
 */
export function getActivities(item) {
  const collection = item?.system?.activities;
  if (!collection) return [];

  let entries = [];
  if (Array.isArray(collection?.contents)) entries = collection.contents;
  else if (typeof collection.values === "function") entries = Array.from(collection.values());
  else if (typeof collection[Symbol.iterator] === "function") entries = Array.from(collection);
  else if (typeof collection === "object") entries = Object.values(collection);

  return entries.map(entry => {
    // Map / Collection iterators sometimes yield [id, activity].
    if (Array.isArray(entry) && entry.length === 2 && entry[1] && typeof entry[1] === "object") {
      return entry[1];
    }
    return entry;
  }).filter(activity => activity && typeof activity === "object");
}

/**
 * @param {object|null} activity
 * @param {Item} [item]
 * @returns {string}
 */
export function getActivationType(activity, item) {
  const fromActivity = activity?.activation?.type
    ?? activity?.system?.activation?.type
    ?? "";
  if (fromActivity) return fromActivity;
  return item?.system?.activation?.type ?? "";
}

/**
 * Weapons for the Attack nest.
 * Characters: equipped weapons and natural attacks.
 * NPCs: every weapon, so an unequipped Beard still appears.
 * @param {Actor} actor
 * @returns {Array<{ id: string, name: string, img: string, item: Item, activity: object|null, available: boolean, reason?: string }>}
 */
export function getEquippedWeapons(actor) {
  const items = [];
  for (const item of actor?.items ?? []) items.push(item);
  items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")));

  const weapons = [];
  const seen = new Set();

  for (const item of items) {
    if (!isListedAttackWeapon(item, actor)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const handle = getAttackHandle(item);
    const available = canAttemptUse(handle.activity, handle.item);
    weapons.push({
      id: `weapon:${item.id}`,
      name: item.name,
      img: itemArtwork(item, handle.activity) || getDefaultIcon("weapon"),
      item: handle.item,
      activity: handle.activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(handle.activity, handle.item)
    });
  }

  return weapons;
}

/**
 * Prefer document artwork (`item.img`); Foundry/system defaults only when missing.
 * Module chrome SVGs are NOT used here — see module-icons.mjs for HUD chrome only.
 * @param {string} kind
 * @returns {string}
 */
export function getDefaultIcon(kind = "item") {
  const defaults = CONFIG?.DND5E?.defaultArtwork?.Item;
  if (defaults?.[kind]) return defaults[kind];
  if (defaults?.weapon) return defaults.weapon;
  return "icons/svg/sword.svg";
}

/** Foundry / Midi-QOL placeholders. `aura.svg` is the usual Midi activity icon. */
const GENERIC_ACTIVITY_FILES = new Set([
  "aura.svg",
  "activity.svg",
  "item-bag.svg",
  "mystery-man.svg",
  "book.svg",
  "sword.svg",
  "combat.svg",
  "explosion.svg"
]);

/**
 * @param {string|null|undefined} img
 * @returns {string}
 */
function cleanImg(img) {
  return typeof img === "string" ? img.trim() : "";
}

/**
 * Shared activity icons are not the picture on the character sheet.
 * Midi-QOL's module icons (`modules/midi-qol/...`) count as placeholders too.
 * @param {string|null|undefined} img
 * @returns {boolean}
 */
export function isGenericActivityArtwork(img) {
  const path = cleanImg(img).toLowerCase().split("?")[0].split("#")[0];
  if (!path) return true;
  if (path.includes("midi-qol") || path.includes("midiqol")) return true;
  const file = path.split("/").pop();
  if (GENERIC_ACTIVITY_FILES.has(file) || file.startsWith("midi-")) return true;
  const defaults = CONFIG?.DND5E?.defaultArtwork;
  if (!defaults) return false;
  const values = [];
  const walk = (node) => {
    if (typeof node === "string") values.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(defaults);
  return values.some(value => String(value).toLowerCase().split("?")[0].split("#")[0] === path);
}

/**
 * Real sheet or activity art. Midi-QOL placeholders are skipped.
 * The item portrait wins. A custom activity image is used only when the item has none.
 * @param {Item|null|undefined} item
 * @param {object|null|undefined} activity
 * @returns {string}
 */
export function itemArtwork(item, activity) {
  const itemImg = cleanImg(item?.img);
  if (itemImg && !isGenericActivityArtwork(itemImg)) return itemImg;
  const activityImg = cleanImg(activity?.img);
  if (activityImg && !isGenericActivityArtwork(activityImg)) return activityImg;
  return "";
}

/**
 * Mode art for one activity on a shared item (weapon modes, Channel Divinity).
 * Custom activity art stays. A Midi-QOL default falls back to the item portrait.
 * @param {Item|null|undefined} item
 * @param {object|null|undefined} activity
 * @returns {string}
 */
export function activityArtwork(item, activity) {
  const activityImg = cleanImg(activity?.img);
  const itemImg = cleanImg(item?.img);
  if (activityImg && !isGenericActivityArtwork(activityImg)) return activityImg;
  if (itemImg && !isGenericActivityArtwork(itemImg)) return itemImg;
  return "";
}

const SPELL_ECONOMIES = new Set(["action", "bonus", "reaction"]);

/**
 * Which action economy a spell uses.
 * The item's own activation wins, so a bonus spell stays on Bonus Action
 * even when a cast activity is tagged as an action.
 * @param {Item} item
 * @returns {"action"|"bonus"|"reaction"}
 */
export function spellEconomy(item) {
  const itemType = String(item?.system?.activation?.type ?? "");
  if (SPELL_ECONOMIES.has(itemType)) return itemType;
  const cast = getCastActivity(item);
  const activityType = String(
    cast?.activation?.type
    ?? cast?.system?.activation?.type
    ?? ""
  );
  if (SPELL_ECONOMIES.has(activityType)) return activityType;
  return "action";
}

/**
 * Castable spells grouped by **available** spell levels only.
 * Section count for the spell-level ring = `levels.length` (never a fixed 0–9 ring).
 * A level appears only when the actor has ≥1 HUD-usable spell at that level.
 * `economy` keeps action, bonus, and reaction spells on their own rings.
 *
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} [economy]
 * @returns {{ levels: Array<{ level: number, label: string, slots: string|null, slotHint: string, spells: object[] }>, empty: boolean }}
 */
export function getSpellLevels(actor, economy = "action") {
  const innate = [];
  const pact = [];
  const byLevel = new Map();

  for (const item of actor.items ?? []) {
    if (item.type !== "spell") continue;
    if (spellEconomy(item) !== economy) continue;
    if (!isSpellAvailableForHud(actor, item)) continue;

    const spell = spellRingOption(item);
    const method = spellCastingMethod(item);
    if (method === "innate") {
      innate.push(spell);
      continue;
    }
    if (method === "pact") {
      pact.push(spell);
      continue;
    }

    const level = Number(item.system?.level ?? 0);
    const key = Number.isFinite(level) && level >= 0 ? level : 0;
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(spell);
  }

  // Innate and Pact Magic are their own wedges. Slot levels follow.
  const levels = [];
  if (innate.length) {
    innate.sort((a, b) => a.name.localeCompare(b.name));
    levels.push({
      id: "innate",
      level: "innate",
      label: t("SpellLevels.Innate"),
      slots: null,
      slotHint: "",
      spells: innate
    });
  }
  if (pact.length) {
    pact.sort((a, b) => a.name.localeCompare(b.name));
    const counts = pactPoolCounts(actor);
    levels.push({
      id: "pact",
      level: "pact",
      label: t("SpellLevels.Pact"),
      slots: formatSpellSlots(counts),
      slotHint: formatSpellSlotHint(counts),
      spells: pact
    });
  }

  // Only levels that actually have spells — UI lays them on a partial arc via arcSegmentsForParent.
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const slotCounts = spellSlotCounts(actor, level);
    const regularCounts = slotCounts?.regular ? { regular: slotCounts.regular, pact: null } : null;
    levels.push({
      id: level,
      level,
      label: spellLevelLabel(level),
      slots: formatSpellSlots(regularCounts),
      slotHint: formatSpellSlotHint(regularCounts),
      spells: byLevel.get(level).sort((a, b) => a.name.localeCompare(b.name))
    });
  }

  return { levels, empty: levels.length === 0 };
}

/**
 * @param {Item} item
 */
function spellRingOption(item) {
  const cast = getCastActivity(item);
  const available = canAttemptUse(cast, item);
  const level = Number(item.system?.level ?? 0);
  return {
    id: `spell:${item.id}`,
    name: item.name,
    img: itemArtwork(item, cast) || getDefaultIcon("spell"),
    item,
    activity: cast,
    level: Number.isFinite(level) ? level : 0,
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
function spellLevelLabel(level) {
  const key = `SpellLevels.${level}`;
  const localized = t(key);
  if (localized && localized !== `TINHEADS_COMBAT_HUD.${key}`) return localized;
  if (level === 0) return "Cantrip";
  if (level === 1) return "1st";
  if (level === 2) return "2nd";
  if (level === 3) return "3rd";
  return `${level}th`;
}

/**
 * Remaining spell slots for one ring level.
 * Regular slots live on `system.spells.spellN`. Pact slots show on `pact.level`.
 * Cantrips have no pool. `value` is remaining; `override` replaces `max` when set.
 * @param {Actor} actor
 * @param {number} level
 * @returns {{ regular: { value: number, max: number }|null, pact: { value: number, max: number }|null }|null}
 */
export function spellSlotCounts(actor, level) {
  if (level <= 0) return null;
  const spells = actor?.system?.spells;
  if (!spells) return null;

  const regular = readSlotPool(spells[`spell${level}`]);
  const pact = spells.pact;
  const pactPool = readSlotPool(pact);
  const pactHere = pactPool && Number(pact?.level ?? 0) === level ? pactPool : null;
  if (!regular && !pactHere) return null;
  return { regular, pact: pactHere };
}

/**
 * @param {object|null|undefined} slot
 * @returns {{ value: number, max: number }|null}
 */
function readSlotPool(slot) {
  if (!slot) return null;
  const max = effectiveSlotMax(slot);
  if (!(max > 0)) return null;
  const raw = Number(slot.value ?? 0);
  const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  return { value, max };
}

/**
 * A pool is usable when it has a maximum (including override) or remaining slots
 * were exported without a maximum.
 * @param {object|null|undefined} slot
 * @returns {boolean}
 */
function slotPoolOpen(slot) {
  if (!slot || typeof slot !== "object") return false;
  if (effectiveSlotMax(slot) > 0) return true;
  const value = Number(slot.value ?? 0);
  return Number.isFinite(value) && value > 0;
}

/**
 * dnd5e uses `override` as the effective maximum when it is set.
 * @param {object} slot
 * @returns {number}
 */
function effectiveSlotMax(slot) {
  if (slot.override != null && slot.override !== "") {
    const override = Number(slot.override);
    if (Number.isFinite(override)) return override;
  }
  const max = Number(slot.max ?? 0);
  return Number.isFinite(max) ? max : 0;
}

/**
 * Wedge caption, e.g. "3/4" or "3/4 · P 1/2" when pact slots share the level.
 * @param {{ regular: { value: number, max: number }|null, pact: { value: number, max: number }|null }|null} counts
 * @returns {string|null}
 */
export function formatSpellSlots(counts) {
  if (!counts) return null;
  const parts = [];
  if (counts.regular) parts.push(`${counts.regular.value}/${counts.regular.max}`);
  if (counts.pact) {
    const pact = `${counts.pact.value}/${counts.pact.max}`;
    parts.push(counts.regular ? `P ${pact}` : pact);
  }
  return parts.join(" · ") || null;
}

/**
 * @param {{ regular: { value: number, max: number }|null, pact: { value: number, max: number }|null }|null} counts
 * @returns {string}
 */
function formatSpellSlotHint(counts) {
  if (!counts) return "";
  const parts = [];
  if (counts.regular) {
    parts.push(slotSentence(
      "SpellLevels.SlotsHint",
      counts.regular,
      `${counts.regular.value} of ${counts.regular.max} slots left.`
    ));
  }
  if (counts.pact) {
    parts.push(slotSentence(
      "SpellLevels.PactSlotsHint",
      counts.pact,
      `${counts.pact.value} of ${counts.pact.max} pact slots left.`
    ));
  }
  return parts.join(" ");
}

/**
 * @param {string} key
 * @param {{ value: number, max: number }} data
 * @param {string} fallback
 */
function slotSentence(key, data, fallback) {
  const localized = t(key, data);
  const fullKey = `TINHEADS_COMBAT_HUD.${key}`;
  if (!localized || localized === fullKey || String(localized).endsWith(key)) return fallback;
  return localized;
}

/**
 * dnd5e casting method: spell, atwill, innate, pact, ritual.
 * @param {Item} item
 * @returns {string}
 */
export function spellCastingMethod(item) {
  return spellCastingState(item).method;
}

/**
 * dnd5e 5.1 stores casting on `system.method` and preparation on `system.prepared`
 * (0 unprepared, 1 prepared, 2 always). Reading `system.preparation` logs a deprecation warning.
 * Plain objects that still carry the old shape are accepted without touching a live getter
 * when the new fields are already present.
 * @param {Item} item
 * @returns {{ method: string, prepared: number }}
 */
function spellCastingState(item) {
  const system = item?.system ?? {};
  if (("method" in system) || typeof system.prepared === "number") {
    const method = system.method || "spell";
    const prepared = Number(system.prepared ?? 0);
    return { method, prepared: Number.isFinite(prepared) ? prepared : 0 };
  }

  const legacy = system.preparation;
  const mode = legacy?.mode || "prepared";
  if (mode === "always") return { method: "spell", prepared: 2 };
  if (mode === "atwill" || mode === "innate" || mode === "ritual") {
    return { method: mode, prepared: 2 };
  }
  if (mode === "pact") return { method: "pact", prepared: legacy?.prepared === false ? 0 : 1 };
  return { method: "spell", prepared: legacy?.prepared === false ? 0 : 1 };
}

/**
 * Spell methods that do not spend a slot.
 * @param {string} method
 * @returns {boolean}
 */
function isSlotlessSpellMethod(method) {
  if (method === "atwill" || method === "innate" || method === "ritual") return true;
  const config = CONFIG?.DND5E?.spellcasting?.[method];
  return config?.slots === false || config?.static === true;
}

/**
 * Methods whose spells can sit unprepared (paladin, cleric, wizard).
 * @param {string} method
 * @returns {boolean}
 */
function spellMethodPrepares(method) {
  const prepares = CONFIG?.DND5E?.spellcasting?.[method]?.prepares;
  if (prepares != null) return !!prepares;
  return method === "spell" || method === "prepared";
}

/**
 * Whether a spell should contribute to the Cast Spell level ring / spell ring.
 * Cantrips: known spells always count.
 * Leveled: must pass prep/known rules and have a usable slot source (or be at-will/innate).
 *
 * @param {Actor} actor
 * @param {Item} item
 * @returns {boolean}
 */
export function isSpellAvailableForHud(actor, item) {
  if (!item || item.type !== "spell") return false;

  const level = Number(item.system?.level ?? 0);
  const { method, prepared } = spellCastingState(item);

  // Cantrips never consume slots
  if (level === 0) return true;

  // At-will / innate / ritual: no slot gate
  if (isSlotlessSpellMethod(method)) return true;

  // Prepared casters: skip unprepared spells entirely (do not create empty/grey levels for them)
  if (spellMethodPrepares(method) && prepared <= 0) return false;

  // Pact magic
  if (method === "pact") return hasPactSlots(actor);

  // always (prepared 2) / prepared / known casters: need a slot at this level (or higher upcast source)
  return hasSpellSlotForLevel(actor, level);
}

/**
 * @param {Actor} actor
 * @param {number} level
 * @returns {boolean}
 */
export function hasSpellSlotForLevel(actor, level) {
  if (level <= 0) return true;
  const spells = actor?.system?.spells;
  if (!spells) {
    // No slot data (NPC / incomplete) — allow listing known/prepared spells; dnd5e enforces on use().
    return true;
  }

  if (slotPoolOpen(spells[`spell${level}`])) return true;

  // Higher-level slots can cast lower-level spells; if any higher pool is open, include the level.
  for (let n = level + 1; n <= 9; n++) {
    if (slotPoolOpen(spells[`spell${n}`])) return true;
  }

  // Pact slot usable for this spell level
  if (hasPactSlots(actor) && Number(spells.pact?.level ?? 0) >= level) return true;

  return false;
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function hasPactSlots(actor) {
  const pact = actor?.system?.spells?.pact;
  return !!pact && Number(pact.max ?? 0) > 0;
}

/**
 * The shared pact-magic pool, independent of which spell level it can cast.
 * @param {Actor} actor
 * @returns {{ regular: null, pact: { value: number, max: number } }|null}
 */
function pactPoolCounts(actor) {
  const pact = readSlotPool(actor?.system?.spells?.pact);
  return pact ? { regular: null, pact } : null;
}

/**
 * @param {Item} item
 * @returns {object|null}
 */
export function getCastActivity(item) {
  const activities = getActivities(item);
  return activities.find(a => a.type === "cast" || a.type === "utility" || a.type === "save" || a.type === "attack" || a.type === "heal" || a.type === "damage")
    ?? activities[0]
    ?? null;
}

/**
 * Midi-QOL labels its generic activities "Midi Heal", "Midi - Heal", "Midi Use", and similar.
 * Those are not the player-facing action. A potion should read as the potion.
 * @param {string} name
 * @returns {boolean}
 */
export function isGenericMidiActivityName(name) {
  const normalized = String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized === "midi"
    || normalized.startsWith("midi ")
    || normalized === "midiqol"
    || normalized.startsWith("midiqol ");
}

/**
 * Wedge label for an item activity. Real activity names stay (Hex Damage).
 * Generic Midi-QOL names fall back to the item (Potion of Healing).
 * @param {Item} item
 * @param {object|null} activity
 * @returns {string}
 */
export function activityOptionName(item, activity) {
  const activityName = String(activity?.name ?? "").trim();
  const itemName = String(item?.name ?? "").trim();
  if (!activityName || isGenericMidiActivityName(activityName)) return itemName || activityName;
  return activityName;
}

/**
 * Bonus Action / Reaction leaf options from matching activities (or legacy activation).
 * @param {Actor} actor
 * @param {"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getActivationOptions(actor, activation) {
  const options = [];
  const seen = new Set();

  for (const item of actor.items ?? []) {
    // Class feats are grouped/nested via getClassFeatureOptions (activation-aware).
    // Spells are listed by economy (Cast Spell / bonus spell wedges), not as activities.
    if (item.type === "feat" || item.type === "spell") continue;

    const activities = getActivities(item);
    if (activities.length) {
      for (const activity of activities) {
        if (getActivationType(activity, item) !== activation) continue;
        const key = `${item.id}:${activity.id ?? activity._id ?? activity.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const available = canAttemptUse(activity, item);
        options.push({
          id: `act:${key}`,
          name: activityOptionName(item, activity),
          img: itemArtwork(item, activity) || getDefaultIcon(item.type),
          item,
          activity,
          available: available.ok,
          reason: available.reason,
          requiresTarget: optionRequiresTarget(activity, item),
          tooltip: sheetItemTooltip(item, {
            title: activityOptionName(item, activity),
            activity,
            reason: available.ok ? "" : available.reason
          })
        });
      }
    } else if ((item.system?.activation?.type ?? "") === activation) {
      const key = `item:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const available = canAttemptUse(null, item);
      options.push({
        id: key,
        name: item.name,
        img: itemArtwork(item, null) || getDefaultIcon(item.type),
        item,
        activity: null,
        available: available.ok,
        reason: available.reason,
        requiresTarget: optionRequiresTarget(null, item),
        tooltip: sheetItemTooltip(item, {
          title: item.name,
          reason: available.ok ? "" : available.reason
        })
      });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {object|null} activity
 * @param {Item} item
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canAttemptUse(activity, item) {
  if (!item) return { ok: false, reason: t("Notify.Unavailable") };
  // OBSERVER may browse/proxy; OWNER/GM execute. Block only true limited viewers.
  if (!item.isOwner && !game.user?.isGM) {
    const actor = item.actor;
    const observer = !!(
      actor?.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
      || actor?.testUserPermission?.(game.user, "OBSERVER")
    );
    if (!observer) {
      return { ok: false, reason: t("Notify.Unavailable") };
    }
  }
  if (activity && activity.canUse === false) {
    return { ok: false, reason: t("Notify.Unavailable") };
  }
  if (item.type === "spell") {
    const { method, prepared } = spellCastingState(item);
    if (spellMethodPrepares(method) && prepared <= 0) {
      return { ok: false, reason: "Spell is not prepared." };
    }
  }
  return { ok: true };
}

/**
 * @param {object|null} activity
 * @param {Item} item
 * @returns {boolean}
 */
export function optionRequiresTarget(activity, item) {
  const target = activity?.target ?? item?.system?.target;
  if (!target) {
    // Attack activities / weapons typically need a target
    if (activity?.type === "attack" || item?.type === "weapon") return true;
    return false;
  }

  const affectsType = target.affects?.type ?? target.type ?? "";
  const templateType = target.template?.type ?? "";
  if (affectsType === "self" || affectsType === "") {
    if (activity?.type === "attack" || item?.type === "weapon") return true;
    // AoE template spells often place a template rather than needing a token target
    if (templateType) return false;
    return false;
  }
  if (["creature", "enemy", "ally", "object", "any"].includes(affectsType)) return true;
  if (target.value && !templateType) return true;
  if (activity?.type === "attack" || item?.type === "weapon") return true;
  return false;
}

/**
 * Spell tooltip fields for the spell ring.
 * @param {Item} item
 * @param {object|null} activity
 */
export function buildSpellTooltipData(item, activity) {
  return sheetItemTooltip(item, {
    activity,
    targets: formatTargets(activity, item),
    range: formatRange(activity, item),
    duration: formatDuration(activity, item),
    damage: formatDamage(activity, item)
  });
}

const DESCRIPTION_LIMIT = 420;

/**
 * Plain-text description for a sheet item, preferring a real activity description.
 * @param {Item|null|undefined} item
 * @param {object|null|undefined} [activity]
 * @returns {string}
 */
export function itemDescriptionText(item, activity = null) {
  const useActivity = activity && !isGenericMidiActivityName(activity.name);
  const fromActivity = useActivity ? plainText(
    activity?.description?.value
    ?? (typeof activity?.description === "string" ? activity.description : "")
    ?? activity?.system?.description?.value
    ?? ""
  ) : "";
  const fromItem = plainText(item?.system?.description?.value ?? item?.system?.description ?? "");
  const text = fromActivity || fromItem;
  if (!text) return "";
  return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}

/**
 * Hover card for a sheet item: its description, plus an optional note (uses, quantity).
 * @param {Item|null|undefined} item
 * @param {{ title?: string, activity?: object|null, note?: string, reason?: string, fallback?: string, targets?: string|null, range?: string|null, duration?: string|null, damage?: string|null }} [extras]
 */
export function sheetItemTooltip(item, extras = {}) {
  const description = itemDescriptionText(item, extras.activity ?? null);
  const parts = [extras.note, description, extras.reason].map(part => String(part ?? "").trim()).filter(Boolean);
  if (!parts.length) parts.push(extras.fallback || t("Tooltip.NoDescription"));
  let title = extras.title || item?.name || "";
  if (isGenericMidiActivityName(title)) title = String(item?.name ?? "").trim() || title;
  const tip = {
    title,
    description: parts.join(" ")
  };
  if (extras.targets != null && extras.targets !== "") tip.targets = extras.targets;
  if (extras.range != null && extras.range !== "") tip.range = extras.range;
  if (extras.duration != null && extras.duration !== "") tip.duration = extras.duration;
  if (extras.damage != null && extras.damage !== "") tip.damage = extras.damage;
  return tip;
}

function plainText(raw) {
  if (raw == null || raw === "") return "";
  const text = typeof raw === "string" ? raw : String(raw?.value ?? raw);
  const stripped = text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return replaceEnrichers(decodeEntities(stripped))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Foundry text enrichers (&Reference, @UUID, [[/r]]) become the label a player reads.
 * @param {string} text
 * @returns {string}
 */
function replaceEnrichers(text) {
  let out = text.replace(
    /&Reference\[([^\]]*)\](?:\{([^}]*)\})?/gi,
    (match, config, label, offset, whole) => referenceLabel(config, label, whole.slice(0, offset))
  );
  out = out.replace(
    /@([A-Za-z][\w-]*)\[([^\]]*)\](?:\{([^}]*)\})?/g,
    (match, type, id, label, offset, whole) => {
      if (label) return choosePlural(label, whole.slice(0, offset));
      if (/^(embed|pdf)$/i.test(type)) return "";
      return readableId(id);
    }
  );
  out = out.replace(/\[\[([\s\S]*?)\]\]/g, (_, body) => inlineRollLabel(body));
  out = out.replace(
    /([\p{L}][\p{L}'’-]{0,40}(?: [\p{L}][\p{L}'’-]{0,40}){0,4});([\p{L}][\p{L}'’-]{0,40}(?: [\p{L}][\p{L}'’-]{0,40}){0,4})/gu,
    (match, singular, plural, offset, whole) => {
      if (!isPluralPair(singular, plural)) return match;
      return choosePlural(`${singular};${plural}`, whole.slice(0, offset));
    }
  );
  return out;
}

/**
 * @param {string} config
 * @param {string|undefined} label
 * @param {string} before
 */
function referenceLabel(config, label, before) {
  if (label && String(label).trim()) return choosePlural(label, before);
  return readableId(config);
}

/**
 * `{singular;plural}` follows a leading count. One, or no count, uses the singular.
 * @param {string} label
 * @param {string} before
 */
function choosePlural(label, before) {
  const parts = String(label).split(";").map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const count = precedingCount(before);
  return count != null && count !== 1 ? parts[1] : parts[0];
}

function precedingCount(before) {
  const match = String(before).match(/(\d+)\s*$/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

function isPluralPair(singular, plural) {
  const one = singular.toLowerCase();
  const many = plural.toLowerCase();
  if (one === many) return true;
  if (many === `${one}s` || many === `${one}es`) return true;
  if (one.endsWith("y") && many === `${one.slice(0, -1)}ies`) return true;
  if (one.endsWith("f") && many === `${one.slice(0, -1)}ves`) return true;
  if (one.endsWith("fe") && many === `${one.slice(0, -2)}ves`) return true;
  return many.startsWith(one) && many.length - one.length <= 3;
}

function readableId(id) {
  const tail = String(id ?? "").split(/[#?]/)[0].split(".").pop() ?? "";
  if (!tail || /^[a-f0-9]{16,}$/i.test(tail)) return "";
  return tail.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function inlineRollLabel(body) {
  let rest = String(body).trim();
  const kindMatch = rest.match(/^\/([a-z]+)\s*/i);
  if (kindMatch) {
    const kind = kindMatch[1].toLowerCase();
    rest = rest.slice(kindMatch[0].length);
    if (kind === "lookup") return "";
  }
  rest = rest.split("#")[0].split("|")[0].trim();
  return rest.replace(/\[([^\]]+)\]/g, " $1").replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function formatTargets(activity, item) {
  const target = activity?.target ?? item?.system?.target;
  if (!target) return t("Tooltip.EmDash");

  const parts = [];
  const affects = target.affects ?? {};
  const template = target.template ?? {};

  if (affects.type) {
    const count = affects.count || affects.value || target.value;
    parts.push(count ? `${count} ${affects.type}` : String(affects.type));
  } else if (target.type) {
    const count = target.value;
    parts.push(count ? `${count} ${target.type}` : String(target.type));
  }

  if (template.type) {
    const size = template.size || template.value;
    parts.push(size ? `${size}${template.units ? ` ${template.units}` : ""} ${template.type}` : template.type);
  }

  return parts.length ? parts.join(" · ") : t("Tooltip.EmDash");
}

function formatRange(activity, item) {
  const range = activity?.range ?? item?.system?.range;
  if (!range) return t("Tooltip.EmDash");
  if (range.units === "self") return "Self";
  if (range.units === "touch") return "Touch";
  const value = range.value ?? range.reach;
  const units = range.units ?? "";
  if (value == null || value === "") return units || t("Tooltip.EmDash");
  return `${value} ${units}`.trim();
}

function formatDuration(activity, item) {
  const duration = activity?.duration ?? item?.system?.duration;
  if (!duration) return "Instant";
  if (!duration.units || duration.units === "inst") return "Instant";
  const value = duration.value;
  return value != null && value !== ""
    ? `${value} ${duration.units}`
    : String(duration.units);
}

function formatDamage(activity, item) {
  const parts = [];

  const activityParts = activity?.damage?.parts;
  if (Array.isArray(activityParts) && activityParts.length) {
    for (const part of activityParts) {
      // 4.x parts may be objects { number, denomination, types } or legacy [formula, type]
      if (Array.isArray(part)) {
        const [formula, type] = part;
        parts.push(type ? `${formula} ${type}` : String(formula));
      } else if (part && typeof part === "object") {
        const formula = part.custom?.formula
          || (part.number != null && part.denomination != null ? `${part.number}d${part.denomination}` : part.formula)
          || "";
        const types = Array.isArray(part.types)
          ? Array.from(part.types).join(", ")
          : (part.type ?? "");
        if (formula) parts.push(types ? `${formula} ${types}` : formula);
      }
    }
  }

  const legacy = item?.system?.damage?.parts;
  if (!parts.length && Array.isArray(legacy)) {
    for (const [formula, type] of legacy) {
      parts.push(type ? `${formula} ${type}` : String(formula));
    }
  }

  return parts.length ? parts.join(" + ") : null;
}

export { MODULE_ID };

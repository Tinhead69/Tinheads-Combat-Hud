/**
 * Ability checks & saving throws for the Checks main wedge.
 * Uses dnd5e Actor roll helpers — never invents modifiers.
 */

import { t } from "./actor-options.mjs";
import { CHROME } from "./module-icons.mjs";

/** Stable ability order (PHB). */
export const ABILITY_IDS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

const FALLBACK_LABELS = Object.freeze({
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
});

/**
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getAbilityOptions(actor) {
  return ABILITY_IDS.map(abilityId => {
    const abl = actor?.system?.abilities?.[abilityId] ?? {};
    const mod = Number.isFinite(Number(abl.mod)) ? Number(abl.mod) : null;
    const save = Number.isFinite(Number(abl.save)) ? Number(abl.save) : mod;
    const name = abilityLabel(abilityId);
    return {
      id: `ability:${abilityId}`,
      kind: "ability",
      abilityId,
      name,
      img: CHROME.abilities[abilityId] || CHROME.fallback,
      mod,
      save,
      available: true,
      tooltip: {
        title: name,
        description: formatAbilityHint(mod, save)
      }
    };
  });
}

/**
 * Check | Save nest under a hovered ability.
 * @param {object} abilityOption
 * @returns {Array<object>}
 */
export function getAbilityRollOptions(abilityOption) {
  const id = abilityOption.abilityId;
  const name = abilityOption.name;
  return [
    {
      id: `ability:${id}:check`,
      kind: "ability-check",
      abilityId: id,
      name: t("Checks.Check"),
      img: CHROME.check,
      available: true,
      tooltip: {
        title: `${name} — ${t("Checks.Check")}`,
        description: modLine(abilityOption.mod, "Checks.Mod")
      }
    },
    {
      id: `ability:${id}:save`,
      kind: "ability-save",
      abilityId: id,
      name: t("Checks.Save"),
      img: CHROME.save,
      available: true,
      tooltip: {
        title: `${name} — ${t("Checks.Save")}`,
        description: modLine(
          abilityOption.save ?? abilityOption.mod,
          "Checks.SaveMod"
        )
      }
    }
  ];
}

/**
 * Call dnd5e roll helpers with 3.x/4.x compatibility.
 * @param {Actor} actor
 * @param {object} option ability-check | ability-save
 */
export async function rollAbilityHudOption(actor, option) {
  if (!actor || !option?.abilityId) {
    throw new Error("Missing actor or ability for roll");
  }
  const ability = option.abilityId;

  if (option.kind === "ability-check") {
    if (typeof actor.rollAbilityCheck === "function") {
      return actor.rollAbilityCheck({ ability });
    }
    if (typeof actor.rollAbilityTest === "function") {
      return callLegacyRoll(actor.rollAbilityTest.bind(actor), ability);
    }
    throw new Error("Actor.rollAbilityCheck / rollAbilityTest unavailable");
  }

  if (option.kind === "ability-save") {
    if (typeof actor.rollSavingThrow === "function") {
      return actor.rollSavingThrow({ ability });
    }
    if (typeof actor.rollAbilitySave === "function") {
      return callLegacyRoll(actor.rollAbilitySave.bind(actor), ability);
    }
    throw new Error("Actor.rollSavingThrow / rollAbilitySave unavailable");
  }

  throw new Error(`Unknown ability roll kind: ${option.kind}`);
}

async function callLegacyRoll(fn, ability) {
  // Newer shims accept { ability }; older 3.0 builds took the id string.
  try {
    return await fn({ ability });
  } catch (_) {
    return fn(ability);
  }
}

function abilityLabel(abilityId) {
  const cfg = CONFIG?.DND5E?.abilities?.[abilityId];
  if (cfg?.label) {
    return game.i18n?.localize?.(cfg.label) || cfg.label;
  }
  return FALLBACK_LABELS[abilityId] || abilityId.toUpperCase();
}

function formatAbilityHint(mod, save) {
  const parts = [];
  if (mod != null) parts.push(modLine(mod, "Checks.Mod"));
  if (save != null && save !== mod) parts.push(modLine(save, "Checks.SaveMod"));
  return parts.join(" · ") || t("Checks.AbilityHint");
}

function modLine(value, key) {
  if (value == null || Number.isNaN(Number(value))) return t("Checks.AbilityHint");
  const n = Number(value);
  const signed = n >= 0 ? `+${n}` : String(n);
  return t(key, { mod: signed });
}

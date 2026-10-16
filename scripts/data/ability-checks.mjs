/**
 * Ability checks & saving throws for the Checks main wedge.
 * Uses dnd5e Actor roll helpers — never invents modifiers.
 */

import { t } from "./actor-options.mjs";
import { isMonsterActor } from "./monster-hud.mjs";
import { CHROME } from "./module-icons.mjs";

/** Stable ability order (PHB). */
export const ABILITY_IDS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/** PHB skill order. Configured skills replace this list when the system provides one. */
const SKILL_ORDER = Object.freeze([
  ["acr", "Acrobatics", "dex"],
  ["ani", "Animal Handling", "wis"],
  ["arc", "Arcana", "int"],
  ["ath", "Athletics", "str"],
  ["dec", "Deception", "cha"],
  ["his", "History", "int"],
  ["ins", "Insight", "wis"],
  ["itm", "Intimidation", "cha"],
  ["inv", "Investigation", "int"],
  ["med", "Medicine", "wis"],
  ["nat", "Nature", "int"],
  ["prc", "Perception", "wis"],
  ["prf", "Performance", "cha"],
  ["per", "Persuasion", "cha"],
  ["rel", "Religion", "int"],
  ["slt", "Sleight of Hand", "dex"],
  ["ste", "Stealth", "dex"],
  ["sur", "Survival", "wis"]
]);

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
 * First ring under Checks: Saves and Skills. Death Saves are for player characters.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getChecksMenuOptions(actor) {
  const options = [
    {
      id: "checks:saves",
      kind: "checks-branch",
      branch: "saves",
      name: t("Checks.Saves"),
      img: CHROME.save,
      available: true,
      tooltip: {
        title: t("Checks.Saves"),
        description: t("Checks.SavesHint")
      }
    },
    {
      id: "checks:skills",
      kind: "checks-branch",
      branch: "skills",
      name: t("Checks.Skills"),
      img: CHROME.check,
      available: true,
      tooltip: {
        title: t("Checks.Skills"),
        description: t("Checks.SkillsHint")
      }
    }
  ];
  if (!isMonsterActor(actor)) options.push(deathSaveOption(actor));
  return options;
}

/**
 * Saving throws, one wedge per ability.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getSavingThrowOptions(actor) {
  return ABILITY_IDS.map(abilityId => {
    const abl = actor?.system?.abilities?.[abilityId] ?? {};
    const save = Number.isFinite(Number(abl.save)) ? Number(abl.save) : null;
    const name = abilityLabel(abilityId);
    return {
      id: `save:${abilityId}`,
      kind: "ability-save",
      abilityId,
      name,
      img: CHROME.abilities[abilityId] || CHROME.save,
      available: true,
      tooltip: {
        title: `${name} — ${t("Checks.Save")}`,
        description: modLine(save, "Checks.SaveMod")
      }
    };
  });
}

/**
 * Every skill on the actor, plus the system's skill list.
 * `proficiency` is "proficient", "expertise", or null.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getSkillOptions(actor) {
  const known = actor?.system?.skills ?? {};
  return skillCatalog(actor).map(row => {
    const data = known[row.id] ?? {};
    const abilityId = data.ability || row.ability || "dex";
    const mod = skillCheckMod(data);
    const name = skillLabel(row.id, row.label);
    const proficiency = skillProficiency(data);
    return {
      id: `skill:${row.id}`,
      kind: "skill-check",
      skillId: row.id,
      abilityId,
      name,
      img: CHROME.abilities[abilityId] || CHROME.check,
      proficiency,
      available: true,
      tooltip: {
        title: name,
        description: skillHint(mod, proficiency, abilityLabel(abilityId))
      }
    };
  });
}

/**
 * Call dnd5e roll helpers with 3.x/4.x compatibility.
 * @param {Actor} actor
 * @param {object} option ability-check | ability-save | skill-check | death-save
 */
export async function rollAbilityHudOption(actor, option) {
  if (!actor) throw new Error("Missing actor or ability for roll");

  if (option?.kind === "skill-check") {
    if (!option.skillId) throw new Error("Missing skill for roll");
    return rollSkillCheck(actor, option.skillId);
  }

  if (option?.kind === "death-save") {
    return rollDeathSave(actor);
  }

  if (!option?.abilityId) {
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

async function rollDeathSave(actor) {
  if (typeof actor.rollDeathSave !== "function") {
    throw new Error("Actor.rollDeathSave unavailable");
  }
  try {
    return await actor.rollDeathSave({});
  } catch (_) {
    return actor.rollDeathSave();
  }
}

/**
 * Stealth and other skill checks. dnd5e 4+ takes { skill }; 3.x takes the skill id.
 * @param {Actor} actor
 * @param {string} skillId
 */
async function rollSkillCheck(actor, skillId) {
  if (typeof actor.rollSkill !== "function") {
    throw new Error("Actor.rollSkill unavailable");
  }
  const version = String(game.system?.version ?? "");
  const modern = typeof foundry?.utils?.isNewerVersion === "function"
    ? foundry.utils.isNewerVersion(version || "0.0.0", "3.9.99")
    : true;
  if (modern) return actor.rollSkill({ skill: skillId });
  return actor.rollSkill(skillId);
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

function deathSaveOption(actor) {
  const death = actor?.system?.attributes?.death ?? {};
  const success = Number.isFinite(Number(death.success)) ? Number(death.success) : 0;
  const failure = Number.isFinite(Number(death.failure)) ? Number(death.failure) : 0;
  return {
    id: "checks:death-save",
    kind: "death-save",
    name: t("Checks.DeathSave"),
    img: CHROME.save,
    available: true,
    tooltip: {
      title: t("Checks.DeathSave"),
      description: t("Checks.DeathSaveProgress", { success, failure })
    }
  };
}

function skillCatalog(actor) {
  const configured = CONFIG?.DND5E?.skills;
  const rows = [];
  const seen = new Set();
  if (configured && typeof configured === "object" && Object.keys(configured).length) {
    for (const [id, cfg] of Object.entries(configured)) {
      seen.add(id);
      rows.push({ id, label: cfg?.label, ability: cfg?.ability });
    }
  } else {
    for (const [id, label, ability] of SKILL_ORDER) {
      seen.add(id);
      rows.push({ id, label, ability });
    }
  }
  for (const id of Object.keys(actor?.system?.skills ?? {}).filter(key => !seen.has(key)).sort()) {
    const data = actor.system.skills[id] ?? {};
    rows.push({ id, label: data.label, ability: data.ability });
  }
  return rows;
}

function skillLabel(skillId, label) {
  if (typeof label === "string" && label) {
    return game.i18n?.localize?.(label) || label;
  }
  const fallback = SKILL_ORDER.find(row => row[0] === skillId);
  return fallback?.[1] || skillId;
}

function skillCheckMod(skill) {
  for (const key of ["total", "mod"]) {
    const n = Number(skill?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * dnd5e stores the proficiency multiplier on skill.value (0, 0.5, 1, 2).
 * Half proficiency stays unmarked. 1 is proficient. 2 or more is expertise.
 * @param {object} skill
 * @returns {"proficient"|"expertise"|null}
 */
function skillProficiency(skill) {
  const raw = skill?.value ?? skill?.proficient ?? 0;
  const rank = Number(raw);
  if (!Number.isFinite(rank) || rank < 1) return null;
  return rank >= 2 ? "expertise" : "proficient";
}

function skillHint(mod, proficiency, abilityName) {
  const parts = [];
  if (abilityName) parts.push(abilityName);
  if (mod != null) parts.push(modLine(mod, "Checks.Mod"));
  if (proficiency === "expertise") parts.push(t("Checks.Expertise"));
  else if (proficiency === "proficient") parts.push(t("Checks.Proficient"));
  return parts.join(" · ") || t("Checks.SkillHint");
}

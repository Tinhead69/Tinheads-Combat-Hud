/** One completed skill check consumes Help; cancelled prompts keep it. */
import { MODULE_ID, t } from "./actor-options.mjs";

function helpEffects(actor) {
  return Array.from(actor?.effects ?? []).filter(effect =>
    !effect.disabled && !effect.isSuppressed && effect.flags?.[MODULE_ID]?.help);
}

export async function grantHelp(actor, targetUuids) {
  if (targetUuids?.length !== 1) return invalidTarget();
  const token = await fromUuid(targetUuids[0]);
  const target = token?.actor;
  const friendly = globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;
  if (token?.documentName !== "Token" || !target || target.uuid === actor?.uuid
    || token.disposition !== friendly) return invalidTarget();

  // Repeated Help does not bank additional checks or stack advantage.
  if (!helpEffects(target).length) {
    await target.createEmbeddedDocuments("ActiveEffect", [{
      name: t("BasicActions.Help"),
      img: "icons/svg/upgrade.svg",
      description: t("BasicActions.HelpHint"),
      type: "base",
      transfer: false,
      system: { changes: [], origin: { actor: actor.uuid } },
      duration: { value: null, units: "seconds", expiry: null },
      flags: { [MODULE_ID]: { help: true } }
    }]);
  }
  return target;
}

function invalidTarget() {
  ui.notifications.warn(t("BasicActions.HelpTarget"));
  return false;
}

let registered = false;
export function registerHelpHooks() {
  if (registered) return;
  registered = true;
  // dnd5e 6 passes the process config, whose subject is the rolling actor.
  Hooks.on("dnd5e.preRollSkillV2", config => {
    const ids = helpEffects(config.subject).map(effect => effect.id);
    if (!ids.length) return;
    config.advantage = true;
    for (const roll of config.rolls ?? []) {
      roll.options ??= {};
      roll.options.tchHelpEffects = ids;
    }
  });
  Hooks.on("dnd5e.rollSkillV2", (rolls, { subject }) => {
    const ids = new Set(rolls.filter(roll => roll._evaluated)
      .flatMap(roll => roll.options?.tchHelpEffects ?? []));
    const consumed = helpEffects(subject).filter(effect => ids.has(effect.id)).map(effect => effect.id);
    if (consumed.length) {
      return subject.deleteEmbeddedDocuments("ActiveEffect", consumed).catch(err => {
        console.error(`${MODULE_ID} | consuming Help failed`, err);
        ui.notifications.error(t("BasicActions.HelpCleanupFailed"));
      });
    }
  });
}

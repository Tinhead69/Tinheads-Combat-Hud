import { MODULE_ID, t } from "./actor-options.mjs";
import { isActiveCombatant } from "./combat-turn.mjs";
import { getSelectedTargetUuids } from "./permissions.mjs";

const declarations = new Set();
const releasing = new Set();
const windows = new Map();

export async function readyHudOption(option, actor, token) {
  if (option.available === false) return warn(option.reason || t("Notify.Unavailable"));
  if (!actor || (!actor.isOwner && !game.user?.isGM)) return warn(t("ReadyAction.OwnerOnly"));
  const combat = game.combat;
  const combatant = combat?.combatant;
  if (!combat?.started || !isActiveCombatant(token ?? actor, combatant)) {
    return warn(t("ReadyAction.YourTurn"));
  }
  const key = `${combat.id}.${combatant.id}`;
  if (declarations.has(key) || Array.from(game.messages).some(message => {
    const ready = message.getFlag(MODULE_ID, "readyAction");
    return ready?.combatId === combat.id && ready.combatantId === combatant.id
      && ready.round === combat.round && ready.turn === combat.turn;
  })) return warn(t("ReadyAction.AlreadyDeclared"));

  declarations.add(key);
  try {
    const manual = option.basicId === "ready-other" || (option.basicId === "unarmed" && !option.item);
    const item = option.activity?.item ?? option.item;
    const activity = option.activity;
    if (!manual && (!item?.uuid || typeof activity?.consume !== "function"
      || typeof activity._prepareUsageConfig !== "function" || activity.canUse === false)) {
      return warn(t("ReadyAction.Unsupported"));
    }

    const ready = {
      actorUuid: actor.uuid, actorName: actor.name,
      itemUuid: item?.uuid ?? null, activityId: activity?.id ?? null,
      weapon: option.kind === "weapon" || option.kind === "weapon-attack",
      name: option.kind === "weapon-attack" ? item.name : option.name,
      combatId: combat.id, combatantId: combatant.id, round: combat.round, turn: combat.turn,
      state: "held"
    };
    const other = option.basicId === "ready-other";
    const details = await promptDeclaration(other);
    if (!details) return false;
    if (other && !details.name) return warn(t("ReadyAction.ActionNameRequired"));
    if (details.name) ready.name = details.name;
    ready.trigger = details.trigger;
    if (game.paused || game.combat !== combat || combat.round !== ready.round || combat.turn !== ready.turn
      || combat.combatant?.id !== ready.combatantId) return warn(t("ReadyAction.YourTurn"));

    const receipt = { create: false, data: {} };
    let message;
    try {
      if (!manual) {
        // Run native consumption without activating the spell or attack.
        const usage = activity._prepareUsageConfig({ concentration: { begin: false } });
        const consumed = await activity.consume(usage, receipt);
        if (consumed === false) {
          // A post-consumption hook can cancel after the resources were updated.
          if (receipt.data.system?.deltas) throw new Error("Ready consumption cancelled after spending resources");
          return false;
        }
        ready.usage = { spell: usage.spell ?? null, scaling: usage.scaling ?? null };
      }
      const Chat = CONFIG.ChatMessage?.documentClass ?? ChatMessage;
      message = await Chat.create({
        speaker: ChatMessage.getSpeaker({ actor, token }),
        content: readyCard(ready),
        flags: { [MODULE_ID]: { readyAction: ready } }
      });
      if (!message) throw new Error("Ready chat card creation was cancelled");
    } catch (error) {
      const deltas = receipt.data?.system?.deltas;
      if (deltas) await activity.refund(deltas);
      throw error;
    }
    if (readyExpired(ready, combat)) await setReadyState(message, ready, "expired");
    else showReadyWindow(message);
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Ready declaration failed`, error);
    return warn(t("Notify.ResolveFailed"));
  } finally {
    declarations.delete(key);
  }
}

async function promptDeclaration(manual) {
  const Dialog = foundry.applications.api.DialogV2;
  return Dialog.wait({
    window: { title: t("BasicActions.Ready") },
    modal: true,
    rejectClose: false,
    content: `${manual ? `<p><label>${escape(t("ReadyAction.ActionName"))} <input name="actionName" required></label></p>` : ""}
      <p><label>${escape(t("ReadyAction.Trigger"))} <input name="trigger"></label></p>
      <p>${escape(t("ReadyAction.SpendHint"))}</p>`,
    buttons: [{ action: "hold", label: t("ReadyAction.Hold"), default: true,
      callback: (_event, button) => {
        const data = new FormData(button.form);
        return { name: data.get("actionName")?.trim(), trigger: data.get("trigger")?.trim() };
      }
    }, { action: "cancel", label: t("ReadyAction.Cancel"), callback: () => null }]
  });
}

// Readied actions are available only during the round in which they were held.
export function readyExpired(ready, combat) {
  if (!combat?.started || combat.id !== ready.combatId) return true;
  return combat.round > ready.round || !combat.turns.some(entry => entry.id === ready.combatantId);
}

function readyCard(ready) {
  const state = ready.state;
  const label = { held: "Held", releasing: "Releasing", completed: "Completed", expired: "Expired" }[state];
  return `<div class="tinheads-combat-hud basic-action">
    <h3>${escape(t("BasicActions.Ready"))} · ${escape(ready.name)}</h3>
    <p>${escape(ready.actorName)} · ${escape(t(`ReadyAction.${label}`))}</p>
    ${ready.trigger ? `<p><strong>${escape(t("ReadyAction.Trigger"))}</strong> ${escape(ready.trigger)}</p>` : ""}
    ${state === "held" ? `<button type="button" data-tch-ready>${escape(t("ReadyAction.Open"))}</button>` : ""}
  </div>`;
}

function setReadyState(message, ready, state) {
  return message.update({
    content: readyCard({ ...ready, state }),
    [`flags.${MODULE_ID}.readyAction.state`]: state
  });
}

function showReadyWindow(message) {
  const ready = message.getFlag(MODULE_ID, "readyAction");
  if (ready?.state !== "held" || message.author?.id !== game.user.id) return;
  if (readyExpired(ready, game.combats.get(ready.combatId))) {
    void expireReadyActions();
    return;
  }
  if (windows.has(message.id)) return windows.get(message.id).bringToFront();
  const Dialog = foundry.applications.api.DialogV2;
  const dialog = new Dialog({
    window: { title: t("ReadyAction.Open") },
    position: { top: 90, left: 100, width: 360 },
    modal: false,
    content: `<p>${escape(t("ReadyAction.Holding", { actor: ready.actorName, action: ready.name }))}</p>
      ${ready.trigger ? `<p><strong>${escape(t("ReadyAction.Trigger"))}</strong> ${escape(ready.trigger)}</p>` : ""}
      <p>${escape(t("ReadyAction.ExpiryHint"))}</p>`,
    buttons: [{ action: "release", label: t("ReadyAction.Release"),
      callback: () => { void releaseReadyAction(message); }
    }]
  });
  dialog.addEventListener("close", () => {
    if (windows.get(message.id) === dialog) windows.delete(message.id);
  }, { once: true });
  windows.set(message.id, dialog);
  void dialog.render({ force: true });
}

function closeReadyWindow(message) {
  const dialog = windows.get(message.id);
  windows.delete(message.id);
  if (dialog) void dialog.close();
}

export async function releaseReadyAction(message) {
  const ready = message.getFlag(MODULE_ID, "readyAction");
  if (game.paused || ready?.state !== "held" || message.author?.id !== game.user.id
    || releasing.has(message.id)) return false;
  releasing.add(message.id);
  try {
    const combat = game.combats.get(ready.combatId);
    if (readyExpired(ready, combat)) {
      await setReadyState(message, ready, "expired");
      closeReadyWindow(message);
      return false;
    }
    const actor = await fromUuid(ready.actorUuid);
    if (!actor || (!actor.isOwner && !game.user.isGM)) return warn(t("ReadyAction.OwnerOnly"));
    const item = ready.itemUuid ? await fromUuid(ready.itemUuid) : null;
    const activity = item?.actor?.uuid === actor?.uuid ? item?.system?.activities?.get(ready.activityId) : null;
    if (ready.itemUuid && !activity) return warn(t("ReadyAction.Unsupported"));

    await setReadyState(message, ready, "releasing");
    let completed = false;
    try {
      if (!readyExpired(ready, combat)) completed = activity ? await useHeldActivity(activity, ready) : true;
    } finally {
      const state = completed ? "completed" : readyExpired(ready, combat) ? "expired" : "held";
      await setReadyState(message, ready, state);
      if (state !== "held") closeReadyWindow(message);
    }
    return completed;
  } catch (error) {
    console.error(`${MODULE_ID} | Ready release failed`, error);
    return warn(t("Notify.ResolveFailed"));
  } finally {
    releasing.delete(message.id);
  }
}

async function useHeldActivity(activity, ready) {
  // The slot or use has already been spent. Keep the same spell slot and scaling.
  const usage = { consume: false };
  if (ready.usage?.spell) usage.spell = ready.usage.spell;
  if (ready.usage?.scaling != null) usage.scaling = ready.usage.scaling;
  const midi = globalThis.MidiQOL;
  if (ready.weapon && game.modules.get("midi-qol")?.active && midi?.completeActivityUse) {
    usage.midiOptions = { targetUuids: getSelectedTargetUuids() };
    const result = await midi.completeActivityUse(activity, usage, { configure: false }, { create: true });
    return !!result && !result.aborted;
  }
  return !!(await activity.use(usage, { configure: false }, { create: true }));
}

async function expireReadyActions(combat, deleted = false) {
  for (const message of game.messages) {
    const author = message.author;
    const canExpire = author?.id === game.user.id || (!author?.active && game.users.activeGM?.id === game.user.id);
    if (!canExpire || releasing.has(message.id)) continue;
    const ready = message.getFlag(MODULE_ID, "readyAction");
    if (!ready || (combat && ready.combatId !== combat.id) || !["held", "releasing"].includes(ready.state)) continue;
    const encounter = combat ?? game.combats.get(ready.combatId);
    if (!deleted && !readyExpired(ready, encounter)) continue;
    try {
      await setReadyState(message, ready, "expired");
      closeReadyWindow(message);
    } catch (error) {
      console.error(`${MODULE_ID} | Ready expiry failed`, error);
    }
  }
}

export function registerReadyHooks() {
  Hooks.on("updateCombat", combat => void expireReadyActions(combat));
  Hooks.on("deleteCombat", combat => void expireReadyActions(combat, true));
  Hooks.on("deleteChatMessage", closeReadyWindow);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html.querySelector("[data-tch-ready]");
    if (!button) return;
    if (message.author?.id !== game.user.id) button.remove();
    else button.addEventListener("click", () => showReadyWindow(message));
  });
  void expireReadyActions();
}

function warn(message) {
  ui.notifications.warn(message);
  return false;
}

function escape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

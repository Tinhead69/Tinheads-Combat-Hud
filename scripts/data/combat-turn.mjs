/**
 * Combat tracker helpers — End Turn hub (local Owner/GM or socketlib proxy).
 */

import { t } from "./actor-options.mjs";
import { canResolveLocally, socketlibModuleActive } from "./permissions.mjs";

/**
 * Permission rule:
 * - Requires an active encounter with a current combatant
 * - GM / OWNER of current combatant: local nextTurn
 * - OBSERVER on current combatant actor: may request via socketlib (proxy)
 *
 * @returns {{ enabled: boolean, reason: string|null, combatant: object|null, proxy: boolean }}
 */
export function getEndTurnState() {
  const combat = game.combat;
  if (!combat) {
    return { enabled: false, reason: t("EndTurn.NoCombat"), combatant: null, proxy: false };
  }

  const combatant = combat.combatant ?? null;
  if (!combatant) {
    return { enabled: false, reason: t("EndTurn.NoCombatant"), combatant: null, proxy: false };
  }

  if (game.user?.isGM) {
    return { enabled: true, reason: null, combatant, proxy: false };
  }

  if (ownsCombatant(combatant)) {
    return { enabled: true, reason: null, combatant, proxy: false };
  }

  if (canProxyEndTurn(combatant)) {
    return { enabled: true, reason: null, combatant, proxy: true };
  }

  return { enabled: false, reason: t("EndTurn.NotYourTurn"), combatant, proxy: false };
}

function ownsCombatant(combatant) {
  if (!combatant || !game.user) return false;
  if (combatant.isOwner) return true;
  try {
    if (combatant.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
      return true;
    }
  } catch (_) {
    /* ignore */
  }
  const actor = combatant.actor;
  if (!actor) return false;
  return canResolveLocally(actor);
}

function canProxyEndTurn(combatant) {
  const actor = combatant?.actor;
  if (!actor || !game.user) return false;
  try {
    if (actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return true;
    if (actor.testUserPermission?.(game.user, "OBSERVER")) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Advance combat via Foundry 13 Combat#nextTurn(), or proxy to GM.
 * @returns {Promise<object>}
 */
export async function endCombatTurn() {
  const state = getEndTurnState();
  if (!state.enabled) {
    const err = new Error(state.reason || t("EndTurn.Unavailable"));
    err.tchEndTurn = true;
    throw err;
  }

  if (state.proxy) {
    if (!socketlibModuleActive()) {
      const err = new Error(t("Proxy.SocketlibMissing"));
      err.tchEndTurn = true;
      throw err;
    }
    const { requestRemoteEndTurn, isSocketReady } = await import("../net/socket.mjs");
    if (!isSocketReady()) {
      const err = new Error(t("Proxy.SocketlibMissing"));
      err.tchEndTurn = true;
      throw err;
    }
    const remote = await requestRemoteEndTurn();
    if (!remote?.ok) {
      const err = new Error(remote?.error || t("EndTurn.Unavailable"));
      err.tchEndTurn = true;
      throw err;
    }
    return remote;
  }

  return executeEndTurnPayload({ combat: game.combat });
}

/**
 * Authority-side (GM) execution — permission already checked by socket handler.
 * @param {{ combat?: Combat }} [ctx]
 */
export async function executeEndTurnPayload(ctx = {}) {
  const combat = ctx.combat ?? game.combat;
  if (!combat) {
    throw new Error(t("EndTurn.NoCombat"));
  }
  if (typeof combat.nextTurn !== "function") {
    throw new Error("Combat#nextTurn is not available in this Foundry build.");
  }
  return combat.nextTurn();
}

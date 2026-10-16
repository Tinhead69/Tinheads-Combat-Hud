/**
 * Combat tracker helpers — End Turn hub (local Owner/GM or socketlib proxy).
 */

import { t } from "./actor-options.mjs";
import { canResolveLocally, socketlibModuleActive } from "./permissions.mjs";

/**
 * Permission rule:
 * - Requires an active encounter whose current combatant is this HUD token
 * - GM / OWNER of that combatant: local nextTurn
 * - An owner who cannot update Combat proxies the request to the GM
 *
 * @param {TokenDocument|Actor|null} [subject] Token the HUD is open for, or its actor
 * @returns {{ enabled: boolean, reason: string|null, combatant: object|null, proxy: boolean }}
 */
export function getEndTurnState(subject = null) {
  const combat = game.combat;
  if (!combat) {
    return { enabled: false, reason: t("EndTurn.NoCombat"), combatant: null, proxy: false };
  }

  const combatant = combat.combatant ?? null;
  if (!combatant) {
    return { enabled: false, reason: t("EndTurn.NoCombatant"), combatant: null, proxy: false };
  }

  if (!isActiveCombatant(subject, combatant)) {
    return { enabled: false, reason: t("EndTurn.NotYourTurn"), combatant, proxy: false };
  }

  if (game.user?.isGM || ownsCombatant(combatant)) {
    const proxy = !game.user?.isGM && !canResolveLocally(combatant.actor);
    return { enabled: true, reason: null, combatant, proxy };
  }

  return { enabled: false, reason: t("EndTurn.NotYourTurn"), combatant, proxy: false };
}

/**
 * The HUD subject is the token (or actor) currently selected in the combat tracker.
 * @param {TokenDocument|Actor|null} subject
 * @param {object} combatant
 */
export function isActiveCombatant(subject, combatant) {
  if (!subject || !combatant) return false;
  const doc = subject.document ?? subject;
  const currentTokenId = combatant.tokenId ?? combatant.token?.id ?? null;
  const currentActorId = combatant.actorId ?? combatant.actor?.id ?? null;

  const isToken = doc.documentName === "Token" || doc.actor || doc.actorId;
  if (isToken) {
    const tokenId = doc.id ?? null;
    if (tokenId && currentTokenId) return tokenId === currentTokenId;
    const actorId = doc.actor?.id ?? doc.actorId ?? null;
    return !!actorId && !!currentActorId && !currentTokenId && actorId === currentActorId;
  }

  const actorId = doc.id ?? null;
  return !!actorId && actorId === currentActorId;
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

/**
 * Advance combat via Foundry 13 Combat#nextTurn(), or proxy to GM.
 * @param {TokenDocument|Actor|null} [subject]
 * @returns {Promise<object>}
 */
export async function endCombatTurn(subject = null) {
  const state = getEndTurnState(subject);
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

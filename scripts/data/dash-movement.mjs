/**
 * Dash grants extra movement equal to each speed the actor already has.
 * A turn-long active effect doubles walk, and fly/swim/climb/burrow when those are above 0.
 * The base speeds on the sheet are left alone.
 */

import { t } from "./actor-options.mjs";
import { moduleIcon } from "./module-icons.mjs";

const MOVEMENT_TYPES = Object.freeze(["walk", "fly", "swim", "climb", "burrow"]);

/**
 * ADD changes that double every movement type the actor can already use.
 * @param {object|null|undefined} movement actor.system.attributes.movement
 * @returns {Array<{ key: string, mode: number, value: string }>}
 */
export function dashMovementChanges(movement) {
  const mode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const changes = [];
  for (const type of MOVEMENT_TYPES) {
    const speed = Number(movement?.[type]);
    if (!Number.isFinite(speed) || speed <= 0) continue;
    changes.push({
      key: `system.attributes.movement.${type}`,
      mode,
      value: String(speed)
    });
  }
  return changes;
}

/**
 * @param {Actor|null|undefined} actor
 * @returns {Promise<Array<{ key: string, mode: number, value: string }>>}
 */
export async function grantDashMovement(actor) {
  const changes = dashMovementChanges(actor?.system?.attributes?.movement);
  if (!changes.length || typeof actor?.createEmbeddedDocuments !== "function") return changes;

  try {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: t("BasicActions.Dash"),
      img: moduleIcon("dash"),
      origin: actor.uuid ?? null,
      duration: dashDuration(),
      changes,
      flags: {
        "tinheads-combat-hud": { dash: true }
      }
    }]);
  } catch (err) {
    console.error("Tinhead's Combat Hud | dash movement failed", err);
  }
  return changes;
}

function dashDuration() {
  const combat = globalThis.game?.combat;
  if (combat?.started && combat.round != null) {
    return {
      combat: combat.id,
      rounds: 0,
      turns: 1,
      startRound: combat.round,
      startTurn: combat.turn ?? 0
    };
  }
  return { seconds: 6 };
}

/**
 * HUD screen placement: drag persistence + viewport clamping.
 * Keeps the radial (including open nests) inside the browser viewport.
 */

export const VIEWPORT_MARGIN = 14;
/** Movement past this (px) before hub pointerdown becomes a drag, not End Turn. */
export const DRAG_THRESHOLD_PX = 6;

const STORAGE_KEY = "tinheads-combat-hud:hud-center";

/**
 * Outermost ring radius for the current nest depth (SVG units ≈ CSS px at 1:1).
 * @param {object} state CombatHud.state
 * @param {object} rings RINGS constants
 */
export function contentOuterRadius(state, rings) {
  if (!state?.section) return rings.mainOuter;

  if (state.section === "checks") {
    return state.checksBranch ? rings.nest1Outer : rings.actionOuter;
  }
  if (state.section === "bonus" || state.section === "reaction") {
    if (state.castSpell && state.spellLevel != null) return rings.flatSpellOuter;
    if (state.opportunityOpen && state.weaponNestId) return rings.flatSpellOuter;
    if (state.useItem && state.useItemGroup) return rings.flatSpellOuter;
    if (state.featureNestId || state.castSpell || state.opportunityOpen || state.useItem) return rings.flatNestOuter;
    return rings.flatOuter;
  }
  if (state.section !== "action") return rings.mainOuter;

  let depth = 1;
  if (state.attackOpen || state.readyOpen || state.otherOpen || state.abilitiesOpen || state.legendaryOpen || state.useItem) depth = 2;
  if (state.useItem && state.useItemGroup) depth = 3;
  if (state.readyOpen && state.attackOpen) depth = 3;
  if (state.castSpell) depth += 1;
  if (state.spellLevel != null) depth += 1;
  if (state.weaponNestId) depth += 1;
  if (state.featureNestId && (state.abilitiesOpen || state.otherOpen)) depth += 1;
  depth = Math.min(depth, 4);
  if (depth <= 1) return rings.actionOuter;
  if (depth === 2) return rings.nest1Outer;
  if (depth === 3) return rings.nest2Outer;
  return rings.nest3Outer ?? rings.nest2Outer;
}

/**
 * Clamp HUD center so a circle of `radius` stays on-screen with margin.
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {{ width?: number, height?: number, margin?: number }} [opts]
 */
export function clampHudCenter(x, y, radius, opts = {}) {
  const margin = opts.margin ?? VIEWPORT_MARGIN;
  const width = opts.width ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  const height = opts.height ?? (typeof window !== "undefined" ? window.innerHeight : 720);
  const pad = Math.max(radius + margin, margin);
  // If the radial is wider than the viewport, pin to center on that axis.
  const minX = pad;
  const maxX = width - pad;
  const minY = pad;
  const maxY = height - pad;
  return {
    x: minX > maxX ? width / 2 : Math.min(maxX, Math.max(minX, x)),
    y: minY > maxY ? height / 2 : Math.min(maxY, Math.max(minY, y))
  };
}

/**
 * @returns {{ x: number, y: number }|null}
 */
export function loadHudPosition() {
  try {
    const flag = game?.user?.getFlag?.("tinheads-combat-hud", "hudCenter");
    if (flag && Number.isFinite(flag.x) && Number.isFinite(flag.y)) {
      return { x: flag.x, y: flag.y };
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const raw = localStorage?.getItem?.(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * @param {number} x
 * @param {number} y
 */
export async function saveHudPosition(x, y) {
  const pos = { x, y };
  try {
    localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(pos));
  } catch (_) {
    /* ignore */
  }
  try {
    if (game?.user?.setFlag) {
      await game.user.setFlag("tinheads-combat-hud", "hudCenter", pos);
    }
  } catch (_) {
    /* ignore */
  }
}

export function defaultHudCenter() {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 720;
  return { x: width / 2, y: height / 2 };
}

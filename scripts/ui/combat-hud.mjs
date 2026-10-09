/**
 * Viewport-centered radial Combat Hud UI.
 */

import {
  actorFromToken,
  canUseActor,
  getEquippedWeapons,
  getSpellLevels,
  t
} from "../data/actor-options.mjs";
import {
  buildActionRingEntries,
  buildEconomyRingEntries,
  getAttackNestEntries,
  getReadyNestEntries
} from "../data/basic-actions.mjs";
import { getEndTurnState, endCombatTurn } from "../data/combat-turn.mjs";
import { getUsableInventoryItems, layoutUseItemEntries } from "../data/use-items.mjs";
import {
  getClassFeatureOptions,
  getFeatureModeOptions,
  getOtherActionOptions
} from "../data/action-features.mjs";
import {
  getChecksMenuOptions,
  getSavingThrowOptions,
  getSkillOptions
} from "../data/ability-checks.mjs";
import { getSpecialWeaponOptions } from "../data/weapon-abilities.mjs";
import { getMonsterAttackNestOptions, getMonsterAttackOptions, getMonsterOpportunityAttacks, isMonsterActor } from "../data/monster-hud.mjs";
import { resolveHudOption } from "../data/resolve.mjs";
import {
  arcSegmentsForParent,
  centerArcOnIndex,
  mainSectionAngles,
  mainSectionById,
  sectionAnchor,
  sectionWedgePath,
  wedgeAnchor
} from "./radial-geometry.mjs";
import { appendHubArt, appendWedgeArt } from "./wedge-art.mjs";
import { applyIconPalette } from "./icon-color.mjs";
import { appendWedgeText, wedgeTextLayout } from "./wedge-text.mjs";
import {
  DRAG_THRESHOLD_PX,
  clampHudCenter,
  contentOuterRadius,
  defaultHudCenter,
  loadHudPosition,
  saveHudPosition
} from "./hud-placement.mjs";
import { CHROME, spellLevelIcon } from "../data/module-icons.mjs";

let _clipSeq = 0;
function nextClipId(prefix = "tch-clip") {
  _clipSeq += 1;
  return `${prefix}-${_clipSeq}`;
}

/**
 * Compact SVG viewBox + ring radii (px).
 * Every wedge has the same radial height. Rings are separated by a fixed gap.
 * Keep preview/radial-preview.html RINGS in sync with these values.
 */
export const SIZE = 760;
const CX = SIZE / 2;
const CY = SIZE / 2;
/** How long the open ring stays up after the pointer slips off it. */
const COLLAPSE_DELAY_MS = 500;
/** Radial thickness of every wedge, main sections included. */
const WEDGE_DEPTH = 62;
/** Clear gap between neighboring rings. */
const RING_GAP = 6;

/** @type {Readonly<{
 *  hub: number,
 *  mainInner: number, mainOuter: number,
 *  actionInner: number, actionOuter: number,
 *  nest1Inner: number, nest1Outer: number,
 *  nest2Inner: number, nest2Outer: number,
 *  nest3Inner: number, nest3Outer: number,
 *  flatInner: number, flatOuter: number,
 *  flatNestInner: number, flatNestOuter: number,
 *  flatSpellInner: number, flatSpellOuter: number
 * }>} */
const mainInner = 42;
const mainOuter = mainInner + WEDGE_DEPTH;
const actionInner = mainOuter + RING_GAP;
const actionOuter = actionInner + WEDGE_DEPTH;
const nest1Inner = actionOuter + RING_GAP;
const nest1Outer = nest1Inner + WEDGE_DEPTH;
const nest2Inner = nest1Outer + RING_GAP;
const nest2Outer = nest2Inner + WEDGE_DEPTH;
const nest3Inner = nest2Outer + RING_GAP;
const nest3Outer = nest3Inner + WEDGE_DEPTH;
export const RINGS = Object.freeze({
  hub: 34,
  mainInner,
  mainOuter,
  actionInner,
  actionOuter,
  nest1Inner,
  nest1Outer,
  nest2Inner,
  nest2Outer,
  nest3Inner,
  nest3Outer,
  flatInner: actionInner,
  flatOuter: actionOuter,
  flatNestInner: nest1Inner,
  flatNestOuter: nest1Outer,
  flatSpellInner: nest2Inner,
  flatSpellOuter: nest2Outer
});

/** @type {CombatHud|null} */
let activeHud = null;

export class CombatHud {
  /**
   * @param {Actor} actor
   * @param {TokenDocument|null} tokenDoc
   */
  constructor(actor, tokenDoc = null) {
    this.actor = actor;
    this.tokenDoc = tokenDoc;
    this.root = null;
    this.stage = null;
    this.svg = null;
    this.tooltipEl = null;
    this.position = defaultHudCenter();
    this._drag = null;
    this._onResize = this._onResize.bind(this);
    this.state = {
      section: null,       // action | checks | bonus | reaction
      castSpell: false,
      opportunityOpen: false,
      spellEconomy: "action",
      useItem: false,
      useItemGroup: null,  // potion | scroll nest inside Use Item
      weaponNestId: null,  // special weapon: its attack plus abilities
      useAbility: false,   // weapon ability modes nest open
      featureNestId: null, // multi-mode class feature (Channel Divinity, …)
      checksBranch: null,  // saves | skills nest under Checks
      spellLevel: null,    // number | null
      collapseTimer: null
    };
    /** @type {null|{ actionSegs: object[], actionEntries: object[], levelSegs: object[], levelInfos: object[] }} */
    this._layout = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onActorUpdate = this._onActorUpdate.bind(this);
    this._onCombatUpdate = this._onCombatUpdate.bind(this);
  }

  /**
   * @param {TokenDocument|Token} tokenLike
   * @returns {CombatHud|null}
   */
  static openForToken(tokenLike) {
    const actor = actorFromToken(tokenLike);
    if (!actor || !canUseActor(actor)) {
      ui.notifications.warn(t("Notify.NoActor"));
      return null;
    }
    return CombatHud.openForActor(actor, tokenLike?.document ?? tokenLike);
  }

  /**
   * @param {Actor} actor
   * @param {TokenDocument|null} tokenDoc
   */
  static openForActor(actor, tokenDoc = null) {
    if (activeHud) activeHud.close();
    const hud = new CombatHud(actor, tokenDoc);
    hud.render();
    activeHud = hud;
    return hud;
  }

  static closeActive() {
    if (activeHud) activeHud.close();
  }

  render() {
    this.root = document.createElement("div");
    this.root.className = "tch-root";
    this.root.dataset.tchHud = "1";

    const backdrop = document.createElement("div");
    backdrop.className = "tch-backdrop";
    backdrop.addEventListener("pointerdown", () => {
      if (this._drag?.active) return;
      this.close();
    });
    this.root.appendChild(backdrop);

    this.stage = document.createElement("div");
    this.stage.className = "tch-stage";
    this.root.appendChild(this.stage);

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("tch-radial");
    this.svg.setAttribute("width", String(SIZE));
    this.svg.setAttribute("height", String(SIZE));
    this.svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    this.svg.addEventListener("pointerleave", () => this._scheduleCollapse(null));
    this.svg.addEventListener("pointermove", (ev) => {
      if (!this.tooltipEl?.hidden) this._positionTooltip(ev);
    });
    this.stage.appendChild(this.svg);

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "tch-tooltip";
    this.tooltipEl.hidden = true;
    this.root.appendChild(this.tooltipEl);

    document.body.appendChild(this.root);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("resize", this._onResize);
    Hooks.on("updateActor", this._onActorUpdate);
    Hooks.on("updateItem", this._onActorUpdate);
    Hooks.on("updateCombat", this._onCombatUpdate);
    Hooks.on("deleteCombat", this._onCombatUpdate);

    const saved = loadHudPosition();
    this.position = saved ? { ...saved } : defaultHudCenter();
    this._applyStagePosition();
    this._clampToViewport(true);
    this._draw();
  }

  close() {
    if (this.state.collapseTimer) {
      clearTimeout(this.state.collapseTimer);
      this.state.collapseTimer = null;
    }
    this._endDragListeners();
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("resize", this._onResize);
    Hooks.off("updateActor", this._onActorUpdate);
    Hooks.off("updateItem", this._onActorUpdate);
    Hooks.off("updateCombat", this._onCombatUpdate);
    Hooks.off("deleteCombat", this._onCombatUpdate);
    this.hideTooltip();
    this.root?.remove();
    this.root = null;
    this.stage = null;
    if (activeHud === this) activeHud = null;
  }

  _onResize() {
    if (!this.root) return;
    this._clampToViewport(true);
  }

  _onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  _onActorUpdate(doc) {
    if (!this.root) return;
    const actorId = this.actor.id;
    if (doc?.id === actorId || doc?.parent?.id === actorId || doc?.actor?.id === actorId) {
      this._draw();
    }
  }

  _onCombatUpdate() {
    if (!this.root) return;
    this._draw();
  }

  _draw() {
    if (!this.svg) return;
    this._redrawing = true;
    this.svg.replaceChildren();
    _clipSeq = 0;

    // Soft guide circles
    this._circle(RINGS.mainOuter, "rgba(255,255,255,0.08)");
    this._circle(RINGS.actionOuter, "rgba(255,255,255,0.05)");

    this._drawGrabRing();
    this._drawMainRing();
    this._drawHub();

    if (isMonsterActor(this.actor) && (this.state.section === "action" || this.state.section === "bonus" || this.state.section === "reaction")) {
      if (this.state.section !== "action") this.state.attackOpen = false;
      if (this.state.section !== "reaction") this.state.opportunityOpen = false;
      this._drawMonsterAttackRing(this.state.section);
      if (this.state.section === "action" && this.state.attackOpen) {
        this._drawMonsterAttackNest();
      }
      if (this.state.section === "reaction" && this.state.opportunityOpen) {
        this._drawMonsterOpportunityNest();
      }
    } else if (this.state.section === "action") {
      this._drawActionRing();
      if (this.state.readyOpen) this._drawReadyNest();
      else if (this.state.attackOpen) this._drawAttackNest(2);
      else if (this.state.otherOpen) this._drawOtherNest(2);
      else if (this.state.abilitiesOpen) this._drawAbilitiesNest(2);
      else if (this.state.useItem) {
        this._drawUseItemRing();
        if (this.state.useItemGroup) this._drawUseItemGroupRing();
      }

      if (this.state.readyOpen && this.state.attackOpen) this._drawAttackNest(3);
      if (this.state.weaponNestId) this._drawSpecialWeaponRing();
      if (this.state.featureNestId) this._drawFeatureModeRing();
      if (this.state.castSpell) {
        this._drawSpellLevelRing();
        if (this.state.spellLevel != null) this._drawSpellRing(this.state.spellLevel);
      }
    } else if (this.state.section === "checks") {
      this._drawChecksMenu();
      if (this.state.checksBranch === "saves") this._drawSavingThrowRing();
      else if (this.state.checksBranch === "skills") this._drawSkillRing();
    } else if (this.state.section === "bonus") {
      this._drawEconomyRing("bonus");
      if (this.state.featureNestId) this._drawFeatureModeRing();
      if (this.state.useItem) {
        this._drawUseItemRing();
        if (this.state.useItemGroup) this._drawUseItemGroupRing();
      }
      if (this.state.castSpell) {
        this._drawSpellLevelRing();
        if (this.state.spellLevel != null) this._drawSpellRing(this.state.spellLevel);
      }
    } else if (this.state.section === "reaction") {
      this._drawEconomyRing("reaction");
      if (this.state.featureNestId) this._drawFeatureModeRing();
      if (this.state.opportunityOpen) {
        this._drawOpportunityNest();
        if (this.state.weaponNestId) this._drawSpecialWeaponRing();
      }
      if (this.state.castSpell) {
        this._drawSpellLevelRing();
        if (this.state.spellLevel != null) this._drawSpellRing(this.state.spellLevel);
      }
    }

    // Nests change the occupied radius — keep arcs on-screen.
    this._clampToViewport();
    this._redrawing = false;
  }

  _applyStagePosition() {
    if (!this.stage) return;
    this.stage.style.left = `${this.position.x}px`;
    this.stage.style.top = `${this.position.y}px`;
    this.stage.style.transform = "translate(-50%, -50%)";
  }

  _clampToViewport(persist = false) {
    const radius = contentOuterRadius(this.state, RINGS);
    const next = clampHudCenter(this.position.x, this.position.y, radius);
    if (next.x !== this.position.x || next.y !== this.position.y) {
      this.position = next;
      this._applyStagePosition();
      if (persist) void saveHudPosition(next.x, next.y);
    } else {
      this._applyStagePosition();
    }
  }

  _endDragListeners() {
    if (!this._drag) return;
    window.removeEventListener("pointermove", this._drag.onMove);
    window.removeEventListener("pointerup", this._drag.onUp);
    window.removeEventListener("pointercancel", this._drag.onUp);
    this._drag = null;
    this.root?.classList.remove("tch-root--dragging");
  }

  /**
   * Hub / grab-ring drag: movement past DRAG_THRESHOLD_PX relocates the HUD;
   * a click with no drag on the hub fires End Turn.
   * @param {PointerEvent} event
   * @param {"hub"|"grab"} source
   */
  _beginDragGesture(event, source) {
    event.stopPropagation();
    event.preventDefault();
    this._endDragListeners();

    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...this.position };
    let dragging = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        dragging = true;
        this.root?.classList.add("tch-root--dragging");
        this.hideTooltip();
      }
      if (!dragging) return;
      this.position = { x: origin.x + dx, y: origin.y + dy };
      this._clampToViewport();
    };

    const onUp = async () => {
      const wasDragging = dragging;
      this._endDragListeners();
      if (wasDragging) {
        this._clampToViewport(true);
        await saveHudPosition(this.position.x, this.position.y);
        return;
      }
      if (source === "hub") await this._onEndTurnClick();
    };

    this._drag = { active: false, onMove, onUp };
    // Mark active only once movement starts — backdrop still works for clicks.
    const wrapMove = (ev) => {
      onMove(ev);
      if (dragging && this._drag) this._drag.active = true;
    };
    this._drag.onMove = wrapMove;
    window.addEventListener("pointermove", wrapMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async _onEndTurnClick() {
    const endTurn = getEndTurnState(this._endTurnSubject());
    if (!endTurn.enabled) {
      ui.notifications.warn(endTurn.reason || t("EndTurn.Unavailable"));
      return;
    }
    try {
      await endCombatTurn(this._endTurnSubject());
      this.close();
    } catch (err) {
      console.error("Tinhead's Combat Hud | end turn failed", err);
      ui.notifications.warn(err?.message || t("EndTurn.Unavailable"));
    }
  }

  /** Thin ring between hub and main wedges — dedicated drag affordance. */
  _drawGrabRing() {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("tch-grab");
    g.setAttribute("aria-label", t("Drag.Handle"));
    // Two half-annuli (full 360° path can degenerate in SVG arc flags).
    for (const [start, end] of [[0, 180], [180, 360]]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("tch-grab__ring");
      path.setAttribute(
        "d",
        sectionWedgePath(CX, CY, RINGS.hub + 2, RINGS.mainInner - 2, start, end)
      );
      g.appendChild(path);
    }
    g.addEventListener("pointerdown", (e) => this._beginDragGesture(e, "grab"));
    g.addEventListener("pointerenter", () => {
      this.showTooltip({
        title: t("Drag.Handle"),
        description: t("Drag.Hint")
      }, g);
    });
    g.addEventListener("pointerleave", () => this.hideTooltip());
    this.svg.appendChild(g);
  }

  _resetActionNests() {
    this.state.attackOpen = false;
    this.state.opportunityOpen = false;
    this.state.readyOpen = false;
    this.state.otherOpen = false;
    this.state.abilitiesOpen = false;
    this.state.castSpell = false;
    this.state.spellEconomy = "action";
    this.state.useItem = false;
    this.state.useItemGroup = null;
    this.state.weaponNestId = null;
    this.state.useAbility = false;
    this.state.featureNestId = null;
    this.state.spellLevel = null;
  }

  _nestKey() {
    const state = this.state;
    return [
      state.attackOpen, state.readyOpen, state.otherOpen, state.abilitiesOpen, state.useItem, state.useItemGroup,
      state.castSpell, state.spellEconomy, state.weaponNestId, state.featureNestId, state.spellLevel
    ].join("|");
  }

  /**
   * Open or close the nest that belongs to this wedge.
   * @param {object} entry
   * @param {"action"|"ready"|"attack"|"abilities"} source
   * @returns {boolean} true when the radial needs a redraw
   */
  _applyHub(entry, source) {
    const before = this._nestKey();
    const kind = entry?.kind;
    if (source === "action") {
      this.state.attackOpen = kind === "attack";
      this.state.readyOpen = kind === "ready";
      this.state.otherOpen = kind === "other";
      this.state.abilitiesOpen = kind === "abilities";
      this.state.useItem = kind === "useItem";
      this.state.castSpell = kind === "cast";
      if (kind === "cast") this.state.spellEconomy = entry.economy || "action";
      this.state.weaponNestId = null;
      this.state.featureNestId = null;
      this.state.spellLevel = null;
      this.state.useAbility = false;
    } else if (source === "ready") {
      this.state.attackOpen = kind === "attack";
      this.state.abilitiesOpen = false;
      this.state.castSpell = kind === "cast";
      if (kind === "cast") this.state.spellEconomy = entry.economy || "action";
      this.state.weaponNestId = null;
      this.state.featureNestId = null;
      this.state.spellLevel = null;
      this.state.useAbility = false;
    } else if (source === "attack") {
      this.state.castSpell = kind === "cast";
      this.state.weaponNestId = (kind === "weapon" && entry.hasSpecial) ? entry.id : null;
      this.state.spellLevel = null;
      this.state.useAbility = false;
      this.state.featureNestId = null;
    } else if (source === "abilities" || source === "other") {
      this.state.featureNestId = (kind === "feature" && entry.hasNest) ? entry.id : null;
      this.state.castSpell = false;
      this.state.spellLevel = null;
    }
    return before !== this._nestKey();
  }

  _isNestHub(entry) {
    return entry?.kind === "cast"
      || entry?.kind === "useItem"
      || entry?.kind === "attack"
      || entry?.kind === "ready"
      || entry?.kind === "abilities"
      || entry?.kind === "other"
      || (entry?.kind === "weapon" && entry.hasSpecial)
      || (entry?.kind === "feature" && entry.hasNest);
  }

  /**
   * Tooltips belong on sheet items (weapons, spells, features, consumables).
   * Action wedges, hubs, and the four main sections stay quiet.
   * @param {object} entry
   * @returns {object|null}
   */
  _itemTooltip(entry) {
    const kind = entry?.kind;
    if (!entry || ["basic", "attack", "cast", "ready", "other", "abilities", "useItem", "opportunity"].includes(kind)) {
      return null;
    }
    const itemKind = kind === "weapon"
      || kind === "spell"
      || kind === "inventory"
      || kind === "feature"
      || kind === "feature-mode"
      || kind === "weapon-attack"
      || kind === "weapon-ability"
      || !!entry.item;
    if (!itemKind) return null;
    return entry.tooltip || { title: entry.name, description: entry.reason || "" };
  }

  _entryActive(entry) {
    if (entry.kind === "attack") {
      return this.state.attackOpen && (this.state.readyOpen ? entry.id === "ready-attack" : entry.id === "attack");
    }
    if (entry.kind === "abilities") return this.state.abilitiesOpen && entry.id === "abilities";
    if (entry.kind === "other") return this.state.otherOpen && entry.id === "other";
    return (entry.kind === "ready" && this.state.readyOpen)
      || (entry.kind === "cast" && this.state.castSpell)
      || (entry.kind === "useItem" && this.state.useItem)
      || (entry.kind === "weapon" && entry.id === this.state.weaponNestId)
      || (entry.kind === "feature" && entry.id === this.state.featureNestId);
  }

  _band(depth) {
    if (depth <= 1) return { inner: RINGS.actionInner, outer: RINGS.actionOuter };
    if (depth === 2) return { inner: RINGS.nest1Inner, outer: RINGS.nest1Outer };
    if (depth === 3) return { inner: RINGS.nest2Inner, outer: RINGS.nest2Outer };
    return { inner: RINGS.nest3Inner, outer: RINGS.nest3Outer };
  }

  _resetChecksNests() {
    this.state.checksBranch = null;
  }

  /**
   * Distance from the radial center to the pointer, in SVG units.
   * @param {PointerEvent} ev
   * @returns {number}
   */
  _pointerRadius(ev) {
    if (!this.svg || ev?.clientX == null) return Infinity;
    const pt = this.svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return Infinity;
    const p = pt.matrixTransform(ctm.inverse());
    return Math.hypot(p.x - CX, p.y - CY);
  }

  _circle(r, stroke) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(CX));
    c.setAttribute("cy", String(CY));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", stroke);
    c.setAttribute("stroke-width", "1");
    c.style.pointerEvents = "none";
    this.svg.appendChild(c);
  }

  _endTurnSubject() {
    return this.tokenDoc ?? this.actor ?? null;
  }

  _drawHub() {
    const endTurn = getEndTurnState(this._endTurnSubject());
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("tch-hub", "tch-hub--has-art");
    if (!endTurn.enabled) g.classList.add("tch-hub--disabled");

    // Click = End Turn; drag past threshold = move HUD (see _beginDragGesture).
    g.addEventListener("pointerdown", (e) => this._beginDragGesture(e, "hub"));
    g.addEventListener("pointerenter", () => {
      this._scheduleCollapse(null);
      this.showTooltip({
        title: t("EndTurn.Label"),
        description: endTurn.enabled
          ? `${t("EndTurn.Hint")} ${t("Drag.HubHint")}`
          : (endTurn.reason || t("EndTurn.Unavailable"))
      }, g);
    });
    g.addEventListener("pointerleave", () => this.hideTooltip());

    // Art under disk tint (circular clip).
    appendHubArt(g, {
      cx: CX,
      cy: CY,
      r: RINGS.hub,
      img: CHROME.endTurn,
      clipId: nextClipId("tch-hub")
    });

    const disk = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    disk.classList.add("tch-hub__disk");
    disk.setAttribute("cx", String(CX));
    disk.setAttribute("cy", String(CY));
    disk.setAttribute("r", String(RINGS.hub));
    g.appendChild(disk);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.classList.add("tch-hub__label");
    label.setAttribute("x", String(CX));
    label.setAttribute("y", String(CY + 2));
    label.textContent = t("EndTurn.Label");
    g.appendChild(label);

    const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
    sub.classList.add("tch-hub__sub");
    sub.setAttribute("x", String(CX));
    sub.setAttribute("y", String(CY + 14));
    sub.textContent = endTurn.enabled ? t("EndTurn.Sub") : "—";
    g.appendChild(sub);

    g.setAttribute("aria-label", t("EndTurn.Label"));
    this.svg.appendChild(g);
  }

  _drawMainRing() {
    const sections = [
      {
        id: "action",
        label: t("Sections.Action"),
        img: CHROME.action,
        hint: t("Sections.ActionHint")
      },
      {
        id: "checks",
        label: t("Sections.Checks"),
        img: CHROME.checks,
        hint: t("Sections.ChecksHint")
      },
      {
        id: "bonus",
        label: t("Sections.BonusAction"),
        img: CHROME.bonus,
        hint: t("Sections.BonusHint")
      },
      {
        id: "reaction",
        label: t("Sections.Reaction"),
        img: CHROME.reaction,
        hint: t("Sections.ReactionHint")
      }
    ];
    const angles = mainSectionAngles();

    for (const section of sections) {
      const ang = angles.find(a => a.id === section.id);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add(
        "tch-segment",
        "tch-segment--main",
        "tch-segment--has-art",
        `tch-economy--${section.id}`
      );
      if (this.state.section === section.id) g.classList.add("tch-segment--active");
      g.dataset.section = section.id;
      g.dataset.economy = section.id;

      const d = sectionWedgePath(
        CX, CY, RINGS.mainInner, RINGS.mainOuter, ang.start, ang.end
      );

      appendWedgeArt(g, {
        d,
        img: section.img,
        inner: RINGS.mainInner,
        outer: RINGS.mainOuter,
        start: ang.start,
        end: ang.end,
        cx: CX,
        cy: CY,
        clipId: nextClipId(`tch-main-${section.id}`)
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("tch-segment__fill");
      path.setAttribute("d", d);
      g.appendChild(path);

      const anchor = sectionAnchor(
        CX, CY,
        (RINGS.mainInner + RINGS.mainOuter) / 2,
        ang.start, ang.end
      );

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("tch-segment__label");
      text.setAttribute("x", String(anchor.x));
      text.setAttribute("y", String(anchor.y));
      text.textContent = section.label;
      g.appendChild(text);

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        // Already on this section. Rebuilding the ring must not pick an ability
        // that happens to sit under the pointer still on the Checks wedge.
        if (this.state.section === section.id) {
          if (section.id === "checks" && this._pointerRadius(ev) < RINGS.actionInner && this.state.checksBranch) {
            this.state.checksBranch = null;
            this._draw();
          }
          return;
        }
        this.state.section = section.id;
        if (section.id !== "action") this._resetActionNests();
        if (section.id === "checks") this.state.checksBranch = null;
        else this._resetChecksNests();
        this._draw();
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(null);
      });

      this.svg.appendChild(g);
    }
  }

  /**
   * Monster sheet: attacks of this activation.
   * Legendary actions share the Attack nest with the creature's other attacks.
   * Lair actions stay on the action ring. Reaction always includes
   * Attack of Opportunity, which opens the creature's action attacks.
   * @param {"action"|"bonus"|"reaction"} activation
   */
  _drawMonsterAttackRing(activation) {
    const entries = getMonsterAttackOptions(this.actor, activation);
    const group = this._ringGroup(activation);
    const main = mainSectionById(activation);
    const inner = RINGS.actionInner;
    const outer = RINGS.actionOuter;

    if (!entries.length) {
      const msg = activation === "bonus"
        ? t("Empty.NoBonusAttacks")
        : activation === "reaction"
          ? t("Empty.NoReactionAttacks")
          : t("Empty.NoActionAttacks");
      this._emptyLabel(group, msg, (inner + outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(entries.length, main.start, main.end, { maxSpanDeg: 220 });
    this._layout = { ...(this._layout || {}) };
    entries.forEach((opt, i) => {
      const seg = segs[i];
      const isOpportunity = opt.kind === "opportunity";
      const isAttackHub = opt.kind === "attack";
      if (isOpportunity) this._layout.opportunitySeg = seg;
      if (isAttackHub) this._layout.monsterAttackSeg = seg;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner,
        outer,
        caption: opt.name,
        img: opt.img,
        itemArt: !isOpportunity && !isAttackHub,
        unavailable: opt.available === false,
        active: (isOpportunity && this.state.opportunityOpen) || (isAttackHub && this.state.attackOpen)
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        if (isOpportunity) {
          if (!this.state.opportunityOpen) {
            this.state.opportunityOpen = true;
            this.state.weaponNestId = null;
            this._draw();
          }
        } else if (isAttackHub) {
          if (!this.state.attackOpen) {
            this.state.attackOpen = true;
            this.state.weaponNestId = null;
            this._draw();
          }
        } else if (this.state.opportunityOpen || this.state.attackOpen) {
          this.state.opportunityOpen = false;
          this.state.attackOpen = false;
          this.state.weaponNestId = null;
          this._draw();
        }
        if (isOpportunity || isAttackHub) this.hideTooltip();
        else this.showTooltip(opt.tooltip || { title: opt.name }, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(activation);
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isOpportunity || isAttackHub) return;
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  /**
   * Attack nest: the creature's action attacks and its legendary actions.
   */
  _drawMonsterAttackNest() {
    const entries = getMonsterAttackNestOptions(this.actor);
    this._drawChoiceRing(entries, {
      depth: 2,
      parent: this._layout?.monsterAttackSeg ?? mainSectionById("action"),
      source: "attack",
      groupName: "monster-attack-nest",
      store: "attack",
      empty: t("Empty.NoActionAttacks")
    });
  }

  /**
   * Opportunity attacks use the monster's action attacks.
   */
  _drawMonsterOpportunityNest() {
    const entries = getMonsterOpportunityAttacks(this.actor);
    this._drawChoiceRing(entries, {
      depth: 2,
      parent: this._layout?.opportunitySeg ?? mainSectionById("reaction"),
      source: "attack",
      groupName: "opportunity-attack",
      store: "attack",
      empty: t("Empty.NoActionAttacks"),
      band: { inner: RINGS.flatNestInner, outer: RINGS.flatNestOuter }
    });
  }

  _drawActionRing() {
    const entries = buildActionRingEntries(this.actor, getEquippedWeapons(this.actor));
    const actionMain = mainSectionById("action");
    this._drawChoiceRing(entries, {
      depth: 1,
      parent: actionMain,
      source: "action",
      groupName: "action",
      store: "action",
      centerOnId: "attack"
    });
  }

  _drawReadyNest() {
    const entries = getReadyNestEntries(this.actor);
    this._drawChoiceRing(entries, {
      depth: 2,
      parent: this._parentSeg("ready"),
      source: "ready",
      groupName: "ready"
    });
  }

  _drawAttackNest(depth) {
    const weapons = getEquippedWeapons(this.actor);
    const entries = getAttackNestEntries(this.actor, weapons);
    const parent = depth >= 3
      ? (this._layout?.readyAttackSeg ?? this._parentSeg("attack"))
      : this._parentSeg("attack");
    this._drawChoiceRing(entries, {
      depth,
      parent,
      source: "attack",
      groupName: "attack-nest",
      store: "attack"
    });
  }

  _drawOtherNest(depth) {
    const entries = getOtherActionOptions(this.actor);
    const parent = this._parentSeg("other");
    this._layout = { ...(this._layout || {}), featureDepth: depth };
    this._drawChoiceRing(entries, {
      depth,
      parent,
      source: "other",
      groupName: "other",
      store: "other",
      empty: t("Empty.NoOtherActions")
    });
  }

  _drawAbilitiesNest(depth) {
    const entries = getClassFeatureOptions(this.actor, "action");
    const parent = depth >= 3
      ? (this._layout?.readyOtherSeg ?? this._parentSeg("abilities"))
      : this._parentSeg("abilities");
    this._layout = { ...(this._layout || {}), featureDepth: depth };
    this._drawChoiceRing(entries, {
      depth,
      parent,
      source: "abilities",
      groupName: "abilities",
      store: "abilities",
      empty: t("Empty.NoFeatureModes")
    });
  }

  _drawOpportunityNest() {
    const entries = getAttackNestEntries(this.actor, getEquippedWeapons(this.actor));
    this._drawChoiceRing(entries, {
      depth: 2,
      parent: this._layout?.opportunitySeg ?? mainSectionById("reaction"),
      source: "attack",
      groupName: "opportunity-attack",
      store: "attack",
      band: { inner: RINGS.flatNestInner, outer: RINGS.flatNestOuter }
    });
  }

  _drawSpecialWeaponRing() {
    const entries = this._layout?.attackEntries ?? [];
    const segs = this._layout?.attackSegs ?? [];
    const idx = entries.findIndex(entry => entry.id === this.state.weaponNestId);
    const weapon = entries[idx];
    if (!weapon) return;
    const parent = segs[idx] ?? this._parentSeg("attack");
    const onReaction = this.state.section === "reaction";
    const options = getSpecialWeaponOptions(weapon);
    this._drawChoiceRing(options, {
      depth: (this._layout?.attackDepth ?? 2) + 1,
      parent,
      source: "weapon",
      groupName: "weapon-special",
      band: onReaction ? { inner: RINGS.flatSpellInner, outer: RINGS.flatSpellOuter } : undefined
    });
  }

  /**
   * @param {Array<object>} entries
   * @param {{
   *   depth: number,
   *   parent: { start: number, end: number },
   *   source: string,
   *   groupName: string,
   *   store?: string,
   *   empty?: string,
   *   centerOnId?: string,
   *   band?: { inner: number, outer: number }
   * }} cfg
   */
  _drawChoiceRing(entries, cfg) {
    const band = cfg.band ?? this._band(cfg.depth);
    const group = this._ringGroup(cfg.groupName, cfg.source === "action" ? "action" : this.state.section);
    const parent = cfg.parent ?? mainSectionById("action");
    if (!entries.length) {
      const mid = (band.inner + band.outer) / 2;
      this._emptyLabel(group, cfg.empty || t("Empty.NoEquippedWeapons"), mid);
      this.svg.appendChild(group);
      return;
    }

    let segs = arcSegmentsForParent(
      entries.length,
      parent.start,
      parent.end,
      { maxSpanDeg: cfg.depth >= 3 ? 240 : 280 }
    );
    if (cfg.centerOnId) {
      const centerIndex = entries.findIndex(entry => entry.kind === cfg.centerOnId || entry.id === cfg.centerOnId);
      if (centerIndex >= 0) segs = centerArcOnIndex(segs, centerIndex, parent.start, parent.end);
    }

    if (cfg.store === "action") {
      this._layout = {
        actionSegs: segs,
        actionEntries: entries,
        levelSegs: [],
        levelInfos: []
      };
    } else if (cfg.store === "attack") {
      this._layout = {
        ...(this._layout || {}),
        attackEntries: entries,
        attackSegs: segs,
        attackDepth: cfg.depth
      };
    } else if (cfg.store === "abilities" || cfg.store === "other") {
      const key = cfg.store === "other" ? "other" : "ability";
      this._layout = {
        ...(this._layout || {}),
        [`${key}Entries`]: entries,
        [`${key}Segs`]: segs,
        featureDepth: cfg.depth
      };
    }

    entries.forEach((entry, index) => {
      const seg = segs[index] ?? segs[0];
      if (entry.kind === "cast") {
        this._layout.castSeg = seg;
        this._layout.castDepth = cfg.depth;
      }
      if (cfg.source === "ready" && entry.kind === "attack") this._layout.readyAttackSeg = seg;
      if (cfg.source === "ready" && entry.kind === "abilities") this._layout.readyOtherSeg = seg;

      const hub = this._isNestHub(entry);
      const onAction = cfg.depth <= 1 && hub && entry.kind !== "weapon" && entry.kind !== "feature";
      const caption = entry.usesLabel ? `${entry.name} · ${entry.usesLabel}` : entry.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: band.inner,
        outer: band.outer,
        label: onAction ? entry.name : "",
        caption: onAction ? "" : caption,
        img: entry.img,
        itemArt: usesSheetIcon(entry.kind),
        unavailable: entry.available === false,
        active: this._entryActive(entry)
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        const changed = cfg.source === "weapon" ? false : this._applyHub(entry, cfg.source);
        if (changed) this._draw();
        const tip = this._itemTooltip(entry);
        if (tip) this.showTooltip(tip, g, ev);
        else this.hideTooltip();
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(cfg.source === "weapon" ? "weapon" : cfg.source);
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (hub) return;
        await this._onLeafClick(entry);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }
  _featureById(id) {
    return (this._layout?.otherEntries ?? []).find(e => e.id === id)
      ?? (this._layout?.abilityEntries ?? []).find(e => e.id === id)
      ?? (this._layout?.actionEntries ?? []).find(e => e.id === id)
      ?? (this._layout?.economyEntries ?? []).find(e => e.id === id)
      ?? null;
  }

  _parentSegForFeature(feature) {
    const otherEntries = this._layout?.otherEntries ?? [];
    const otherSegs = this._layout?.otherSegs ?? [];
    const otherIdx = otherEntries.findIndex(entry => entry.id === feature.id);
    if (otherIdx >= 0 && otherSegs[otherIdx]) return otherSegs[otherIdx];
    const abilityEntries = this._layout?.abilityEntries ?? [];
    const abilitySegs = this._layout?.abilitySegs ?? [];
    const abilityIdx = abilityEntries.findIndex(entry => entry.id === feature.id);
    if (abilityIdx >= 0 && abilitySegs[abilityIdx]) return abilitySegs[abilityIdx];
    if (this.state.section === "action") return this._parentSegByEntryId(feature.id);
    const entries = this._layout?.economyEntries ?? [];
    const segs = this._layout?.economySegs ?? [];
    const idx = entries.findIndex(e => e.id === feature.id);
    if (idx >= 0 && segs[idx]) return segs[idx];
    return mainSectionById(this.state.section === "reaction" ? "reaction" : "bonus");
  }

  _drawFeatureModeRing() {
    const feature = this._featureById(this.state.featureNestId);
    if (!feature) return;
    const modes = getFeatureModeOptions(feature);
    const group = this._ringGroup("feature-modes");
    const parent = this._parentSegForFeature(feature);
    const onEconomy = this.state.section === "bonus" || this.state.section === "reaction";
    const band = onEconomy
      ? { inner: RINGS.flatNestInner, outer: RINGS.flatNestOuter }
      : this._band((this._layout?.featureDepth ?? 1) + 1);

    if (!modes.length) {
      this._emptyLabel(group, t("Empty.NoFeatureModes"), (band.inner + band.outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(modes.length, parent.start, parent.end, { maxSpanDeg: 170 });
    modes.forEach((opt, i) => {
      const seg = segs[i];
      const caption = opt.usesLabel ? `${opt.name} · ${opt.usesLabel}` : opt.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: band.inner,
        outer: band.outer,
        caption,
        img: opt.img,
        unavailable: !opt.available
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.showTooltip(opt.tooltip || { title: opt.name }, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        const keep = this.state.section === "action" ? "action" : this.state.section;
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(keep);
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawChecksMenu() {
    const entries = getChecksMenuOptions(this.actor);
    const group = this._ringGroup("checks-menu");
    const main = mainSectionById("checks");
    const segs = arcSegmentsForParent(entries.length, main.start, main.end, { maxSpanDeg: 200 });
    this._layout = {
      ...(this._layout || {}),
      checksMenu: entries,
      checksMenuSegs: segs
    };

    entries.forEach((opt, i) => {
      const seg = segs[i];
      const isBranch = opt.kind === "checks-branch";
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.actionInner,
        outer: RINGS.actionOuter,
        caption: opt.name,
        img: opt.img,
        active: isBranch && this.state.checksBranch === opt.branch
      });

      g.addEventListener("pointerenter", (ev) => {
        if (this._pointerRadius(ev) < RINGS.actionInner) return;
        this._clearCollapse();
        if (isBranch) {
          if (this.state.checksBranch === opt.branch) {
            this.showTooltip(opt.tooltip, g, ev);
            return;
          }
          this.state.checksBranch = opt.branch;
          this._draw();
          this.showTooltip(opt.tooltip, g, ev);
          return;
        }
        if (this.state.checksBranch) {
          this.state.checksBranch = null;
          this._draw();
        }
        this.showTooltip(opt.tooltip, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("checks");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isBranch) return;
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawSavingThrowRing() {
    this._drawChecksLeafRing(getSavingThrowOptions(this.actor), "saves");
  }

  _drawSkillRing() {
    this._drawChecksLeafRing(getSkillOptions(this.actor), "skills");
  }

  _drawChecksLeafRing(options, branch) {
    const entries = this._layout?.checksMenu ?? getChecksMenuOptions(this.actor);
    const segsLayout = this._layout?.checksMenuSegs ?? [];
    const idx = entries.findIndex(entry => entry.kind === "checks-branch" && entry.branch === branch);
    const parent = idx >= 0 && segsLayout[idx] ? segsLayout[idx] : mainSectionById("checks");
    const group = this._ringGroup(branch);
    const segs = arcSegmentsForParent(options.length, parent.start, parent.end, { maxSpanDeg: 200 });

    options.forEach((opt, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
        caption: opt.name,
        img: opt.img,
        proficiency: opt.proficiency
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.showTooltip(opt.tooltip, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("ability");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawUseItemRing() {
    const onBonus = this.state.section === "bonus";
    const items = layoutUseItemEntries(
      getUsableInventoryItems(this.actor, onBonus ? "bonus" : "action")
    );
    const group = this._ringGroup("use-items");
    const parent = onBonus
      ? (this._layout?.useItemSeg ?? mainSectionById("bonus"))
      : this._parentSeg("useItem");
    const inner = onBonus ? RINGS.flatNestInner : RINGS.nest1Inner;
    const outer = onBonus ? RINGS.flatNestOuter : RINGS.nest1Outer;

    if (!items.length) {
      this._emptyLabel(group, t("Empty.NoUsableItems"), (inner + outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      items.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 170 }
    );
    if (this._layout) {
      this._layout.useItemEntries = items;
      this._layout.useItemSegs = segs;
    }
    items.forEach((opt, i) => {
      const seg = segs[i];
      const isGroup = opt.kind === "use-item-group";
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner,
        outer,
        caption: opt.name,
        img: opt.img,
        itemArt: !isGroup,
        unavailable: !opt.available,
        active: isGroup && opt.groupId === this.state.useItemGroup
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        if (isGroup) {
          if (this.state.useItemGroup !== opt.groupId) {
            this.state.useItemGroup = opt.groupId;
            this._draw();
          }
        } else if (this.state.useItemGroup) {
          this.state.useItemGroup = null;
          this._draw();
        }
        this.showTooltip(opt.tooltip, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("useItem");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isGroup) return;
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawUseItemGroupRing() {
    const entries = this._layout?.useItemEntries ?? [];
    const segs = this._layout?.useItemSegs ?? [];
    const index = entries.findIndex(entry =>
      entry.kind === "use-item-group" && entry.groupId === this.state.useItemGroup
    );
    const hub = index >= 0 ? entries[index] : null;
    const children = hub?.children ?? [];
    if (!hub || !children.length) {
      this.state.useItemGroup = null;
      return;
    }

    const onBonus = this.state.section === "bonus";
    const parent = segs[index] ?? (onBonus ? mainSectionById("bonus") : this._parentSeg("useItem"));
    const inner = onBonus ? RINGS.flatSpellInner : RINGS.nest2Inner;
    const outer = onBonus ? RINGS.flatSpellOuter : RINGS.nest2Outer;
    const group = this._ringGroup("use-item-group");
    const childSegs = arcSegmentsForParent(children.length, parent.start, parent.end, { maxSpanDeg: 170 });

    children.forEach((opt, i) => {
      const seg = childSegs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner,
        outer,
        caption: opt.name,
        img: opt.img,
        itemArt: true,
        unavailable: !opt.available
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.showTooltip(opt.tooltip, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("useItem");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  /**
   * Resolve the Action-ring segment for a nest hub (cast / useItem) or weapon entry id.
   * @param {"cast"|"useItem"|string} kindOrId
   */
  _parentSeg(kindOrId) {
    const fallback = mainSectionById("action");
    const entries = this._layout?.actionEntries ?? [];
    const segs = this._layout?.actionSegs ?? [];
    const idx = entries.findIndex(e => e.kind === kindOrId || e.id === kindOrId);
    if (idx >= 0 && segs[idx]) return segs[idx];
    return { start: fallback.start, end: fallback.end };
  }

  _parentSegByEntryId(entryId) {
    return this._parentSeg(entryId);
  }

  _drawSpellLevelRing() {
    // Partial arc anchored on Cast Spell — section count = available levels only.
    const economy = this.state.spellEconomy || "action";
    const { levels, empty } = getSpellLevels(this.actor, economy);
    const group = this._ringGroup("levels");
    const parent = this._layout?.castSeg ?? this._parentSeg("cast");
    const band = this._castLevelBand();
    if (this._layout) this._layout.levelDepth = (this._layout.castDepth ?? 2) + 1;

    if (empty) {
      this._emptyLabel(group, t("Empty.NoSpellLevels"), (band.inner + band.outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      levels.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 170 }
    );
    if (this._layout) {
      this._layout.levelSegs = segs;
      this._layout.levelInfos = levels;
    }

    levels.forEach((levelInfo, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: band.inner,
        outer: band.outer,
        label: levelInfo.label,
        caption: levelInfo.slots || undefined,
        img: spellLevelIcon(levelInfo.level),
        unavailable: false,
        active: this.state.spellLevel === levelInfo.level
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.state.spellLevel = levelInfo.level;
        this._draw();
        const description = [t("SpellLevels.PickHint", { label: levelInfo.label }), levelInfo.slotHint]
          .filter(Boolean)
          .join(" ");
        this.showTooltip({
          title: levelInfo.slots ? `${levelInfo.label} · ${levelInfo.slots}` : levelInfo.label,
          description
        }, g, ev);
      });
      g.addEventListener("pointerleave", (ev) => {
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("cast");
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _castLevelBand() {
    if (this.state.section === "bonus" || this.state.section === "reaction") {
      return { inner: RINGS.flatNestInner, outer: RINGS.flatNestOuter };
    }
    return this._band((this._layout?.castDepth ?? 2) + 1);
  }

  _castSpellBand() {
    if (this.state.section === "bonus" || this.state.section === "reaction") {
      return { inner: RINGS.flatSpellInner, outer: RINGS.flatSpellOuter };
    }
    return this._band((this._layout?.levelDepth ?? 3) + 1);
  }

  _drawSpellRing(level) {
    const economy = this.state.spellEconomy || "action";
    const { levels } = getSpellLevels(this.actor, economy);
    const levelInfo = levels.find(l => l.level === level);
    const spells = levelInfo?.spells ?? [];
    const group = this._ringGroup("spells");

    // Anchor on the hovered level segment when available
    let parent = this._parentSeg("cast");
    const layoutLevels = this._layout?.levelInfos ?? [];
    const layoutSegs = this._layout?.levelSegs ?? [];
    const li = layoutLevels.findIndex(l => l.level === level);
    if (li >= 0 && layoutSegs[li]) parent = layoutSegs[li];

    const spellBand = this._castSpellBand();

    if (!spells.length) {
      this._emptyLabel(group, t("Empty.NoSpellsAtLevel"), (spellBand.inner + spellBand.outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      spells.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 160 }
    );
    spells.forEach((spell, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: spellBand.inner,
        outer: spellBand.outer,
        caption: spell.name,
        img: spell.img,
        itemArt: true,
        unavailable: !spell.available
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.showTooltip(spell.tooltip, g, ev);
      });
      g.addEventListener("pointermove", (ev) => this._positionTooltip(ev));
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("level");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        await this._onLeafClick(spell);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  /**
   * Bonus Action / Reaction ring: Cast Spell, Use Item, class features, and other activities.
   * Bonus-action consumables open from Use Item. Spells stay inside Cast Spell.
   * Multi-mode features nest the same way as on Action.
   * @param {"bonus"|"reaction"} activation
   */
  _drawEconomyRing(activation) {
    const entries = buildEconomyRingEntries(this.actor, activation);
    const group = this._ringGroup(activation);
    const main = mainSectionById(activation === "bonus" ? "bonus" : "reaction");

    if (!entries.length) {
      const msg = activation === "bonus" ? t("Empty.NoBonusActions") : t("Empty.NoReactions");
      this._emptyLabel(group, msg, (RINGS.flatInner + RINGS.flatOuter) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      entries.length,
      main.start,
      main.end,
      { maxSpanDeg: 300, minSegmentDeg: 32, idealSegmentDeg: 46 }
    );
    this._layout = {
      ...(this._layout || {}),
      economyEntries: entries,
      economySegs: segs,
      economyActivation: activation,
      featureDepth: 1
    };

    entries.forEach((opt, i) => {
      const seg = segs[i];
      const isFeatureNest = opt.kind === "feature" && opt.hasNest;
      const isCast = opt.kind === "cast";
      const isUseItem = opt.kind === "useItem";
      const isOpportunity = opt.kind === "opportunity";
      if (isOpportunity) this._layout.opportunitySeg = seg;
      if (isUseItem) this._layout.useItemSeg = seg;
      if (isCast) {
        this._layout.castSeg = seg;
        this._layout.castDepth = 1;
      }
      const caption = opt.usesLabel ? `${opt.name} · ${opt.usesLabel}` : opt.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.flatInner,
        outer: RINGS.flatOuter,
        caption,
        img: opt.img,
        unavailable: opt.available === false,
        active: (isFeatureNest && opt.id === this.state.featureNestId)
          || (isCast && this.state.castSpell)
          || (isUseItem && this.state.useItem)
          || (isOpportunity && this.state.opportunityOpen)
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        if (isCast) {
          const economy = opt.economy || activation;
          const changed = !this.state.castSpell
            || this.state.spellEconomy !== economy
            || this.state.featureNestId
            || this.state.opportunityOpen
            || this.state.useItem;
          this.state.featureNestId = null;
          this.state.opportunityOpen = false;
          this.state.weaponNestId = null;
          this.state.useItem = false;
          this.state.castSpell = true;
          this.state.spellEconomy = economy;
          if (changed) this.state.spellLevel = null;
          if (changed) this._draw();
        } else if (isUseItem) {
          const changed = !this.state.useItem
            || this.state.castSpell
            || this.state.featureNestId
            || this.state.opportunityOpen;
          this.state.featureNestId = null;
          this.state.castSpell = false;
          this.state.spellLevel = null;
          this.state.opportunityOpen = false;
          this.state.weaponNestId = null;
          this.state.useItem = true;
          if (changed) this._draw();
        } else if (isOpportunity) {
          const changed = !this.state.opportunityOpen || this.state.castSpell || this.state.featureNestId || this.state.useItem;
          this.state.featureNestId = null;
          this.state.castSpell = false;
          this.state.spellLevel = null;
          this.state.useItem = false;
          this.state.opportunityOpen = true;
          if (changed) this.state.weaponNestId = null;
          if (changed) this._draw();
        } else if (isFeatureNest) {
          const changed = this.state.featureNestId !== opt.id || this.state.castSpell || this.state.opportunityOpen || this.state.useItem;
          this.state.castSpell = false;
          this.state.spellLevel = null;
          this.state.opportunityOpen = false;
          this.state.weaponNestId = null;
          this.state.useItem = false;
          this.state.featureNestId = opt.id;
          if (changed) this._draw();
        } else if (this.state.featureNestId || this.state.castSpell || this.state.opportunityOpen || this.state.useItem) {
          this.state.featureNestId = null;
          this.state.castSpell = false;
          this.state.spellLevel = null;
          this.state.opportunityOpen = false;
          this.state.weaponNestId = null;
          this.state.useItem = false;
          this._draw();
        }
        const tip = this._itemTooltip(opt);
        if (tip) this.showTooltip(tip, g, ev);
        else this.hideTooltip();
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(activation);
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isFeatureNest || isCast || isOpportunity || isUseItem) return;
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  /**
   * @param {object} cfg
   */
  _leafSegment(cfg) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("tch-segment");
    if (cfg.unavailable) g.classList.add("tch-segment--unavailable");
    if (cfg.active) g.classList.add("tch-segment--active");
    if (cfg.proficiency === "proficient") g.classList.add("tch-segment--proficient");
    if (cfg.proficiency === "expertise") g.classList.add("tch-segment--expertise");
    if (cfg.itemArt) g.classList.add("tch-segment--item-art");
    if (cfg.itemArt && cfg.img) applyIconPalette(g, cfg.img);

    const d = sectionWedgePath(CX, CY, cfg.inner, cfg.outer, cfg.start, cfg.end);
    const midR = (cfg.inner + cfg.outer) / 2;
    const anchor = sectionAnchor(CX, CY, midR, cfg.start, cfg.end);

    // Layer: clipped art → translucent economy fill → labels/captions
    if (cfg.img) {
      g.classList.add("tch-segment--has-art");
      const art = appendWedgeArt(g, {
        d,
        img: cfg.img,
        inner: cfg.inner,
        outer: cfg.outer,
        start: cfg.start,
        end: cfg.end,
        cx: CX,
        cy: CY,
        clipId: nextClipId("tch-leaf")
      });
      if (art) {
        art.addEventListener("error", () => {
          art.remove();
          g.classList.remove("tch-segment--has-art");
          if (!cfg.label && cfg.caption) {
            const laid = wedgeTextLayout({
              start: cfg.start,
              end: cfg.end,
              inner: cfg.inner,
              outer: cfg.outer,
              text: cfg.caption,
              cx: CX,
              cy: CY
            });
            appendWedgeText(g, "tch-segment__label", laid, anchor, 0);
          }
        });
      }
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("tch-segment__fill");
    path.setAttribute("d", d);
    g.appendChild(path);

    if (cfg.label) {
      const laid = wedgeTextLayout({
        start: cfg.start,
        end: cfg.end,
        inner: cfg.inner,
        outer: cfg.outer,
        text: cfg.label,
        cx: CX,
        cy: CY
      });
      appendWedgeText(g, "tch-segment__label", laid, anchor, cfg.caption ? -laid.lineH * 0.45 : 0);
    }

    if (cfg.caption) {
      const laid = wedgeTextLayout({
        start: cfg.start,
        end: cfg.end,
        inner: cfg.inner,
        outer: cfg.outer,
        text: cfg.caption,
        cx: CX,
        cy: CY
      });
      appendWedgeText(
        g,
        cfg.label ? "tch-segment__caption" : "tch-segment__label",
        laid,
        anchor,
        cfg.label ? laid.lineH * 0.45 : 0
      );
    }

    return g;
  }

  /**
   * @param {string} name
   * @param {"action"|"checks"|"bonus"|"reaction"|null} [economy]
   */
  _ringGroup(name, economy = null) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("tch-ring", "tch-ring--visible");
    g.dataset.ring = name;
    const eco = economy || this.state.section;
    if (eco) {
      g.classList.add(`tch-economy--${eco}`);
      g.dataset.economy = eco;
    }
    return g;
  }

  _emptyLabel(group, message, r) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("tch-ring-empty");
    // Place empty copy on the top of the ring
    const anchor = wedgeAnchor(CX, CY, r, -20, 20);
    text.setAttribute("x", String(anchor.x));
    text.setAttribute("y", String(anchor.y));
    text.textContent = message;
    group.appendChild(text);
  }

  async _onLeafClick(option) {
    const result = await resolveHudOption(option, { actor: this.actor });
    if (result.closed) this.close();
    else this._draw();
  }

  showTooltip(data, _segment, event) {
    if (!this.tooltipEl || !data) return;
    const rows = [];
    if (data.description) {
      rows.push(`<p class="tch-tooltip__desc">${escapeHtml(data.description)}</p>`);
    }
    const fields = [
      ["Targets", data.targets],
      ["Range", data.range],
      ["Duration", data.duration],
      ["Damage", data.damage]
    ];
    for (const [key, value] of fields) {
      if (value == null || value === "") continue;
      rows.push(`
        <div class="tch-tooltip__row">
          <span class="tch-tooltip__key">${escapeHtml(t(`Tooltip.${key}`))}</span>
          <span class="tch-tooltip__value">${escapeHtml(String(value))}</span>
        </div>
      `);
    }
    this.tooltipEl.innerHTML = `
      <p class="tch-tooltip__title">${escapeHtml(data.title || "")}</p>
      ${rows.join("")}
    `;
    this.tooltipEl.hidden = false;
    if (event) this._positionTooltip(event);
    else {
      this.tooltipEl.style.left = "50%";
      this.tooltipEl.style.top = "12%";
      this.tooltipEl.style.transform = "translateX(-50%)";
    }
  }

  _positionTooltip(event) {
    if (!this.tooltipEl || this.tooltipEl.hidden) return;
    const pad = 16;
    const x = Math.min(window.innerWidth - 300, event.clientX + pad);
    const y = Math.min(window.innerHeight - 40, event.clientY + pad);
    this.tooltipEl.style.transform = "none";
    this.tooltipEl.style.left = `${Math.max(8, x)}px`;
    this.tooltipEl.style.top = `${Math.max(8, y)}px`;
  }

  hideTooltip() {
    if (this._redrawing) return;
    if (!this.tooltipEl) return;
    this.tooltipEl.hidden = true;
    this.tooltipEl.innerHTML = "";
  }

  _relatedTargetInHud(ev) {
    const related = ev.relatedTarget;
    return !!(related && this.svg?.contains(related));
  }

  _clearCollapse() {
    if (this.state.collapseTimer) {
      clearTimeout(this.state.collapseTimer);
      this.state.collapseTimer = null;
    }
  }

  /**
   * Collapse nested rings toward main. `keep` limits how far we collapse.
   * @param {null|"action"|"cast"|"level"|"useItem"|"weapon"|"useAbility"|"feature"|"checks"|"ability"} keep
   */
  _scheduleCollapse(keep) {
    this._clearCollapse();
    this.state.collapseTimer = setTimeout(() => {
      this.state.collapseTimer = null;
      if (keep === "level" || keep === "useAbility" || keep === "ability") {
        return;
      }
      if (keep === "weapon") {
        this.state.useAbility = false;
      } else if (keep === "attack") {
        this.state.weaponNestId = null;
        this.state.castSpell = false;
        this.state.spellLevel = null;
        this.state.useAbility = false;
      } else if (keep === "ready") {
        this.state.attackOpen = false;
        this.state.abilitiesOpen = false;
        this.state.castSpell = false;
        this.state.spellLevel = null;
        this.state.weaponNestId = null;
        this.state.featureNestId = null;
        this.state.useAbility = false;
      } else if (keep === "abilities" || keep === "other") {
        this.state.featureNestId = null;
      } else if (keep === "checks") {
        this.state.checksBranch = null;
      } else if (keep === "bonus" || keep === "reaction") {
        this.state.featureNestId = null;
        this.state.castSpell = false;
        this.state.spellLevel = null;
        this.state.spellEconomy = "action";
        this.state.opportunityOpen = false;
        this.state.weaponNestId = null;
        this.state.useItem = false;
        this.state.useItemGroup = null;
      } else if (keep === "cast") {
        this.state.spellLevel = null;
      } else if (keep === "useItem") {
        this.state.useItemGroup = null;
        this.state.castSpell = false;
        this.state.spellLevel = null;
        this.state.weaponNestId = null;
        this.state.useAbility = false;
        this.state.featureNestId = null;
      } else if (keep === "action") {
        this._resetActionNests();
      } else {
        this.state.section = null;
        this._resetActionNests();
        this._resetChecksNests();
      }
      this.hideTooltip();
      this._draw();
    }, COLLAPSE_DELAY_MS);
  }
}

function usesSheetIcon(kind) {
  return kind === "weapon"
    || kind === "weapon-attack"
    || kind === "weapon-ability"
    || kind === "inventory";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Viewport-centered radial Combat Hud UI.
 */

import {
  actorFromToken,
  canUseActor,
  getActivationOptions,
  getEquippedWeapons,
  getSpellLevels,
  t
} from "../data/actor-options.mjs";
import { buildActionRingEntries } from "../data/basic-actions.mjs";
import { getEndTurnState, endCombatTurn } from "../data/combat-turn.mjs";
import { getUsableInventoryItems } from "../data/use-items.mjs";
import {
  getClassFeatureOptions,
  getFeatureModeOptions
} from "../data/action-features.mjs";
import {
  getAbilityOptions,
  getAbilityRollOptions
} from "../data/ability-checks.mjs";
import {
  getWeaponAbilityOptions,
  getWeaponMenuOptions
} from "../data/weapon-abilities.mjs";
import { resolveHudOption } from "../data/resolve.mjs";
import {
  arcSegmentsForParent,
  mainSectionAngles,
  mainSectionById,
  sectionAnchor,
  sectionWedgePath,
  wedgeAnchor
} from "./radial-geometry.mjs";
import { appendHubArt, appendWedgeArt } from "./wedge-art.mjs";
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
 * Split a wedge name onto two lines so it stays inside a wider slice.
 * @param {string} caption
 * @returns {string[]}
 */
function captionLines(caption) {
  const text = String(caption ?? "").trim();
  if (!text) return [];
  const limit = 14;
  if (text.length <= limit) return [text];
  const mid = text.lastIndexOf(" ", limit);
  if (mid >= 4) {
    const rest = text.slice(mid + 1);
    return [
      text.slice(0, mid),
      rest.length > limit ? `${rest.slice(0, limit - 1)}…` : rest
    ];
  }
  return [`${text.slice(0, limit - 1)}…`];
}

/**
 * Compact SVG viewBox + ring radii (px).
 * Main Action/BA/R is intentionally smaller so nested partial arcs stay on-screen.
 * Keep preview/radial-preview.html RINGS in sync with these values.
 */
export const SIZE = 920;
const CX = SIZE / 2;
const CY = SIZE / 2;

/** @type {Readonly<{
 *  hub: number,
 *  mainInner: number, mainOuter: number,
 *  actionInner: number, actionOuter: number,
 *  nest1Inner: number, nest1Outer: number,
 *  nest2Inner: number, nest2Outer: number,
 *  flatInner: number, flatOuter: number
 * }>} */
export const RINGS = Object.freeze({
  hub: 40,
  mainInner: 50,
  mainOuter: 132,
  actionInner: 144,
  actionOuter: 272,
  nest1Inner: 284,
  nest1Outer: 384,
  nest2Inner: 396,
  nest2Outer: 448,
  flatInner: 144,
  flatOuter: 272
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
      useItem: false,
      weaponNestId: null,  // equipped weapon id with Attack / Use Ability nest
      useAbility: false,   // weapon ability modes nest open
      featureNestId: null, // multi-mode class feature (Channel Divinity, …)
      abilityId: null,     // checks nest: str|dex|…
      spellLevel: null,    // number | null
      collapseTimer: null
    };
    /** @type {null|{ actionSegs: object[], actionEntries: object[], levelSegs: object[], levelInfos: object[] }} */
    this._layout = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onActorUpdate = this._onActorUpdate.bind(this);
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

  _draw() {
    if (!this.svg) return;
    this.svg.replaceChildren();
    _clipSeq = 0;

    // Soft guide circles
    this._circle(RINGS.mainOuter, "rgba(255,255,255,0.08)");
    this._circle(RINGS.actionOuter, "rgba(255,255,255,0.05)");

    this._drawGrabRing();
    this._drawMainRing();
    this._drawHub();

    if (this.state.section === "action") {
      this._drawActionRing();
      if (this.state.weaponNestId) {
        this._drawWeaponMenuRing();
        if (this.state.useAbility) this._drawWeaponAbilityRing();
      }
      if (this.state.featureNestId) this._drawFeatureModeRing();
      if (this.state.useItem) this._drawUseItemRing();
      if (this.state.castSpell) {
        this._drawSpellLevelRing();
        if (this.state.spellLevel != null) this._drawSpellRing(this.state.spellLevel);
      }
    } else if (this.state.section === "checks") {
      this._drawAbilityRing();
      if (this.state.abilityId) this._drawAbilityRollRing();
    } else if (this.state.section === "bonus") {
      this._drawEconomyRing("bonus");
      if (this.state.featureNestId) this._drawFeatureModeRing();
    } else if (this.state.section === "reaction") {
      this._drawEconomyRing("reaction");
      if (this.state.featureNestId) this._drawFeatureModeRing();
    }

    // Nests change the occupied radius — keep arcs on-screen.
    this._clampToViewport();
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
    const endTurn = getEndTurnState();
    if (!endTurn.enabled) {
      ui.notifications.warn(endTurn.reason || t("EndTurn.Unavailable"));
      return;
    }
    try {
      await endCombatTurn();
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
    this.state.castSpell = false;
    this.state.useItem = false;
    this.state.weaponNestId = null;
    this.state.useAbility = false;
    this.state.featureNestId = null;
    this.state.spellLevel = null;
  }

  _resetChecksNests() {
    this.state.abilityId = null;
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

  _drawHub() {
    const endTurn = getEndTurnState();
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

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        this.state.section = section.id;
        if (section.id !== "action") this._resetActionNests();
        if (section.id !== "checks") this._resetChecksNests();
        this._draw();
        this.showTooltip({ title: section.label, description: section.hint }, g);
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(null);
      });

      this.svg.appendChild(g);
    }
  }

  _drawActionRing() {
    const weapons = getEquippedWeapons(this.actor);
    const entries = buildActionRingEntries(this.actor, weapons);
    const actionMain = mainSectionById("action");
    const segs = arcSegmentsForParent(
      Math.max(entries.length, 1),
      actionMain.start,
      actionMain.end
    );
    this._layout = {
      actionSegs: segs,
      actionEntries: entries,
      levelSegs: [],
      levelInfos: []
    };

    const group = this._ringGroup("action");
    if (!weapons.length) {
      this._emptyLabel(group, t("Empty.NoEquippedWeapons"), (RINGS.actionInner + RINGS.actionOuter) / 2 - 10);
    }

    entries.forEach((entry, i) => {
      const seg = segs[i] ?? segs[0];
      const isNestHub = entry.kind === "cast"
        || entry.kind === "useItem"
        || (entry.kind === "weapon" && entry.hasSpecial)
        || (entry.kind === "feature" && entry.hasNest);
      const caption = entry.usesLabel
        ? `${entry.name} · ${entry.usesLabel}`
        : entry.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.actionInner,
        outer: RINGS.actionOuter,
        label: (entry.kind === "cast" || entry.kind === "useItem") ? entry.name : "",
        caption: (entry.kind === "cast" || entry.kind === "useItem") ? "" : caption,
        img: entry.img,
        unavailable: entry.available === false,
        active: (entry.kind === "cast" && this.state.castSpell)
          || (entry.kind === "useItem" && this.state.useItem)
          || (entry.kind === "weapon" && entry.id === this.state.weaponNestId)
          || (entry.kind === "feature" && entry.id === this.state.featureNestId)
      });

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        if (entry.kind === "cast") {
          this._resetActionNests();
          this.state.castSpell = true;
          this._draw();
          this.showTooltip(entry.tooltip || { title: entry.name }, g);
        } else if (entry.kind === "useItem") {
          this._resetActionNests();
          this.state.useItem = true;
          this._draw();
          this.showTooltip(entry.tooltip || { title: entry.name }, g);
        } else if (entry.kind === "weapon" && entry.hasSpecial) {
          this._resetActionNests();
          this.state.weaponNestId = entry.id;
          this._draw();
          this.showTooltip({ title: entry.name, description: entry.tooltip?.description }, g);
        } else if (entry.kind === "feature" && entry.hasNest) {
          this._resetActionNests();
          this.state.featureNestId = entry.id;
          this._draw();
          this.showTooltip(entry.tooltip || { title: entry.name }, g);
        } else {
          const hadNest = this.state.castSpell
            || this.state.useItem
            || this.state.weaponNestId
            || this.state.useAbility
            || this.state.featureNestId
            || this.state.spellLevel != null;
          if (hadNest) {
            this._resetActionNests();
            this._draw();
          }
          if (entry.tooltip) this.showTooltip(entry.tooltip, g);
          else this.showTooltip({ title: entry.name }, g);
        }
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("action");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isNestHub) return;
        await this._onLeafClick(entry);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _weaponOptionById(id) {
    return (this._layout?.actionEntries ?? []).find(e => e.id === id) ?? null;
  }

  _drawWeaponMenuRing() {
    const weapon = this._weaponOptionById(this.state.weaponNestId);
    if (!weapon) return;
    const parent = this._parentSegByEntryId(weapon.id);
    const menu = getWeaponMenuOptions(weapon);
    const group = this._ringGroup("weapon-menu");
    const segs = arcSegmentsForParent(menu.length, parent.start, parent.end, { maxSpanDeg: 120 });

    if (this._layout) {
      this._layout.weaponMenuSegs = segs;
      this._layout.weaponMenuEntries = menu;
    }

    menu.forEach((opt, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
        label: opt.name,
        img: opt.img,
        unavailable: opt.available === false,
        active: opt.kind === "weapon-use-ability" && this.state.useAbility
      });

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        if (opt.kind === "weapon-use-ability") {
          this.state.useAbility = true;
          this._draw();
        } else if (this.state.useAbility) {
          this.state.useAbility = false;
          this._draw();
        }
        this.showTooltip(opt.tooltip || { title: opt.name }, g);
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("weapon");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (opt.isNest || opt.kind === "weapon-use-ability") return;
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawWeaponAbilityRing() {
    const weapon = this._weaponOptionById(this.state.weaponNestId);
    if (!weapon) return;
    const abilities = getWeaponAbilityOptions(weapon);
    const group = this._ringGroup("weapon-abilities");

    let parent = this._parentSegByEntryId(weapon.id);
    const menu = this._layout?.weaponMenuEntries ?? [];
    const menuSegs = this._layout?.weaponMenuSegs ?? [];
    const useIdx = menu.findIndex(m => m.kind === "weapon-use-ability");
    if (useIdx >= 0 && menuSegs[useIdx]) parent = menuSegs[useIdx];

    if (!abilities.length) {
      this._emptyLabel(group, t("Empty.NoWeaponAbilities"), (RINGS.nest2Inner + RINGS.nest2Outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(abilities.length, parent.start, parent.end, { maxSpanDeg: 240 });
    abilities.forEach((opt, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest2Inner,
        outer: RINGS.nest2Outer,
        caption: opt.name,
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
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("useAbility");
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        await this._onLeafClick(opt);
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _featureById(id) {
    return (this._layout?.actionEntries ?? []).find(e => e.id === id)
      ?? (this._layout?.economyEntries ?? []).find(e => e.id === id)
      ?? null;
  }

  _parentSegForFeature(feature) {
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

    if (!modes.length) {
      this._emptyLabel(group, t("Empty.NoFeatureModes"), (RINGS.nest1Inner + RINGS.nest1Outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(modes.length, parent.start, parent.end, { maxSpanDeg: 260 });
    modes.forEach((opt, i) => {
      const seg = segs[i];
      const caption = opt.usesLabel ? `${opt.name} · ${opt.usesLabel}` : opt.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
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

  _drawAbilityRing() {
    const abilities = getAbilityOptions(this.actor);
    const group = this._ringGroup("abilities");
    const main = mainSectionById("checks");
    const segs = arcSegmentsForParent(
      abilities.length,
      main.start,
      main.end,
      { maxSpanDeg: 280 }
    );

    if (this._layout) {
      this._layout.abilitySegs = segs;
      this._layout.abilityEntries = abilities;
    } else {
      this._layout = { abilitySegs: segs, abilityEntries: abilities };
    }

    abilities.forEach((opt, i) => {
      const seg = segs[i];
      const modCaption = opt.mod == null
        ? opt.name
        : `${opt.name} ${opt.mod >= 0 ? `+${opt.mod}` : opt.mod}`;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.actionInner,
        outer: RINGS.actionOuter,
        caption: modCaption,
        img: opt.img,
        active: this.state.abilityId === opt.abilityId
      });

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        this.state.abilityId = opt.abilityId;
        this._draw();
        this.showTooltip(opt.tooltip, g);
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("checks");
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawAbilityRollRing() {
    const abilities = this._layout?.abilityEntries ?? getAbilityOptions(this.actor);
    const ability = abilities.find(a => a.abilityId === this.state.abilityId);
    if (!ability) return;
    const rolls = getAbilityRollOptions(ability);
    const group = this._ringGroup("ability-rolls");

    let parent = mainSectionById("checks");
    const segsLayout = this._layout?.abilitySegs ?? [];
    const idx = abilities.findIndex(a => a.abilityId === this.state.abilityId);
    if (idx >= 0 && segsLayout[idx]) parent = segsLayout[idx];

    const segs = arcSegmentsForParent(rolls.length, parent.start, parent.end, { maxSpanDeg: 120 });
    rolls.forEach((opt, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
        label: opt.name,
        img: opt.img
      });

      g.addEventListener("pointerenter", (ev) => {
        this._clearCollapse();
        this.showTooltip(opt.tooltip, g, ev);
      });
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
    const items = getUsableInventoryItems(this.actor);
    const group = this._ringGroup("use-items");
    const parent = this._parentSeg("useItem");

    if (!items.length) {
      this._emptyLabel(group, t("Empty.NoUsableItems"), (RINGS.nest1Inner + RINGS.nest1Outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      items.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 280 }
    );
    items.forEach((opt, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
        caption: opt.name,
        img: opt.img,
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
    // Partial arc anchored on Cast Spell hub — section count = available levels only.
    const { levels, empty } = getSpellLevels(this.actor);
    const group = this._ringGroup("levels");
    const parent = this._parentSeg("cast");

    if (empty) {
      this._emptyLabel(group, t("Empty.NoSpellLevels"), (RINGS.nest1Inner + RINGS.nest1Outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      levels.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 280 }
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
        inner: RINGS.nest1Inner,
        outer: RINGS.nest1Outer,
        label: levelInfo.label,
        img: spellLevelIcon(levelInfo.level),
        unavailable: false,
        active: this.state.spellLevel === levelInfo.level
      });

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        this.state.spellLevel = levelInfo.level;
        this._draw();
        this.showTooltip({
          title: levelInfo.label,
          description: t("SpellLevels.PickHint", { label: levelInfo.label })
        }, g);
      });
      g.addEventListener("pointerleave", (ev) => {
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse("cast");
      });

      group.appendChild(g);
    });

    this.svg.appendChild(group);
  }

  _drawSpellRing(level) {
    const { levels } = getSpellLevels(this.actor);
    const levelInfo = levels.find(l => l.level === level);
    const spells = levelInfo?.spells ?? [];
    const group = this._ringGroup("spells");

    // Anchor on the hovered level segment when available
    let parent = this._parentSeg("cast");
    const layoutLevels = this._layout?.levelInfos ?? [];
    const layoutSegs = this._layout?.levelSegs ?? [];
    const li = layoutLevels.findIndex(l => l.level === level);
    if (li >= 0 && layoutSegs[li]) parent = layoutSegs[li];

    if (!spells.length) {
      this._emptyLabel(group, t("Empty.NoSpellsAtLevel"), (RINGS.nest2Inner + RINGS.nest2Outer) / 2);
      this.svg.appendChild(group);
      return;
    }

    const segs = arcSegmentsForParent(
      spells.length,
      parent.start,
      parent.end,
      { maxSpanDeg: 280 }
    );
    spells.forEach((spell, i) => {
      const seg = segs[i];
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.nest2Inner,
        outer: RINGS.nest2Outer,
        caption: spell.name,
        img: spell.img,
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
   * Bonus Action / Reaction ring: class features (activation-matched) + other items.
   * Multi-mode features nest the same way as on Action.
   * @param {"bonus"|"reaction"} activation
   */
  _drawEconomyRing(activation) {
    const features = getClassFeatureOptions(this.actor, activation);
    const others = getActivationOptions(this.actor, activation);
    const entries = [...features, ...others];
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
      { maxSpanDeg: 280 }
    );
    this._layout = {
      ...(this._layout || {}),
      economyEntries: entries,
      economySegs: segs,
      economyActivation: activation
    };

    entries.forEach((opt, i) => {
      const seg = segs[i];
      const isFeatureNest = opt.kind === "feature" && opt.hasNest;
      const caption = opt.usesLabel ? `${opt.name} · ${opt.usesLabel}` : opt.name;
      const g = this._leafSegment({
        start: seg.start,
        end: seg.end,
        inner: RINGS.flatInner,
        outer: RINGS.flatOuter,
        caption,
        img: opt.img,
        unavailable: opt.available === false,
        active: isFeatureNest && opt.id === this.state.featureNestId
      });

      g.addEventListener("pointerenter", () => {
        this._clearCollapse();
        if (isFeatureNest) {
          this.state.featureNestId = opt.id;
          this._draw();
        } else if (this.state.featureNestId) {
          this.state.featureNestId = null;
          this._draw();
        }
        this.showTooltip(opt.tooltip || { title: opt.name, description: opt.reason || "" }, g);
      });
      g.addEventListener("pointerleave", (ev) => {
        this.hideTooltip();
        if (!this._relatedTargetInHud(ev)) this._scheduleCollapse(activation);
      });
      g.addEventListener("pointerdown", async (ev) => {
        ev.stopPropagation();
        if (isFeatureNest) return;
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
            const fallback = document.createElementNS("http://www.w3.org/2000/svg", "text");
            fallback.classList.add("tch-segment__label");
            fallback.setAttribute("x", String(anchor.x));
            fallback.setAttribute("y", String(anchor.y));
            fallback.textContent = cfg.caption;
            g.appendChild(fallback);
          }
        });
      }
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("tch-segment__fill");
    path.setAttribute("d", d);
    g.appendChild(path);

    if (cfg.label) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("tch-segment__label");
      text.setAttribute("x", String(anchor.x));
      text.setAttribute("y", String(anchor.y + (cfg.caption ? -6 : 0)));
      text.textContent = cfg.label;
      g.appendChild(text);
    }

    if (cfg.caption) {
      const lines = captionLines(cfg.caption);
      const lineH = 15;
      const origin = anchor.y + (cfg.label ? 8 : 0);
      const startY = origin - ((lines.length - 1) * lineH) / 2;
      const cap = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const asLabel = !cfg.label;
      cap.classList.add(asLabel ? "tch-segment__label" : "tch-segment__caption");
      cap.setAttribute("x", String(anchor.x));
      cap.setAttribute("y", String(startY));
      lines.forEach((line, index) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.setAttribute("x", String(anchor.x));
        tspan.setAttribute("dy", index === 0 ? "0" : String(lineH));
        tspan.textContent = line;
        cap.appendChild(tspan);
      });
      g.appendChild(cap);
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
    // activity.use() / item.use() open configure dialogs and do not resolve
    // until those dialogs close. Drop the radial first so the popups are visible.
    const actor = this.actor;
    this.close();
    await resolveHudOption(option, { actor });
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
      } else if (keep === "checks") {
        this.state.abilityId = null;
      } else if (keep === "bonus" || keep === "reaction") {
        this.state.featureNestId = null;
      } else if (keep === "cast") {
        this.state.spellLevel = null;
      } else if (keep === "useItem") {
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
    }, 140);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

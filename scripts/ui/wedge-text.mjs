import { normalizeMid } from "./radial-geometry.mjs";

/**
 * Bottom sector, where a clockwise caption would turn upside down.
 * The sides stay with the clockwise arc so letters face outward, matching the top of the ring.
 * @param {number} midAngle
 * @returns {boolean}
 */
export function captionFacesInward(midAngle) {
  const mid = ((Number(midAngle) % 360) + 360) % 360;
  return mid > 135 && mid < 225;
}

/**
 * Rotation that runs the caption along the wedge and keeps it right-side up.
 * 0° is north, clockwise. Only the bottom sector is flipped.
 * @param {number} midAngle
 * @returns {number}
 */
export function uprightTangentRotation(midAngle) {
  const mid = ((Number(midAngle) % 360) + 360) % 360;
  if (captionFacesInward(mid)) return mid + 180;
  return mid;
}

/**
 * SVG path along a wedge arc. Reversed runs the bottom sector so letters stay upright.
 * Angles match the HUD: 0° is north, clockwise.
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} startAngle
 * @param {number} endAngle
 * @param {boolean} reversed
 * @returns {string}
 */
export function wedgeArcPath(cx, cy, radius, startAngle, endAngle, reversed) {
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const large = sweep > 180 ? 1 : 0;
  const a0 = reversed ? endAngle : startAngle;
  const a1 = reversed ? startAngle : endAngle;
  const sweepFlag = reversed ? 0 : 1;
  const at = (deg) => {
    const rad = toRad(deg);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    };
  };
  const p0 = at(a0);
  const p1 = at(a1);
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${large} ${sweepFlag} ${p1.x} ${p1.y}`;
}

/**
 * Caption lines that follow the wedge arc.
 * Wide slices keep a long name on the curve instead of a straight line
 * that leaves the box. The bottom sector is reversed so text stays upright.
 * @param {{ start: number, end: number, inner: number, outer: number, text: string, cx?: number, cy?: number }} geom
 */
export function wedgeTextLayout(geom) {
  const start = Number(geom?.start) || 0;
  const end = Number(geom?.end) || 0;
  const inner = Number(geom?.inner) || 0;
  const outer = Number(geom?.outer) || 0;
  const mid = ((normalizeMid(start, end) % 360) + 360) % 360;
  const sweep = end < start ? end + 360 - start : end - start;
  const reversed = captionFacesInward(mid);
  const midR = (inner + outer) / 2;
  const pad = Math.min(2.4, sweep * 0.08);
  const pathSweep = Math.max(sweep - pad * 2, 4);
  const arcLen = Math.max(24, midR * (pathSweep * Math.PI / 180));
  const radial = Math.max(18, Math.abs(outer - inner));
  const fitted = fitArcLines(geom?.text, arcLen, radial);
  const fontPx = fitted.fontPx;
  return {
    lines: fitted.lines,
    rotation: uprightTangentRotation(mid),
    fontPx,
    lineH: Math.round(fontPx + 2),
    curve: sweep >= 10,
    reversed,
    radii: lineRadii(inner, outer, Math.max(fitted.lines.length, 1), fontPx, reversed),
    pathStart: start + pad,
    pathEnd: start + sweep - pad,
    center: { cx: Number(geom?.cx) || 0, cy: Number(geom?.cy) || 0 }
  };
}

/**
 * Draw a caption along the wedge. `localOffset` separates a label from a caption
 * along the radius (negative sits above the other line in the reading direction).
 * @param {SVGGElement} parent
 * @param {string} className
 * @param {ReturnType<typeof wedgeTextLayout>} laid
 * @param {{ x: number, y: number }} anchor
 * @param {number} localOffset
 */
export function appendWedgeText(parent, className, laid, anchor, localOffset) {
  const ns = "http://www.w3.org/2000/svg";
  const lines = laid?.lines?.length ? laid.lines : [""];
  if (!laid?.curve || !parent) {
    const text = document.createElementNS(ns, "text");
    text.classList.add(className);
    placeStraightText(text, laid, anchor, localOffset);
    parent?.appendChild(text);
    return;
  }

  const { cx, cy } = laid.center;
  const radialNudge = laid.reversed ? localOffset : -localOffset;
  lines.forEach((line, index) => {
    const radius = (laid.radii[index] ?? laid.radii[0]) + radialNudge;
    const id = nextArcId();
    const path = document.createElementNS(ns, "path");
    path.setAttribute("id", id);
    path.setAttribute("d", wedgeArcPath(cx, cy, radius, laid.pathStart, laid.pathEnd, laid.reversed));
    path.setAttribute("fill", "none");
    path.classList.add("tch-segment__arc");
    const text = document.createElementNS(ns, "text");
    text.classList.add(className);
    text.style.fontSize = `${laid.fontPx}px`;
    text.style.dominantBaseline = "auto";
    const textPath = document.createElementNS(ns, "textPath");
    textPath.setAttribute("href", `#${id}`);
    textPath.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${id}`);
    textPath.setAttribute("startOffset", "50%");
    textPath.textContent = line;
    text.appendChild(textPath);
    parent.appendChild(path);
    parent.appendChild(text);
  });
}

let arcSeq = 0;

function nextArcId() {
  arcSeq += 1;
  return `tch-arc-${arcSeq}`;
}

function placeStraightText(text, laid, anchor, localOffset) {
  const lines = laid?.lines?.length ? laid.lines : [""];
  const lineH = laid?.lineH || 15;
  text.setAttribute("x", String(anchor.x));
  text.setAttribute("y", String(anchor.y + localOffset - ((lines.length - 1) * lineH) / 2));
  text.setAttribute("transform", `rotate(${laid?.rotation || 0} ${anchor.x} ${anchor.y})`);
  text.style.fontSize = `${laid?.fontPx || 13}px`;
  lines.forEach((line, index) => {
    const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    tspan.setAttribute("x", String(anchor.x));
    tspan.setAttribute("dy", index === 0 ? "0" : String(lineH));
    tspan.textContent = line;
    text.appendChild(tspan);
  });
}

function fitArcLines(text, arcLen, radial) {
  const raw = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return { lines: [], fontPx: 13 };
  let fontPx = 13;
  let lines = [raw];
  for (let guard = 0; guard < 12; guard += 1) {
    const maxLines = Math.max(1, Math.min(3, Math.floor((radial * 0.78) / (fontPx + 2))));
    const charPx = fontPx * 0.6;
    const maxChars = Math.max(4, Math.floor(arcLen / charPx));
    lines = wedgeCaptionLines(raw, { maxChars, maxLines });
    const overflow = lines.some(line => line.includes("…") || line.length * charPx > arcLen + 1);
    if (!overflow || fontPx <= 10) break;
    fontPx = Math.round((fontPx - 0.5) * 10) / 10;
  }
  return { lines, fontPx };
}

function lineRadii(inner, outer, count, fontPx, reversed) {
  const edge = Math.max(2, fontPx * 0.15);
  const bandIn = inner + edge;
  const bandOut = Math.max(bandIn + 8, outer - edge);
  const mid = (bandIn + bandOut) / 2;
  if (count <= 1) {
    const shift = fontPx * 0.32;
    const radius = reversed ? mid + shift : mid - shift;
    return [Math.min(bandOut, Math.max(bandIn, radius))];
  }
  const leading = fontPx * 1.05;
  const inkShift = (reversed ? 1 : -1) * fontPx * 0.28;
  const radii = [];
  for (let i = 0; i < count; i += 1) {
    const fromCenter = ((count - 1) / 2 - i) * leading;
    const signed = reversed ? -fromCenter : fromCenter;
    radii.push(Math.min(bandOut, Math.max(bandIn, mid + signed + inkShift)));
  }
  return radii;
}

/**
 * Fit a wedge caption into a couple of centered lines.
 * Breaks on spaces so "Constitution +3" becomes the name and the modifier,
 * instead of chopping the name with an ellipsis.
 *
 * @param {string} caption
 * @param {{ maxChars?: number, maxLines?: number }} [opts]
 * @returns {string[]}
 */
export function wedgeCaptionLines(caption, opts = {}) {
  const maxChars = Math.max(4, opts.maxChars ?? 14);
  const maxLines = Math.max(1, opts.maxLines ?? 2);
  const text = String(caption ?? "").trim().replace(/\s+/g, " ");
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  if (maxLines === 1) return [clip(text, maxChars)];

  const words = text.split(" ");
  const lines = [];
  let line = "";
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      index += 1;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
      continue;
    }
    lines.push(clip(word, maxChars));
    index += 1;
    line = "";
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (index < words.length && lines.length) {
    const last = lines[lines.length - 1];
    const room = maxChars - 1;
    lines[lines.length - 1] = last.length >= room ? `${last.slice(0, room)}…` : `${last}…`;
  }
  return lines;
}

function clip(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

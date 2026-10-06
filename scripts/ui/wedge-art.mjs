/**
 * Clipped image fills for annular wedges.
 * Art sits under the translucent economy color tint — colors stay the identity.
 */

import { wedgeImageFrame } from "./radial-geometry.mjs";

let clipSeq = 0;

/** @returns {string} unique clipPath id for this page session */
export function nextClipId(prefix = "tch-clip") {
  clipSeq += 1;
  return `${prefix}-${clipSeq}`;
}

/**
 * Append a cover-fit image clipped to a wedge path.
 * Call before appending the translucent fill path so color tints the art.
 *
 * @param {SVGGElement} parentG
 * @param {{
 *   d: string,
 *   img: string,
 *   cx: number, cy: number,
 *   inner: number, outer: number,
 *   start: number, end: number,
 *   clipId?: string
 * }} cfg
 * @returns {SVGImageElement|null}
 */
export function appendWedgeArt(parentG, cfg) {
  if (!cfg?.img || !cfg.d) return null;

  const clipId = cfg.clipId || nextClipId();
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
  clip.setAttribute("id", clipId);
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  clipPath.setAttribute("d", cfg.d);
  clip.appendChild(clipPath);
  defs.appendChild(clip);
  parentG.appendChild(defs);

  const frame = wedgeImageFrame(
    cfg.cx, cfg.cy,
    cfg.inner, cfg.outer,
    cfg.start, cfg.end
  );

  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wrap.classList.add("tch-segment__art-wrap");
  wrap.setAttribute("clip-path", `url(#${clipId})`);

  const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
  img.classList.add("tch-segment__art");
  img.setAttribute("href", cfg.img);
  img.setAttributeNS("http://www.w3.org/1999/xlink", "href", cfg.img);
  img.setAttribute("x", String(frame.x));
  img.setAttribute("y", String(frame.y));
  img.setAttribute("width", String(frame.width));
  img.setAttribute("height", String(frame.height));
  img.setAttribute("preserveAspectRatio", "xMidYMid slice");
  img.setAttribute("pointer-events", "none");

  wrap.appendChild(img);
  parentG.appendChild(wrap);
  return img;
}

/**
 * Circular hub art (End Turn).
 * @param {SVGGElement} parentG
 * @param {{ img: string, cx: number, cy: number, r: number, clipId?: string }} cfg
 */
export function appendDiscArt(parentG, cfg) {
  if (!cfg?.img) return null;
  const clipId = cfg.clipId || nextClipId("tch-hub-clip");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
  clip.setAttribute("id", clipId);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(cfg.cx));
  circle.setAttribute("cy", String(cfg.cy));
  circle.setAttribute("r", String(cfg.r));
  clip.appendChild(circle);
  defs.appendChild(clip);
  parentG.appendChild(defs);

  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wrap.classList.add("tch-hub__art-wrap");
  wrap.setAttribute("clip-path", `url(#${clipId})`);
  const size = cfg.r * 2;
  const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
  img.classList.add("tch-hub__art");
  img.setAttribute("href", cfg.img);
  img.setAttributeNS("http://www.w3.org/1999/xlink", "href", cfg.img);
  img.setAttribute("x", String(cfg.cx - cfg.r));
  img.setAttribute("y", String(cfg.cy - cfg.r));
  img.setAttribute("width", String(size));
  img.setAttribute("height", String(size));
  img.setAttribute("preserveAspectRatio", "xMidYMid slice");
  img.setAttribute("pointer-events", "none");
  wrap.appendChild(img);
  parentG.appendChild(wrap);
  return img;
}

/** @deprecated alias — hub uses circular clip */
export const appendHubArt = appendDiscArt;


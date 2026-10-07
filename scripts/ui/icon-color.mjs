/**
 * Wedge colors taken from a weapon or item icon.
 * The dominant painted color becomes the fill and outline so each item
 * stays recognizable without the economy tint.
 */

const cache = new Map();

/**
 * @param {Uint8ClampedArray|ArrayLike<number>} data RGBA bytes
 * @returns {{ fill: string, stroke: string, fillHot: string, strokeHot: string }|null}
 */
export function paletteFromPixels(data) {
  const buckets = new Map();
  let counted = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 48) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    if (luma < 16 || luma > 246) continue;
    const sat = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { r: 0, g: 0, b: 0, n: 0, sat: 0 };
      buckets.set(key, bucket);
    }
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    bucket.sat += sat;
    counted += 1;
  }

  if (!counted) return null;

  let best = null;
  let bestScore = -1;
  for (const bucket of buckets.values()) {
    const sat = bucket.sat / bucket.n;
    const score = bucket.n * (0.25 + sat);
    if (score > bestScore) {
      bestScore = score;
      best = bucket;
    }
  }

  return colorsFromRgb(
    Math.round(best.r / best.n),
    Math.round(best.g / best.n),
    Math.round(best.b / best.n)
  );
}

/**
 * Paint a weapon or item wedge from its icon. Safe to call again for the same URL.
 * @param {Element} segment
 * @param {string} url
 */
export function applyIconPalette(segment, url) {
  if (!segment || !url) return;
  const known = cache.get(url);
  if (known instanceof Promise) {
    known.then(palette => paintSegment(segment, palette));
    return;
  }
  if (known) {
    paintSegment(segment, known);
    return;
  }
  const pending = sampleIcon(url).then(palette => {
    cache.set(url, palette);
    return palette;
  });
  cache.set(url, pending);
  pending.then(palette => paintSegment(segment, palette));
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function colorsFromRgb(r, g, b) {
  const stroke = mixWhite(r, g, b, 0.28);
  const strokeHot = mixWhite(r, g, b, 0.5);
  return {
    fill: `rgba(${r}, ${g}, ${b}, 0.55)`,
    stroke: `rgba(${stroke[0]}, ${stroke[1]}, ${stroke[2]}, 0.95)`,
    fillHot: `rgba(${r}, ${g}, ${b}, 0.22)`,
    strokeHot: `rgba(${strokeHot[0]}, ${strokeHot[1]}, ${strokeHot[2]}, 1)`
  };
}

function mixWhite(r, g, b, amount) {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount)
  ];
}

function paintSegment(segment, palette) {
  if (!palette || !segment.isConnected) return;
  segment.classList.add("tch-segment--icon-color");
  segment.style.setProperty("--tch-icon-fill", palette.fill);
  segment.style.setProperty("--tch-icon-stroke", palette.stroke);
  segment.style.setProperty("--tch-icon-fill-hot", palette.fillHot);
  segment.style.setProperty("--tch-icon-stroke-hot", palette.strokeHot);
}

function sampleIcon(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, size, size);
        resolve(paletteFromPixels(ctx.getImageData(0, 0, size, size).data));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

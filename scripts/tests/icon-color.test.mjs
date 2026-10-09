/**
 * Icon palette: the dominant painted color, not the transparent background.
 * Run: node scripts/tests/icon-color.test.mjs
 */

const { paletteFromPixels } = await import("../ui/icon-color.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function px(r, g, b, a = 255) {
  return [r, g, b, a];
}

const redIcon = new Uint8ClampedArray([
  ...px(0, 0, 0, 0),
  ...px(180, 24, 28),
  ...px(190, 30, 32),
  ...px(170, 20, 24),
  ...px(255, 255, 255),
  ...px(8, 8, 8)
]);
const red = paletteFromPixels(redIcon);
const redChannels = red.fill.match(/rgba\((\d+), (\d+), (\d+)/);
assert(redChannels, `red icon produced a color: ${red?.fill}`);
assert(Number(redChannels[1]) > Number(redChannels[2]) && Number(redChannels[1]) > Number(redChannels[3]), "red channel leads the icon palette");
assert(red.stroke.includes("0.95"), "stroke stays opaque enough to read");

const clear = paletteFromPixels(new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]));
assert(clear === null, "empty or outline-only icons keep the plain portrait");

console.log("icon-color.test.mjs ok");

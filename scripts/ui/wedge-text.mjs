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

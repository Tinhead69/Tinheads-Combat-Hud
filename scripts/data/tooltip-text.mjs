/** Convert Foundry descriptions and enrichers into display text without executing rolls. */
export function tooltipText(raw) {
  let text = typeof raw === "number" && Number.isFinite(raw) ? String(raw)
    : typeof raw === "string" ? raw : (typeof raw?.value === "string" ? raw.value : "");
  // Imported descriptions can contain another encoded layer of HTML.
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  text = text
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?([a-z][\w:-]*)(?:\s+(?:[^'"<>]|"[^"]*"|'[^']*')*)?\s*\/?>/gi,
      (_, tag) => /^(?:p|div|section|article|h[1-6]|li|ul|ol|table|tr|td|th|br|hr)$/i.test(tag) ? " " : "");
  return humanizeFormula(replaceEnrichers(text))
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[,.;:\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceEnrichers(text) {
  let out = text.replace(/&Reference\[([^\]]*)\](?:\{([^}]*)\})?/gi,
    (_, input, label, offset, whole) => {
      if (label) return choosePlural(label, whole.slice(0, offset));
      const { formula, config } = splitRollConfig(input);
      const rule = ["condition", "action", "rule", "skill", "ability", "sense", "damage", "property"]
        .map(key => config[key]).find(Boolean);
      return readableId(rule || formula);
    });
  out = out.replace(/@([A-Za-z][\w-]*)\[([^\]]*)\](?:\{([^}]*)\})?/g,
    (_, type, id, label, offset, whole) => {
      if (label) return choosePlural(label, whole.slice(0, offset));
      if (/^(embed|pdf)$/i.test(type)) return "";
      if (/^(uuid|compendium|actor|item|journalentry|scene|rolltable)$/i.test(type)) return documentLabel(id);
      return readableId(splitRollConfig(id).formula);
    });
  out = replaceInlineRolls(out);
  return out.replace(
    /([\p{L}][\p{L}'’-]{0,40}(?: [\p{L}][\p{L}'’-]{0,40}){0,4});([\p{L}][\p{L}'’-]{0,40}(?: [\p{L}][\p{L}'’-]{0,40}){0,4})/gu,
    (match, singular, plural, offset, whole) => isPluralPair(singular, plural)
      ? choosePlural(`${singular};${plural}`, whole.slice(0, offset)) : match
  );
}

/** Bracket depth keeps dice flavor such as 2d6[fire] inside its inline roll. */
function replaceInlineRolls(text) {
  let output = "";
  let cursor = 0;
  let start;
  while ((start = text.indexOf("[[", cursor)) >= 0) {
    let depth = 0;
    let end = start + 2;
    for (; end < text.length; end += 1) {
      if (text[end] === "[") depth += 1;
      else if (text[end] === "]") {
        if (depth > 0) depth -= 1;
        else if (text[end + 1] === "]") break;
      }
    }
    if (end >= text.length) break;
    output += text.slice(cursor, start);
    const label = text.slice(end + 2).match(/^\{([^}]*)\}/);
    output += label ? choosePlural(label[1], output) : inlineRollLabel(text.slice(start + 2, end));
    cursor = end + 2 + (label?.[0].length ?? 0);
  }
  return output + text.slice(cursor);
}

function choosePlural(label, before) {
  const parts = String(label).split(";").map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const match = String(before).match(/(\d+)\s*$/);
  return match && Number(match[1]) !== 1 ? parts[1] : parts[0];
}

function isPluralPair(singular, plural) {
  const one = singular.toLowerCase();
  const many = plural.toLowerCase();
  if (one === many || many === `${one}s` || many === `${one}es`) return true;
  if (one.endsWith("y") && many === `${one.slice(0, -1)}ies`) return true;
  if (one.endsWith("f") && many === `${one.slice(0, -1)}ves`) return true;
  if (one.endsWith("fe") && many === `${one.slice(0, -2)}ves`) return true;
  return many.startsWith(one) && many.length - one.length <= 3;
}

function readableId(id) {
  const tail = String(id ?? "").split(/[#?]/)[0].split(".").pop() ?? "";
  if (!tail || /^[a-f0-9]{16,}$/i.test(tail)) return "";
  return tail.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function documentLabel(id) {
  // Resolve only documents already loaded by Foundry; never fetch or run an enricher.
  try {
    const name = globalThis.fromUuidSync?.(id)?.name;
    if (name) return name;
  } catch (_) { /* Unloaded compendium document: prefer an explicit label. */ }
  const tail = String(id).split(".").pop();
  if (/^[A-Za-z0-9]{16}$/.test(tail)) return "";
  return readableId(id);
}

const ROLL_FLAGS = new Set(["average", "extended", "critical", "hideDC", "passive"]);
const ABILITY_NAMES = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma"
};

function inlineRollLabel(body) {
  let rest = String(body).trim();
  const command = rest.match(/^\/([a-z]+)\s*/i);
  const kind = command?.[1].toLowerCase() ?? "";
  if (command) rest = rest.slice(command[0].length);
  if (kind === "lookup") return "";
  rest = rest.split("#")[0].split(/\s+\|\s+/)[0].trim();
  if (["damage", "heal", "healing"].includes(kind) && rest.includes("&")) {
    return rest.split(/\s*&\s*/).map(part => inlineRollLabel(`/${kind} ${part}`)).join(" + ");
  }
  const { formula, config } = splitRollConfig(rest);
  if (["save", "concentration", "check", "skill", "tool"].includes(kind)) {
    const tokens = formula.split(/\s+/);
    const ability = config.ability ?? tokens.find(token => ABILITY_NAMES[token.toLowerCase()]);
    const abilityName = String(ability ?? "").split(/[|/]/)
      .map(key => ABILITY_NAMES[key.toLowerCase()] ?? readableId(key)).filter(Boolean).join(" or ");
    const dc = config.dc ?? tokens.find(token => /^\d+$/.test(token));
    const check = [abilityName, readableId(config.skill ?? config.tool)].filter(Boolean).join(" ");
    const suffix = kind === "concentration" ? "Concentration saving throw"
      : kind === "save" ? "saving throw" : "check";
    return [dc && config.hidedc !== "true" ? `DC ${humanizeFormula(dc)}` : "", check, suffix].filter(Boolean).join(" ");
  }
  const dice = humanizeFormula(formula.replace(/\[([^\]]+)\]/g, " $1"));
  const type = String(config.type ?? "").replace(/[,|_-]+/g, " ").trim();
  return [dice, type].filter(Boolean).join(" ");
}

/** dnd5e config allows quoted values and key=value tokens anywhere in the expression. */
function splitRollConfig(input) {
  const formula = [];
  const config = {};
  for (const token of String(input).match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
    const eq = token.match(/^([A-Za-z][\w-]*)=(.*)$/);
    if (eq) config[eq[1].toLowerCase()] = eq[2].replace(/^"|"$/g, "");
    else if (!ROLL_FLAGS.has(token)) formula.push(token.replace(/^"|"$/g, ""));
  }
  return { formula: formula.join(" ").trim(), config };
}

function humanizeFormula(formula) {
  return String(formula)
    .replace(/@abilities\.([a-z]{3})\.(mod|value|save|dc)/gi, (_, abl, prop) => {
      const name = ABILITY_NAMES[abl.toLowerCase()] || abl.toUpperCase();
      if (prop.toLowerCase() === "mod") return `${name} modifier`;
      if (["save", "dc"].includes(prop.toLowerCase())) return `${name} save`;
      return name;
    })
    .replace(/@mod\b/gi, "ability modifier")
    .replace(/@prof\b/gi, "proficiency bonus")
    .replace(/@([a-z][\w-]*(?:\.[\w-]+)+)/gi, (_, path) => path.replace(/[._-]+/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", times: "×", divide: "÷", plusmn: "±",
  copy: "©", reg: "®", trade: "™", deg: "°", thinsp: " ", ensp: " ", emsp: " ",
  minus: "−", le: "≤", ge: "≥"
};
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, code) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const value = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value) : "";
    }
    const known = ENTITIES[code.toLowerCase()];
    if (known != null) return known;
    if (globalThis.document?.createElement) {
      const decoder = document.createElement("textarea");
      decoder.innerHTML = match;
      return decoder.value;
    }
    return match;
  });
}

/** Validate actual translations and the feature tooltips that consume them. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const raw = fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8');
const translations = JSON.parse(raw);
const lookup = key => key.split('.').reduce((value, part) => value?.[part], translations);
globalThis.game = {
  i18n: { format: (key, data = {}) => (lookup(key) ?? key).replace(/\{(\w+)\}/g, (match, name) => data[name] ?? match) },
  user: { isGM: true, targets: new Set() }
};
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} } } };
const { getActionFeatureOptions } = await import('../data/action-features.mjs');
const { t } = await import('../data/actor-options.mjs');
const cases = [
  ['translation objects have no duplicate keys', () => {
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?|true|false|null/g);
    const stack = [];
    const duplicates = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === '{') stack.push(new Set());
      else if (token === '[') stack.push(null);
      else if (token === '}' || token === ']') stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ':') {
        const key = JSON.parse(token);
        const keys = stack.at(-1);
        if (keys?.has(key)) duplicates.push(key);
        keys?.add(key);
      }
    }
    assert.deepEqual(duplicates, []);
  }],
  ['all literal module translation keys exist', () => {
    const missing = new Set();
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'tests') scan(file);
        else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
          for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bt\(["']([^"']+)["']/g)) {
            const key = 'TINHEADS_COMBAT_HUD.' + match[1];
            if (typeof lookup(key) !== 'string') missing.add(key);
          }
        }
      }
    }
    scan(path.join(root, 'scripts'));
    assert.deepEqual([...missing], []);
  }],
  ...['Fey Presence', 'Healing Hands'].map(name => [name + ' tooltip shows translated uses', () => {
    const item = {
      id: name, name, type: 'feat', isOwner: true,
      system: {
        activation: { type: 'action' }, uses: { max: 1, spent: 0 },
        description: { value: '<p>Use this feature as an action.</p>' },
        activities: [{ id: 'use', name, type: 'utility', activation: { type: 'action' } }]
      }
    };
    const option = getActionFeatureOptions({ items: [item], system: {} }).find(entry => entry.name === name);
    assert(option, name + ' is on the action feature list');
    assert.match(option.tooltip.description, /^Uses remaining: 1\/1\. Use this feature as an action\.$/);
    assert(!option.tooltip.description.includes('TINHEADS_COMBAT_HUD'));
    assert.equal(option.usesLabel, '1/1');
  }]),
  ['character and monster feature labels both survive', () => {
    assert.equal(t('Features.Label'), 'Features');
    assert.equal(t('Features.Hint'), 'Features from this creature.');
    assert.equal(t('Features.ClassFeatureHint'), 'Class feature from your character sheet.');
    assert.equal(t('Features.OpenModesHint'), 'Hover for options (e.g. Channel Divinity modes).');
  }]
];
let failed = 0;
for (const [name, test] of cases) {
  try { test(); console.log('PASS ' + name); }
  catch (error) { failed += 1; console.error('FAIL ' + name + ': ' + error.message); }
}
console.log(`${cases.length - failed}/${cases.length} localization cases passed`);
if (failed) process.exitCode = 1;

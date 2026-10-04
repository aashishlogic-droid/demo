// The wall's rules, as a pure function: no network, no disk, no GitHub.
// The bot (check-pr.cjs) and the site build (build-wall.mjs) both use this file,
// so a card that passes review is exactly a card the wall can render.

export const LIMITS = { name: [1, 60], where: [1, 60], 'first-fix': [10, 140], link: [0, 200] };
export const REQUIRED = ['name', 'where', 'first-fix'];
export const OPTIONAL = ['link'];
const KNOWN = [...REQUIRED, ...OPTIONAL];
const MAX_BYTES = 1024;
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at'];

// Characters that hide or reorder text: control chars (except \n \t), bidi overrides, zero-width.
const SNEAKY = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const URLISH = /(https?:\/\/|www\.|\b[\w.-]+@[\w-]+\.\w+|\[[^\]]*\]\([^)]*\))/i;

/** Turn a label someone typed into the key they probably meant. */
function suggestKey(raw) {
  const k = raw.toLowerCase().replace(/[\s_]+/g, '-');
  if (KNOWN.includes(k)) return k;
  if (/^first-?fix$/.test(k.replace(/-/g, ''))) return 'first-fix';
  if (['city', 'location', 'place', 'from'].includes(k)) return 'where';
  if (['url', 'website', 'site', 'portfolio'].includes(k)) return 'link';
  return null;
}

/**
 * Parse and check a card's text. Returns { problems: [{check, text}], card, held }.
 * check is 'Front matter' or 'Length', matching the bot's comment.
 */
export function validateCard(text, { blockedDomains = [], holdWords = [] } = {}) {
  const problems = [];
  const fm = (t) => problems.push({ check: 'Front matter', text: t });
  const len = (t) => problems.push({ check: 'Length', text: t });

  if (typeof text !== 'string') { fm('The file could not be read as text.'); return { problems, card: null, held: false }; }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fm(`The file is ${Buffer.byteLength(text, 'utf8')} bytes. A card is a few short lines, under ${MAX_BYTES} bytes.`);
  if (SNEAKY.test(text)) fm('Something in the file isn\'t plain text (a hidden or control character). Copy the example again and retype your answers.');

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0].trim() !== '---') {
    fm('The first line should be three hyphens: ---');
    return { problems, card: null, held: false };
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close === -1) {
    fm('There\'s no closing --- line. Add a line with three hyphens after your last field.');
    return { problems, card: null, held: false };
  }
  if (lines.slice(close + 1).some((l) => l.trim() !== '')) fm('Nothing goes after the closing --- line. Delete anything below it.');

  const card = {};
  const seen = new Set();
  lines.slice(1, close).forEach((line, i) => {
    const n = i + 2; // line number in the file
    if (line.trim() === '') return;
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) { fm(`Line ${n} has no colon. Each line is a label, a colon, a space, then the value.`); return; }
    const rawKey = m[1].trim();
    let value = m[2];
    const key = KNOWN.includes(rawKey) ? rawKey : null;
    if (!key) {
      const guess = suggestKey(rawKey);
      fm(guess ? `No ${guess} found, but there's a line labelled "${rawKey}". Did you mean ${guess}? Labels need a hyphen where shown, a colon and then a space.`
               : `"${rawKey}" isn't a field the wall uses. The fields are name, where, first-fix and link. Remove that line.`);
      return;
    }
    if (seen.has(key)) { fm(`${key} appears twice. Keep one.`); return; }
    seen.add(key);
    if (value.length && !value.startsWith(' ')) fm(`Line ${n}: add a space after the colon in "${key}:".`);
    value = value.trim();
    const q = value.match(/^"(.*)"$/) || value.match(/^'(.*)'$/);
    if (q) value = q[1];
    else if (/:\s/.test(value)) fm(`Your ${key} contains a colon followed by a space. Wrap the whole value in double quotes: ${key}: "${value}"`);
    else if (/^["']/.test(value)) fm(`Your ${key} starts with a quote mark but doesn't end with one.`);
    card[key] = value;
  });

  for (const k of REQUIRED) {
    if (!(k in card) && !problems.some((p) => p.text.includes(`Did you mean ${k}?`))) fm(`No ${k} found. Add a line: ${k}: …`);
  }

  for (const k of ['name', 'where', 'first-fix']) {
    if (!(k in card)) continue;
    const v = card[k];
    const [min, max] = LIMITS[k];
    if (v.length === 0) len(`${k} is empty.`);
    else if (v.length < min || v.length > max) len(`${k} is ${v.length} characters (${v.length < min ? `at least ${min}` : `limit ${max}`}).`);
    if (URLISH.test(v)) fm(`Links go in link, and only one. Remove the address from ${k}.`);
    if (/[<>]/.test(v)) fm(`${k} can't contain < or >.`);
  }

  if ('link' in card && card.link !== '') {
    const v = card.link;
    let u = null;
    try { u = new URL(v); } catch { /* handled below */ }
    if (!u || u.protocol !== 'https:') fm('link must be a full address starting with https://');
    else {
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (u.username || u.password) fm('link can\'t contain a username or password.');
      if (u.search || u.hash) fm('link should be a plain page address, without ? or # parts.');
      if (v.length > LIMITS.link[1]) len(`link is ${v.length} characters (limit ${LIMITS.link[1]}).`);
      if (SHORTENERS.includes(host) || blockedDomains.includes(host)) fm('Use the full address of your own page in link, not a shortened or blocked one.');
    }
  }

  const words = holdWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const all = Object.values(card).join(' ').toLowerCase();
  const held = words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(all));

  return { problems, card, held };
}

/**
 * Check a whole pull request.
 * files: [{ filename, status }] from the PR; author: PR author's login;
 * content: text of the single card file (or null); existsOnMain: does designers/<author>.md exist on main.
 * Returns { ok, held, handle, checks: [{ name, ok, detail }] }.
 */
export function validatePR({ files, author, content, existsOnMain = false, blockedHandles = [], blockedDomains = [], holdWords = [] }) {
  const handle = String(author || '').toLowerCase();
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const expected = `designers/${handle}.md`;

  if (blockedHandles.map((h) => h.trim().toLowerCase()).includes(handle)) {
    return { ok: false, blocked: true, held: false, handle, checks: [{ name: 'Author', ok: false, detail: 'This account can\'t add a card to the wall.' }] };
  }

  // One file
  const changed = files || [];
  const one = changed.length === 1 && ['added', 'modified'].includes(changed[0].status);
  if (changed.length !== 1) add('One file', false, `This PR changes ${changed.length} files. A wall card is one file in designers/. Remove the other changes, or close this PR and start again from the wall's page.`);
  else if (!['added', 'modified'].includes(changed[0].status)) add('One file', false, `This PR ${changed[0].status === 'removed' ? 'deletes' : 'renames'} a file. To change your card, edit it; to remove it, open an issue.`);
  else add('One file', true, `1 file ${changed[0].status === 'added' ? 'added' : 'edited'}, nothing else changed.`);

  const file = one ? changed[0].filename : null;

  // Folder
  if (!file) add('Folder', false, 'Checked once there is exactly one file.');
  else if (!/^designers\/[^/]+$/.test(file)) add('Folder', false, `Your file is at ${file}. Move it into the designers/ folder: edit the file name and type designers/ in front of it.`);
  else add('Folder', true, file);

  // Filename
  if (!file) add('Filename', false, 'Checked once there is exactly one file.');
  else {
    const base = file.split('/').pop();
    if (base.toLowerCase() !== `${handle}.md` || base.startsWith('_')) add('Filename', false, `This PR was opened by @${author}, but the file is ${file}. Rename it to ${expected} so the card can only ever be yours.`);
    else if (changed[0].status === 'added' && existsOnMain) add('Filename', false, `You already have a card at ${expected}. To change it, open that file on the wall's page and edit it instead of adding a new one.`);
    else if (changed[0].status === 'modified' && !existsOnMain) add('Filename', false, `${expected} isn't on the wall yet, so there's nothing to edit. Add it as a new file.`);
    else add('Filename', true, `Matches the PR author, @${author}.`);
  }

  // Front matter + Length
  let held = false;
  if (!file || !file.endsWith('.md') || content == null) {
    add('Front matter', false, 'Checked once the file is in the right place with the right name.');
    add('Length', false, 'Checked once the front matter reads correctly.');
  } else {
    const r = validateCard(content, { blockedDomains, holdWords });
    held = r.held;
    const fm = r.problems.filter((p) => p.check === 'Front matter').map((p) => p.text);
    const ln = r.problems.filter((p) => p.check === 'Length').map((p) => p.text);
    const found = r.card ? REQUIRED.filter((k) => k in r.card) : [];
    add('Front matter', fm.length === 0, fm.length ? fm.join(' ') : `${found.join(', ')} found.${r.card && r.card.link ? ' link is a valid URL.' : ''}`);
    add('Length', ln.length === 0 && fm.length === 0, ln.length ? ln.join(' ') : (fm.length ? 'Checked once the front matter reads correctly.' : `first-fix is ${r.card['first-fix'].length} characters (limit ${LIMITS['first-fix'][1]}).`));
  }

  return { ok: checks.every((c) => c.ok), held, handle, checks };
}

/** The sticky comment, in the same shape Chapter 1 shows. */
export function formatComment({ result, sha, siteUrl, author, merging }) {
  const marker = '<!-- wall-bot -->';
  const rows = result.checks.map((c) => {
    const tag = c.ok ? 'PASS' : 'FLAG';
    const words = c.detail.split(' ');
    const wrapped = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 52) { wrapped.push(line.trim()); line = w; } else line += ' ' + w;
    }
    if (line.trim()) wrapped.push(line.trim());
    return `${tag}  ${c.name.padEnd(13)} ${wrapped.join('\n' + ' '.repeat(20))}`;
  });
  const head = `Wall bot · checked commit ${String(sha).slice(0, 7)}`;
  let tail;
  if (result.blocked) tail = '';
  else if (result.ok && result.held) tail = `Looks right, @${author}. A person will look at this one before it goes up, usually within a day.`;
  else if (result.ok) tail = merging ? 'All good. Merging now.' : 'All good. Auto-merge is paused right now, so a person will merge this soon.';
  else tail = `Nearly there, @${author}. Fix the FLAG lines on your branch (open the file from your fork, click the pencil, Commit changes) and I'll check again automatically.`;
  return `${marker}\n\`\`\`\n${head}\n\n${rows.join('\n')}\n\`\`\`\n${tail}`;
}

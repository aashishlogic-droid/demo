import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCard, validatePR, formatComment } from './validate.mjs';

const good = `---
name: Sam Okafor
where: Leeds, UK
first-fix: The empty state on our search page says "No results" and nothing else.
link: https://samokafor.example
---
`;
const pr = (over = {}) => validatePR({
  files: [{ filename: 'designers/samokafor.md', status: 'added' }],
  author: 'samokafor', content: good, existsOnMain: false, ...over,
});
const flags = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test('a correct card passes every check', () => {
  const r = pr();
  assert.equal(r.ok, true, JSON.stringify(r.checks, null, 2));
  assert.deepEqual(r.checks.map((c) => c.name), ['One file', 'Folder', 'Filename', 'Front matter', 'Length']);
});

test('link is optional', () => {
  assert.equal(pr({ content: good.replace(/link:.*\n/, '') }).ok, true);
});

test('handles are matched case-insensitively', () => {
  assert.equal(pr({ author: 'SamOkafor' }).ok, true);
});

test('more than one file is flagged', () => {
  const r = pr({ files: [{ filename: 'designers/samokafor.md', status: 'added' }, { filename: 'README.md', status: 'modified' }] });
  assert.deepEqual(flags(r).includes('One file'), true);
  assert.match(r.checks[0].detail, /changes 2 files/);
});

test('file outside designers/ is flagged with the move instruction', () => {
  const r = pr({ files: [{ filename: 'samokafor.md', status: 'added' }] });
  assert.ok(flags(r).includes('Folder'));
  assert.match(r.checks[1].detail, /type designers\/ in front/);
});

test('subfolders are not allowed', () => {
  assert.ok(flags(pr({ files: [{ filename: 'designers/x/samokafor.md', status: 'added' }] })).includes('Folder'));
});

test('filename must match the author (the Chapter 1 example)', () => {
  const r = pr({ files: [{ filename: 'designers/sam.md', status: 'added' }] });
  assert.ok(flags(r).includes('Filename'));
  assert.match(r.checks[2].detail, /Rename it to designers\/samokafor\.md/);
});

test('editing someone else\'s card is flagged', () => {
  assert.ok(flags(pr({ files: [{ filename: 'designers/alex.md', status: 'modified' }], existsOnMain: true })).includes('Filename'));
});

test('editing your own existing card passes', () => {
  assert.equal(pr({ files: [{ filename: 'designers/samokafor.md', status: 'modified' }], existsOnMain: true }).ok, true);
});

test('adding a second card for the same handle is flagged', () => {
  assert.ok(flags(pr({ existsOnMain: true })).includes('Filename'));
});

test('deleting or renaming is flagged', () => {
  assert.ok(flags(pr({ files: [{ filename: 'designers/samokafor.md', status: 'removed' }] })).includes('One file'));
  assert.ok(flags(pr({ files: [{ filename: 'designers/samokafor.md', status: 'renamed' }] })).includes('One file'));
});

test('"first fix" without a hyphen gets the did-you-mean (Chapter 1 example)', () => {
  const r = validateCard(good.replace('first-fix:', 'first fix:'));
  assert.ok(r.problems.some((p) => /Did you mean first-fix\?/.test(p.text)), JSON.stringify(r.problems));
  assert.ok(!r.problems.some((p) => /No first-fix found\. Add/.test(p.text)), 'no duplicate missing-field message');
});

test('unquoted colon in a value asks for quotes; quoted passes', () => {
  const bad = good.replace(/first-fix:.*/, "first-fix: Checkout: the error says 'Something went wrong'");
  assert.ok(validateCard(bad).problems.some((p) => /Wrap the whole value in double quotes/.test(p.text)));
  const ok = good.replace(/first-fix:.*/, `first-fix: "Checkout: the error says 'Something went wrong'"`);
  assert.equal(validateCard(ok).problems.length, 0);
});

test('missing space after the colon is flagged', () => {
  assert.ok(validateCard(good.replace('where: Leeds', 'where:Leeds')).problems.some((p) => /add a space after the colon/.test(p.text)));
});

test('missing opening or closing dashes', () => {
  assert.match(validateCard(good.replace(/^---\n/, '')).problems[0].text, /first line should be three hyphens/);
  assert.match(validateCard(good.replace(/\n---\n$/, '\n')).problems[0].text, /no closing ---/);
});

test('text after the closing dashes is flagged', () => {
  assert.ok(validateCard(good + 'Hello!\n').problems.some((p) => /Nothing goes after/.test(p.text)));
});

test('missing required field', () => {
  assert.ok(validateCard(good.replace(/where:.*\n/, '')).problems.some((p) => /No where found/.test(p.text)));
});

test('unknown field', () => {
  assert.ok(validateCard(good.replace('link:', 'twitter:')).problems.some((p) => /isn't a field the wall uses/.test(p.text)));
});

test('duplicate field', () => {
  assert.ok(validateCard(good.replace('name: Sam Okafor', 'name: Sam Okafor\nname: Sam')).problems.some((p) => /appears twice/.test(p.text)));
});

test('first-fix length limits', () => {
  const long = good.replace(/first-fix:.*/, 'first-fix: ' + 'x'.repeat(141));
  assert.ok(validateCard(long).problems.some((p) => p.check === 'Length' && /141 characters \(limit 140\)/.test(p.text)));
  const short = good.replace(/first-fix:.*/, 'first-fix: Too short');
  assert.ok(validateCard(short).problems.some((p) => /at least 10/.test(p.text)));
});

test('links only in link; https only; no shorteners; no query', () => {
  assert.ok(validateCard(good.replace('Leeds, UK', 'see https://x.com')).problems.some((p) => /Links go in link/.test(p.text)));
  assert.ok(validateCard(good.replace('https://samokafor.example', 'http://samokafor.example')).problems.some((p) => /https:\/\//.test(p.text)));
  assert.ok(validateCard(good.replace('https://samokafor.example', 'https://bit.ly/abc')).problems.some((p) => /shortened or blocked/.test(p.text)));
  assert.ok(validateCard(good.replace('https://samokafor.example', 'https://samokafor.example/?ref=x')).problems.some((p) => /without \? or #/.test(p.text)));
  assert.ok(validateCard(good, { blockedDomains: ['samokafor.example'] }).problems.some((p) => /blocked/.test(p.text)));
});

test('hidden characters and HTML are rejected', () => {
  assert.ok(validateCard(good.replace('Sam', 'Sa‮m')).problems.some((p) => /isn't plain text/.test(p.text)));
  assert.ok(validateCard(good.replace('Sam Okafor', '<b>Sam</b>')).problems.some((p) => /can't contain </.test(p.text)));
});

test('Windows line endings are fine', () => {
  assert.equal(validateCard(good.replace(/\n/g, '\r\n')).problems.length, 0);
});

test('hold words send the card to a person, not a rejection', () => {
  const r = pr({ holdWords: ['crypto'], content: good.replace('search page', 'crypto page') });
  assert.equal(r.ok, true);
  assert.equal(r.held, true);
});

test('blocked handles are refused', () => {
  const r = pr({ blockedHandles: ['samokafor'] });
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true);
});

test('the comment matches Chapter 1\'s shape', () => {
  const c = formatComment({ result: pr(), sha: '4f9a2c1deadbeef', author: 'samokafor', merging: true });
  assert.match(c, /^<!-- wall-bot -->/);
  assert.match(c, /Wall bot · checked commit 4f9a2c1/);
  assert.match(c, /PASS  One file/);
  assert.match(c, /All good\. Merging now\./);
  const f = formatComment({ result: pr({ files: [{ filename: 'designers/sam.md', status: 'added' }] }), sha: 'abc1234', author: 'samokafor' });
  assert.match(f, /FLAG  Filename/);
  assert.match(f, /Nearly there, @samokafor/);
});

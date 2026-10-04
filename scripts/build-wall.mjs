// designers/*.md → dist/index.html. Uses the same validator as the bot, so only cards
// that pass review are ever rendered. Every value is HTML-escaped.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCard } from './validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'wall.config.json'), 'utf8'));
const list = (f) => { try { return readFileSync(join(ROOT, 'moderation', f), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); } catch { return []; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// When was each card first added? (Needs full git history in CI: fetch-depth 0.)
function addedAt(file) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop();
    return out || null;
  } catch { return null; }
}

const blocked = list('blocked-handles.txt').map((h) => h.toLowerCase());
const cards = [];
for (const f of readdirSync(join(ROOT, 'designers')).sort()) {
  if (!f.endsWith('.md') || f.startsWith('_')) continue;
  const handle = f.slice(0, -3).toLowerCase();
  if (blocked.includes(handle)) continue;
  const text = readFileSync(join(ROOT, 'designers', f), 'utf8');
  const { problems, card } = validateCard(text, { blockedDomains: list('blocked-domains.txt') });
  if (problems.length) { console.warn(`skip ${f}: ${problems.map((p) => p.text).join(' | ')}`); continue; }
  cards.push({ handle, ...card, added: addedAt(join('designers', f)) || '1970-01-01' });
}
cards.sort((a, b) => b.added.localeCompare(a.added) || a.handle.localeCompare(b.handle));

const linkHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const cardHtml = (c) => `
    <article class="card" id="${esc(c.handle)}">
      <p class="fix">${esc(c['first-fix'])}</p>
      <footer>
        <span class="who"><b>${esc(c.name)}</b> · ${esc(c.where)}</span>
        <span class="meta"><a href="https://github.com/${esc(c.handle)}" rel="nofollow ugc noopener">@${esc(c.handle)}</a>${c.link ? ` · <a href="${esc(c.link)}" rel="nofollow ugc noopener">${esc(linkHost(c.link))}</a>` : ''}</span>
      </footer>
    </article>`;

const n = cards.length;
const addUrl = `https://github.com/${config.repo}/new/main/designers`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The wall · designers who shipped their first pull request</title>
<meta name="description" content="${n} designers who opened, fixed and merged their first pull request, and the first thing each of them wants to fix.">
<meta property="og:title" content="The wall">
<meta property="og:description" content="${n} designers who shipped their first pull request.">
<meta property="og:url" content="${esc(config.siteUrl)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="wrap">
  <header class="top">
    <p class="eyebrow">The wall</p>
    <h1>Designers who shipped their first pull request.</h1>
    <p class="lede">Each card here is a real pull request: opened, checked, fixed if needed, and merged. And on each one, the first thing that designer wants to fix in a product.</p>
    <p class="count"><b>${n}</b> ${n === 1 ? 'designer' : 'designers'} so far</p>
    <a class="cta" href="${esc(addUrl)}">Add yours</a>
  </header>
  <section class="grid" aria-label="Cards">${cards.map(cardHtml).join('')}
  </section>
  ${n === 0 ? '<p class="empty">No cards yet. The first one could be yours.</p>' : ''}
  <footer class="foot">
    <p>From <a href="${esc(config.bookUrl)}">${esc(config.bookName)}</a>, Chapter 1. Cards are added by pull request to <a href="https://github.com/${esc(config.repo)}">${esc(config.repo)}</a>. To report or remove a card, <a href="https://github.com/${esc(config.repo)}/issues/new/choose">open an issue</a>.</p>
  </footer>
</main>
</body>
</html>
`;

const out = join(ROOT, 'dist');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
copyFileSync(join(ROOT, 'site', 'style.css'), join(out, 'style.css'));
if (config.cname) writeFileSync(join(out, 'CNAME'), config.cname + '\n');
writeFileSync(join(out, '.nojekyll'), '');
console.log(`built dist/index.html with ${n} cards`);

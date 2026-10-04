// Runs inside actions/github-script on pull_request_target.
// It only READS the pull request through the GitHub API. It never checks out,
// installs or runs anything from the pull request. The rules live in validate.mjs,
// loaded from this repo's own main branch (the workspace checkout).
const fs = require('fs');
const path = require('path');

const ROOT = process.env.GITHUB_WORKSPACE;
const MARKER = '<!-- wall-bot -->';
const readList = (f) => {
  try { return fs.readFileSync(path.join(ROOT, 'moderation', f), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); }
  catch { return []; }
};

module.exports = async ({ github, context, core }) => {
  const { validatePR, formatComment } = await import(path.join(ROOT, 'scripts', 'validate.mjs'));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'wall.config.json'), 'utf8'));
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  const author = pr.user.login;
  const sha = pr.head.sha;

  // Ignore PRs from people who can write to the repo (maintainers' own work).
  if (['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pr.author_association) && !pr.head.repo.fork) {
    core.info('Maintainer PR: not a wall card, skipping.');
    core.setOutput('ok', 'false');
    return;
  }

  const files = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number, per_page: 100 });

  let content = null;
  if (files.length === 1 && ['added', 'modified'].includes(files[0].status) && files[0].filename.endsWith('.md')) {
    // Read the blob by its hash: plain text, never executed.
    try {
      const blob = await github.rest.git.getBlob({ owner, repo, file_sha: files[0].sha });
      content = Buffer.from(blob.data.content, 'base64').toString('utf8');
    } catch {
      // Fallback: read the same file from the author's fork at the checked commit.
      const r = await github.rest.repos.getContent({ owner: pr.head.repo.owner.login, repo: pr.head.repo.name, path: files[0].filename, ref: sha });
      content = Buffer.from(r.data.content, 'base64').toString('utf8');
    }
  }

  let existsOnMain = false;
  try {
    await github.rest.repos.getContent({ owner, repo, path: `designers/${author.toLowerCase()}.md`, ref: pr.base.ref });
    existsOnMain = true;
  } catch (e) { if (e.status !== 404) throw e; }

  const result = validatePR({
    files: files.map((f) => ({ filename: f.filename, status: f.status })),
    author, content, existsOnMain,
    blockedHandles: readList('blocked-handles.txt'),
    blockedDomains: readList('blocked-domains.txt'),
    holdWords: readList('hold-words.txt'),
  });

  const automerge = (process.env.WALL_AUTOMERGE || 'on') !== 'off';
  const merging = result.ok && !result.held && automerge;
  const body = formatComment({ result, sha, author, merging, siteUrl: config.siteUrl });

  // One sticky comment, edited on every run.
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: pr.number, per_page: 100 });
  const mine = comments.find((c) => c.user.type === 'Bot' && c.body.startsWith(MARKER));
  if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
  else await github.rest.issues.createComment({ owner, repo, issue_number: pr.number, body });

  // Labels: needs-changes while flagged, needs-review when held for a person.
  const want = result.ok ? (result.held ? 'needs-review' : null) : 'needs-changes';
  for (const label of ['needs-changes', 'needs-review']) {
    const has = pr.labels.some((l) => l.name === label);
    if (label === want && !has) await github.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels: [label] });
    if (label !== want && has) await github.rest.issues.removeLabel({ owner, repo, issue_number: pr.number, name: label }).catch(() => {});
  }

  if (result.blocked) {
    await github.rest.pulls.update({ owner, repo, pull_number: pr.number, state: 'closed' });
  }

  core.setOutput('ok', merging ? 'true' : 'false');
  core.setOutput('sha', sha);
  core.setOutput('handle', result.handle);
  core.info(JSON.stringify(result.checks));
};

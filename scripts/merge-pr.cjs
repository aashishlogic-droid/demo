// Runs in the merge job, after check-pr passed. Merges exactly the commit that was checked,
// thanks the author, and asks the deploy workflow to rebuild the wall.
// (A merge made with the built-in token doesn't trigger push workflows, so we dispatch it.)
const fs = require('fs');
const path = require('path');

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  const sha = process.env.CHECKED_SHA;
  const handle = process.env.HANDLE;
  const config = JSON.parse(fs.readFileSync(path.join(process.env.GITHUB_WORKSPACE, 'wall.config.json'), 'utf8'));

  try {
    await github.rest.pulls.merge({
      owner, repo, pull_number: pr.number, sha, merge_method: 'squash',
      commit_title: `Add ${handle} to the wall (#${pr.number})`,
    });
  } catch (e) {
    // 409: the author pushed again after the check. The new push gets its own check.
    core.warning(`Merge skipped: ${e.message}`);
    return;
  }

  await github.rest.issues.createComment({
    owner, repo, issue_number: pr.number,
    body: `Merged. Thanks, @${pr.user.login}.\nYour card will be on the wall within a few minutes:\n${config.siteUrl}#${handle}`,
  });

  await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: 'deploy.yml', ref: pr.base.ref });
};

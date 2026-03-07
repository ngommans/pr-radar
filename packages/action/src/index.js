import * as core from '@actions/core';
import * as github from '@actions/github';
import { throttling } from '@octokit/plugin-throttling';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { detectCollisions } from 'pr-radar-core/detector';
import { upsertComment, deleteComment, findManagedComment, buildCollisionComment, buildClearComment } from 'pr-radar-core/comment';
import { getAllOpenPRsWithFiles, upsertCheckRun, postCommitStatus } from 'pr-radar-core/github-api';

async function run() {
  const token = core.getInput('token', { required: true });
  // github.getOctokit returns @octokit/rest with paginate, rest, etc. already included.
  // We wrap it with throttling by passing the plugin via additionalPlugins.
  const octokit = github.getOctokit(token, {
    throttle: {
      onRateLimit: (retryAfter, options, _octokit, retryCount) => {
        core.warning(`PR Radar: rate limit hit. Retry after ${retryAfter}s (attempt ${retryCount + 1})`);
        return retryCount < 3;
      },
      onSecondaryRateLimit: (retryAfter, options) => {
        core.warning(`PR Radar: secondary rate limit hit on ${options.method} ${options.url}`);
        return false;
      },
    },
  }, throttling);
  const ignorePatterns = parseCommaSeparated(core.getInput('ignore-patterns'));
  const autoIgnore = parseCommaSeparated(core.getInput('auto-ignore'));
  const paths = parseCommaSeparated(core.getInput('paths'));
  const checkMode = core.getInput('check-mode') || 'auto';
  const commentMode = core.getInput('comment-mode') || 'upsert';
  const skipDrafts = core.getInput('skip-drafts') === 'true';

  const context = github.context;
  const { owner, repo } = context.repo;
  const triggeringPR = context.payload.pull_request;

  if (!triggeringPR) {
    core.warning('PR Radar: no pull_request payload found. Skipping.');
    return;
  }

  // Wrap octokit.paginate to count calls and emit rate-limit warnings
  let apiCallCount = 0;
  const originalPaginate = octokit.paginate.bind(octokit);
  octokit.paginate = async (...args) => {
    apiCallCount++;
    if (apiCallCount === 500) {
      core.warning('PR Radar: ~500 API calls made in this run. Consider using path scoping (paths input) or additional ignore-patterns to reduce API usage.');
    }
    return originalPaginate(...args);
  };

  // Load and merge ignore patterns
  const allIgnorePatterns = [...ignorePatterns];
  allIgnorePatterns.push(...loadIgnoreFiles(autoIgnore));

  const isClosed = context.payload.action === 'closed';
  const checkedAt = new Date().toISOString();

  // Fetch all open PRs with file lists
  let allPRs = await getAllOpenPRsWithFiles(octokit, owner, repo);

  // Warn about truncated file lists
  for (const pr of allPRs) {
    if (pr.truncated) {
      core.warning(`PR Radar: PR #${pr.pr_number} (${pr.branch}) hit the 300-file API cap. Collision detection for this PR may be incomplete.`);
    }
  }

  if (skipDrafts) {
    allPRs = allPRs.filter(pr => !pr.draft);
  }

  // Apply path scoping if configured
  if (paths.length > 0) {
    for (const pr of allPRs) {
      pr.file_paths = pr.file_paths.filter(f => paths.some(p => f.startsWith(p)));
    }
  }

  if (isClosed) {
    // PR was closed — re-evaluate all remaining open PRs
    // The triggering PR is already gone from the open list
    await evaluateAllPRs(octokit, owner, repo, allPRs, allIgnorePatterns, checkMode, commentMode, checkedAt);
    return;
  }

  // Build fileMap for collision detection
  const fileMap = Object.fromEntries(
    allPRs.map(pr => [String(pr.pr_number), pr.file_paths])
  );

  const prMeta = Object.fromEntries(
    allPRs.map(pr => [String(pr.pr_number), {
      number: pr.pr_number,
      title: pr.title,
      branch: pr.branch,
      draft: pr.draft,
    }])
  );

  const { collisions } = detectCollisions(fileMap, allIgnorePatterns);

  // Determine which PRs are involved in any collision
  const involvedPRNumbers = new Set([String(triggeringPR.number)]);
  for (const collision of collisions) {
    for (const src of collision.sources) {
      involvedPRNumbers.add(src);
    }
  }

  // Update all involved PRs
  for (const prNumberStr of involvedPRNumbers) {
    const prNumber = parseInt(prNumberStr, 10);
    const prData = allPRs.find(p => p.pr_number === prNumber);
    if (!prData) continue;

    // Compute collisions from this PR's perspective
    const myCollisions = collisions.filter(c => c.sources.includes(prNumberStr));

    try {
      await updatePR(octokit, owner, repo, prData, myCollisions, prMeta, checkMode, commentMode, checkedAt);
    } catch (err) {
      if (prNumber !== triggeringPR.number) {
        core.warning(`PR Radar: could not update sibling PR #${prNumber}: ${err.message}. The triggering PR has been fully updated.`);
      } else {
        throw err;
      }
    }
  }
}

async function updatePR(octokit, owner, repo, prData, myCollisions, prMeta, checkMode, commentMode, checkedAt) {
  const hasCollisions = myCollisions.length > 0;

  const checkTitle = hasCollisions
    ? `⚠️ ${myCollisions.length} file(s) shared with ${countSiblingPRs(myCollisions)} PR(s)`
    : 'No file collisions';

  const checkConclusion = hasCollisions ? 'neutral' : 'success';

  const commentBody = hasCollisions
    ? buildCollisionComment(myCollisions, prMeta, checkedAt)
    : buildClearComment(checkedAt);

  // Post check run
  if (checkMode === 'check-run' || checkMode === 'auto') {
    try {
      await upsertCheckRun(octokit, owner, repo, prData.head_sha, checkConclusion, `PR Radar — ${checkTitle}`, commentBody);
    } catch (err) {
      if (checkMode === 'auto') {
        core.warning(`PR Radar: checks:write unavailable for PR #${prData.pr_number}, falling back to commit status: ${err.message}`);
        await postCommitStatus(octokit, owner, repo, prData.head_sha, hasCollisions ? 'pending' : 'success', `PR Radar — ${checkTitle}`);
      } else {
        throw err;
      }
    }
  } else if (checkMode === 'commit-status') {
    await postCommitStatus(octokit, owner, repo, prData.head_sha, hasCollisions ? 'pending' : 'success', `PR Radar — ${checkTitle}`);
  }

  // Post comment
  if (commentMode === 'upsert') {
    await upsertComment(octokit, owner, repo, prData.pr_number, commentBody);
  }
}

async function evaluateAllPRs(octokit, owner, repo, allPRs, ignorePatterns, checkMode, commentMode, checkedAt) {
  const fileMap = Object.fromEntries(allPRs.map(pr => [String(pr.pr_number), pr.file_paths]));
  const prMeta = Object.fromEntries(allPRs.map(pr => [String(pr.pr_number), {
    number: pr.pr_number,
    title: pr.title,
    branch: pr.branch,
    draft: pr.draft,
  }]));

  const { collisions } = detectCollisions(fileMap, ignorePatterns);

  for (const prData of allPRs) {
    const prNumberStr = String(prData.pr_number);
    const myCollisions = collisions.filter(c => c.sources.includes(prNumberStr));
    try {
      await updatePR(octokit, owner, repo, prData, myCollisions, prMeta, checkMode, commentMode, checkedAt);
    } catch (err) {
      core.warning(`PR Radar: could not update PR #${prData.pr_number} after close event: ${err.message}`);
    }
  }
}

function countSiblingPRs(collisions) {
  const siblings = new Set();
  for (const c of collisions) {
    for (const src of c.sources) siblings.add(src);
  }
  return siblings.size;
}

function parseCommaSeparated(input) {
  if (!input || !input.trim()) return [];
  return input.split(',').map(s => s.trim()).filter(Boolean);
}

function loadIgnoreFiles(autoIgnore) {
  const patterns = [];
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  // .prradarignore is always loaded if present
  const prradarIgnore = join(workspace, '.prradarignore');
  if (existsSync(prradarIgnore)) {
    patterns.push(...parseIgnoreFile(prradarIgnore));
  }

  const fileMap = {
    gitignore: '.gitignore',
    npmignore: '.npmignore',
    prettierignore: '.prettierignore',
    eslintignore: '.eslintignore',
  };

  for (const key of autoIgnore) {
    const filename = fileMap[key];
    if (!filename) continue;
    const filePath = join(workspace, filename);
    if (existsSync(filePath)) {
      patterns.push(...parseIgnoreFile(filePath));
    }
  }

  return patterns;
}

function parseIgnoreFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

run().catch(err => {
  core.setFailed(`PR Radar failed: ${err.message}`);
});

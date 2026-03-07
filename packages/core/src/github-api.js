const MAX_FILES_PER_PR = 300;

/**
 * Fetch all open PRs with their changed file lists.
 * Handles pagination (> 100 PRs, > 300 files per PR).
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<PRWithFiles[]>}
 */
export async function getAllOpenPRsWithFiles(octokit, owner, repo) {
  const prs = await octokit.paginate('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  const results = await Promise.all(prs.map(async (pr) => {
    const files = await octokit.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });

    const truncated = files.length >= MAX_FILES_PER_PR;
    const filePaths = files.map(f => f.filename);

    return {
      pr_number: pr.number,
      title: pr.title,
      branch: pr.head.ref,
      head_sha: pr.head.sha,
      draft: pr.draft ?? false,
      file_paths: filePaths,
      truncated,
    };
  }));

  return results;
}

/**
 * Post or update a check run for a given PR head SHA.
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} headSha
 * @param {'success' | 'neutral'} conclusion
 * @param {string} title
 * @param {string} summary
 * @returns {Promise<{id: number, html_url: string}>}
 */
export async function upsertCheckRun(octokit, owner, repo, headSha, conclusion, title, summary) {
  const { data } = await octokit.request('POST /repos/{owner}/{repo}/check-runs', {
    owner,
    repo,
    name: 'PR Radar',
    head_sha: headSha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
    },
  });

  return { id: data.id, html_url: data.html_url };
}

/**
 * Post or update a commit status (fallback when checks:write is unavailable).
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} headSha
 * @param {'success' | 'pending'} state - commit statuses use 'pending' for warn (no neutral)
 * @param {string} description
 * @returns {Promise<void>}
 */
export async function postCommitStatus(octokit, owner, repo, headSha, state, description) {
  await octokit.request('POST /repos/{owner}/{repo}/statuses/{sha}', {
    owner,
    repo,
    sha: headSha,
    state,
    description: description.slice(0, 140), // GitHub limit
    context: 'PR Radar',
    target_url: 'https://github.com/ngommans/pr-radar',
  });
}

/**
 * @typedef {Object} PRWithFiles
 * @property {number} pr_number
 * @property {string} title
 * @property {string} branch
 * @property {string} head_sha
 * @property {boolean} draft
 * @property {string[]} file_paths
 * @property {boolean} truncated - true if GitHub's 300-file cap was reached
 */

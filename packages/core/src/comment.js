export const MANAGED_COMMENT_MARKER = '<!-- pr-radar-managed-comment -->';

/**
 * Find an existing managed comment in a PR's comment list.
 * Matches on MANAGED_COMMENT_MARKER.
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<{id: number, body: string} | null>}
 */
export async function findManagedComment(octokit, owner, repo, prNumber) {
  const comments = await octokit.paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  return comments.find(c => c.body && c.body.includes(MANAGED_COMMENT_MARKER)) ?? null;
}

/**
 * Upsert (create or update) the managed comment on a PR.
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @param {string} body - full comment body (must include MANAGED_COMMENT_MARKER)
 * @returns {Promise<{id: number, html_url: string}>}
 */
export async function upsertComment(octokit, owner, repo, prNumber, body) {
  const existing = await findManagedComment(octokit, owner, repo, prNumber);

  if (existing) {
    const { data } = await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { id: data.id, html_url: data.html_url };
  }

  const { data } = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return { id: data.id, html_url: data.html_url };
}

/**
 * Delete the managed comment (used when a PR is closed).
 *
 * @param {import('@octokit/core').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} commentId
 * @returns {Promise<void>}
 */
export async function deleteComment(octokit, owner, repo, commentId) {
  await octokit.request('DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}', {
    owner,
    repo,
    comment_id: commentId,
  });
}

/**
 * Build the comment body for a PR with collisions.
 *
 * @param {import('./detector.js').CollisionEntry[]} collisions
 * @param {Record<string, {number: number, title: string, branch: string, draft: boolean}>} prMeta
 * @param {string} checkedAt - ISO timestamp
 * @returns {string}
 */
export function buildCollisionComment(collisions, prMeta, checkedAt) {
  const rows = collisions.map(({ file, sources }) => {
    const prs = sources.map(src => {
      const meta = prMeta[src];
      const draft = meta?.draft ? ' *(draft)*' : '';
      return meta ? `#${meta.number} (${meta.branch})${draft}` : `#${src}`;
    }).join(', ');
    return `| \`${file}\` | ${prs} |`;
  });

  return `${MANAGED_COMMENT_MARKER}
## ⚠️ PR Radar — File Collision Warning

The following files are also modified by other open PRs:

| File | Colliding PRs |
|------|---------------|
${rows.join('\n')}

> **What this means:** These PRs are touching the same files. This does not guarantee a merge conflict, but it increases coordination risk. Review the linked PRs before merging.

<details>
<summary>What to do</summary>

- Check whether your changes to these files are logically independent
- If not, coordinate with the authors of the colliding PRs
- Consider rebasing or stacking if the work is sequential
- This warning clears automatically when collisions are resolved

</details>

---
*Last checked: ${checkedAt} — [PR Radar](https://github.com/ngommans/pr-radar)*`;
}

/**
 * Build the comment body for a PR with no collisions.
 *
 * @param {string} checkedAt - ISO timestamp
 * @returns {string}
 */
export function buildClearComment(checkedAt) {
  return `${MANAGED_COMMENT_MARKER}
## ✅ PR Radar — No File Collisions

No other open PRs are modifying the same files as this one.

---
*Last checked: ${checkedAt} — [PR Radar](https://github.com/ngommans/pr-radar)*`;
}

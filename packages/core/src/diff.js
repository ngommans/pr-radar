/**
 * Parse a unified diff string and extract per-file statistics.
 *
 * @param {string} diffOutput - output of `git diff`
 * @returns {FileDiffStats[]}
 */
export function getFileDiffStats(diffOutput) {
  const results = [];
  let current = null;

  for (const line of diffOutput.split('\n')) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    if (line.startsWith('diff --git ')) {
      if (current) results.push(current);
      // Extract filename from "diff --git a/foo b/foo"
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
      current = {
        file: match ? match[1] : line,
        added: 0,
        removed: 0,
        hunks: [],
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('@@ ')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        current.hunks.push({
          oldStart: parseInt(hunkMatch[1], 10),
          oldCount: parseInt(hunkMatch[2] ?? '1', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newCount: parseInt(hunkMatch[4] ?? '1', 10),
        });
      }
      continue;
    }

    if (line.startsWith('+')) current.added++;
    else if (line.startsWith('-')) current.removed++;
  }

  if (current) results.push(current);
  return results;
}

/**
 * Identify overlapping hunks between two sets of diff stats for the same file.
 * Returns line ranges where both diffs touch the same original lines.
 *
 * @param {FileDiffStats} statsA
 * @param {FileDiffStats} statsB
 * @returns {OverlapRange[]}
 */
export function findOverlappingHunks(statsA, statsB) {
  const overlaps = [];

  for (const hunkA of statsA.hunks) {
    for (const hunkB of statsB.hunks) {
      const aStart = hunkA.oldStart;
      const aEnd = hunkA.oldStart + hunkA.oldCount - 1;
      const bStart = hunkB.oldStart;
      const bEnd = hunkB.oldStart + hunkB.oldCount - 1;

      // Check for overlap in original line ranges
      if (aStart <= bEnd && bStart <= aEnd) {
        overlaps.push({
          start: Math.max(aStart, bStart),
          end: Math.min(aEnd, bEnd),
        });
      }
    }
  }

  return overlaps;
}

/**
 * @typedef {Object} FileDiffStats
 * @property {string} file
 * @property {number} added
 * @property {number} removed
 * @property {HunkRange[]} hunks
 */

/**
 * @typedef {Object} HunkRange
 * @property {number} oldStart
 * @property {number} oldCount
 * @property {number} newStart
 * @property {number} newCount
 */

/**
 * @typedef {Object} OverlapRange
 * @property {number} start - first overlapping line number (in original file)
 * @property {number} end   - last overlapping line number (in original file)
 */

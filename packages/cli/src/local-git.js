import { execa } from 'execa';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { detectCollisions, normalisePath, getFileDiffStats, findOverlappingHunks } from 'pr-radar-core';

/**
 * Main local collision check entry point.
 *
 * @param {string[]} branches
 * @param {object} options
 * @returns {Promise<CollisionReport>}
 */
export async function localCollisionCheck(branches, options) {
  const repo = options.repo || process.cwd();
  const base = await resolveBase(options.base, repo);
  const scannedAt = new Date().toISOString();

  // Load ignore patterns from .prradarignore and .gitignore
  const ignorePatterns = [
    ...options.ignorePatterns,
    ...loadIgnoreFile(join(repo, '.prradarignore')),
    ...loadIgnoreFile(join(repo, '.gitignore')),
  ];

  // Get changed files per branch
  const branchFiles = {};
  for (const branch of branches) {
    branchFiles[branch] = await getChangedFiles(branch, base, repo);
  }

  const { collisions, clean } = detectCollisions(branchFiles, ignorePatterns);

  // Collect diff stats per colliding file per branch
  const collisionDetails = [];
  for (const collision of collisions) {
    const branchStats = {};

    for (const branch of collision.sources) {
      try {
        const diff = await getDiff(branch, base, collision.file, repo);
        const stats = getFileDiffStats(diff);
        branchStats[branch] = stats.find(s => normalisePath(s.file) === normalisePath(collision.file)) ?? null;
      } catch {
        branchStats[branch] = null;
      }
    }

    // Find overlapping hunks between each pair of branches
    const conflicts = [];
    if (options.conflictCheck) {
      const branchNames = collision.sources;
      for (let i = 0; i < branchNames.length; i++) {
        for (let j = i + 1; j < branchNames.length; j++) {
          const statsA = branchStats[branchNames[i]];
          const statsB = branchStats[branchNames[j]];
          if (statsA && statsB) {
            const overlaps = findOverlappingHunks(statsA, statsB);
            if (overlaps.length > 0) {
              conflicts.push({
                branchA: branchNames[i],
                branchB: branchNames[j],
                overlaps,
              });
            }
          }
        }
      }
    }

    // Optionally get unified diff per branch
    const diffs = {};
    if (options.showDiff) {
      for (const branch of collision.sources) {
        try {
          diffs[branch] = await getDiff(branch, base, collision.file, repo);
        } catch {
          diffs[branch] = null;
        }
      }
    }

    collisionDetails.push({
      file: collision.file,
      sources: collision.sources,
      branchStats,
      conflicts,
      diffs: options.showDiff ? diffs : undefined,
    });
  }

  // Tally clean files per branch
  const cleanFiles = clean.map(file => ({
    file,
    branch: Object.entries(branchFiles).find(([, files]) => files.includes(file))?.[0] ?? 'unknown',
  }));

  const totalFiles = new Set(Object.values(branchFiles).flat().map(normalisePath)).size;

  return {
    base,
    branches,
    scannedAt,
    collisions: collisionDetails,
    clean: cleanFiles,
    summary: {
      branchesCompared: branches.length,
      filesScanned: totalFiles,
      collidingFiles: collisionDetails.length,
      likelyConflicts: collisionDetails.filter(c => c.conflicts.length > 0).length,
      cleanOverlaps: collisionDetails.filter(c => c.conflicts.length === 0).length,
    },
  };
}

/**
 * Resolve the base branch.
 * Tries the provided value, then "main", then "master".
 *
 * @param {string|undefined} baseInput
 * @param {string} repo
 * @returns {Promise<string>}
 */
async function resolveBase(baseInput, repo) {
  if (baseInput) return baseInput;

  for (const candidate of ['main', 'master']) {
    try {
      await execa('git', ['rev-parse', '--verify', candidate], { cwd: repo });
      return candidate;
    } catch {
      // not found, try next
    }
  }

  throw new Error('Could not find a base branch. Specify one with --base <branch>.');
}

/**
 * Get the list of files changed between base and branch (triple-dot diff).
 *
 * @param {string} branch
 * @param {string} base
 * @param {string} repo
 * @returns {Promise<string[]>}
 */
async function getChangedFiles(branch, base, repo) {
  const { stdout } = await execa(
    'git',
    ['diff', '--name-only', `${base}...${branch}`],
    { cwd: repo }
  );
  return stdout
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean)
    .map(normalisePath);
}

/**
 * Get unified diff for a specific file between base and branch.
 *
 * @param {string} branch
 * @param {string} base
 * @param {string} file
 * @param {string} repo
 * @returns {Promise<string>}
 */
async function getDiff(branch, base, file, repo) {
  const { stdout } = await execa(
    'git',
    ['diff', `${base}...${branch}`, '--', file],
    { cwd: repo }
  );
  return stdout;
}

/**
 * Load patterns from an ignore file (gitignore syntax).
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function loadIgnoreFile(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * @typedef {Object} CollisionReport
 * @property {string} base
 * @property {string[]} branches
 * @property {string} scannedAt
 * @property {CollisionDetail[]} collisions
 * @property {{ file: string, branch: string }[]} clean
 * @property {ReportSummary} summary
 */

/**
 * @typedef {Object} CollisionDetail
 * @property {string} file
 * @property {string[]} sources
 * @property {Record<string, import('pr-radar-core/diff').FileDiffStats|null>} branchStats
 * @property {ConflictPair[]} conflicts
 * @property {Record<string, string|null>} [diffs]
 */

/**
 * @typedef {Object} ConflictPair
 * @property {string} branchA
 * @property {string} branchB
 * @property {import('pr-radar-core/diff').OverlapRange[]} overlaps
 */

/**
 * @typedef {Object} ReportSummary
 * @property {number} branchesCompared
 * @property {number} filesScanned
 * @property {number} collidingFiles
 * @property {number} likelyConflicts
 * @property {number} cleanOverlaps
 */

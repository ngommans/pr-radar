import { minimatch } from 'minimatch';

/**
 * Given a map of { identifier → string[] } (PR number or branch name → file paths),
 * returns collision groups.
 *
 * @param {Record<string, string[]>} fileMap - keys are PR numbers or branch names, values are file path arrays
 * @param {string[]} [ignorePatterns] - minimatch glob patterns to exclude
 * @returns {CollisionReport}
 */
export function detectCollisions(fileMap, ignorePatterns = []) {
  // Build reverse map: file_path → [source, ...]
  /** @type {Map<string, string[]>} */
  const fileSources = new Map();

  for (const [source, files] of Object.entries(fileMap)) {
    for (const file of files) {
      const normalised = normalisePath(file);
      if (isIgnored(normalised, ignorePatterns)) continue;
      if (!fileSources.has(normalised)) {
        fileSources.set(normalised, []);
      }
      fileSources.get(normalised).push(source);
    }
  }

  /** @type {CollisionEntry[]} */
  const collisions = [];
  /** @type {string[]} */
  const clean = [];
  /** @type {string[]} */
  const ignored = [];

  // Collect ignored files for reporting
  for (const [source, files] of Object.entries(fileMap)) {
    for (const file of files) {
      const normalised = normalisePath(file);
      if (isIgnored(normalised, ignorePatterns) && !ignored.includes(normalised)) {
        ignored.push(normalised);
      }
    }
  }

  for (const [file, sources] of fileSources.entries()) {
    if (sources.length > 1) {
      collisions.push({ file, sources: [...new Set(sources)] });
    } else {
      clean.push(file);
    }
  }

  return { collisions, clean, ignored };
}

/**
 * Normalise path separators to forward-slash.
 * @param {string} filePath
 * @returns {string}
 */
export function normalisePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check whether a file path matches any of the given ignore patterns.
 * @param {string} filePath - normalised (forward-slash) path
 * @param {string[]} patterns
 * @returns {boolean}
 */
function isIgnored(filePath, patterns) {
  return patterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
}

/**
 * @typedef {Object} CollisionReport
 * @property {CollisionEntry[]} collisions - files touched by > 1 source
 * @property {string[]} clean - files touched by only 1 source
 * @property {string[]} ignored - files excluded by ignorePatterns
 */

/**
 * @typedef {Object} CollisionEntry
 * @property {string} file
 * @property {string[]} sources - PR numbers or branch names that touch this file
 */

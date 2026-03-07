# PR Radar

> Detect file-level collisions across open pull requests — before merge conflicts materialise.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Status: Spike](https://img.shields.io/badge/status-spike-yellow.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]()

PR Radar is a two-part toolset that detects when multiple open pull requests touch the same files, giving teams early warning of coordination risk before merge conflicts materialise.

---

## Table of Contents

- [Overview](#overview)
- [Packages](#packages)
- [Part 1 — GitHub Action](#part-1--github-action)
- [Part 2 — Local CLI](#part-2--local-cli)
- [Ignore Patterns](#ignore-patterns)
- [Monorepo Usage](#monorepo-usage)
- [How It Works](#how-it-works)
- [Prior Art](#prior-art)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

When two pull requests independently modify the same file, neither GitHub's merge button nor standard CI catches it — until someone merges first and the other PR suddenly conflicts. PR Radar fills this gap by:

1. **Comparing changed files** across all open PRs (or local branches)
2. **Posting an auto-updating status check** (pass / warn) and managed comment on each affected PR
3. **Clearing automatically** when the overlap is resolved

No false blocking — collisions produce an amber `neutral` check, never a red `failure`. The warning is informational.

---

## Packages

This monorepo contains three packages:

| Package | Published as | Purpose |
|---------|-------------|---------|
| `packages/core` | `pr-radar-core` | Shared detection engine — `detectCollisions()`, GitHub API wrappers, comment upsert logic |
| `packages/action` | `pr-radar-action` | GitHub Action entry point — runs on `pull_request` events |
| `packages/cli` | `pr-radar` | Local CLI — compare branches without CI |

---

## Part 1 — GitHub Action

### Quick Start

Add this workflow to your repository at `.github/workflows/pr-radar.yml`:

```yaml
name: PR Radar
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  pull-requests: write
  checks: write
  contents: read

jobs:
  collision-check:
    runs-on: ubuntu-latest
    steps:
      - uses: daycopilot/pr-radar@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `token` | `${{ github.token }}` | GitHub token with `pull-requests:write` and `checks:write` |
| `ignore-patterns` | `""` | Comma-separated glob patterns to exclude (e.g. `"package-lock.json,*.snap"`) |
| `auto-ignore` | `"gitignore"` | Ignore files to auto-discover: `gitignore`, `npmignore`, `prettierignore`, `eslintignore` |
| `paths` | `""` | Scope detection to specific paths (e.g. `"packages/api/,shared/"`) |
| `check-mode` | `"auto"` | `auto` \| `check-run` \| `commit-status` — auto tries check-run first, falls back gracefully |
| `comment-mode` | `"upsert"` | `upsert` (default) \| `off` |
| `skip-drafts` | `"false"` | Set `"true"` to exclude draft PRs from collision detection |

### What It Posts

**When collisions are found** — an amber neutral check and a comment like:

> #### ⚠️ PR Radar — File Collision Warning
>
> | File | Colliding PRs |
> |------|--------------|
> | `src/api/handler.ts` | #42 (feat/new-auth), #51 (fix/rate-limit) |
> | `src/utils/config.ts` | #42 (feat/new-auth) |

**When clear** — a green success check and:

> #### ✅ PR Radar — No File Collisions
>
> No other open PRs are modifying the same files as this one.

Comments are managed (one per PR, updated in place) — no spam.

### How Sibling PRs Stay in Sync

When PR A pushes new changes that create a collision with PR B, PR B has not changed — so no workflow event fires for it. PR Radar solves this by iterating over all colliding sibling PRs and writing their status checks directly using the triggering workflow's token. This mirrors how Dependabot ripples security alerts across PRs.

If the token lacks permission to write to sibling PRs, the action degrades gracefully: the triggering PR still receives its full update, and a `core.warning()` notes that sibling updates were skipped.

---

## Part 2 — Local CLI

### Installation

```bash
# Global install
npm install -g pr-radar

# Or use without installing
npx pr-radar branch-a branch-b
```

> **Windows note:** The CLI runs on Windows (PowerShell / CMD) without WSL. Requires Node.js ≥ 18 and `git` on PATH.

### Usage

```
pr-radar [options] <branch1> <branch2> [branch3...]
```

#### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--base <branch>` | `main` / `master` | Base branch to diff against |
| `--repo <path>` | `.` | Path to git repo |
| `--from-github` | — | Fetch open PR branches from GitHub (requires `gh` CLI) |
| `--output <file>` | — | Write JSON report to file |
| `--diff` | — | Show unified diff for colliding files |
| `--conflict-check` | — | Dry-run merge to identify actual conflict sites |
| `--no-colour` | — | Disable ANSI colour (for CMD without VT100 support) |
| `--format <fmt>` | `table` | `table` \| `compact` \| `json` |

#### Examples

```bash
# Compare two feature branches against main
pr-radar feat/auth-refactor fix/rate-limit

# Compare three branches, show diffs, check for conflicts
pr-radar feat/auth feat/config fix/db --diff --conflict-check

# Pull all open PR branches from GitHub and compare them all
pr-radar --from-github --output collision-report.json

# Pipe-friendly JSON output (PowerShell)
pr-radar feat/a feat/b --format json | ConvertFrom-Json
```

### Sample Output

```
PR Radar — Local Branch Collision Report
=========================================
Base:     main
Branches: feat/auth-refactor, fix/rate-limit, feat/config-update
Scanned:  2026-03-07 10:42:00

COLLISIONS DETECTED
───────────────────
  src/api/handler.ts
  ├─ feat/auth-refactor  +42 -18 lines
  └─ fix/rate-limit       +7  -3 lines
  ⚠ Likely conflict: overlapping changes in lines 88-104

  src/utils/config.ts
  ├─ feat/auth-refactor  +12  -0 lines
  └─ feat/config-update  +31  -8 lines
  ✓ No conflict markers found

NO COLLISION
────────────
  src/db/schema.ts        (feat/auth-refactor only)
  tests/auth.test.ts      (feat/auth-refactor only)
  src/routes/health.ts    (fix/rate-limit only)

SUMMARY
───────
  Branches compared:  3
  Files scanned:     12 unique (across all branches)
  Colliding files:    2
  Likely conflicts:   1
  Clean overlaps:     1
```

---

## Ignore Patterns

PR Radar layers ignore rules from multiple sources, in priority order:

1. **`ignore-patterns` input / `--ignore` flag** — explicit exclusions, always applied
2. **`.prradarignore`** — dedicated ignore file (same minimatch glob syntax as `.gitignore`), auto-discovered
3. **`.gitignore`** — auto-discovered by default
4. **`.npmignore`**, **`.prettierignore`**, **`.eslintignore`** — opt-in via `auto-ignore` input

### `.prradarignore` example

```gitignore
# Lock files — nearly always false positives
package-lock.json
yarn.lock
pnpm-lock.yaml

# Generated / build output
dist/
*.generated.ts
*.snap
```

---

## Monorepo Usage

Use the `paths` input to scope collision detection per package, running multiple action jobs:

```yaml
jobs:
  collision-api:
    runs-on: ubuntu-latest
    steps:
      - uses: daycopilot/pr-radar@v1
        with:
          paths: "packages/api/,shared/"

  collision-web:
    runs-on: ubuntu-latest
    steps:
      - uses: daycopilot/pr-radar@v1
        with:
          paths: "packages/web/,shared/"
```

This reduces API call volume significantly and produces more focused reports.

---

## How It Works

### Core Algorithm

```
For each pull_request event:
  1. Fetch all open PRs + their changed file lists
  2. Build a map: file_path → [pr_number, ...]
  3. Compute collisions for the triggering PR
  4. For each involved PR (triggering + collision partners):
     a. Upsert managed comment
     b. Post/update check run (neutral=warn, success=clear)
  5. Iterate sibling PRs — write their checks using triggering workflow token
  6. On PR close — re-evaluate all remaining open PRs
```

### GitHub API Limits

- **300-file cap**: GitHub's Pulls Files API returns at most 300 files per PR. PRs exceeding this get a warning note in their comment.
- **Rate limit**: Soft warning at ~500 calls/run; hard warning when `x-ratelimit-remaining ≤ 100`. Automatic throttling via `@octokit/plugin-throttling`.
- **Check vs Status**: Attempts Check Run first (`checks:write`), falls back to Commit Status (`statuses:write`) if unavailable (common on GHES or restricted tokens).

### Why `neutral` not `failure`

The check run conclusion for collisions is `neutral` (amber dot), never `failure`. This means:

- PR Radar **never blocks a merge** by default
- Teams can opt in to enforcement by adding a required check on `success` only
- The warning is a coordination nudge, not a gate

---

## Prior Art

Research confirmed no actively maintained tool fills this gap:

| Tool | Status | Gap |
|------|--------|-----|
| `outsideris/potential-conflicts-checker-action` | Abandoned | No auto-clear, no status checks |
| `mateusabelli/pr-tracker` | Bash-only | `opened` trigger only, manual cleanup |
| MergeBetter | Sunset Feb 2026 | Best prior approach, no longer available |
| Base-branch conflict labellers | Active | Detect `git mergeable` state, not cross-PR overlap |

PR Radar detects **cross-PR file overlap** — a distinct and earlier signal than post-merge base-branch conflicts.

---

## Future: Jira Integration

The architecture is designed for extension. A planned future mode:

```bash
pr-radar --from-jira --jira-project PROJ --jira-status "In Progress"
```

This would fetch In Progress Jira issues, resolve their associated branches via naming conventions (`PROJ-123-*`), and feed them into the same `detectCollisions()` engine. Out of scope for this spike — the core engine is already agnostic to whether keys are PR numbers, branch names, or Jira issue keys.

---

## Contributing

This project is in spike / pre-release status (v0.1.0). Contributions and feedback are welcome.

```bash
# Clone and install dependencies
git clone https://github.com/ngommans/pr-radar.git
cd pr-radar
npm install

# Run tests
npm test

# Run CLI locally (from packages/cli)
node packages/cli/bin/pr-radar.js --help
```

---

## License

[MIT](LICENSE) — DayCopilot Ltd

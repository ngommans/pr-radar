# PR Radar

> Detect file-level collisions across open pull requests — before merge conflicts materialise.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)]()

PR Radar warns your team when multiple open PRs touch the same files — an earlier signal than merge conflicts, surfaced directly on the PR.

---

## Quick Start — GitHub Action

Add `.github/workflows/pr-radar.yml` to your repository:

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
      - uses: ngommans/pr-radar@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. PR Radar posts an amber warning check and a managed comment on every affected PR when collisions are found, and clears them automatically when resolved. It never blocks a merge.

---

## Quick Start — Local CLI

```bash
npm install -g pr-radar

# Compare two feature branches against main
pr-radar feat/auth-refactor fix/rate-limit

# Pull all open PR branches from GitHub and compare
pr-radar --from-github
```

Requires Node.js ≥ 18 and `git` on PATH. Works on Linux, macOS, and Windows.

---

## Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `token` | `${{ github.token }}` | GitHub token with `pull-requests:write` and `checks:write` |
| `ignore-patterns` | `""` | Comma-separated globs to exclude (e.g. `"package-lock.json,*.snap"`) |
| `auto-ignore` | `"gitignore"` | Ignore files to auto-discover: `gitignore`, `npmignore`, `prettierignore`, `eslintignore` |
| `paths` | `""` | Scope to specific paths — useful for monorepos (e.g. `"packages/api/,shared/"`) |
| `check-mode` | `"auto"` | `auto` \| `check-run` \| `commit-status` |
| `comment-mode` | `"upsert"` | `upsert` \| `off` |
| `skip-drafts` | `"false"` | Set `"true"` to exclude draft PRs |

---

## CLI Options

```
pr-radar [options] <branch1> <branch2> [branch3...]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--base <branch>` | `main` / `master` | Base branch to diff against |
| `--repo <path>` | `.` | Path to git repo |
| `--from-github` | — | Fetch open PR branches via `gh` CLI |
| `--output <file>` | — | Write JSON report to file |
| `--diff` | — | Show unified diff for colliding files |
| `--conflict-check` | — | Dry-run merge to identify conflict sites |
| `--format <fmt>` | `table` | `table` \| `compact` \| `json` |

---

## Ignoring Files

Create a `.prradarignore` in your repo root (same syntax as `.gitignore`). Lock files, build output, and snapshots are common candidates. PR Radar also reads `.gitignore` automatically.

---

## Packages

This is a monorepo with three packages:

| Package | Purpose |
|---------|---------|
| `packages/core` (`pr-radar-core`) | Shared detection engine |
| `packages/action` (`pr-radar-action`) | GitHub Action entry point |
| `packages/cli` (`pr-radar`) | Local CLI |

---

## Documentation

Full documentation — including how it works, monorepo setup, API limits, and prior art — is available in the [project wiki](../../wiki).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) — ngommans

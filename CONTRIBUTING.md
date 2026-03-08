# Contributing to PR Radar

Thank you for your interest in contributing. This document explains how to get set up, what to work on, and how to submit changes.

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Getting Started

**Prerequisites:** Node.js ≥ 18, npm, git

```bash
git clone https://github.com/ngommans/pr-radar.git
cd pr-radar
npm install
```

### Running Tests

```bash
npm test
```

### Running the CLI Locally

```bash
node packages/cli/bin/pr-radar.js --help
```

### Building the Action

```bash
cd packages/action
npm run build
```

The built output (`dist/index.js`) is committed to the repo so the GitHub Action can reference it directly.

---

## Repository Structure

```
packages/
  core/     # pr-radar-core — shared detection engine
  action/   # pr-radar-action — GitHub Action entry point
  cli/      # pr-radar — local CLI
```

Changes to the detection logic belong in `core`. Changes specific to GitHub Action behaviour go in `action`. CLI presentation and flags live in `cli`.

---

## Making Changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. **Make your changes** and write or update tests where relevant.
3. **Run tests** to confirm nothing is broken:
   ```bash
   npm test
   ```
4. **Build the action** if you changed anything under `packages/action/src/`:
   ```bash
   cd packages/action && npm run build
   ```
   Commit the updated `dist/` output.
5. **Open a pull request** against `main` with a clear description of what you changed and why.

---

## What to Work On

- Check the [issues list](https://github.com/ngommans/pr-radar/issues) for open bugs and feature requests.
- Look for issues labelled `good first issue` if you are new to the codebase.
- If you plan a significant change, open an issue first to discuss the approach.

---

## Commit Style

Use short, imperative commit messages (50 characters or fewer for the subject line):

```
fix: handle PRs with more than 300 changed files
feat: add --json-pretty output flag
docs: clarify monorepo paths input
```

Prefix types: `fix`, `feat`, `docs`, `refactor`, `test`, `chore`.

---

## Reporting Bugs

Open a [GitHub issue](https://github.com/ngommans/pr-radar/issues) and include:

- What you did
- What you expected to happen
- What actually happened
- Your Node.js version and OS

---

## Questions

Open an issue or start a [discussion](https://github.com/ngommans/pr-radar/discussions). Extended documentation is available in the [project wiki](https://github.com/ngommans/pr-radar/wiki).

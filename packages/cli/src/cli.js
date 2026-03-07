import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { localCollisionCheck } from './local-git.js';
import { renderReport } from './reporter.js';
import { writeFileSync } from 'fs';

export async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('$0 [options] <branch1> <branch2> [branch3...]')
    .example('$0 feat/auth-refactor fix/rate-limit', 'Compare two branches against main')
    .example('$0 feat/auth feat/config fix/db --diff --conflict-check', 'Full collision + conflict report')
    .example('$0 --from-github --output report.json', 'Compare all open GitHub PRs')
    .option('base', {
      type: 'string',
      description: 'Base branch to diff against (default: main, then master)',
    })
    .option('repo', {
      type: 'string',
      description: 'Path to git repository',
      default: process.cwd(),
    })
    .option('from-github', {
      type: 'boolean',
      description: 'Fetch open PR branches from GitHub (requires gh CLI and GITHUB_TOKEN)',
      default: false,
    })
    .option('output', {
      type: 'string',
      description: 'Write JSON report to this file in addition to terminal output',
    })
    .option('diff', {
      type: 'boolean',
      description: 'Show unified diff for colliding files',
      default: false,
    })
    .option('conflict-check', {
      type: 'boolean',
      description: 'Attempt a dry-run merge to identify actual conflict sites',
      default: false,
    })
    .option('no-colour', {
      type: 'boolean',
      description: 'Disable ANSI colour output (for CMD without VT100)',
      default: false,
    })
    .option('format', {
      type: 'string',
      description: 'Output format: table (default) | compact | json',
      choices: ['table', 'compact', 'json'],
      default: 'table',
    })
    .option('ignore', {
      type: 'string',
      description: 'Comma-separated glob patterns to exclude from collision detection',
    })
    .help()
    .alias('h', 'help')
    .version()
    .alias('v', 'version')
    .argv;

  const branches = argv._;

  if (!argv.fromGithub && branches.length < 2) {
    console.error('Error: provide at least two branch names, or use --from-github');
    process.exit(1);
  }

  const ignorePatterns = argv.ignore
    ? argv.ignore.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const options = {
    base: argv.base,
    repo: argv.repo,
    fromGithub: argv.fromGithub,
    showDiff: argv.diff,
    conflictCheck: argv.conflictCheck,
    noColour: argv.noColour,
    format: argv.format,
    ignorePatterns,
  };

  let branchList = branches.map(String);

  if (options.fromGithub) {
    branchList = await fetchGitHubBranches(options.repo);
    if (branchList.length < 2) {
      console.error('Error: fewer than 2 open PR branches found on GitHub');
      process.exit(1);
    }
  }

  const report = await localCollisionCheck(branchList, options);

  if (options.format === 'json') {
    const json = JSON.stringify(report, null, 2);
    process.stdout.write(json + '\n');
    if (argv.output) {
      writeFileSync(argv.output, json, 'utf8');
    }
    return;
  }

  renderReport(report, options);

  if (argv.output) {
    writeFileSync(argv.output, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nJSON report written to: ${argv.output}`);
  }

  // Exit with code 1 if collisions found (useful for CI piping)
  if (report.collisions.length > 0) {
    process.exitCode = 1;
  }
}

async function fetchGitHubBranches(repoPath) {
  const { execa } = await import('execa');
  try {
    const { stdout } = await execa('gh', ['pr', 'list', '--state', 'open', '--json', 'headRefName'], {
      cwd: repoPath,
    });
    const prs = JSON.parse(stdout);
    return prs.map(pr => pr.headRefName);
  } catch (err) {
    console.error(`Error fetching GitHub PRs: ${err.message}`);
    console.error('Make sure gh CLI is installed and GITHUB_TOKEN is set.');
    process.exit(1);
  }
}

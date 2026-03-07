import chalk from 'chalk';

/**
 * Render a collision report to the terminal.
 *
 * @param {import('./local-git.js').CollisionReport} report
 * @param {{ noColour: boolean, format: string }} options
 */
export function renderReport(report, options) {
  if (options.noColour) {
    chalk.level = 0;
  }

  const hr = chalk.dim('─'.repeat(40));

  console.log('');
  console.log(chalk.bold('PR Radar — Local Branch Collision Report'));
  console.log(chalk.bold('========================================='));
  console.log(`Base:     ${chalk.cyan(report.base)}`);
  console.log(`Branches: ${chalk.cyan(report.branches.join(', '))}`);
  console.log(`Scanned:  ${chalk.dim(formatDate(report.scannedAt))}`);
  console.log('');

  if (options.format === 'compact') {
    renderCompact(report, hr);
  } else {
    renderTable(report, hr, options);
  }

  renderSummary(report, hr);
}

function renderTable(report, hr, options) {
  if (report.collisions.length > 0) {
    console.log(chalk.red.bold('COLLISIONS DETECTED'));
    console.log(hr);

    for (const collision of report.collisions) {
      console.log(`  ${chalk.yellow.bold(collision.file)}`);

      for (const branch of collision.sources) {
        const stats = collision.branchStats?.[branch];
        const statStr = stats
          ? chalk.dim(`  ${chalk.green('+' + stats.added)} ${chalk.red('-' + stats.removed)} lines`)
          : '';
        const isLast = branch === collision.sources[collision.sources.length - 1];
        const prefix = isLast ? '└─' : '├─';
        console.log(`  ${chalk.dim(prefix)} ${chalk.cyan(branch)}${statStr}`);
      }

      if (collision.conflicts.length > 0) {
        for (const conflict of collision.conflicts) {
          const ranges = conflict.overlaps.map(o => `lines ${o.start}-${o.end}`).join(', ');
          console.log(`  ${chalk.red('⚠')} Likely conflict: overlapping changes in ${chalk.bold(ranges)}`);
        }
      } else if (options.conflictCheck) {
        console.log(`  ${chalk.green('✓')} No conflict markers found`);
      }

      // Show diffs if requested
      if (options.showDiff && collision.diffs) {
        for (const [branch, diff] of Object.entries(collision.diffs)) {
          if (!diff) continue;
          console.log('');
          console.log(chalk.dim(`  --- diff: ${collision.file} (${branch}) ---`));
          for (const line of diff.split('\n')) {
            if (line.startsWith('+')) console.log(chalk.green('  ' + line));
            else if (line.startsWith('-')) console.log(chalk.red('  ' + line));
            else console.log(chalk.dim('  ' + line));
          }
        }
      }

      console.log('');
    }
  } else {
    console.log(chalk.green.bold('NO COLLISIONS DETECTED'));
    console.log(hr);
    console.log('  All branches touch distinct files.');
    console.log('');
  }

  if (report.clean.length > 0) {
    console.log(chalk.dim('NO COLLISION'));
    console.log(chalk.dim(hr));

    for (const { file, branch } of report.clean) {
      console.log(chalk.dim(`  ${file}  (${branch} only)`));
    }

    console.log('');
  }
}

function renderCompact(report, hr) {
  if (report.collisions.length === 0) {
    console.log(chalk.green('✅ No collisions'));
    return;
  }
  console.log(chalk.red(`⚠️  ${report.collisions.length} collision(s):`));
  for (const c of report.collisions) {
    console.log(`  ${c.file}  [${c.sources.join(', ')}]`);
  }
  console.log('');
}

function renderSummary(report, hr) {
  const s = report.summary;
  console.log(chalk.bold('SUMMARY'));
  console.log(hr);
  console.log(`  Branches compared:  ${chalk.bold(s.branchesCompared)}`);
  console.log(`  Files scanned:      ${chalk.bold(s.filesScanned)} unique (across all branches)`);
  console.log(`  Colliding files:    ${s.collidingFiles > 0 ? chalk.yellow.bold(s.collidingFiles) : chalk.green.bold(s.collidingFiles)}`);
  console.log(`  Likely conflicts:   ${s.likelyConflicts > 0 ? chalk.red.bold(s.likelyConflicts) : chalk.green.bold(s.likelyConflicts)}`);
  console.log(`  Clean overlaps:     ${chalk.bold(s.cleanOverlaps)}`);
  console.log('');
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

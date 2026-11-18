const fs = require('fs');

// Writes the line coverage of the Jest json-summary report as the endpoint
// JSON of a shields.io badge, which CI pushes to the badges branch
//
//   node tools/coverage-badge.js reports/coverage-summary.json badges/coverage.json

const [summaryPath, outputPath] = process.argv.slice(2);

if (!summaryPath || !outputPath) {
  console.error(
    'Usage: node tools/coverage-badge.js <summary-path> <output-path>'
  );
  process.exit(1);
}

const { total } = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const percent = total.lines.pct;

const colors = [
  [90, 'brightgreen'],
  [80, 'green'],
  [70, 'yellowgreen'],
  [60, 'yellow'],
  [0, 'red']
];
const [, color] = colors.find(([min]) => percent >= min);

fs.writeFileSync(
  outputPath,
  JSON.stringify({
    schemaVersion: 1,
    label: 'coverage',
    message: `${percent.toFixed(1)}%`,
    color
  }) + '\n'
);
console.log(`Coverage badge: ${percent}% (${color})`);

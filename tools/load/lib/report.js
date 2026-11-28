/** The results of a report as a Markdown table, the form of the baselines of PLAN-v3.md. */
function formatTable(report) {
  const rows = [
    ['Scenario', 'Conn.', 'Req/s', 'p50', 'p97.5', 'p99', 'Errors'],
    ...report.results.map((result) => [
      result.name,
      String(result.connections),
      result.requestsPerSecond.toLocaleString('en-US'),
      `${result.latency.p50} ms`,
      `${result.latency.p97_5} ms`,
      `${result.latency.p99} ms`,
      failures(result)
    ])
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const line = (row) => `| ${row.map((cell, i) => cell.padEnd(widths[i])).join(' | ')} |`;
  return [line(rows[0]), `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`, ...rows.slice(1).map(line)].join(
    '\n'
  );
}

function failures(result) {
  const parts = [];
  if (result.timeouts) {
    parts.push(`${result.timeouts} timeouts`);
  }
  if (result.errors - result.timeouts > 0) {
    parts.push(`${result.errors - result.timeouts} errors`);
  }
  if (result.non2xx) {
    const codes = Object.entries(result.statusCodes)
      .filter(([code]) => !code.startsWith('2'))
      .map(([code, count]) => `${count}x${code}`);
    parts.push(codes.join(' '));
  }
  return parts.join(', ') || '-';
}

module.exports = { formatTable };

#!/usr/bin/env node
/**
 * Listar stegen för en Release-körning, inklusive hoppade steg.
 * Användning:  node scripts/kontrollera-steg.mjs [tagg]
 * Utan tagg visas den senaste körningen.
 */
import { execFileSync } from 'node:child_process';

const REPO = 'appbuildersweden/v-xverket';
const WANTED = process.argv[2] || '';

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 20000,
    });
    return (/^password=(.+)$/m.exec(out)?.[1] ?? '').trim();
  } catch {
    return '';
  }
}
const t = token();
if (!t) {
  console.log('Ingen token tillgänglig.');
  process.exit(0);
}
const headers = {
  Authorization: `Bearer ${t}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'elda-check',
};

const runs = await (
  await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=4`, { headers })
).json();
const run = WANTED
  ? runs.workflow_runs.find((r) => r.head_branch === WANTED)
  : runs.workflow_runs[0];
if (!run) {
  console.log(`Hittade ingen körning${WANTED ? ` för ${WANTED}` : ''}.`);
  process.exit(0);
}
console.log(`Körning ${run.id} (${run.head_branch}) – ${run.status}/${run.conclusion}`);
console.log(`URL: ${run.html_url}\n`);

const jobs = await (
  await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${run.id}/jobs`, { headers })
).json();
for (const j of jobs.jobs ?? []) {
  console.log(`Jobb: ${j.name} – ${j.status}/${j.conclusion}`);
  for (const s of j.steps ?? []) {
    console.log(`  [${s.conclusion ?? s.status}] ${s.name}`);
  }
}

#!/usr/bin/env node
/**
 * Rapporterar status för releaskörningen. Läser GitHub-token från git:s
 * credential-helper om inget GITHUB_TOKEN finns i miljön. Token skrivs aldrig ut.
 */
import { execFileSync } from 'node:child_process';

const REPO = 'appbuildersweden/v-xverket';

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 20000,
    });
    const m = /^password=(.+)$/m.exec(out);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

const t = token();
if (!t) {
  console.log('Ingen GitHub-token tillgänglig i miljön. Kontrollera körningen i stället på:');
  console.log(`  https://github.com/${REPO}/actions`);
  process.exitCode = 0;
} else {
  const headers = {
    Authorization: `Bearer ${t}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'elda-release-check',
  };

  const runs = await (await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=5`, { headers })).json();
  if (!runs.workflow_runs) {
    console.log('Oväntat API-svar:', JSON.stringify(runs).slice(0, 300));
  } else {
    console.log(`Körningar (${runs.total_count} totalt):`);
    for (const r of runs.workflow_runs) {
      console.log(
        `  ${r.name} | ref=${r.head_branch ?? r.display_title} | status=${r.status} | conclusion=${r.conclusion ?? '-'} | ${r.created_at}`,
      );
    }
  }

  const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`, { headers })).json();
  if (Array.isArray(rel)) {
    console.log(`\nReleaser (${rel.length} senaste):`);
    for (const r of rel) {
      console.log(`  ${r.tag_name} | draft=${r.draft} | publicerad=${r.published_at}`);
      for (const a of r.assets ?? []) console.log(`    - ${a.name} (${a.size} B)`);
    }
  } else {
    console.log('\nKunde inte läsa releaser:', JSON.stringify(rel).slice(0, 200));
  }
}

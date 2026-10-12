// tests/modes-tracker-write-paths.test.mjs — the mode prompts send tracker
// writes through the canonical writers, never through a hand edit.
//
// `modes/_shared.md` is loaded by every evaluation, and its Tools table said
// `Write → applications.md` and `Edit → Update tracker`, eleven lines below the
// rule that says never to edit applications.md directly. Fourteen localized
// copies carried the same two rows. A direct Write or Edit skips the lock that
// merge-tracker.mjs, set-status.mjs, the web and the dashboard share, and a
// hand-edited status never reaches data/status-log.tsv, so funnel and velocity
// stats go wrong with no error.
//
// A prompt contradiction produces no failing run, which is why it lasted since
// the first release. These checks read the tables themselves, in every
// language, by the tool name in the first cell (the one part no translation
// changes).
import { pass, fail, ROOT } from './helpers.mjs';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ok = (name, fn) => { try { fn(); pass(name); } catch (e) { fail(`${name} — ${e.message}`); } };
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

const sharedFiles = ['modes/_shared.md', ...readdirSync(join(ROOT, 'modes'), { withFileTypes: true })
  .filter(e => e.isDirectory() && existsSync(join(ROOT, 'modes', e.name, '_shared.md')))
  .map(e => `modes/${e.name}/_shared.md`)].sort();

/** The Tools-table row for one tool: `| Write | … |` or `| **Write** | … |`. */
function toolRow(text, tool) {
  const re = new RegExp(`^\\|\\s*\\*{0,2}${tool}\\*{0,2}\\s*\\|(.*)\\|\\s*$`, 'm');
  return text.match(re)?.[1].trim() ?? null;
}

const withTable = sharedFiles.filter(f => toolRow(read(f), 'Write') !== null);

ok('the Tools table is found in the English _shared.md and its localized copies', () => {
  assert.ok(withTable.includes('modes/_shared.md'), 'modes/_shared.md has no Write row');
  // The audit counted 14 localized copies plus three already-corrected ones.
  // A recognizer that silently stops matching would pass everything below.
  assert.ok(withTable.length >= 18, `only ${withTable.length} Tools tables recognized: ${withTable.join(', ')}`);
  for (const f of withTable) assert.ok(toolRow(read(f), 'Edit') !== null, `${f}: Write row found but no Edit row`);
});

for (const file of withTable) {
  ok(`${file}: Write points new tracker rows at the TSV additions directory`, () => {
    const row = toolRow(read(file), 'Write');
    assert.ok(row.includes('batch/tracker-additions/'), `Write row: "${row}"`);
  });
  ok(`${file}: Edit points status changes at set-status.mjs and new rows at merge-tracker.mjs`, () => {
    const row = toolRow(read(file), 'Edit');
    assert.ok(row.includes('set-status.mjs'), `Edit row: "${row}"`);
    assert.ok(row.includes('merge-tracker.mjs'), `Edit row: "${row}"`);
  });
}

ok('no localized rule 9 still allows hand-editing existing tracker rows', () => {
  // The Russian and Ukrainian copies said direct editing of existing rows was
  // acceptable for status/notes, in the sentence right after the TSV rule.
  for (const file of sharedFiles) {
    const rule = read(file).split('\n').find(l => /^9\.\s/.test(l) && l.includes('batch/tracker-additions/'));
    assert.ok(rule, `${file}: rule 9 (tracker additions as TSV) not found`);
    assert.ok(!/допустим/i.test(rule), `${file}: rule 9 still permits a direct edit`);
  }
});

/** The body of one `### N. Title` / `## Title` section, up to the next heading of that depth. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === heading);
  assert.ok(start !== -1, `heading "${heading}" not found`);
  const depth = heading.match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${depth}}\\s`).test(l));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

ok('oferta.md "Record in tracker" goes through the TSV and merge-tracker', () => {
  const step = section(read('modes/oferta.md'), '### 2. Record in tracker');
  assert.ok(step.includes('node merge-tracker.mjs'), 'does not name merge-tracker.mjs');
  assert.ok(step.includes('TSV Format for Tracker Additions'), 'does not point at the TSV spec');
  assert.ok(!/record in `data\/applications\.md`/i.test(step), 'still says to record in applications.md');
  // A confirmed agency must not be dropped by a tracker with no Via column.
  assert.ok(step.includes('--migrate-via'), 'does not say how to keep a confirmed Via');
});

ok('oferta.md takes the salary line\'s tracker number after the merge', () => {
  const step = section(read('modes/oferta.md'), '### 3. Salary observations (desired ask only)');
  assert.match(step, /after\*{0,2} the merge/i);
});

ok('the other English steps name the writer instead of the tracker file', () => {
  assert.ok(section(read('modes/auto-pipeline.md'), '## Step 5 — Update Tracker').includes('node merge-tracker.mjs'));
  assert.ok(section(read('modes/pdf.md'), '## Post-generation').includes('node mark-pdf-ready.mjs'));
  const followup = read('modes/followup.md').split('\n').find(l => l.includes('Follow-up {N} sent'));
  assert.ok(followup && followup.includes('node set-status.mjs'), 'followup.md notes step does not use set-status.mjs');
});

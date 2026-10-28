// npm run verify — dependency-free invariant checks. See harness/invariants.md.
// Exit 1 if any check fails. Baselines (harness/baselines.json) freeze known deviations so only NEW ones fail.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EXT = join(ROOT, 'chrome-extension');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const baselines = JSON.parse(read('harness/baselines.json'));

// Build output / vendored bundle: not source.
const SKIP = new Set(['offscreen/offscreen.js', 'offscreen/offscreen.js.map']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(name) && !SKIP.has(relative(EXT, p))) out.push(p);
  }
  return out;
}
const sources = walk(EXT);
const rel = (p) => relative(ROOT, p);

const results = [];
function check(id, title, fn) {
  const problems = [];
  const notes = [];
  fn(problems, notes);
  results.push({ id, title, problems, notes });
}

// Compare found keys with a baseline list. New = fail. Stale baseline entries = note (shrink the baseline).
function against(found, baseline, problems, notes, what) {
  for (const k of found) if (!baseline.includes(k)) problems.push(`new ${what}: ${k}`);
  for (const k of baseline) if (!found.includes(k)) notes.push(`baseline entry no longer found (remove it): ${k}`);
}

// I1 — tab opening / activating / navigating, counted per file+kind.
check('I1', 'tab APIs only at baselined call sites', (problems, notes) => {
  const kinds = [
    ['tabs.create', /chrome\.tabs\.create\(/],
    ['tabs.update', /chrome\.tabs\.update\(/],
    ['window.open', /window\.open\(/],
    ['location-assign', /(?:window\.)?location(?:\.href)?\s*=[^=]/],
  ];
  const found = new Set();
  for (const f of sources.filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(f, 'utf8');
    for (const [kind, re] of kinds) if (re.test(text)) found.add(`${relative(EXT, f)}:${kind}`);
  }
  against([...found].sort(), baselines.tabs, problems, notes, 'tab API use');
});

// I5 — manifest: no plain http; URL literals only to allowed hosts.
check('I5', 'no plain-http permissions; outbound hosts on allowlist', (problems, notes) => {
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  const found = [];
  for (const h of manifest.host_permissions || []) if (h.startsWith('http://')) found.push(`manifest host ${h}`);
  const csp = manifest.content_security_policy?.extension_pages || '';
  for (const tok of csp.split(/\s+/)) if (tok.startsWith('http://')) found.push(`csp ${tok}`);
  const allow = baselines.hostAllowlist;
  const hostRe = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost|127\.0\.0\.1)/gi;
  for (const f of sources.filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(hostRe)) {
      const host = m[1].toLowerCase();
      if (!allow.some((a) => host === a || host.endsWith('.' + a))) found.push(`host ${host} in ${relative(EXT, f)}`);
    }
  }
  against([...new Set(found)].sort(), baselines.network, problems, notes, 'network deviation');
});

// I6 — every lib file a copied page reaches must be in package.json's hand-written cp list.
check('I6', 'lib files used by pages are copied to dist/', (problems) => {
  const pkg = JSON.parse(read('package.json'));
  const copied = new Set([...pkg.scripts['build:extension'].matchAll(/chrome-extension\/lib\/([\w.-]+\.js)/g)].map((m) => m[1]));
  const importRe = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const seen = new Set();
  const stack = [];
  const roots = readdirSync(join(EXT, 'pages')).filter((n) => n.endsWith('.js')).map((n) => join(EXT, 'pages', n));
  stack.push(...roots);
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(importRe)) stack.push(resolve(dirname(f), m[1] || m[2]));
  }
  for (const f of seen) {
    const r = relative(EXT, f);
    if (r.startsWith('lib/') && !r.slice(4).includes('/') && !copied.has(r.slice(4))) problems.push(`${r} reachable from pages/ but missing from build cp list`);
  }
  for (const c of copied) if (!existsSync(join(EXT, 'lib', c))) problems.push(`cp list names missing file lib/${c}`);
});

// I7 — one version everywhere.
check('I7', 'version identical across files', (problems) => {
  const v = JSON.parse(read('chrome-extension/manifest.json')).version;
  const expect = (name, got) => got !== v && problems.push(`${name} has ${got ?? 'none'}, manifest has ${v}`);
  for (const f of ['popup/popup.html', 'pages/contacts.html', 'pages/ask-ai.html'])
    expect(f, read(`chrome-extension/${f}`).match(/id="version"[^>]*>v([\d.]+)(?: [a-z]+)?</)?.[1]);
  expect('background/sw.js', read('chrome-extension/background/sw.js').match(/const VERSION = ['"]([\d.]+)['"]/)?.[1]);
  expect('CHANGELOG.md newest entry', read('CHANGELOG.md').match(/^- \*\*([\d.]+)\*\*/m)?.[1]);
  try {
    const tags = execSync('git tag --list', { cwd: ROOT }).toString().split('\n');
    if (!tags.includes(v)) problems.push(`no git tag ${v} (expected after release commit)`);
  } catch {
    problems.push('git not available');
  }
});

// I8 — generated copies agree with their source.
check('I8', 'entry twins and rule copies in sync', (problems) => {
  const a = read('map/CLAUDE.md');
  for (const t of ['map/AGENTS.md', 'map/routing.md']) if (read(t) !== a) problems.push(`${t} differs from map/CLAUDE.md`);
  const phrase = /avoid opening or activating tabs/i;
  for (const f of ['AGENTS.md', '.cursorrules', '.cursor/rules/no-tabs-or-url-changes.mdc'])
    if (!phrase.test(read(f))) problems.push(`${f} lacks the current tab rule`);
});

// I9 — removed code stays removed: no lib/ai ghost, no ChatGPT provider outside the migration and the model-id list.
check('I9', 'lib/ai stays deleted; no ChatGPT/OpenAI-key code outside the migration', (problems) => {
  if (existsSync(join(EXT, 'lib/ai'))) problems.push('chrome-extension/lib/ai exists again (removed in 1.84.5)');
  const allowed = ['lib/provider-migration.js', 'lib/model-ids.js'];
  for (const f of sources.filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(f, 'utf8');
    if (/lib\/ai\/|from\s+['"]\.\/ai\//.test(text)) problems.push(`${rel(f)} imports lib/ai`);
    if (!allowed.some((a) => rel(f).endsWith(a)) && /openaiApiKey|CHATGPT_MODEL_ID|OPENAI_CHAT_COMPLETIONS_URL/.test(text))
      problems.push(`${rel(f)} references the removed ChatGPT provider`);
  }
});

// I12 — every relative import / script src in shipped source resolves to a file.
check('I12', 'relative imports resolve', (problems) => {
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|<script[^>]*src=)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!existsSync(resolve(dirname(f), m[1]))) problems.push(`${rel(f)} imports ${m[1]} (missing)`);
    }
  }
});

// I11 — the map index agrees with the cards; cards whose source changed since verification are flagged (note, not failure).
check('I11', 'map index status matches card frontmatter', (problems, notes) => {
  const index = read('map/objects/_index.md');
  const cards = [];
  const walkMd = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkMd(p);
      else if (name.endsWith('.md') && !name.startsWith('_') && !['CLAUDE.md', 'AGENTS.md', 'CONTEXT.md', 'routing.md'].includes(name)) cards.push(p);
    }
  };
  walkMd(join(ROOT, 'map/objects'));
  walkMd(join(ROOT, 'map/processes'));
  for (const card of cards) {
    const text = readFileSync(card, 'utf8');
    const status = text.match(/^status: (\w+)/m)?.[1];
    const base = rel(card).replace('map/objects/', '');
    if (rel(card).startsWith('map/objects/')) {
      const line = index.split('\n').find((l) => l.includes(`(${base})`));
      if (!line) problems.push(`${base} is not listed in map/objects/_index.md`);
      else if (!line.startsWith(`- ${status} ·`)) problems.push(`${base}: index says "${line.split(' ·')[0].slice(2)}", card says "${status}"`);
    }
    if (status === 'verified') {
      const at = text.match(/^verified_at: (\S+)/m)?.[1];
      const files = (text.match(/^owner_files: \[(.*)\]/m)?.[1] || '').split(',').map((f) => f.trim()).filter(Boolean);
      try {
        const changed = execSync(`git diff --name-only ${at} -- ${files.join(' ')}`, { cwd: ROOT }).toString().trim();
        if (changed) notes.push(`${base} is "verified" but its source changed since ${at}: ${changed.split('\n').join(', ')}`);
      } catch { /* unknown revision: ignore */ }
    }
  }
});

let failed = 0;
for (const r of results) {
  const ok = r.problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.id}  ${r.title}`);
  for (const p of r.problems) console.log(`       - ${p}`);
  for (const n of r.notes) console.log(`       ~ ${n}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

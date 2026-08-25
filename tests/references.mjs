/* Find components used in JSX but never imported or defined.
 *
 * These do not fail the build — an undefined identifier in JSX is only a
 * ReferenceError when that branch actually renders. So a page works with data
 * and dies on an empty list, which is the state a new shop is in on day one.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files "app/**/*.js" "app/**/*.jsx" "components/*.jsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

let problems = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  /* Everything brought in by any import, including multi-line named lists. */
  const imported = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1];
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def) imported.add(def[1]);
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) imported.add(name);
      }
    }
  }

  /* Anything declared in the file itself. */
  const declared = new Set();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Z][\w$]*)/g))
    declared.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][\w$]*)\s*=/g))
    declared.add(m[1]);

  /* Every capitalised JSX tag used. */
  const used = new Set();
  for (const m of src.matchAll(/<([A-Z][\w$]*)/g)) used.add(m[1]);

  const missing = [...used].filter((n) => !imported.has(n) && !declared.has(n));
  if (missing.length) {
    problems++;
    console.log(`  ${file}`);
    console.log(`      uses but never imports: ${missing.join(', ')}`);
  }
}

console.log(problems ? `\n${problems} file(s) with a missing reference` : '\n  none — every JSX tag resolves');
process.exit(problems ? 1 : 0);

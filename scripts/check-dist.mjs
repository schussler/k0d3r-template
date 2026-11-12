#!/usr/bin/env node
// Confere o build contra dois critérios da spec: nenhum arquivo externo (só HTML, JS e CSS) e nenhum gancho de teste.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = 'dist';
const ALLOWED = new Set(['.html', '.js', '.css']);
const FORBIDDEN_TEXT = ['__kepler'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const problems = [];
let files;
try {
  files = walk(DIST);
} catch (err) {
  console.error(`check-dist: não consegui ler ${DIST}/: ${err.message}`);
  process.exit(1);
}
for (const f of files) {
  if (!ALLOWED.has(extname(f))) problems.push(`arquivo de tipo não permitido: ${f}`);
  else if (extname(f) === '.js') {
    const text = readFileSync(f, 'utf8');
    for (const t of FORBIDDEN_TEXT) if (text.includes(t)) problems.push(`${f} contém "${t}" (código só de desenvolvimento)`);
  }
}
if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problema(s)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-dist: ok (${files.length} arquivos: ${files.map((f) => extname(f)).sort().join(' ')})`);

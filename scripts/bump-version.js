#!/usr/bin/env node
/**
 * bump-version.js — incrementa a versão do Orpen URA Builder.
 *
 * Uso:
 *   node scripts/bump-version.js <patch|minor|major> "Descrição da mudança"
 *
 * Atalhos via package.json:
 *   npm run version:patch "Correção de bug"
 *   npm run version:minor "Nova funcionalidade"
 *   npm run version:major "Mudança arquitetural"
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = join(__dirname, '..', 'src', 'version.js');

// ── Argumentos ────────────────────────────────────────────────────────────────

const [, , bumpType, ...descParts] = process.argv;
const description = descParts.join(' ').trim();

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('❌ Tipo inválido. Use: patch | minor | major');
  console.error('   Exemplo: node scripts/bump-version.js patch "Correção de contraste"');
  process.exit(1);
}

if (!description) {
  console.error('❌ Descrição obrigatória.');
  console.error('   Exemplo: node scripts/bump-version.js patch "Correção de contraste"');
  process.exit(1);
}

// ── Lê o arquivo e extrai VERSION via eval seguro ─────────────────────────────

const content = readFileSync(VERSION_FILE, 'utf-8');

const majorMatch = content.match(/major:\s*(\d+)/);
const minorMatch = content.match(/minor:\s*(\d+)/);
const patchMatch = content.match(/patch:\s*(\d+)/);
const labelMatch = content.match(/label:\s*'([^']*)'/);

if (!majorMatch || !minorMatch || !patchMatch) {
  console.error('❌ Não foi possível parsear src/version.js. Verifique o formato.');
  process.exit(1);
}

let major = parseInt(majorMatch[1], 10);
let minor = parseInt(minorMatch[1], 10);
let patch = parseInt(patchMatch[1], 10);
const label = labelMatch ? labelMatch[1] : '';

// ── Incrementa ────────────────────────────────────────────────────────────────

const prev = `${major}.${minor}.${patch}`;

if (bumpType === 'major') { major += 1; minor = 0; patch = 0; }
else if (bumpType === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }

const next = `${major}.${minor}.${patch}`;
const today = new Date().toISOString().slice(0, 10);
const versionString = `${next}${label ? '-' + label : ''}`;

console.log(`\n📦 Orpen URA Builder — bump version`);
console.log(`   ${prev} → ${versionString}`);
console.log(`   ${bumpType.toUpperCase()} · ${today}\n`);

// ── Prefixo da mensagem ───────────────────────────────────────────────────────

const prefix = bumpType === 'major' ? '~ ' : bumpType === 'minor' ? '+ ' : '~ ';
const escapedDesc = description.replace(/'/g, "\\'");

// ── Nova entrada do changelog ─────────────────────────────────────────────────

const newEntry = `    {
      version: '${next}',
      date: '${today}',
      changes: [
        '${prefix}${escapedDesc}',
      ],
    },\n`;

// ── Substitui bloco VERSION no arquivo ───────────────────────────────────────
// Estratégia: substitui cada campo individualmente e insere a entrada no início do array

let updated = content;

// Atualiza major, minor, patch, buildDate
updated = updated.replace(/(major:\s*)\d+/, `$1${major}`);
updated = updated.replace(/(minor:\s*)\d+/, `$1${minor}`);
updated = updated.replace(/(patch:\s*)\d+/, `$1${patch}`);
updated = updated.replace(/(buildDate:\s*)'[^']*'/, `$1'${today}'`);

// Insere nova entrada no início do array changelog (após "changelog: [")
updated = updated.replace(/(changelog:\s*\[)\s*\n/, `$1\n${newEntry}`);

writeFileSync(VERSION_FILE, updated, 'utf-8');

console.log(`✅ src/version.js atualizado`);
console.log(`   VERSION_STRING: ${versionString}`);
console.log(`   buildDate: ${today}`);
console.log(`\n   Próximo passo:`);
console.log(`   git add src/version.js`);
console.log(`   git commit -m "chore: bump version ${next} — ${description}"\n`);

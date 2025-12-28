// Script per estrarre istruzioni SAGE dai file Rust e generare una mappa JSON
// Usage: node scripts/extract_sage_instructions.cjs --src <input_dir> --out <output_file>

const fs = require('fs');
const path = require('path');

function getArg(flag, def) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : def;
}

const SRC = getArg('--src', '../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions');
const OUT = getArg('--out', 'dist/sage_instructions.tmp.json');

function extractDocAbove(lines, structIdx) {
  let doc = [];
  for (let i = structIdx - 1; i >= 0; --i) {
    const line = lines[i].trim();
    if (line.startsWith('///')) doc.unshift(line.replace(/^\/\/\//, '').trim());
    else if (line.startsWith('/**')) doc.unshift(line.replace(/^\/\*\*/, '').trim());
    else if (line.startsWith('*')) doc.unshift(line.replace(/^\*/, '').trim());
    else if (line === '' || line.startsWith('//')) continue;
    else break;
  }
  return doc.join(' ');
}

function parseFile(filePath) {
  const relPath = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let results = [];
  for (let i = 0; i < lines.length; ++i) {
    const structMatch = lines[i].match(/pub struct (\w+)/);
    if (structMatch) {
      const name = structMatch[1];
      // Escludi InstructionAccounts e simili
      if (/InstructionAccounts$/i.test(name)) continue;
      // Cerca discriminatore nelle 10 righe sopra
      let discriminator = null;
      for (let j = Math.max(0, i - 10); j < i + 5 && j < lines.length; ++j) {
        const discMatch = lines[j].match(/discriminator\s*=\s*"([^"]+)"/);
        if (discMatch) {
          discriminator = discMatch[1];
          break;
        }
      }
      if (!discriminator) continue; // skip struct senza discriminatore
      const description = extractDocAbove(lines, i);
      results.push({
        name,
        discriminator,
        description,
        source: relPath
      });
    }
  }
  return results;
}

function walkDir(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) files = files.concat(walkDir(full));
    else if (full.endsWith('.rs')) files.push(full);
  }
  return files;
}

if (!fs.existsSync(SRC)) {
  console.error('Directory sorgente non trovata:', SRC);
  process.exit(2);
}
if (!fs.existsSync(path.dirname(OUT))) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
}

const files = walkDir(SRC);
let all = [];
for (const f of files) {
  all = all.concat(parseFile(f));
}

// Validazione duplicati discriminatore
const seen = new Set();
for (const x of all) {
  if (seen.has(x.discriminator)) {
    console.error('Discriminatore duplicato:', x.discriminator, x.name, x.source);
    process.exit(3);
  }
  seen.add(x.discriminator);
}

fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
console.log(`Estratte ${all.length} istruzioni in ${OUT}`);

// Script di test: converte un file JSON array in un file TypeScript che esporta l'array
// Usage: node scripts/json2tsmap.cjs input.json output.ts

const fs = require('fs');
const path = require('path');

const [,, input, output] = process.argv;
if (!input || !output) {
  console.error('Usage: node scripts/json2tsmap.cjs input.json output.ts');
  process.exit(1);
}

const arr = JSON.parse(fs.readFileSync(input, 'utf8'));
const ts = `// File generato automaticamente da ${path.basename(input)}\n\nexport const TEST_TS_MAP = ${JSON.stringify(arr, null, 2)};\n`;
fs.writeFileSync(output, ts);
console.log(`Creato ${output} con ${arr.length} elementi.`);

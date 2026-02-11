#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
const profileId = process.argv[2];
if (!profileId) {
  console.error('Usage: node run_decoder_on_cache.js <profileId> [batchSize]');
  process.exit(2);
}
const batchSize = Number(process.argv[3]) || 200;
const cacheDir = path.join(process.cwd(), 'cache', profileId, 'wallet-txs');
if (!fs.existsSync(cacheDir)) {
  console.error('Cache dir not found:', cacheDir);
  process.exit(3);
}

function listAllJsonFiles(dir) {
  const wallets = fs.readdirSync(dir);
  const out = [];
  for (const w of wallets) {
    const wdir = path.join(dir, w);
    if (!fs.existsSync(wdir)) continue;
    const files = fs.readdirSync(wdir).filter(f => f.endsWith('.json'));
    for (const f of files) out.push(path.join(wdir, f));
  }
  return out;
}

function extractSageInstructionsFromParsed(parsed) {
  const tx = parsed && parsed.data ? parsed.data : parsed;
  if (!tx || !tx.transaction || !tx.transaction.message) return [];
  const keys = tx.transaction.message.staticAccountKeys;
  const compiled = tx.transaction.message.compiledInstructions;
  if (!Array.isArray(keys) || !Array.isArray(compiled)) return [];
  const signature = tx.signature || (tx.signatures && tx.signatures[0]) || (tx.raw && tx.raw.signature) || '';
  const out = [];
  for (const ix of compiled) {
    if (typeof ix.programIdIndex === 'number' && keys[ix.programIdIndex] === SAGE_PROGRAM_ID) {
      let dataHex = '';
      if (ix.data) {
        if (typeof ix.data === 'string') {
          try {
            const bs58 = require('bs58');
            dataHex = Buffer.from(bs58.decode(ix.data)).toString('hex');
          } catch (e) {
            dataHex = Buffer.from(ix.data, 'base64').toString('hex');
          }
        } else if (Array.isArray(ix.data)) {
          dataHex = Buffer.from(ix.data).toString('hex');
        } else if (Buffer.isBuffer(ix.data)) {
          dataHex = ix.data.toString('hex');
        } else if (typeof ix.data === 'object' && ix.data && Array.isArray(ix.data.data)) {
          dataHex = Buffer.from(ix.data.data).toString('hex');
        }
      }
      out.push({ programId: SAGE_PROGRAM_ID, data: dataHex, signature });
    }
  }
  return out;
}

const files = listAllJsonFiles(cacheDir);
console.log('Found', files.length, 'json files');
let inputs = [];
for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const parsed = JSON.parse(raw);
    const sage = extractSageInstructionsFromParsed(parsed);
    if (sage.length > 0) {
      // attach source file for traceability
      sage.forEach(s => s._source = f);
      inputs = inputs.concat(sage);
    }
  } catch (e) {
    // ignore
  }
}
console.log('Total SAGE instructions found:', inputs.length);

if (inputs.length === 0) process.exit(0);

const outDir = path.join(process.cwd(), 'log');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const resultsSummary = { totalInput: inputs.length, batches: [] };
let batchIndex = 0;
for (let i = 0; i < inputs.length; i += batchSize) {
  const batch = inputs.slice(i, i + batchSize);
  const payload = JSON.stringify(batch);
  console.log(`Running batch ${batchIndex} (size=${batch.length})`);
  const res = spawnSync(path.join(process.cwd(), 'bin', 'carbon_decoder'), [payload, '--mode', 'composite'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  const outFile = path.join(outDir, `carbon_decoder_output_${profileId}_batch_${batchIndex}.json`);
  const record = {
    batchIndex,
    inputCount: batch.length,
    inputSignatures: batch.map(b => b.signature),
    exitCode: res.status,
    error: res.error ? String(res.error) : null,
    stdout: res.stdout ? res.stdout.trim() : '',
    stderr: res.stderr ? res.stderr.trim() : ''
  };
  try {
    fs.writeFileSync(outFile, JSON.stringify(record, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed writing', outFile, e.message);
  }
  // try parse stdout to count successes
  let parsedStdout = null;
  try {
    parsedStdout = record.stdout ? JSON.parse(record.stdout) : null;
  } catch (e) {
    parsedStdout = null;
  }
  let successCount = 0;
  if (Array.isArray(parsedStdout)) {
    successCount = parsedStdout.filter(r => r && r.success === true).length;
  }
  resultsSummary.batches.push({ batchIndex, inputCount: batch.length, exitCode: record.exitCode, successCount });
  console.log(`Batch ${batchIndex} done — exit=${record.exitCode} successes=${successCount}`);
  batchIndex += 1;
}

const summaryFile = path.join(outDir, `carbon_decoder_summary_${profileId}.json`);
fs.writeFileSync(summaryFile, JSON.stringify(resultsSummary, null, 2), 'utf8');
console.log('Done. Summary saved to', summaryFile);
process.exit(0);

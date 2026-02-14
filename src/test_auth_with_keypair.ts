import nacl from 'tweetnacl';
import bs58 from 'bs58';

async function testCompleteAuthWithSignature() {
  console.log('\n=== SAE Auth Module - Complete Flow Test ===\n');

  const message = Buffer.from(`Login test ${Date.now()}`);
  const messageB64 = message.toString('base64');

  console.log('[1] Generating Ed25519 keypair for testing...');
  const keypair = nacl.sign.keyPair();
  const pubkeyB58 = bs58.encode(keypair.publicKey);
  console.log('Public Key:', pubkeyB58);
  console.log('Message:', message.toString('utf8'));

  const signature = nacl.sign.detached(message, keypair.secretKey);
  const signatureB64 = Buffer.from(signature).toString('base64');
  console.log('Signature (64 bytes):', signatureB64.substring(0, 20) + '...');

  console.log('\n[2] Verify signature locally (should pass)...');
  const isValidLocal = nacl.sign.detached.verify(
    message,
    signature,
    keypair.publicKey
  );
  console.log('Local verification result:', isValidLocal ? '✓ VALID' : '✗ INVALID');

  console.log('\n[3] Test endpoint with VALID signature but UNAUTHORIZED wallet...');
  const unauthorizedRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: pubkeyB58,
      message: messageB64,
      signature: signatureB64
    })
  });
  console.log('Status:', unauthorizedRes.status);
  const unauthorizedBody = await unauthorizedRes.json();
  console.log('Response:', unauthorizedBody);

  console.log('\n[4] Adding wallet to ALLOWED_WALLETS via .env...');
  const fs = await import('fs');
  const path = await import('path');
  const envPath = path.dirname(process.cwd()) + '/sae/.env';
  const envContent = `JWT_SECRET=your-super-secret-jwt-key-at-least-32-bytes-long-here-xxx12345
JWT_EXPIRY_SECONDS=604800
ALLOWED_WALLETS=9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY,${pubkeyB58}
NODE_ENV=development
`;
  await fs.promises.writeFile(path.join(process.cwd(), '.env'), envContent);
  console.log('✓ Updated .env with new wallet pubkey');

  console.log('\n[5] NOTE: Server must be restarted to reload .env');
  console.log('Run: pkill -9 node; cd ~/sae; sleep 1; npm run build && npm run dev');
  console.log('\nAfter restart, test login again:');
  console.log('curl -X POST http://localhost:3000/auth/login \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '{"pubkey":"${pubkeyB58}","message":"${messageB64}","signature":"${signatureB64}"}'`);

  console.log('\n[6] Test authenticate-protected endpoint WITHOUT token...');
  const noTokenRes = await fetch('http://localhost:3000/api/analyze-profile', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Status:', noTokenRes.status, '(should be 401 or 400 depending on route)');

  console.log('\n=== Test Complete ===\n');
}

testCompleteAuthWithSignature().catch(e => console.error('Error:', e));

import nacl from 'tweetnacl';
import bs58 from 'bs58';

const testPubkey = '9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY';

async function testAuthFlow() {
  console.log('\n=== SAE Auth Module Test ===\n');

  console.log('[1] Test: Invalid pubkey format');
  const invalidPubkeyRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: 'invalid',
      message: 'dGVzdA==',
      signature: 'dGVzdA=='
    })
  });
  console.log('Status:', invalidPubkeyRes.status);
  console.log('Response:', await invalidPubkeyRes.json());

  console.log('\n[2] Test: Missing fields');
  const missingFieldsRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: testPubkey
    })
  });
  console.log('Status:', missingFieldsRes.status);
  console.log('Response:', await missingFieldsRes.json());

  console.log('\n[3] Test: Invalid message encoding (not base64)');
  const invalidMsgRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: testPubkey,
      message: '!!!invalid!!!',
      signature: 'dGVzdA=='
    })
  });
  console.log('Status:', invalidMsgRes.status);
  console.log('Response:', await invalidMsgRes.json());

  console.log('\n[4] Test: Invalid signature (wrong length)');
  const invalidSigRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: testPubkey,
      message: 'dGVzdA==',
      signature: 'c2hvcnQ='
    })
  });
  console.log('Status:', invalidSigRes.status);
  console.log('Response:', await invalidSigRes.json());

  console.log('\n[5] Test: Invalid pubkey (not 32 bytes)');
  const shortPubkeyRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: 'A',
      message: 'dGVzdA==',
      signature: 'dGVzdA=='
    })
  });
  console.log('Status:', shortPubkeyRes.status);
  console.log('Response:', await shortPubkeyRes.json());

  console.log('\n[6] Test: Valid format but invalid signature');
  const message = Buffer.from('Login test message');
  const messageB64 = message.toString('base64');
  const dummySig = Buffer.alloc(64).toString('base64');
  const invalidSigButValidFormatRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: testPubkey,
      message: messageB64,
      signature: dummySig
    })
  });
  console.log('Status:', invalidSigButValidFormatRes.status);
  console.log('Response:', await invalidSigButValidFormatRes.json());

  console.log('\n[7] Test: Wallet not authorized (valid format but not in whitelist)');
  const otherWallet = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
  const validSigButUnauthorizedRes = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: otherWallet,
      message: messageB64,
      signature: dummySig
    })
  });
  console.log('Status:', validSigButUnauthorizedRes.status);
  console.log('Response:', await validSigButUnauthorizedRes.json());

  console.log('\n=== Test Complete ===\n');
}

testAuthFlow().catch(e => console.error('Test failed:', e));

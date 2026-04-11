import assert from 'node:assert/strict';
import test from 'node:test';

import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

import {
  createTxSigningRequest,
  getTxSigningRequestDebugInfo,
  verifySignedTransactionRequest,
} from '../src/backend/security/txSigningGuard';

function buildTransferTx(signer = Keypair.generate(), lamports = 1234) {
  const recipient = Keypair.generate().publicKey;
  const tx = new Transaction();
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: recipient,
      lamports,
    }),
  );
  return { signer, recipient, tx };
}

function buildRoundTripSensitiveTx(signer = Keypair.generate()) {
  const shared = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const tx = new Transaction();
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.add(
    new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: shared, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, 2, 3, 4]),
    }),
  );
  tx.add(
    new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: shared, isSigner: false, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([5, 6, 7, 8]),
    }),
  );
  return { signer, tx };
}

test('verifySignedTransactionRequest accepts the exact signed payload once', () => {
  const { signer, tx } = buildTransferTx();
  const request = createTxSigningRequest({
    tx,
    signer: signer.publicKey,
    operation: 'unit-test',
    expiresInMs: 60_000,
  });

  tx.sign(signer);
  const signedTransaction = tx.serialize().toString('base64');

  const verified = verifySignedTransactionRequest({
    signingRequestId: request.id,
    signedTransaction,
  });

  assert.equal(verified.expectedSigner, signer.publicKey.toBase58());
  assert.equal(verified.operation, 'unit-test');
  assert.ok(verified.rawTx.length > 0);

  assert.throws(() => {
    verifySignedTransactionRequest({
      signingRequestId: request.id,
      signedTransaction,
    });
  }, /already used/i);
});

test('verifySignedTransactionRequest accepts a wallet-refreshed blockhash for the same tx intent', () => {
  const original = buildTransferTx(undefined, 1234);
  const request = createTxSigningRequest({
    tx: original.tx,
    signer: original.signer.publicKey,
    operation: 'blockhash-refresh',
    expiresInMs: 60_000,
  });

  const refreshed = new Transaction();
  refreshed.feePayer = original.signer.publicKey;
  refreshed.recentBlockhash = Keypair.generate().publicKey.toBase58();
  refreshed.add(
    SystemProgram.transfer({
      fromPubkey: original.signer.publicKey,
      toPubkey: original.recipient,
      lamports: 1234,
    }),
  );
  refreshed.sign(original.signer);

  const verified = verifySignedTransactionRequest({
    signingRequestId: request.id,
    signedTransaction: refreshed.serialize().toString('base64'),
  });

  assert.equal(verified.operation, 'blockhash-refresh');
  assert.equal(verified.expectedSigner, original.signer.publicKey.toBase58());
});

test('verifySignedTransactionRequest accepts frontend round-trip serialization for the same tx intent', () => {
  const original = buildRoundTripSensitiveTx();
  const request = createTxSigningRequest({
    tx: original.tx,
    signer: original.signer.publicKey,
    operation: 'frontend-roundtrip',
    expiresInMs: 60_000,
  });

  const unsignedPayload = original.tx.serialize({ requireAllSignatures: false }).toString('base64');
  const roundTripped = Transaction.from(Buffer.from(unsignedPayload, 'base64'));
  roundTripped.sign(original.signer);

  const verified = verifySignedTransactionRequest({
    signingRequestId: request.id,
    signedTransaction: roundTripped.serialize().toString('base64'),
  });

  assert.equal(verified.operation, 'frontend-roundtrip');
});

test('verifySignedTransactionRequest accepts wallet-injected compute budget and small tip instructions', () => {
  const original = buildTransferTx(undefined, 1234);
  const request = createTxSigningRequest({
    tx: original.tx,
    signer: original.signer.publicKey,
    operation: 'wallet-aux',
    expiresInMs: 60_000,
  });

  const augmented = new Transaction();
  augmented.feePayer = original.signer.publicKey;
  augmented.recentBlockhash = original.tx.recentBlockhash;
  augmented.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250000 }));
  augmented.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
  augmented.add(SystemProgram.transfer({
    fromPubkey: original.signer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 5000,
  }));
  for (const instruction of original.tx.instructions) {
    augmented.add(instruction);
  }
  augmented.sign(original.signer);

  const verified = verifySignedTransactionRequest({
    signingRequestId: request.id,
    signedTransaction: augmented.serialize().toString('base64'),
  });

  assert.equal(verified.operation, 'wallet-aux');
});

test('verifySignedTransactionRequest accepts Lighthouse assertion instructions injected by the wallet', () => {
  const original = buildTransferTx(undefined, 1234);
  const request = createTxSigningRequest({
    tx: original.tx,
    signer: original.signer.publicKey,
    operation: 'lighthouse-assertions',
    expiresInMs: 60_000,
  });

  const augmented = new Transaction();
  augmented.feePayer = original.signer.publicKey;
  augmented.recentBlockhash = original.tx.recentBlockhash;
  const lighthouseProgramId = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
  augmented.add(new TransactionInstruction({
    programId: lighthouseProgramId,
    keys: [{ pubkey: original.recipient, isSigner: false, isWritable: false }],
    data: Buffer.from('BgUDACuqagIAAAAABAMAAAEAAAAAAAAAAAA=', 'base64'),
  }));
  augmented.add(new TransactionInstruction({
    programId: lighthouseProgramId,
    keys: [{ pubkey: original.recipient, isSigner: false, isWritable: false }],
    data: Buffer.from('CgUFCALUCENaKAEAAAQDAAAGAAAAAAAAAAAAAeh5Ihh62UDuMMnf3TCqtkpUiVvW4V+ea6WsAtfcODfzAA==', 'base64'),
  }));
  for (const instruction of original.tx.instructions) {
    augmented.add(instruction);
  }
  augmented.sign(original.signer);

  const verified = verifySignedTransactionRequest({
    signingRequestId: request.id,
    signedTransaction: augmented.serialize().toString('base64'),
  });

  assert.equal(verified.operation, 'lighthouse-assertions');
});

test('verifySignedTransactionRequest rejects tampered transaction bytes', () => {
  const original = buildTransferTx(undefined, 1234);
  const request = createTxSigningRequest({
    tx: original.tx,
    signer: original.signer.publicKey,
    operation: 'tamper-check',
    expiresInMs: 60_000,
  });

  const tampered = new Transaction();
  tampered.feePayer = original.signer.publicKey;
  tampered.recentBlockhash = original.tx.recentBlockhash;
  tampered.add(
    SystemProgram.transfer({
      fromPubkey: original.signer.publicKey,
      toPubkey: original.recipient,
      lamports: 9999,
    }),
  );
  tampered.sign(original.signer);

  assert.throws(() => {
    verifySignedTransactionRequest({
      signingRequestId: request.id,
      signedTransaction: tampered.serialize().toString('base64'),
    });
  }, /mismatch|modified|integrity/i);
});

test('createTxSigningRequest persists debug info for PM2/multi-core handoff', () => {
  const { signer, tx } = buildTransferTx();
  const request = createTxSigningRequest({
    tx,
    signer: signer.publicKey,
    operation: 'pm2-persistence',
    expiresInMs: 60_000,
  });

  const debugInfo = getTxSigningRequestDebugInfo(request.id);
  assert.ok(debugInfo, 'expected persisted signing request debug info');
  assert.equal(debugInfo?.id, request.id);
  assert.equal(debugInfo?.expectedSigner, signer.publicKey.toBase58());
  assert.equal(debugInfo?.operation, 'pm2-persistence');
  assert.equal(typeof debugInfo?.storePath, 'string');
  assert.match(debugInfo?.storePath ?? '', /tx-signing-requests/);
});

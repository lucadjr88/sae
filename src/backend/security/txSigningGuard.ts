import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ComputeBudgetProgram, PublicKey, SystemInstruction, SystemProgram, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

const DEFAULT_REQUEST_TTL_MS = 2 * 60 * 1000;
const USED_REQUEST_RETENTION_MS = 10 * 60 * 1000;
const LOCK_STALE_MS = 30 * 1000;
const REQUEST_STORE_DIR = process.env.TX_SIGNING_STORE_DIR || path.join(process.cwd(), 'cache', 'security', 'tx-signing-requests');
const MAX_ALLOWED_WALLET_TIP_LAMPORTS = Number(process.env.TX_SIGNING_MAX_WALLET_TIP_LAMPORTS || 2_000_000);
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const LIGHTHOUSE_PROGRAM_ID = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
const LIGHTHOUSE_ALLOWED_DISCRIMINATORS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export interface CreateTxSigningRequestInput {
  tx: Transaction;
  signer: PublicKey | string;
  operation: string;
  profileId?: string;
  expiresInMs?: number;
  meta?: Record<string, JsonLike>;
}

export interface TxInstructionIntent {
  programId: string;
  dataBase64: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}

export interface TxAccountPrivilege {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface TxSigningRequestRecord {
  id: string;
  nonce: string;
  operation: string;
  profileId?: string;
  expectedSigner: string;
  expectedFeePayer: string;
  createdAt: number;
  expiresAt: number;
  unsignedTransaction: string;
  unsignedTxHash: string;
  messageBase64: string;
  messageHash: string;
  intentHash: string;
  recentBlockhash: string | null;
  instructionIntents: TxInstructionIntent[];
  accountPrivileges: TxAccountPrivilege[];
  meta?: Record<string, JsonLike>;
  usedAt?: number;
}

export interface VerifySignedTransactionRequestInput {
  signingRequestId: string;
  signedTransaction: string;
}

export interface VerifiedSignedTransactionResult {
  rawTx: Buffer;
  transaction: Transaction;
  expectedSigner: string;
  operation: string;
  record: TxSigningRequestRecord;
}

export interface TxSigningRequestDebugInfo extends TxSigningRequestRecord {
  state: 'pending' | 'used';
  storePath: string;
}

const txSigningRequests = new Map<string, TxSigningRequestRecord>();

function sha256Hex(value: Buffer | Uint8Array | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureStoreDir(): void {
  fs.mkdirSync(REQUEST_STORE_DIR, { recursive: true });
}

function getPendingRequestPath(id: string): string {
  return path.join(REQUEST_STORE_DIR, `${id}.json`);
}

function getUsedRequestPath(id: string): string {
  return path.join(REQUEST_STORE_DIR, `${id}.used.json`);
}

function getLockPath(id: string): string {
  return path.join(REQUEST_STORE_DIR, `${id}.lock`);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureStoreDir();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

function removeFileIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function removeRequestFiles(id: string): void {
  removeFileIfExists(getPendingRequestPath(id));
  removeFileIfExists(getUsedRequestPath(id));
  removeFileIfExists(getLockPath(id));
}

function loadRecordFromPath(filePath: string): TxSigningRequestRecord | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as TxSigningRequestRecord;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function persistRecord(record: TxSigningRequestRecord): string {
  const targetPath = record.usedAt ? getUsedRequestPath(record.id) : getPendingRequestPath(record.id);
  writeJsonAtomic(targetPath, record);
  if (record.usedAt) {
    removeFileIfExists(getPendingRequestPath(record.id));
  }
  txSigningRequests.set(record.id, record);
  return targetPath;
}

function loadTxSigningRequest(id: string, preferDisk = false): TxSigningRequestRecord | null {
  if (!preferDisk) {
    const cached = txSigningRequests.get(id);
    if (cached) return cached;
  }

  const record = loadRecordFromPath(getPendingRequestPath(id)) ?? loadRecordFromPath(getUsedRequestPath(id));
  if (record) {
    txSigningRequests.set(id, record);
    return record;
  }

  if (preferDisk) {
    return txSigningRequests.get(id) ?? null;
  }
  return null;
}

function acquireRequestLock(id: string): { lockPath: string; fd: number } {
  ensureStoreDir();
  const lockPath = getLockPath(id);

  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      return { lockPath, fd };
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          console.warn('[TX-SIGNING] removing stale lock', { signingRequestId: id, lockPath });
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      throw new Error('Signing request is already being processed');
    }
  }
}

function releaseRequestLock(lock: { lockPath: string; fd: number }): void {
  try {
    fs.closeSync(lock.fd);
  } catch {}
  removeFileIfExists(lock.lockPath);
}

export function pruneExpiredTxSigningRequests(now = Date.now()): void {
  for (const [id, record] of txSigningRequests.entries()) {
    const expired = record.expiresAt <= now;
    const staleUsed = typeof record.usedAt === 'number' && record.usedAt + USED_REQUEST_RETENTION_MS <= now;
    if (expired || staleUsed) {
      txSigningRequests.delete(id);
    }
  }

  if (!fs.existsSync(REQUEST_STORE_DIR)) return;

  for (const entry of fs.readdirSync(REQUEST_STORE_DIR)) {
    const filePath = path.join(REQUEST_STORE_DIR, entry);
    if (entry.endsWith('.lock')) {
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {}
      continue;
    }
    if (!entry.endsWith('.json')) continue;

    try {
      const record = loadRecordFromPath(filePath);
      if (!record) continue;
      const expired = record.expiresAt <= now;
      const staleUsed = typeof record.usedAt === 'number' && record.usedAt + USED_REQUEST_RETENTION_MS <= now;
      if (expired || staleUsed) {
        removeRequestFiles(record.id);
      }
    } catch (error: any) {
      console.warn('[TX-SIGNING] failed to prune record', { filePath, error: error?.message || String(error) });
    }
  }
}

function buildInstructionIntents(tx: Transaction): TxInstructionIntent[] {
  return tx.instructions.map((instruction) => ({
    programId: instruction.programId.toBase58(),
    dataBase64: Buffer.from(instruction.data).toString('base64'),
    keys: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  }));
}

function buildAccountPrivileges(tx: Transaction): TxAccountPrivilege[] {
  const message = tx.compileMessage();
  const { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts } = message.header;
  const signedWritableCount = numRequiredSignatures - numReadonlySignedAccounts;
  const unsignedWritableCutoff = message.accountKeys.length - numReadonlyUnsignedAccounts;

  return message.accountKeys.map((key, index) => {
    const isSigner = index < numRequiredSignatures;
    const isWritable = isSigner
      ? index < signedWritableCount
      : index < unsignedWritableCutoff;
    return {
      pubkey: key.toBase58(),
      isSigner,
      isWritable,
    };
  });
}

function buildTxIntentSnapshot(tx: Transaction) {
  return {
    feePayer: tx.feePayer?.toBase58?.() ?? null,
    instructionIntents: buildInstructionIntents(tx),
  };
}

function buildTxIntentHash(tx: Transaction): string {
  return sha256Hex(JSON.stringify(buildTxIntentSnapshot(tx)));
}

function getExpectedInstructionIntents(record: TxSigningRequestRecord): TxInstructionIntent[] {
  if (Array.isArray(record.instructionIntents) && record.instructionIntents.length > 0) {
    return record.instructionIntents;
  }
  const rawUnsignedTx = Buffer.from(record.unsignedTransaction, 'base64');
  const tx = Transaction.from(rawUnsignedTx);
  return buildInstructionIntents(tx);
}

function areInstructionIntentsEqual(left: TxInstructionIntent, right: TxInstructionIntent): boolean {
  return left.programId === right.programId
    && left.dataBase64 === right.dataBase64
    && left.keys.length === right.keys.length
    && left.keys.every((key, index) => key.pubkey === right.keys[index]?.pubkey);
}

function getExpectedAccountPrivileges(record: TxSigningRequestRecord): TxAccountPrivilege[] {
  if (Array.isArray(record.accountPrivileges) && record.accountPrivileges.length > 0) {
    return record.accountPrivileges;
  }
  const rawUnsignedTx = Buffer.from(record.unsignedTransaction, 'base64');
  const tx = Transaction.from(rawUnsignedTx);
  return buildAccountPrivileges(tx);
}

function isAllowedWalletInstruction(instruction: TxInstructionIntent, feePayer: string): boolean {
  if (instruction.programId === ComputeBudgetProgram.programId.toBase58()) {
    return true;
  }
  if (instruction.programId === MEMO_PROGRAM_ID) {
    return true;
  }
  if (instruction.programId === LIGHTHOUSE_PROGRAM_ID) {
    try {
      const discriminator = Buffer.from(instruction.dataBase64, 'base64')[0] ?? -1;
      const signerSafe = instruction.keys.every((key) => !key.isSigner || key.pubkey === feePayer);
      return signerSafe && LIGHTHOUSE_ALLOWED_DISCRIMINATORS.has(discriminator);
    } catch {
      return false;
    }
  }
  if (instruction.programId === SystemProgram.programId.toBase58()) {
    try {
      const txInstruction = SystemProgram.transfer({
        fromPubkey: new PublicKey(instruction.keys[0]?.pubkey ?? feePayer),
        toPubkey: new PublicKey(instruction.keys[1]?.pubkey ?? feePayer),
        lamports: 0,
      });
      txInstruction.data = Buffer.from(instruction.dataBase64, 'base64');
      txInstruction.keys = instruction.keys.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      }));
      const type = SystemInstruction.decodeInstructionType(txInstruction);
      if (type !== 'Transfer') return false;
      const decoded = SystemInstruction.decodeTransfer(txInstruction);
      return decoded.fromPubkey.toBase58() === feePayer && decoded.lamports <= MAX_ALLOWED_WALLET_TIP_LAMPORTS;
    } catch {
      return false;
    }
  }
  return false;
}

function toPubkeyString(value: PublicKey | string): string {
  return typeof value === 'string' ? new PublicKey(value).toBase58() : value.toBase58();
}

export function createTxSigningRequest(input: CreateTxSigningRequestInput): TxSigningRequestRecord {
  pruneExpiredTxSigningRequests();

  const { tx, operation, profileId, meta } = input;
  if (!tx.feePayer) {
    throw new Error('Cannot create signing request without tx.feePayer');
  }
  if (!tx.recentBlockhash) {
    throw new Error('Cannot create signing request without tx.recentBlockhash');
  }

  const createdAt = Date.now();
  const expiresInMs = Math.max(5_000, input.expiresInMs ?? DEFAULT_REQUEST_TTL_MS);
  const id = crypto.randomUUID();
  const nonce = crypto.randomBytes(16).toString('hex');
  const expectedSigner = toPubkeyString(input.signer);
  const expectedFeePayer = tx.feePayer.toBase58();
  const messageBytes = Buffer.from(tx.serializeMessage());
  const unsignedTransaction = tx.serialize({ requireAllSignatures: false }).toString('base64');

  const record: TxSigningRequestRecord = {
    id,
    nonce,
    operation,
    profileId,
    expectedSigner,
    expectedFeePayer,
    createdAt,
    expiresAt: createdAt + expiresInMs,
    unsignedTransaction,
    unsignedTxHash: sha256Hex(unsignedTransaction),
    messageBase64: messageBytes.toString('base64'),
    messageHash: sha256Hex(messageBytes),
    intentHash: buildTxIntentHash(tx),
    recentBlockhash: tx.recentBlockhash ?? null,
    instructionIntents: buildInstructionIntents(tx),
    accountPrivileges: buildAccountPrivileges(tx),
    meta,
  };

  const storePath = persistRecord(record);
  console.debug('[TX-SIGNING] request created', {
    signingRequestId: id,
    operation,
    expectedSigner,
    profileId: profileId ?? null,
    expiresAt: record.expiresAt,
    storePath,
  });
  return record;
}

export function verifySignedTransactionRequest(input: VerifySignedTransactionRequestInput): VerifiedSignedTransactionResult {
  pruneExpiredTxSigningRequests();

  const { signingRequestId, signedTransaction } = input;
  if (!signedTransaction || typeof signedTransaction !== 'string') {
    throw new Error('Missing signed transaction payload');
  }

  const lock = acquireRequestLock(signingRequestId);
  try {
    const record = loadTxSigningRequest(signingRequestId, true);
    if (!record) {
      throw new Error('Unknown or expired signing request');
    }
    if (record.usedAt) {
      throw new Error('Signing request already used');
    }
    if (record.expiresAt <= Date.now()) {
      removeRequestFiles(signingRequestId);
      txSigningRequests.delete(signingRequestId);
      throw new Error('Signing request expired');
    }

    let rawTx: Buffer;
    let transaction: Transaction;
    try {
      rawTx = Buffer.from(signedTransaction, 'base64');
      transaction = Transaction.from(rawTx);
    } catch (error: any) {
      throw new Error(`Invalid signed transaction encoding: ${error?.message || String(error)}`);
    }

    const expectedMessage = Buffer.from(record.messageBase64, 'base64');
    const actualMessage = Buffer.from(transaction.serializeMessage());
    const expectedInstructionIntents = getExpectedInstructionIntents(record);
    const actualInstructionIntents = buildInstructionIntents(transaction);
    const matchedIndexes = new Set<number>();
    let searchFromIndex = 0;

    for (const expectedInstruction of expectedInstructionIntents) {
      let foundIndex = -1;
      for (let index = searchFromIndex; index < actualInstructionIntents.length; index++) {
        if (areInstructionIntentsEqual(expectedInstruction, actualInstructionIntents[index])) {
          foundIndex = index;
          break;
        }
      }
      if (foundIndex === -1) {
        console.warn('[TX-SIGNING] intent mismatch', {
          signingRequestId,
          reason: 'missing-required-instruction',
          expectedMessageHash: record.messageHash,
          actualMessageHash: sha256Hex(actualMessage),
          expectedIntentHash: record.intentHash,
          actualIntentHash: buildTxIntentHash(transaction),
          expectedRecentBlockhash: record.recentBlockhash ?? null,
          actualRecentBlockhash: transaction.recentBlockhash ?? null,
          expectedIntent: buildTxIntentSnapshot(Transaction.from(Buffer.from(record.unsignedTransaction, 'base64'))),
          actualIntent: buildTxIntentSnapshot(transaction),
        });
        throw new Error('Transaction integrity mismatch: signed payload differs from the server-generated transaction');
      }
      matchedIndexes.add(foundIndex);
      searchFromIndex = foundIndex + 1;
    }

    const expectedAccountPrivileges = getExpectedAccountPrivileges(record);
    const actualAccountPrivileges = new Map(buildAccountPrivileges(transaction).map((privilege) => [privilege.pubkey, privilege]));
    const privilegeMismatch = expectedAccountPrivileges.find((expectedPrivilege) => {
      const actualPrivilege = actualAccountPrivileges.get(expectedPrivilege.pubkey);
      return !actualPrivilege
        || actualPrivilege.isSigner !== expectedPrivilege.isSigner
        || actualPrivilege.isWritable !== expectedPrivilege.isWritable;
    });
    if (privilegeMismatch) {
      console.warn('[TX-SIGNING] intent mismatch', {
        signingRequestId,
        reason: 'account-privilege-mismatch',
        privilegeMismatch,
        actualPrivilege: actualAccountPrivileges.get(privilegeMismatch.pubkey) ?? null,
        expectedIntent: buildTxIntentSnapshot(Transaction.from(Buffer.from(record.unsignedTransaction, 'base64'))),
        actualIntent: buildTxIntentSnapshot(transaction),
      });
      throw new Error('Transaction integrity mismatch: signed payload differs from the server-generated transaction');
    }

    const extraInstructions = actualInstructionIntents.filter((_, index) => !matchedIndexes.has(index));
    const disallowedExtraInstructions = extraInstructions.filter((instruction) => !isAllowedWalletInstruction(instruction, record.expectedFeePayer));
    if (disallowedExtraInstructions.length > 0) {
      console.warn('[TX-SIGNING] intent mismatch', {
        signingRequestId,
        reason: 'disallowed-extra-instructions',
        expectedMessageHash: record.messageHash,
        actualMessageHash: sha256Hex(actualMessage),
        expectedIntentHash: record.intentHash,
        actualIntentHash: buildTxIntentHash(transaction),
        expectedRecentBlockhash: record.recentBlockhash ?? null,
        actualRecentBlockhash: transaction.recentBlockhash ?? null,
        extraInstructions,
        disallowedExtraInstructions,
        expectedIntent: buildTxIntentSnapshot(Transaction.from(Buffer.from(record.unsignedTransaction, 'base64'))),
        actualIntent: buildTxIntentSnapshot(transaction),
      });
      throw new Error('Transaction integrity mismatch: signed payload differs from the server-generated transaction');
    }
    if (extraInstructions.length > 0) {
      console.warn('[TX-SIGNING] allowing wallet-injected auxiliary instructions', {
        signingRequestId,
        extraInstructions,
      });
    }
    if (!actualMessage.equals(expectedMessage)) {
      console.warn('[TX-SIGNING] wallet refreshed recent blockhash but preserved tx intent', {
        signingRequestId,
        expectedRecentBlockhash: record.recentBlockhash ?? null,
        actualRecentBlockhash: transaction.recentBlockhash ?? null,
        expectedMessageHash: record.messageHash,
        actualMessageHash: sha256Hex(actualMessage),
      });
    }

    const actualFeePayer = transaction.feePayer?.toBase58?.();
    if (actualFeePayer !== record.expectedFeePayer) {
      throw new Error(`Transaction fee payer mismatch: expected ${record.expectedFeePayer}, got ${actualFeePayer || 'missing'}`);
    }

    const expectedSignerKey = new PublicKey(record.expectedSigner);
    const signerEntry = transaction.signatures.find((entry) => entry.publicKey.equals(expectedSignerKey));
    if (!signerEntry?.signature) {
      throw new Error(`Missing wallet signature for expected signer ${record.expectedSigner}`);
    }

    const signatureValid = nacl.sign.detached.verify(
      actualMessage,
      signerEntry.signature,
      expectedSignerKey.toBytes(),
    );
    if (!signatureValid) {
      throw new Error(`Invalid wallet signature for expected signer ${record.expectedSigner}`);
    }

    record.usedAt = Date.now();
    persistRecord(record);
    console.debug('[TX-SIGNING] request verified', {
      signingRequestId,
      operation: record.operation,
      expectedSigner: record.expectedSigner,
      rawTxBytes: rawTx.length,
      usedAt: record.usedAt,
    });

    return {
      rawTx,
      transaction,
      expectedSigner: record.expectedSigner,
      operation: record.operation,
      record,
    };
  } finally {
    releaseRequestLock(lock);
  }
}

export function getTxSigningRequestDebugInfo(signingRequestId: string): TxSigningRequestDebugInfo | null {
  pruneExpiredTxSigningRequests();
  const record = loadTxSigningRequest(signingRequestId, true);
  if (!record) return null;

  const usedPath = getUsedRequestPath(signingRequestId);
  const pendingPath = getPendingRequestPath(signingRequestId);
  const state = record.usedAt || fs.existsSync(usedPath) ? 'used' : 'pending';
  const storePath = state === 'used' ? usedPath : pendingPath;

  return {
    ...record,
    state,
    storePath,
  };
}

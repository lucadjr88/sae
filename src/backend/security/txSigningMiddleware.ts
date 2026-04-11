import type { NextFunction, Request, Response } from 'express';
import type { PublicKey, Transaction } from '@solana/web3.js';

import {
  createTxSigningRequest,
  type CreateTxSigningRequestInput,
  type VerifiedSignedTransactionResult,
  verifySignedTransactionRequest,
} from './txSigningGuard.js';

export interface PrepareTxForWalletSignatureInput extends CreateTxSigningRequestInput {
  tx: Transaction;
  signer: PublicKey | string;
}

export interface PreparedTxForWalletSignature {
  transaction: string;
  signingRequestId: string;
  signingRequestExpiresAt: number;
}

export function prepareTxForWalletSignature(input: PrepareTxForWalletSignatureInput): PreparedTxForWalletSignature {
  const signingRequest = createTxSigningRequest(input);
  console.debug('[TX-SIGNING][prepare] request created', {
    signingRequestId: signingRequest.id,
    operation: signingRequest.operation,
    expectedSigner: signingRequest.expectedSigner,
    profileId: signingRequest.profileId ?? null,
    expiresAt: signingRequest.expiresAt,
    messageHash: signingRequest.messageHash,
  });

  return {
    transaction: input.tx.serialize({ requireAllSignatures: false }).toString('base64'),
    signingRequestId: signingRequest.id,
    signingRequestExpiresAt: signingRequest.expiresAt,
  };
}

export function requireVerifiedTxSignature() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { transaction, signingRequestId } = req.body ?? {};

    if (!transaction || typeof transaction !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid transaction field' });
    }
    if (!signingRequestId || typeof signingRequestId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid signingRequestId field' });
    }

    try {
      const verified = verifySignedTransactionRequest({
        signingRequestId,
        signedTransaction: transaction,
      });

      (res.locals as Record<string, unknown>).verifiedSignedTx = verified;
      console.debug('[TX-SIGNING][middleware] request verified', {
        signingRequestId,
        operation: verified.operation,
        expectedSigner: verified.expectedSigner,
        rawTxBytes: verified.rawTx.length,
      });
      return next();
    } catch (error: any) {
      const message = error?.message || String(error);
      console.warn('[TX-SIGNING][middleware] verification failed', {
        signingRequestId,
        error: message,
      });
      return res.status(403).json({ error: message });
    }
  };
}

export function getVerifiedSignedTxFromLocals(res: Response): VerifiedSignedTransactionResult {
  const verified = (res.locals as Record<string, unknown>).verifiedSignedTx as VerifiedSignedTransactionResult | undefined;
  if (!verified) {
    throw new Error('Missing verified signed transaction in response locals');
  }
  return verified;
}

import nacl from 'tweetnacl';
import bs58 from 'bs58';

export interface VerifySignatureInput {
  pubkey: string;
  message: string;
  signature: string;
}

export interface VerifySignatureResult {
  valid: boolean;
  error?: string;
  pubkeyBuffer?: Buffer;
  messageBuffer?: Buffer;
  signatureBuffer?: Buffer;
}

export async function verifySignature(input: VerifySignatureInput): Promise<VerifySignatureResult> {
  const { pubkey, message, signature } = input;

  try {
    let pubkeyBuffer: Buffer;
    try {
      pubkeyBuffer = Buffer.from(bs58.decode(pubkey));
      if (pubkeyBuffer.length !== 32) {
        return { valid: false, error: 'Invalid pubkey length (expected 32 bytes)' };
      }
    } catch (e) {
      return { valid: false, error: 'Invalid pubkey format (not valid base58)' };
    }

    let messageBuffer: Buffer;
    try {
      messageBuffer = Buffer.from(message, 'base64');
    } catch (e) {
      return { valid: false, error: 'Invalid message encoding (expected base64)' };
    }

    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, 'base64');
      if (signatureBuffer.length !== 64) {
        return { valid: false, error: 'Invalid signature length (expected 64 bytes)' };
      }
    } catch (e) {
      return { valid: false, error: 'Invalid signature encoding (expected base64)' };
    }

    const isValid = nacl.sign.detached.verify(
      messageBuffer,
      signatureBuffer,
      pubkeyBuffer
    );

    return {
      valid: isValid,
      pubkeyBuffer,
      messageBuffer,
      signatureBuffer,
      error: isValid ? undefined : 'Signature verification failed'
    };
  } catch (e: any) {
    return { valid: false, error: `Unexpected error: ${e?.message || e}` };
  }
}

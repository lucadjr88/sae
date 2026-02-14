import express, { Request, Response } from 'express';
import { verifySignature } from '../../utils/auth/verifySignature.js';
import { generateToken } from '../../utils/auth/jwtHandler.js';
import { isWalletAuthorized } from '../../utils/auth/wallet-whitelist.js';
import { saveToken } from '../../utils/auth/tokenStorage.js';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { pubkey, message, signature, profileId } = req.body;

  console.log(`[auth/login] POST request received | pubkey=${pubkey?.substring(0, 10)}... | profileId=${profileId || 'global'}`);

  try {
    if (!pubkey || !message || !signature) {
      console.log(`[auth/login] ❌ Missing fields | pubkey=${!!pubkey} | message=${!!message} | signature=${!!signature}`);
      return res.status(400).json({ error: 'Missing pubkey, message, or signature' });
    }

    console.log(`[auth/login] ✓ Request fields validated`);

    const verifyResult = await verifySignature({ pubkey, message, signature });

    if (!verifyResult.valid) {
      console.log(`[auth/login] ❌ Signature verification failed | error=${verifyResult.error} | pubkey=${pubkey?.substring(0, 10)}...`);
      return res.status(403).json({
        error: verifyResult.error || 'Invalid signature',
        pubkey
      });
    }

    console.log(`[auth/login] ✓ Signature verified | pubkey=${pubkey?.substring(0, 10)}...`);

    const authorized = await isWalletAuthorized(pubkey, profileId);
    if (!authorized) {
      console.log(`[auth/login] ❌ Wallet not authorized | pubkey=${pubkey?.substring(0, 10)}... | profileId=${profileId || 'global'}`);
      return res.status(401).json({
        error: 'Wallet not authorized',
        pubkey
      });
    }

    console.log(`[auth/login] ✓ Wallet authorized | pubkey=${pubkey?.substring(0, 10)}...`);

    const token = generateToken(pubkey);
    const expirySeconds = parseInt(process.env.JWT_EXPIRY_SECONDS || '604800', 10);

    console.log(`[auth/login] ✓ JWT generated | expiresIn=${expirySeconds}s`);

    try {
      await saveToken(pubkey, token, expirySeconds);
      console.log(`[auth/login] ✓ Token saved to file | pubkey=${pubkey?.substring(0, 10)}...`);
    } catch (e: any) {
      console.warn(`[auth/login] ⚠ Failed to save token file: ${e?.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[auth/login] ✅ SUCCESS | pubkey=${pubkey?.substring(0, 10)}... | duration=${duration}ms`);

    return res.json({
      success: true,
      token,
      expiresIn: expirySeconds,
      pubkey
    });
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error(`[auth/login] ❌ ERROR | ${e?.message || e} | pubkey=${pubkey?.substring(0, 10)}... | duration=${duration}ms`);
    return res.status(500).json({
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? e?.message : undefined
    });
  }
});

export default router;

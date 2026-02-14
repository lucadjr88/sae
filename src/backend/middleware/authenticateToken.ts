import { Request, Response, NextFunction } from 'express';
import { verifyToken as verifyJwt } from '../../utils/auth/jwtHandler.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        pubkey: string;
      };
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const method = req.method;
  const path = req.path;

  console.log(`[authenticateToken] ${method} ${path} | token=${token ? 'present' : 'missing'}`);

  if (!token) {
    console.log(`[authenticateToken] ❌ Token missing | ${method} ${path}`);
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = verifyJwt(token);
    req.user = { pubkey: payload.pubkey };
    console.log(`[authenticateToken] ✓ Token verified | pubkey=${payload.pubkey?.substring(0, 10)}... | ${method} ${path}`);
    next();
  } catch (e: any) {
    const errorMsg = e?.message || 'Invalid token';
    const status = errorMsg === 'Token expired' ? 401 : 403;
    console.error(`[authenticateToken] ❌ Token verification failed | ${errorMsg} | ${method} ${path}`);
    return res.status(status).json({ error: errorMsg });
  }
}


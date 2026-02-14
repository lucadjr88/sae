import jwt from 'jsonwebtoken';

export interface JwtPayload {
  pubkey: string;
  iat?: number;
  exp?: number;
  type?: string;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set in environment and be at least 32 bytes');
  }
  return secret;
};

const getExpirySeconds = (): number => {
  const envValue = process.env.JWT_EXPIRY_SECONDS;
  return envValue ? parseInt(envValue, 10) : 604800; // default 7 days
};

export function generateToken(pubkey: string): string {
  try {
    const secret = getSecret();
    const expirySeconds = getExpirySeconds();
    const payload: JwtPayload = {
      pubkey,
      type: 'auth'
    };

    const token = jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: expirySeconds
    });

    return token;
  } catch (e: any) {
    throw new Error(`Token generation failed: ${e?.message || e}`);
  }
}

export function verifyToken(token: string): JwtPayload {
  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    return decoded;
  } catch (e: any) {
    if (e.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (e.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error(`Token verification failed: ${e?.message || e}`);
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token) as JwtPayload | null;
    return decoded;
  } catch (e) {
    return null;
  }
}

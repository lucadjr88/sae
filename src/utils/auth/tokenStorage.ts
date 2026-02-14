import { promises as fs } from 'fs';
import path from 'path';

const TOKEN_DIR = path.join(process.cwd(), 'token');

async function ensureTokenDir(): Promise<void> {
  try {
    await fs.mkdir(TOKEN_DIR, { recursive: true });
  } catch (e) {
    // ignore if dir already exists
  }
}

export async function saveToken(pubkey: string, token: string, expiresIn: number): Promise<string> {
  await ensureTokenDir();
  const filePath = path.join(TOKEN_DIR, pubkey);
  const data = {
    token,
    pubkey,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    expiresInSeconds: expiresIn
  };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

export async function loadToken(pubkey: string): Promise<{ token: string; issuedAt: string; expiresAt: string } | null> {
  try {
    const filePath = path.join(TOKEN_DIR, pubkey);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      token: data.token,
      issuedAt: data.issuedAt,
      expiresAt: data.expiresAt
    };
  } catch (e) {
    return null;
  }
}

export async function deleteToken(pubkey: string): Promise<boolean> {
  try {
    const filePath = path.join(TOKEN_DIR, pubkey);
    await fs.unlink(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

export async function listAllTokens(): Promise<string[]> {
  try {
    const files = await fs.readdir(TOKEN_DIR);
    return files;
  } catch (e) {
    return [];
  }
}

export async function getTokenStatus(pubkey: string): Promise<{ exists: boolean; isValid: boolean; expiresAt?: string } | null> {
  const data = await loadToken(pubkey);
  if (!data) return { exists: false, isValid: false };

  const expiresAt = new Date(data.expiresAt);
  const isValid = expiresAt > new Date();

  return {
    exists: true,
    isValid,
    expiresAt: data.expiresAt
  };
}

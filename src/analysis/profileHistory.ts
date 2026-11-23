import fs from 'fs/promises';
import path from 'path';

const ID_HISTORY_LOG_PATH = path.join(process.cwd(), 'IdHistory.log');
const ID_HISTORY_HEADER = 'timestamp\tprofileId\twalletPubKey\n';

export async function appendIdHistory(profileId: string, walletPubKey?: string | null): Promise<void> {
  const timestamp = new Date().toISOString();
  const wallet = typeof walletPubKey === 'string' && walletPubKey.trim().length > 0
    ? walletPubKey.trim()
    : '-';
  const line = `${timestamp}\t${profileId}\t${wallet}\n`;

  let prependHeader = false;
  try {
    const stats = await fs.stat(ID_HISTORY_LOG_PATH);
    prependHeader = !stats || stats.size === 0;
  } catch {
    prependHeader = true;
  }

  await fs.appendFile(
    ID_HISTORY_LOG_PATH,
    prependHeader ? `${ID_HISTORY_HEADER}${line}` : line,
    'utf8',
  );
}

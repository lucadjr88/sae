
export const APP_IDENTITY = {
  name: 'Star Atlas Explorer',
  uri: 'https://staratlasexplorer.duckdns.org',
  icon: 'favicon.ico',
};

export async function getWalletAdapters() {
  const { PhantomWalletAdapter } = await import('@solana/wallet-adapter-phantom');
  const { SolflareWalletAdapter } = await import('@solana/wallet-adapter-solflare');
  const { BackpackWalletAdapter } = await import('@solana/wallet-adapter-backpack');
  return [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ];
}
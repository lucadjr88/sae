

export const APP_IDENTITY = {
  name: 'React Native dApp',
  uri: 'https://staratlasexplorer.duckdns.org', // Your dApp's URL, used as the origin for wallet authorization
  icon: "favicon.ico", // Full path resolves to https://staratlasexplorer.duckdns.org/favicon.ico
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
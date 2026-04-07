
const APP_ORIGIN = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://staratlasexplorer.duckdns.org';
const APP_ICON_VERSION = '20260407b';

export const APP_IDENTITY = {
  name: 'Star Atlas Explorer',
  uri: APP_ORIGIN,
  icon: `${APP_ORIGIN}/favicon512.png?v=${APP_ICON_VERSION}`,
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
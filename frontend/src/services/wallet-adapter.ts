import { isMobile } from '../utils/mobile';
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";

export const APP_IDENTITY = {
  name: 'React Native dApp',
  uri:  'https://staratlasexplorer.duckdns.org', // Your dApp's URL, used as the origin for wallet authorization
  icon: "favicon.ico", // Full path resolves to https://staratlasexplorer.duckdns.org/favicon.ico
};

export async function getWalletAdapters() {
if (isMobile()) {
  
const authorizationResult = await transact(async (wallet: Web3MobileWallet) => {
    const authorizationResult = await wallet.authorize({
        chain: 'solana:mainnet',
        identity: APP_IDENTITY,
    });

    /* After approval, signing requests are available in the session. */

    return authorizationResult;
});
  } else {
    const { PhantomWalletAdapter } = await import('@solana/wallet-adapter-phantom');
    const { SolflareWalletAdapter } = await import('@solana/wallet-adapter-solflare');
    const { BackpackWalletAdapter } = await import('@solana/wallet-adapter-backpack');
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ];
  }
}
// Forza l'inclusione di createSidebarElement nel bundle per asset Vite
import { createSidebarElement as _createSidebarElement } from '@/ui/elements/sideBar';
// Forza inclusione home.png nel bundle Vite
//import homePng from '@/assets/icons/home.png'; // eslint-disable-line @typescript-eslint/no-unused-vars
import "@/style.css";
import "@/ui/styles/alertInstructions.css";
import "@/ui/styles/backGround.css";
import "@/ui/styles/footBar.css";
import "@/ui/styles/heroTitle_elements.css";
import "@/ui/styles/loading.css";
import "@/ui/styles/manualLogin.css";
import "@/ui/styles/fees_playload.css";
import "@/ui/styles/privacyPolicy.css";
import "@/ui/styles/resultsComponent.css";
import "@/ui/styles/resource_playload.css";
import "@/ui/styles/sideBar.css";
import "@/ui/styles/startButtons.css";
import "@/ui/styles/toggleSwitch.css";
import "@/ui/styles/rental_playload.css";
import "@/ui/styles/rentalState_playload.css";
import "@/ui/styles/rental_detail.css";
import "@/ui/styles/list_detail.css";
import { createHomePage, getWalletConnection, manualProfileEntryListener, getWalletIcon } from "@/hompage";

import { Wallet } from '@/services/wallet';
import { setConnectedWalletPublicKey, setConnectedWalletIcon } from '@/utils/state';
// Setup wallet logic
import { isMobile } from '@/services/mobile';
import {
  initializeMobileWallet,
  connectMobileWallet,
  getMobilePublicKey,
  isMobileSessionValid,
  disconnectMobileWallet,
  getMobileIcon,
  onMobileConnect,
  mobileWalletAdapter
} from '@/services/mobile_wallet';

declare global {
  interface Window {
    wallet: any;
    prices?: any;
  }
}

window.addEventListener('error', (event) => {
  const message = typeof event.message === 'string'
    ? event.message
    : typeof event.error?.message === 'string'
      ? event.error.message
      : '';

  if (!message) {
    return;
  }

  // Verifichiamo se l'errore contiene le parole chiave di Phantom
  const isPhantomError = message.includes("Could not establish connection") ||
                         message.includes("PHANTOM");

  if (isPhantomError) {
    console.warn("Rilevato errore Phantom. Tentativo di ripristino...");
    
    // Usiamo il sessionStorage per evitare loop infiniti
    const reloadCount = parseInt(sessionStorage.getItem('phantom_reload_count') || '0', 10);
    
    if (reloadCount < 1) { // Limita a un solo tentativo automatico
      sessionStorage.setItem('phantom_reload_count', (reloadCount + 1).toString());
      window.location.reload();
    } else {
      console.log("Il ricaricamento automatico non ha risolto l'errore di Phantom.");
      // Opzionale: pulisci il contatore dopo un po'
      setTimeout(() => sessionStorage.removeItem('phantom_reload_count'), 5000);
    }
  }
}, true);

if (isMobile()) {
    initializeMobileWallet();
    window.wallet = {
      connect: connectMobileWallet,
      get publicKey() { return getMobilePublicKey(); },
      get isConnected() { return isMobileSessionValid(); },
      disconnect: disconnectMobileWallet,
      get icon() { return getMobileIcon(); },
      adapter: mobileWalletAdapter,
      name: "mobile"
    };
    onMobileConnect(() => {
      window.dispatchEvent(new Event('walletStateChanged'));
    });
} else {
  window.wallet = new Wallet();
}

createHomePage();
//console.log('[main.ts] Initialization complete | imports resolved directly without window globals');

const connectBtn = document.getElementById('connectWalletBtn') as HTMLButtonElement | null;
const enterNoWBtn = document.getElementById('enterNoWalletBtn') as HTMLButtonElement | null;


if (connectBtn) {
  connectBtn.disabled = false;
  connectBtn.addEventListener('click', () => {
    //console.log('[DEBUG] Connect Wallet button pressed');
    if (!window.wallet) {
      //alert('window.wallet non è definito!');
      console.log('[DEBUG] window.wallet non è definito!');
      return;
    }
    // Multi-wallet: mostra sempre il modal custom
    //console.log('[DEBUG] window.wallet prima di connect:', window.wallet);
    window.wallet.connect().then(() => {
      console.log('[DEBUG] Connect chiamato, stato wallet:', window.wallet);
    }).catch((err: any) => {
      //alert('Errore durante la connessione al wallet: ' + (err?.message || err));
      console.log('[DEBUG] Errore connect wallet:', err);
    });
  });
}

window.addEventListener('walletStateChanged', async () => {
  const wallet = window.wallet;
  if (wallet && wallet.isConnected) {
    const pubKeyStr = wallet.publicKey?.toString() || null;
    const iconStr = getWalletIcon(wallet);
    setConnectedWalletPublicKey(pubKeyStr);
    setConnectedWalletIcon(iconStr);
    getWalletConnection(wallet);
  } else {
    setConnectedWalletPublicKey(null);
    setConnectedWalletIcon(null);
  }
});





if (enterNoWBtn) {
  
  enterNoWBtn.addEventListener('click', () => {
    
    manualProfileEntryListener()

  });
}
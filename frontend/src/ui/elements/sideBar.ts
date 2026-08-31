// Modulo per la Sidebar: esporta funzione per creare la struttura reale della sidebar
// Copiata da index.html e main.ts

import { wipeAndReload } from "@/services/wipe_reload";
import { createPrivacyPolicySidebarElement } from "@/ui/elements/privacyPolicy";
import { toggleSwitchHTML } from "@/ui/elements/toggleSwitch";
import { applyProfileFactionIcon, getCachedProfileFaction } from "@/utils/faction";
import { currentProfileId } from "@/utils/state";
import playstoreIcona from "@/assets/icons/playstore.png";

  let hideTimeout: ReturnType<typeof setTimeout> | null = null;
  let suppressScrollHideUntil = 0;

  const clearHideTimer = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };

  const suppressScrollHideFor = (milliseconds: number) => {
    suppressScrollHideUntil = Date.now() + milliseconds;
  };

  export const canHideSidebarFromScroll = () => Date.now() >= suppressScrollHideUntil;

    

  export const startHideTimer = () => {
    clearHideTimer();
    if (!window.matchMedia('(max-width: 1200px)').matches) {
      return;
    }
    hideTimeout = setTimeout(() => {
      if (window.matchMedia('(max-width: 1200px)').matches) {
        hideSidebar();
      }
    }, 5000);
  };

  export const showSidebar = () => {
    const colonna1 = document.getElementById('colonna1');
    colonna1?.classList.remove('sidebar-hidden');
    document.body.classList.remove('sidebar-is-hidden');
    // Ignore scroll-triggered auto-hide briefly after opening from the toggle.
    suppressScrollHideFor(450);
    startHideTimer();
  };

  export const hideSidebar = () => {
    console.log('Hiding sidebar');
    const colonna1 = document.getElementById('colonna1');
    colonna1?.classList.add('sidebar-hidden');
    document.body.classList.add('sidebar-is-hidden');//nasconde sidebar
    document.getElementById('cacheTooltip')?.classList.remove('visible'); // nasconde tooltip cache se aperto
    clearHideTimer();
  };



export function createSidebarElement(): HTMLDivElement {
// 1. Il contenitore principale della Sidebar
const sidebar = document.createElement('div');
sidebar.id = 'sidebar';
sidebar.className = 'sidebar';
sidebar.onclick = () => {
  clearHideTimer();
    startHideTimer();
};


const homeIcon = document.createElement('div');
homeIcon.id = 'homeIcon';
homeIcon.className = 'home-icon';
homeIcon.title = 'Home';
// Aggiungi un evento click per tornare alla home
homeIcon.addEventListener('click', () => {
    // Logica per tornare alla home, ad esempio:
    window.location.href = '/'; // O qualsiasi altra logica per navigare alla home
});
sidebar.appendChild(homeIcon);

const homeIconImg = document.createElement('img');
homeIconImg.src = '/home.png';
homeIconImg.className = 'home-icon-img';
homeIconImg.alt = 'Home';
homeIcon.appendChild(homeIconImg);

const walletAndIconContainer = document.createElement('div');
walletAndIconContainer.className = 'wallet-icon-container';
sidebar.appendChild(walletAndIconContainer);

// 2. Info Wallet
const sidebarWalletInfo = document.createElement('div');
sidebarWalletInfo.id = 'sidebarWalletInfo';
sidebarWalletInfo.className = 'sidebar-wallet-info';
walletAndIconContainer.appendChild(sidebarWalletInfo);

// 3. Icona Profilo
const profileIcon = document.createElement('div');
profileIcon.id = 'profileIcon';
profileIcon.className = 'profile-icon';
profileIcon.textContent = '👤';
profileIcon.title = 'Profile';
applyProfileFactionIcon(profileIcon, getCachedProfileFaction(currentProfileId));
walletAndIconContainer.appendChild(profileIcon);

// 4. ID Profilo
const sidebarProfileId = document.createElement('div');
sidebarProfileId.id = 'sidebarProfileId';
sidebarProfileId.className = 'profile-id';
sidebar.appendChild(sidebarProfileId);

// 5. Tooltip della Cache (Contenitore)
const cacheTooltip = document.createElement('div');
cacheTooltip.id = 'cacheTooltip';
cacheTooltip.className = 'cache-tooltip';

    // Titolo del Tooltip (Header)
    const cacheTooltipTitleContainer = document.createElement('div');
    cacheTooltipTitleContainer.className = 'cache-tooltip-title';

    const cacheTooltipIcon = document.createElement('span');
    cacheTooltipIcon.id = 'cacheTooltipIcon';
    cacheTooltipIcon.textContent = '💾';
    
    const cacheTooltipTitleText = document.createElement('span');
    cacheTooltipTitleText.id = 'cacheTooltipTitle';
    cacheTooltipTitleText.textContent = 'Cache Status';

    cacheTooltipTitleContainer.appendChild(cacheTooltipIcon);
    cacheTooltipTitleContainer.appendChild(cacheTooltipTitleText);
    cacheTooltip.appendChild(cacheTooltipTitleContainer);

    // Stato della Cache
    const cacheTooltipStatus = document.createElement('div');
    cacheTooltipStatus.id = 'cacheTooltipStatus';
    cacheTooltipStatus.className = 'cache-tooltip-status';
    cacheTooltipStatus.textContent = 'Loading...';
    cacheTooltip.appendChild(cacheTooltipStatus);

    // Età della Cache
    const cacheTooltipAge = document.createElement('div');
    cacheTooltipAge.id = 'cacheTooltipAge';
    cacheTooltipAge.className = 'cache-tooltip-age';
    cacheTooltip.appendChild(cacheTooltipAge);

    // Bottone Wipe
    const cacheWipeBtn = document.createElement('button');
    cacheWipeBtn.id = 'cacheWipeBtn';
    cacheWipeBtn.className = 'cache-tooltip-btn cache-tooltip-btn-danger';
    cacheWipeBtn.textContent = '🗑️ Wipe & Reload';

    cacheWipeBtn.addEventListener('click', () => {
        cacheTooltip.className = 'cache-tooltip'; // Rimuove la classe 'visible' per nascondere il tooltip
        wipeAndReload(currentProfileId || undefined);
    });

    cacheTooltip.appendChild(cacheWipeBtn);

sidebar.appendChild(cacheTooltip);

// 5. Toggle Switch (Contenitore)
const toggleSwitchContainer = document.createElement('div');
toggleSwitchContainer.id = 'toggleSwitchContainer';
toggleSwitchContainer.className = 'toggle-switch-container';
toggleSwitchContainer.innerHTML = toggleSwitchHTML;
sidebar.appendChild(toggleSwitchContainer);


const playstoreIcon = document.createElement('div');
playstoreIcon.id = 'playstoreIcon';
playstoreIcon.className = 'playstore-icon';
playstoreIcon.title = 'Get the App';
// Aggiungi un evento click per andare alla pagina di download dell'app
playstoreIcon.addEventListener('click', () => {
    // Logica per navigare alla pagina di download, ad esempio:
    window.open('https://play.google.com/store/apps/details?id=com.sae.app'); // Sostituisci con l'URL reale della pagina di download
});
sidebar.appendChild(playstoreIcon);

const playstoreIconImg = document.createElement('img');
playstoreIconImg.src = playstoreIcona; // Assicurati di avere questa icona nella cartella assets
playstoreIconImg.className = 'playstore-icon-img';
playstoreIconImg.alt = 'Get the App';
playstoreIcon.appendChild(playstoreIconImg);

const playstoreIconText = document.createElement('span');
playstoreIconText.textContent = 'Get the App';
playstoreIconText.className = 'playstore-icon-text';
playstoreIcon.appendChild(playstoreIconText);


// 6. Privacy Policy
const privacyPolicySidebar = createPrivacyPolicySidebarElement();
privacyPolicySidebar.id = 'privacyPolicySidebar';

sidebar.appendChild(privacyPolicySidebar);

// 7. Infine, aggiungi la sidebar al body (o a un altro contenitore nel DOM)
document.body.appendChild(sidebar);

return sidebar;
}


// Modulo per la Sidebar: esporta funzione per creare la struttura reale della sidebar
// Copiata da index.html e main.ts

import { createPrivacyPolicySidebarElement } from "./privacyPolicy";
import { toggleSwitchHTML } from "./toggleSwitch";

export function createSidebarElement(): HTMLDivElement {
// 1. Il contenitore principale della Sidebar
const sidebar = document.createElement('div');
sidebar.id = 'sidebar';
sidebar.className = 'sidebar';

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
    cacheTooltip.appendChild(cacheWipeBtn);

sidebar.appendChild(cacheTooltip);

// 5. Toggle Switch (Contenitore)
const toggleSwitchContainer = document.createElement('div');
toggleSwitchContainer.id = 'toggleSwitchContainer';
toggleSwitchContainer.className = 'toggle-switch-container';
toggleSwitchContainer.innerHTML = toggleSwitchHTML;
sidebar.appendChild(toggleSwitchContainer);

// 6. Privacy Policy
const privacyPolicySidebar = createPrivacyPolicySidebarElement();
privacyPolicySidebar.id = 'privacyPolicySidebar';

sidebar.appendChild(privacyPolicySidebar);

// 7. Infine, aggiungi la sidebar al body (o a un altro contenitore nel DOM)
document.body.appendChild(sidebar);

return sidebar;
}


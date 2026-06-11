import '@/ui/styles/backGround.css';
import '@/ui/styles/heroTitle_elements.css';
import '@/pages/pages.css';

import { createBackground } from '@/ui/elements/backGround';
import { createHeroTitle } from '@/ui/elements/heroTitle_elements';

function renderTermsPage(): void {
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer');

  if (!mainContainer) {
    return;
  }

  mainContainer.innerHTML = '';

  const backgroundContainer = document.createElement('div');
  backgroundContainer.id = 'background-container';
  backgroundContainer.appendChild(createBackground());
  mainContainer.appendChild(backgroundContainer);

  const heroContainer = document.createElement('div');
  heroContainer.id = 'hero-container';
  heroContainer.style.cursor = 'pointer';
  heroContainer.appendChild(createHeroTitle());
  heroContainer.addEventListener('click', () => {
    window.location.href = '/';
  });
  mainContainer.appendChild(heroContainer);

  const contentContainer = document.createElement('div');
  contentContainer.id = 'content-container';
  contentContainer.className = 'terms-of-use';
  contentContainer.innerHTML = `
    <div class="content">
      <h1>Terms of Use</h1>
      <p><strong>Last Updated:</strong> June 2026</p>
      <div class="disclaimer">
        <strong>IMPORTANT NOTICE &amp; OFFICIAL DISCLAIMER:</strong><br>
        Star Atlas Explorer is an independent, unofficial, community-driven dashboard and analytics tool. It is <strong>NOT</strong> affiliated with, authorized, endorsed, or sponsored by ATMTA, Inc., the Star Atlas development team, or the Solana Foundation. All official Star Atlas trademarks, names, and assets belong to their respective owners.
      </div>
      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using Star Atlas Explorer (the "Application"), you agree to be bound by these Terms of Use. If you do not agree, please do not use the Application.</p>
      <h2>2. Description of Service &amp; Use of Blockchain Data</h2>
      <p>The Application provides real-time dashboard and analytics data regarding the Star Atlas on-chain game operations on the Solana blockchain. All data displayed is fetched directly from public, open-source Solana blockchain records. We do not guarantee the permanent availability, accuracy, or completeness of such public data.</p>
      <h2>3. No Custody, Wallet Responsibility &amp; Financial Advice</h2>
      <p>The Application is a non-custodial software. We do not hold, store, manage, or have access to your private keys, seed phrases, or crypto assets (tokens/NFTs). You are solely responsible for the security of your own Solana wallet. Nothing contained in this Application constitutes financial, investment, or legal advice.</p>
      <h2>4. Assumption of Risk &amp; Blockchain Irreversibility</h2>
      <p>By using this Application, you acknowledge that blockchain transactions are permanent and irreversible. You accept all inherent risks associated with cryptographic systems, smart contracts, network fees (gas/rent), extreme price volatility, and potential technical exploits or bugs within the underlying Solana network or Star Atlas protocols.</p>
      <h2>5. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Star Atlas Explorer and its developers shall not be liable for any direct, indirect, incidental, or consequential damages, including but not limited to loss of funds, tokens, NFTs, or profits, arising out of your use or inability to use the Application.</p>
      <h2>6. Contact Information</h2>
      <p>For any questions or support regarding these Terms, contact: <a href="mailto:info@staratlasexplorer.it">info@staratlasexplorer.it</a></p>
    </div>
  `;
  mainContainer.appendChild(contentContainer);
}

renderTermsPage();


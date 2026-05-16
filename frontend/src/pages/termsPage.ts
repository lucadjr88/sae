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
      <p>Last updated: 16 May 2026</p>
      <h2>1. Acceptance of Terms</h2>
      <p>By using SaeMobile (the \"App\"), you agree to these Terms of Use. If you do not agree, please do not use the App.</p>
      <h2>2. Use of Blockchain Data</h2>
      <p>The App interacts with the Solana blockchain. All transactions are public and immutable. You are responsible for your wallet and private keys. The App does not store or have access to your private keys.</p>
      <h2>3. No Custody or Financial Advice</h2>
      <p>The App does not provide custody of assets, nor does it offer financial, investment, or legal advice. Use at your own risk.</p>
      <h2>4. User Responsibilities</h2>
      <ul>
        <li>Do not use the App for illegal activities.</li>
        <li>Ensure compliance with your local laws.</li>
        <li>You are solely responsible for your actions and transactions.</li>
      </ul>
      <h2>5. Limitation of Liability</h2>
      <p>The App is provided \"as is\" without warranties of any kind. The developers are not liable for any damages, losses, or issues arising from use of the App, including but not limited to loss of funds, data, or access.</p>
      <h2>6. Third-Party Services</h2>
      <p>The App may link to third-party services or content. The developers are not responsible for third-party content or services.</p>
      <h2>7. Changes to Terms</h2>
      <p>We may update these Terms at any time. Continued use of the App after changes means you accept the new Terms.</p>
      <h2>8. Contact</h2>
      <p>For questions, contact: staratlasexplorer@duckdns.org</p>
    </div>
  `;
  mainContainer.appendChild(contentContainer);
}

renderTermsPage();


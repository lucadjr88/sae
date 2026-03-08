import '../ui/styles/backGround.css';
import '../ui/styles/heroTitle_elements.css';
import './pages.css';

import { createBackground } from '../ui/elements/backGround';
import { createHeroTitle } from '../ui/elements/heroTitle_elements';

function renderPrivacyPolicyPage(): void {
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
  contentContainer.className = 'privacy-policy';
  contentContainer.innerHTML = `
    <div class="content">
      <h1>Privacy Policy</h1>
      <p>Last updated: March 8, 2026</p>

      <h2>1. Overview</h2>
      <p>This project provides blockchain data analysis. To provide its services, the app processes public data directly from the blockchain. We value your privacy and aim to be as transparent as possible about the data handled.</p>

      <h2>2. Data We Process</h2>
      <p>While we do not collect traditional personal information (like your name or email) and don't use cookies or tracking, profiling or advertising, the following data is processed:</p>
      <p>Wallet Public Key: When you connect your wallet, the app reads exclusively your public wallet address.</p>
      <p>Profile ID &amp; Game Data: The backend uses the public key solely to derive a unique profileid releted to your game account. This ID is used to perform on-chain searches focused exclusively on game-related information.</p>
      <p>On-chain Transactions: We analyze and display public transaction history associated with your wallet, specifically filtered for gaming activities.</p>

      <h2>3. Data Storage and Caching</h2>
      <p>To ensure a fast and efficient user experience, we implement the following caching mechanisms:</p>
      <p>Backend Caching: The game-related information retrieved via the profileid is saved in our backend cache for a limited period. This is done for the sole purpose of serving the data faster for subsequent searches involving the same profileid.</p>
      <p>No Permanent Storage: We do not permanently store your wallet address or your personal transaction history on our private servers. No additional information about the user is requested, saved, or processed.</p>

      <h2>4. Third-Party Services</h2>
      <p>The app interacts with public blockchain nodes and APIs to retrieve on-chain data. These services only receive your public wallet address as part of the request, but they do not receive any additional information from us.</p>

      <h2>5. Security</h2>
      <p>Please remember that blockchain transactions are public by nature. We do not have access to your private keys or seed phrases and will never ask for them.</p>

      <h2>6. User Rights</h2>
      <p>Under the GDPR, you have the right to access, rectify, and erase your data. Since we do not store personal data, these rights are limited to the public wallet address and associated profileid. You can request deletion of your profileid and associated cached data by contacting us.</p>

      <h2>6. Contact</h2>
      <p>This project is operated by staratlasexplorer.duckdns.org.</p>
      <p>If you have any questions or to exercise your rights, please contact us.</p>
      <p>Email: lucadjr88@gmail.com</p>
    </div>
  `;
  mainContainer.appendChild(contentContainer);
}

renderPrivacyPolicyPage();
import '../ui/styles/backGround.css';
import '../ui/styles/heroTitle_elements.css';
import './pages.css';

import istruzione1 from '../assets/istruzione1.png';
import istruzione2 from '../assets/istruzione2.png';
import { createBackground } from '../ui/elements/backGround';
import { createHeroTitle } from '../ui/elements/heroTitle_elements';

function renderInstructionsPage(): void {
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
  contentContainer.className = 'instructions';
  contentContainer.innerHTML = `
    <div class="content">
      <h1>How to find your player profileid</h1>
      <p>To find your player profileid, follow these steps:</p>
      <ol>
        <li>Go to the official Star Atlas game page <a href="https://based.staratlas.com/" target="_blank">https://based.staratlas.com/</a>.</li>
        <br>
        <li>Click on a CSS StarBase details of your faction.</li>
        <br>
        <img src="${istruzione1}" alt="StarBase Details" class="instruction-image">
        <br>
        <li>Scroll down to find your player profileid.</li>
        <img src="${istruzione2}" alt="Player ProfileID" class="instruction-image">
        <br>
        <li>In case you don't have a player profileid, but you still want to test the app, use my personal profileid: <strong>4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8</strong></li>
      </ol>

      <h2>6. Contact</h2>
      <p>If you have any questions regarding how your blockchain data is handled, please contact us.</p>
      <p>Email: lucadjr88@gmail.com</p>
    </div>
  `;
  mainContainer.appendChild(contentContainer);
}

renderInstructionsPage();
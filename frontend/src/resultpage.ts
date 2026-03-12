import { createBackground } from '@/ui/elements/backGround';
import { createHeroTitle } from '@/ui/elements/heroTitle_elements';
import { createFootBarElement } from '@/ui/elements/footBar';
import { createSidebarElement } from '@/ui/elements/sideBar';



export function createResultPage(): void {
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer')!;

  mainContainer.innerHTML = '';
  mainContainer.classList.add('main-container-results');

  const colonna1 = document.createElement('div');
  colonna1.id = 'colonna1';
  colonna1.className = 'results-sidebar-column';
  const colonna2 = document.createElement('div');
  colonna2.id = 'colonna2';
  colonna2.className = 'results-content-column';

  mainContainer.appendChild(colonna1);
  mainContainer.appendChild(colonna2);

  const sidebar = createSidebarElement();
  colonna1.appendChild(sidebar);

  const backgroundDiv = document.createElement('div');
  backgroundDiv.id = 'background-container';
  backgroundDiv.appendChild(createBackground());
  colonna2.appendChild(backgroundDiv);

  const heroDiv = document.createElement('div');
  heroDiv.id = 'hero-container';
  heroDiv.appendChild(createHeroTitle());

  const resultDiv = document.createElement('div');
  resultDiv.id = 'result-container';
  resultDiv.className = 'result-container';





  const priceTickerBar = document.createElement('div');
  priceTickerBar.id = 'price-ticker-container';
  priceTickerBar.appendChild(createFootBarElement());

  colonna2.appendChild(heroDiv);
  colonna2.appendChild(resultDiv);
  mainContainer.appendChild(priceTickerBar);
}




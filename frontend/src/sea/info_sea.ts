import './styles/info_sea.css';
    
    // 1. Funzione riutilizzabile per caricare la pagina HTML desiderata
    function loadPage(filename: string) {
      const container = document.getElementById('container') as HTMLElement;
      container.innerHTML = 'Caricamento in corso...';

      fetch(`./text/${filename}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Impossibile caricare il file HTML');
          }
          return response.text();
        })
        .then(htmlString => {
          container.innerHTML = htmlString;
        })
        .catch(error => {
          console.error('Errore:', error);
          container.innerHTML = '<p>Impossibile caricare il contenuto.</p>';
        });
    }

    // 2. Al caricamento della pagina, mostra di default "about_sea.html"
    document.addEventListener('DOMContentLoaded', () => {
      loadPage('about_sea.html');

      // 3. Aggiunge l'ascoltatore di eventi a tutti gli elementi del menu
      const links = document.querySelectorAll('.nav-link');
      links.forEach(link => {
        link.addEventListener('click', (event) => {
          const file = (event.target as HTMLElement) .getAttribute('data-file');
          if (file) {
            loadPage(file);
          }
        });
      });
    });
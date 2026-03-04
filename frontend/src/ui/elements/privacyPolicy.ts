// Modulo per Privacy Policy (elementi reali)
// Esporta funzioni per creare i due elementi privacy policy usati in index.html e sidebar

export function createPrivacyPolicyStartElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'privacyPolicyStart';
    div.innerHTML = `<a class="privacy-policy-link" href="https://sites.google.com/view/policy-staratlasexplorer/home-page" target="_blank" rel="noopener">Privacy Policy</a>`;
    return div;
}

export function createPrivacyPolicySidebarElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'privacyPolicySidebar';
    div.innerHTML = `<a class="privacy-policy-link" href="https://sites.google.com/view/policy-staratlasexplorer/home-page" target="_blank" rel="noopener">Privacy Policy</a>`;
    return div;
}

// Se servono come stringhe HTML (template):
export const privacyPolicyStartHTML = `<div id=\"privacyPolicyStart\"><a class=\"privacy-policy-link\" href=\"https://sites.google.com/view/policy-staratlasexplorer/home-page\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a></div>`;
export const privacyPolicySidebarHTML = `<div id=\"privacyPolicySidebar\"><a class=\"privacy-policy-link\" href=\"https://sites.google.com/view/policy-staratlasexplorer/home-page\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a></div>`;

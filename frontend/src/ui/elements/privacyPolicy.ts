// Costante centralizzata per l'URL della privacy policy

const PRIVACY_POLICY_URL = '/pages/privacy_policy.html';
const TERMS_URL = '/pages/terms.html';


export function createPrivacyPolicyStartElement(): HTMLDivElement {
        const div = document.createElement('div');
        div.id = 'privacyPolicyStart';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.innerHTML = `
                <a class="privacy-policy-link" href="${PRIVACY_POLICY_URL}" rel="noopener">Privacy Policy</a>
                <a class="terms-link" href="${TERMS_URL}" rel="noopener">Terms of Use</a>
        `;
        return div;
}


export function createPrivacyPolicySidebarElement(): HTMLDivElement {
        const div = document.createElement('div');
        div.id = 'privacyPolicySidebar';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.innerHTML = `
                <a class="privacy-policy-link" href="${PRIVACY_POLICY_URL}" rel="noopener">Privacy Policy</a>
                <a class="terms-link" href="${TERMS_URL}" rel="noopener">Terms of Use</a>
        `;
        return div;
}

// Template HTML
export const privacyPolicyStartHTML = `
    <div id=\"privacyPolicyStart\">\n    <div style=\"display: flex; flex-direction: column; gap: 4px; align-items: flex-start;\">\n      <a class=\"privacy-policy-link\" href=\"${PRIVACY_POLICY_URL}\" rel=\"noopener\">Privacy Policy</a>\n      <a class=\"terms-link\" href=\"${TERMS_URL}\" rel=\"noopener\">Terms of Use</a>\n    </div>\n  </div>`;
export const privacyPolicySidebarHTML = `
    <div id=\"privacyPolicySidebar\">\n    <div style=\"display: flex; flex-direction: column; gap: 4px; align-items: flex-start;\">\n      <a class=\"privacy-policy-link\" href=\"${PRIVACY_POLICY_URL}\" rel=\"noopener\">Privacy Policy</a>\n      <a class=\"terms-link\" href=\"${TERMS_URL}\" rel=\"noopener\">Terms of Use</a>\n    </div>\n  </div>`;
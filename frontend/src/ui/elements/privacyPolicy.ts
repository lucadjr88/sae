// Costante centralizzata per l'URL della privacy policy
const PRIVACY_POLICY_URL = '/pages/privacy_policy.html';

export function createPrivacyPolicyStartElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'privacyPolicyStart';
    div.innerHTML = `<a class="privacy-policy-link" href="${PRIVACY_POLICY_URL}" rel="noopener">Privacy Policy</a>`;
    return div;
}

export function createPrivacyPolicySidebarElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'privacyPolicySidebar';
    div.innerHTML = `<a class="privacy-policy-link" href="${PRIVACY_POLICY_URL}" rel="noopener">Privacy Policy</a>`;
    return div;
}

// Template HTML
export const privacyPolicyStartHTML = `<div id=\"privacyPolicyStart\"><a class=\"privacy-policy-link\" href=\"${PRIVACY_POLICY_URL}\" rel=\"noopener\">Privacy Policy</a></div>`;
export const privacyPolicySidebarHTML = `<div id=\"privacyPolicySidebar\"><a class=\"privacy-policy-link\" href=\"${PRIVACY_POLICY_URL}\" rel=\"noopener\">Privacy Policy</a></div>`;
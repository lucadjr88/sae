// Sidebar UI logic
export function setSidebarVisible(visible: boolean): void {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    // Su mobile, la sidebar deve restare nascosta e non influenzare il layout
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      sidebar.style.display = 'none';
    } else {
      sidebar.style.display = visible ? 'flex' : 'none';
    }
  }
  // Nascondi info wallet se non visibile
  const sidebarWalletInfo = document.getElementById('sidebarWalletInfo');
  if (!visible && sidebarWalletInfo) {
    sidebarWalletInfo.innerHTML = '';
    sidebarWalletInfo.style.display = 'none';
  }
  // Mostra/nascondi Privacy Policy centrale
  const privacyPolicyStart = document.getElementById('privacyPolicyStart');
  if (privacyPolicyStart) {
    privacyPolicyStart.style.display = visible ? 'none' : '';
  }
}


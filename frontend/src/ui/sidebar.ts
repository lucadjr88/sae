// Sidebar UI logic
export function setSidebarVisible(visible: boolean): void {
  const sidebar = document.getElementById('sidebar');
  const container = document.querySelector('.container');
  if (sidebar) {
    sidebar.style.display = visible ? 'flex' : 'none';
  }
  if (container) {
    if (visible) {
      container.classList.add('with-sidebar');
    } else {
      container.classList.remove('with-sidebar');
    }
  }
}


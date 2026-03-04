
export function isMobile() {
  // Detection robusta: viewport + user agent
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return (
    /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(ua) ||
    window.innerWidth <= 768
  );
}

export function onMobile(callback: () => void) {
  if (isMobile()) callback();
}

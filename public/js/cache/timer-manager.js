// public/js/cache/timer-manager.js

export function startTimer(onTick) {
  const startTime = Date.now();
  const interval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    onTick(seconds);
  }, 1000);
  return { startTime, interval };
}

export function stopTimer(timerHandle) {
  if (timerHandle?.interval) {
    clearInterval(timerHandle.interval);
  }
}

export function updateTimerInResults(seconds) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;
  const loadingDiv = resultsDiv.querySelector('.loading');
  if (!loadingDiv) return;
  const span = loadingDiv.querySelector('span');
  if (!span) return;
  
  const text = span.textContent;
  const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
  const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
  span.textContent = `(${message} - ${seconds}s)`;
}
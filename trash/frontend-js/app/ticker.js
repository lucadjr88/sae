async function updatePriceTicker(renderPriceTicker) {
  try {
    const cgRes = await fetch("/api/prices");
    let prices = cgRes.ok ? await cgRes.json() : {};
    window.prices = prices;
    renderPriceTicker(prices);
  } catch {
    renderPriceTicker(null);
  }
}
export {
  updatePriceTicker
};

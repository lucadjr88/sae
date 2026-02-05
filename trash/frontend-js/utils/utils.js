function copyToClipboard(text, event) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target.closest("[data-copy]");
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "\u2713 Copied!";
      btn.style.color = "#10b981";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = "";
      }, 1500);
    }
  }).catch((err) => {
    console.error("Failed to copy:", err);
    alert("Failed to copy to clipboard");
  });
  event.stopPropagation();
  event.preventDefault();
}
function inferRecipeName(decoded, burns, claims) {
  try {
    const c = claims && claims.length > 0 ? claims[0] : null;
    const mat = c?.material || c?.item;
    if (mat) return String(mat);
  } catch {
  }
  try {
    if (decoded?.recipeName) return String(decoded.recipeName);
    const action0 = decoded?.actions?.[0];
    if (action0?.recipeName) return String(action0.recipeName);
    if (decoded?.recipe) return String(decoded.recipe);
  } catch {
  }
  return null;
}
function inferMaterialLabel(entry, decoded) {
  const preferred = entry?.material || entry?.recipe || entry?.decodedMaterial || "";
  const norm = preferred.toString().trim().toLowerCase();
  const candidates = /* @__PURE__ */ new Set();
  if (norm) candidates.add(norm);
  try {
    const claims = decoded?.claimedItems || decoded?.actions?.[0]?.claimedItems || [];
    claims.forEach((c) => {
      const m = c?.material || c?.item;
      if (m) candidates.add(String(m).toLowerCase());
    });
  } catch {
  }
  try {
    const burns = decoded?.burnedMaterials || decoded?.actions?.[0]?.burnedMaterials || [];
    burns.forEach((b) => {
      const m = b?.material;
      if (m) candidates.add(String(m).toLowerCase());
    });
  } catch {
  }
  try {
    const recipeName = decoded?.recipeName || decoded?.material || decoded?.recipe;
    if (recipeName) candidates.add(String(recipeName).toLowerCase());
  } catch {
  }
  const map = [
    ["ammo", "Ammo"],
    ["fuel", "Fuel"],
    ["food", "Food"],
    ["ore", "Ore"],
    ["tool", "Tool"],
    ["component", "Component"],
    ["metal", "Metal"],
    ["fiber", "Fiber"],
    ["chemical", "Chemical"],
    ["circuit", "Circuit"]
  ];
  for (const c of Array.from(candidates)) {
    for (const [k, v] of map) {
      if (c.includes(k)) return v;
    }
  }
  if (preferred) return preferred.toString().charAt(0).toUpperCase() + preferred.toString().slice(1);
  return "";
}
function normalizeOpName(opName) {
  const lower = (opName || "").toLowerCase();
  if (!lower) return opName;
  if (lower.includes("createstarbaseupgrade") || lower.includes("submitstarbaseupgrade")) return "SB Upgrade";
  if (lower.includes("closetokenaccount") || lower.includes("opentokenaccount")) return "TokenAccount";
  if (lower.includes("loading_bay") || lower.includes("loadingbay") || lower.includes("withdrawcargo") || lower.includes("depositcargo")) return "Dock/Undock/Load/Unload";
  if (lower.includes("fleetstatehandler_mining") || lower.includes("startminingasteroid") || lower.includes("stopminingasteroid")) return "Mining";
  if (lower.includes("fleetstatehandler_subwarp") || lower.includes("startsubwarp") || lower.includes("stopsubwarp")) return "Subwarp";
  if (lower.includes("scanforsurveydataunits")) return "Scan SDU";
  if (lower.includes("crafting")) return "Crafting";
  if (lower.includes("warp")) return "Warp";
  const mapping = {
    //'startminingasteroid': 'Mining',
  };
  return mapping[lower] || opName;
}
function isDecodedInstruction(obj) {
  return obj && typeof obj === "object" && ("recipeName" in obj || "actions" in obj);
}
function isValidMaterialEntry(obj) {
  return obj && typeof obj === "object" && ("material" in obj || "recipe" in obj || "decodedMaterial" in obj);
}
export {
  copyToClipboard,
  inferMaterialLabel,
  inferRecipeName,
  normalizeOpName
};

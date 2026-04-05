// profileFaction account is resolved server-side; this module only handles UI/icon mapping and local cache reuse.
import mudWhiteIcon from '@/assets/icons/mud_w.png';
import oniWhiteIcon from '@/assets/icons/oni_w.png';
import usturWhiteIcon from '@/assets/icons/ustur_w.png';

export type ProfileFactionName = 'mud' | 'oni' | 'ustur';

const PROFILE_FACTION_CACHE_KEY = 'profileFactionByProfileId';

export function normalizeProfileFaction(faction: unknown): ProfileFactionName | null {
  if (typeof faction === 'number') {
    if (faction === 1) return 'mud';
    if (faction === 2) return 'oni';
    if (faction === 3) return 'ustur';
    return null;
  }
  if (typeof faction !== 'string') return null;
  const normalized = faction.trim().toLowerCase();
  if (normalized === 'mud' || normalized === 'oni' || normalized === 'ustur') return normalized as ProfileFactionName;
  if (normalized === '1') return 'mud';
  if (normalized === '2') return 'oni';
  if (normalized === '3') return 'ustur';
  return null;
}

function readProfileFactionCache(): Record<string, ProfileFactionName> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROFILE_FACTION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedProfileFaction(profileId?: string | null): ProfileFactionName | null {
  if (!profileId) return null;
  const cache = readProfileFactionCache();
  return normalizeProfileFaction(cache[profileId]);
}

export function saveProfileFactionToCache(profileId: string | null | undefined, faction: unknown): ProfileFactionName | null {
  if (!profileId) return null;
  const normalized = normalizeProfileFaction(faction);
  if (!normalized || typeof localStorage === 'undefined') return normalized;
  try {
    const cache = readProfileFactionCache();
    cache[profileId] = normalized;
    localStorage.setItem(PROFILE_FACTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function getProfileFactionLabel(faction: unknown): string | null {
  const normalized = normalizeProfileFaction(faction);
  return normalized ? normalized.toUpperCase() : null;
}

export function getProfileFactionIconSrc(faction: unknown): string | null {
  const normalized = normalizeProfileFaction(faction);
  if (normalized === 'mud') return mudWhiteIcon;
  if (normalized === 'oni') return oniWhiteIcon;
  if (normalized === 'ustur') return usturWhiteIcon;
  return null;
}

export function renderProfileFactionIconMarkup(faction: unknown, className = 'profile-faction-icon'): string {
  const src = getProfileFactionIconSrc(faction);
  const label = getProfileFactionLabel(faction);
  return src && label
    ? `<img src="${src}" alt="${label}" class="${className}" draggable="false">`
    : '👤';
}

export function applyProfileFactionIcon(element: HTMLElement | null, faction: unknown): void {
  if (!element) return;
  const src = getProfileFactionIconSrc(faction);
  const label = getProfileFactionLabel(faction);
  if (!src || !label) {
    element.textContent = '👤';
    element.title = 'Profile';
    return;
  }
  const icon = document.createElement('img');
  icon.src = src;
  icon.alt = label;
  icon.className = 'profile-faction-icon';
  icon.draggable = false;
  element.replaceChildren(icon);
  element.title = `${label} Profile`;
}

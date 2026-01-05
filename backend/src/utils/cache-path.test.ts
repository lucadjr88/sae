import { normalizeProfileId, cachePath } from './cache-path.js';

describe('normalizeProfileId', () => {
  it('should normalize valid profileIds', () => {
    expect(normalizeProfileId('test-profile')).toBe('test-profile');
    expect(normalizeProfileId('Test_Profile_123')).toBe('Test_Profile_123');
    expect(normalizeProfileId('profile-with-dashes')).toBe('profile-with-dashes');
    expect(normalizeProfileId('profile_with_underscores')).toBe('profile_with_underscores');
  });

  it('should hash invalid profileIds', () => {
    const hashed = normalizeProfileId('invalid profile with spaces');
    expect(hashed).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash
    expect(hashed).not.toBe('invalid profile with spaces');
  });

  it('should hash profileIds with special characters', () => {
    const hashed = normalizeProfileId('profile@domain.com');
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle empty string', () => {
    const hashed = normalizeProfileId('');
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should strip leading/trailing slashes', () => {
    expect(normalizeProfileId('/profile/')).toBe('profile');
    expect(normalizeProfileId('///profile///')).toBe('profile');
  });
});

describe('cachePath', () => {
  it('should return correct paths for valid profileId', () => {
    const paths = cachePath('test-profile');
    expect(paths.root).toMatch(/\/cache\/test-profile$/);
    expect(paths.file('data.json')).toMatch(/\/cache\/test-profile\/data\.json$/);
  });

  it('should return correct paths for hashed profileId', () => {
    const paths = cachePath('invalid profile');
    expect(paths.root).toMatch(/\/cache\/[a-f0-9]{64}$/);
    expect(paths.file('data.json')).toMatch(/\/cache\/[a-f0-9]{64}\/data\.json$/);
  });

  it('should handle different file names', () => {
    const paths = cachePath('profile');
    expect(paths.file('fleets.json')).toMatch(/\/cache\/profile\/fleets\.json$/);
    expect(paths.file('nested/dir/file.json')).toMatch(/\/cache\/profile\/nested\/dir\/file\.json$/);
  });
});
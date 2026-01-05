import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { getCache, setCache, getCacheDataOnly, getCacheWithTimestamp } from './persist-cache.js';
import { cachePath } from './cache-path.js';

// Mock fs operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    access: jest.fn(),
    rename: jest.fn(),
    readdir: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('persist-cache', () => {
  const testProfileId = 'test-profile';
  const testNamespace = 'test-namespace';
  const testKey = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // A valid Solana pubkey-like key
  const testData = { key: 'value' };
  const cachePaths = cachePath(testProfileId);

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default behavior
    mockFs.readFile.mockResolvedValue(JSON.stringify(testData));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
  });

  describe('getCache', () => {
    it('should read and parse cache file', async () => {
      const result = await getCache(testProfileId, testNamespace, testKey);
      expect(result).toEqual(testData);
      expect(mockFs.readFile).toHaveBeenCalledWith(cachePaths.file(`${testNamespace}/${testKey}.json`), 'utf8');
    });

    it('should return null if file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      const result = await getCache(testProfileId, testNamespace, testKey);
      expect(result).toBeNull();
    });

    it('should handle legacy migration for DEFAULT_PROFILE_ID', async () => {
      const defaultProfileId = 'default';
      const legacyPath = path.join(process.cwd(), '..', 'cache', `${testNamespace}/${testKey}.json`);
      const newPath = cachePath(defaultProfileId).file(`${testNamespace}/${testKey}.json`);

      mockFs.readFile
        .mockRejectedValueOnce(new Error('ENOENT')) // New path doesn't exist
        .mockResolvedValueOnce(JSON.stringify(testData)); // Legacy path exists

      mockFs.access.mockResolvedValueOnce(undefined); // Legacy file exists
      mockFs.rename.mockResolvedValueOnce(undefined); // Migration succeeds

      const result = await getCache(defaultProfileId, testNamespace, testKey);
      expect(result).toEqual(testData);
      expect(mockFs.rename).toHaveBeenCalledWith(legacyPath, newPath);
    });
  });

  describe('setCache', () => {
    it('should write data to cache file atomically', async () => {
      await setCache(testProfileId, testNamespace, testKey, testData);
      expect(mockFs.mkdir).toHaveBeenCalledWith(cachePaths.file(testNamespace), { recursive: true });
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toMatch(/\.tmp$/);
      expect(writeCall[1]).toContain('"savedAt":');
      expect(writeCall[1]).toContain('"key": "value"');
      expect(mockFs.rename).toHaveBeenCalled();
    });

    it('should handle concurrent writes with mutex', async () => {
      const promises = [
        setCache(testProfileId, testNamespace, testKey, { data: 1 }),
        setCache(testProfileId, testNamespace, testKey, { data: 2 }),
      ];

      await Promise.all(promises);
      // Both should succeed, second should wait for first
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCacheDataOnly', () => {
    it('should return only data without metadata', async () => {
      const dataWithMeta = { data: testData, savedAt: Date.now() };
      mockFs.readFile.mockResolvedValue(JSON.stringify(dataWithMeta));

      const result = await getCacheDataOnly(testProfileId, testNamespace, testKey);
      expect(result).toEqual(testData);
    });
  });

  describe('getCacheWithTimestamp', () => {
    it('should return data with timestamp', async () => {
      const timestamp = Date.now();
      const dataWithMeta = { data: testData, savedAt: timestamp };
      mockFs.readFile.mockResolvedValue(JSON.stringify(dataWithMeta));

      const result = await getCacheWithTimestamp(testProfileId, testNamespace, testKey);
      expect(result).toEqual({ data: testData, savedAt: timestamp });
    });
  });

  describe('Profile isolation', () => {
    it('should create separate directories for different profiles', () => {
      const profile1Paths = cachePath('profile1');
      const profile2Paths = cachePath('profile2');

      expect(profile1Paths.root).not.toBe(profile2Paths.root);
      expect(profile1Paths.file('test.json')).not.toBe(profile2Paths.file('test.json'));
    });

    it('should handle hashed profile IDs', () => {
      const invalidProfile = 'invalid profile';
      const hashedPaths = cachePath(invalidProfile);
      const validPaths = cachePath('valid-profile');

      expect(hashedPaths.root).not.toBe(validPaths.root);
      expect(hashedPaths.root).toMatch(/\/cache\/[a-f0-9]{64}$/);
    });
  });
});
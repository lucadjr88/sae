import { jest } from '@jest/globals';
import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { cacheWipeHandler } from './cache-wipe.js';
import { cachePath } from '../utils/cache-path.js';

// Mock fs
jest.mock('fs', () => ({
  promises: {
    rm: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('cacheWipeHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();
    mockRes = {
      json: jsonMock,
      status: statusMock,
    } as Partial<Response>;
    mockFs.rm.mockResolvedValue(undefined);
  });

  it('should wipe cache for valid profileId', async () => {
    mockReq = { body: { profileId: 'test-profile' } };

    await cacheWipeHandler(mockReq as Request, mockRes as Response);

    const expectedRoot = cachePath('test-profile').root;
    expect(mockFs.rm).toHaveBeenCalledWith(expectedRoot, { recursive: true, force: true });
    expect(mockRes.json).toHaveBeenCalledWith({ success: true, message: 'Cache wiped successfully' });
  });

  it('should return 400 if profileId is missing', async () => {
    mockReq = { body: {} };

    await cacheWipeHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'profileId required' });
    expect(mockFs.rm).not.toHaveBeenCalled();
  });

  it('should handle fs errors', async () => {
    mockReq = { body: { profileId: 'test-profile' } };
    const error = new Error('FS error');
    mockFs.rm.mockRejectedValue(error);

    await cacheWipeHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'FS error' });
  });

  it('should isolate cache wipe to specific profile', async () => {
    // Test that different profiles have different roots
    mockReq = { body: { profileId: 'profile1' } };
    await cacheWipeHandler(mockReq as Request, mockRes as Response);

    const profile1Root = cachePath('profile1').root;

    mockReq = { body: { profileId: 'profile2' } };
    await cacheWipeHandler(mockReq as Request, mockRes as Response);

    const profile2Root = cachePath('profile2').root;

    expect(profile1Root).not.toBe(profile2Root);
    expect(mockFs.rm).toHaveBeenCalledTimes(2);
    expect(mockFs.rm).toHaveBeenNthCalledWith(1, profile1Root, { recursive: true, force: true });
    expect(mockFs.rm).toHaveBeenNthCalledWith(2, profile2Root, { recursive: true, force: true });
  });
});
import { describe, it, expect } from '@jest/globals';
import { initializeFleetBuckets, ensureFleetBucket } from '../lib/initialize-fleet-buckets.js';

describe('initializeFleetBuckets', () => {
  it('should initialize all direct fleet accounts even with enableSubAccountMapping=false', () => {
    const fleetAccounts = ['fleet1', 'fleet2', 'fleet3'];
    const result = initializeFleetBuckets({
      fleetAccounts,
      fleetNames: { fleet1: 'Name1' },
      fleetRentalStatus: { fleet1: true },
      accountToFleetMap: null,
    });

    // All fleets should be initialized
    expect(Object.keys(result).sort()).toEqual(['fleet1', 'fleet2', 'fleet3']);
    
    // Check fleet1 metadata
    expect(result.fleet1.fleetName).toBe('Name1');
    expect(result.fleet1.isRented).toBe(true);
    expect(result.fleet1.totalFee).toBe(0);
    expect(result.fleet1.totalOperations).toBe(0);
    expect(result.fleet1.operations).toEqual({});
    
    // Check fleet2 defaults (no custom metadata)
    expect(result.fleet2.fleetName).toBe('fleet2');
    expect(result.fleet2.isRented).toBe(false);
    
    // Check fleet3 defaults
    expect(result.fleet3.fleetName).toBe('fleet3');
    expect(result.fleet3.isRented).toBe(false);
  });

  it('should pre-initialize from accountToFleetMap when provided', () => {
    const fleetAccounts = ['mainFleet'];
    const accountToFleetMap = new Map<string, string>([
      ['subAccount1', 'mainFleet'],
      ['subAccount2', 'mainFleet'],
    ]);
    
    const result = initializeFleetBuckets({
      fleetAccounts,
      fleetNames: { mainFleet: 'Main Fleet' },
      fleetRentalStatus: {},
      accountToFleetMap,
    });

    // Should have mainFleet initialized (from both phases)
    expect(Object.keys(result)).toEqual(['mainFleet']);
    expect(result.mainFleet.fleetName).toBe('Main Fleet');
  });

  it('should handle empty fleetAccounts gracefully', () => {
    const result = initializeFleetBuckets({
      fleetAccounts: [],
      fleetNames: {},
      fleetRentalStatus: {},
      accountToFleetMap: null,
    });

    expect(Object.keys(result).length).toBe(0);
  });

  it('should not override pre-initialized buckets', () => {
    const existing: Record<string, any> = { 
      fleet1: { 
        totalFee: 100, 
        totalOperations: 5,
        custom: true,
        operations: { Mining: { count: 5 } },
        feePercentage: 0,
        isRented: false,
        fleetName: 'Fleet 1'
      } 
    };
    
    const result = initializeFleetBuckets({
      fleetAccounts: ['fleet1', 'fleet2'],
      fleetNames: { fleet1: 'New Name' },
      fleetRentalStatus: { fleet1: true },
      accountToFleetMap: null,
      existingBuckets: existing,
    });

    // fleet1 should preserve existing data
    expect((result.fleet1 as any).custom).toBe(true);
    expect(result.fleet1.totalFee).toBe(100);
    expect(result.fleet1.totalOperations).toBe(5);
    expect(result.fleet1.operations.Mining).toBeDefined();
    
    // fleet2 should be newly initialized
    expect(result.fleet2.totalFee).toBe(0);
    expect(result.fleet2.fleetName).toBe('fleet2');
  });

  it('should handle large fleet lists efficiently', () => {
    const fleetAccounts = Array.from({ length: 100 }, (_, i) => `fleet${i}`);
    const start = Date.now();
    
    const result = initializeFleetBuckets({
      fleetAccounts,
      fleetNames: {},
      fleetRentalStatus: {},
      accountToFleetMap: null,
    });
    
    const duration = Date.now() - start;
    
    expect(Object.keys(result).length).toBe(100);
    expect(duration).toBeLessThan(100);
  });
});

describe('ensureFleetBucket', () => {
  it('should create entry if not exists', () => {
    const feesByFleet: Record<string, any> = {};
    
    ensureFleetBucket(feesByFleet, 'newFleet', { newFleet: 'MyFleet' }, { newFleet: true });

    expect(feesByFleet.newFleet).toBeDefined();
    expect(feesByFleet.newFleet.fleetName).toBe('MyFleet');
    expect(feesByFleet.newFleet.isRented).toBe(true);
    expect(feesByFleet.newFleet.totalFee).toBe(0);
  });

  it('should not overwrite existing entry', () => {
    const existing = { 
      totalFee: 500, 
      custom: 'data',
      operations: { Test: { count: 1 } }
    };
    const feesByFleet: Record<string, any> = { newFleet: existing };
    
    ensureFleetBucket(feesByFleet, 'newFleet', { newFleet: 'NewName' }, {});

    expect(feesByFleet.newFleet.totalFee).toBe(500);
    expect(feesByFleet.newFleet.custom).toBe('data');
    expect(feesByFleet.newFleet.operations.Test).toBeDefined();
  });

  it('should handle null/undefined fleet keys gracefully', () => {
    const feesByFleet: Record<string, any> = {};
    
    ensureFleetBucket(feesByFleet, null as any, {}, {});
    ensureFleetBucket(feesByFleet, undefined as any, {}, {});
    ensureFleetBucket(feesByFleet, '', {}, {});

    expect(Object.keys(feesByFleet).length).toBe(0);
  });

  it('should use defaults when metadata not provided', () => {
    const feesByFleet: Record<string, any> = {};
    
    ensureFleetBucket(feesByFleet, 'testFleet');

    expect(feesByFleet.testFleet.fleetName).toBe('testFleet');
    expect(feesByFleet.testFleet.isRented).toBe(false);
  });

  it('should be idempotent (can call multiple times safely)', () => {
    const feesByFleet: Record<string, any> = {};
    
    ensureFleetBucket(feesByFleet, 'fleet1', { fleet1: 'Name1' }, {});
    ensureFleetBucket(feesByFleet, 'fleet1', { fleet1: 'Name2' }, {});
    ensureFleetBucket(feesByFleet, 'fleet1', { fleet1: 'Name3' }, {});
    
    expect(feesByFleet.fleet1.fleetName).toBe('Name1');
    expect(Object.keys(feesByFleet).length).toBe(1);
  });
});

describe('Integration: initializeFleetBuckets + ensureFleetBucket', () => {
  it('should handle mixed initialization and on-demand creation', () => {
    const feesByFleet = initializeFleetBuckets({
      fleetAccounts: ['fleet1', 'fleet2'],
      fleetNames: { fleet1: 'Fleet 1' },
      fleetRentalStatus: {},
      accountToFleetMap: null,
    });
    
    expect(Object.keys(feesByFleet).length).toBe(2);
    
    ensureFleetBucket(feesByFleet, 'fleet3', { fleet3: 'Fleet 3' }, {});
    
    expect(Object.keys(feesByFleet).length).toBe(3);
    expect(feesByFleet.fleet3.fleetName).toBe('Fleet 3');
    
    ensureFleetBucket(feesByFleet, 'fleet1', { fleet1: 'New Name' }, {});
    
    expect(feesByFleet.fleet1.fleetName).toBe('Fleet 1');
  });
});

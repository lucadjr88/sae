import {
  extractStateTypeFromLog,
  extractStateDetailsFromLog,
  extractStateTypeFromLogs,
  extractStateDetailsFromLogs,
  enrichFleetStateHandler,
  FleetStateType,
} from '../fleetstatehandler';

describe('FleetStateHandler Enrichment', () => {
  describe('extractStateTypeFromLog', () => {
    it('should extract MineAsteroid state', () => {
      const log = 'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3sm..., resource: qBn..., start: 1770038872 })';
      const stateType = extractStateTypeFromLog(log);
      expect(stateType).toBe(FleetStateType.MineAsteroid);
    });

    it('should extract MoveSubwarp state', () => {
      const log = 'Program log: Current state: MoveSubwarp(MoveSubwarp { from_sector: [-4, -9], to_sector: [-2, -9] })';
      const stateType = extractStateTypeFromLog(log);
      expect(stateType).toBe(FleetStateType.MoveSubwarp);
    });

    it('should extract Idle state', () => {
      const log = 'Program log: Current state: Idle(Idle { sector: [-2, -9] })';
      const stateType = extractStateTypeFromLog(log);
      expect(stateType).toBe(FleetStateType.Idle);
    });

    it('should return Unknown for unrecognized state', () => {
      const log = 'Program log: Current state: SomeOtherState(...)';
      const stateType = extractStateTypeFromLog(log);
      expect(stateType).toBe(FleetStateType.Unknown);
    });

    it('should return Unknown for non-matching log', () => {
      const log = 'Program log: Some other message';
      const stateType = extractStateTypeFromLog(log);
      expect(stateType).toBe(FleetStateType.Unknown);
    });
  });

  describe('extractStateDetailsFromLog', () => {
    it('should extract MineAsteroid details', () => {
      const log = 'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3smQvmWWiPtN5ycQBjS6kRbL74qvXY4AXN2WvjczZTUu, resource: qBnf8FXUiBsaoyB5R6TW4N3eTRSjEcM2NZNyuGhPCTD, start: 1770038872, end: 0, amount_mined: 42, last_update: 1770038872 })';
      const details = extractStateDetailsFromLog(log);
      
      expect(details.type).toBe('MineAsteroid');
      expect(details.asteroid).toBe('3smQvmWWiPtN5ycQBjS6kRbL74qvXY4AXN2WvjczZTUu');
      expect(details.resource).toBe('qBnf8FXUiBsaoyB5R6TW4N3eTRSjEcM2NZNyuGhPCTD');
      expect(details.amount_mined).toBe(42);
    });

    it('should extract MoveSubwarp details', () => {
      const log = 'Program log: Current state: MoveSubwarp(MoveSubwarp { from_sector: [-4, -9], to_sector: [-2, -9], current_sector: [-4, -9], departure_time: 1770062165, arrival_time: 1770062573, fuel_expenditure: 974, last_update: 1770062165 })';
      const details = extractStateDetailsFromLog(log);
      
      expect(details.type).toBe('MoveSubwarp');
      expect(details.from_sector).toBe('-4, -9');
      expect(details.to_sector).toBe('-2, -9');
      expect(details.fuel_expenditure).toBe(974);
    });

    it('should extract Idle details', () => {
      const log = 'Program log: Current state: Idle(Idle { sector: [-2, -9] })';
      const details = extractStateDetailsFromLog(log);
      
      expect(details.type).toBe('Idle');
      expect(details.sector).toBe('-2, -9');
    });

    it('should return empty object for non-matching log', () => {
      const log = 'Program log: Some other message';
      const details = extractStateDetailsFromLog(log);
      
      expect(details).toEqual({});
    });
  });

  describe('extractStateTypeFromLogs', () => {
    it('should find state type in array of logs', () => {
      const logs = [
        'Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE invoke [1]',
        'Program log: Instruction: FleetStateHandler',
        'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3sm..., resource: qBn..., start: 1770038872 })',
        'Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE consumed 123456 of 200000 compute units',
        'Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE success',
      ];
      
      const stateType = extractStateTypeFromLogs(logs);
      expect(stateType).toBe(FleetStateType.MineAsteroid);
    });

    it('should return Unknown when no state found', () => {
      const logs = [
        'Program log: Instruction: SomeOther',
        'Program log: Some message',
      ];
      
      const stateType = extractStateTypeFromLogs(logs);
      expect(stateType).toBe(FleetStateType.Unknown);
    });

    it('should return Unknown for empty array', () => {
      const stateType = extractStateTypeFromLogs([]);
      expect(stateType).toBe(FleetStateType.Unknown);
    });
  });

  describe('extractStateDetailsFromLogs', () => {
    it('should find and extract details from array of logs', () => {
      const logs = [
        'Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE invoke [1]',
        'Program log: Instruction: FleetStateHandler',
        'Program log: Current state: MoveSubwarp(MoveSubwarp { from_sector: [6, -17], to_sector: [6, -16], fuel_expenditure: 228 })',
        'Program SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE success',
      ];
      
      const details = extractStateDetailsFromLogs(logs);
      expect(details.type).toBe('MoveSubwarp');
      expect(details.from_sector).toBe('6, -17');
      expect(details.to_sector).toBe('6, -16');
      expect(details.fuel_expenditure).toBe(228);
    });

    it('should return empty object when no details found', () => {
      const logs = ['Program log: Some message'];
      const details = extractStateDetailsFromLogs(logs);
      expect(details).toEqual({});
    });
  });

  describe('enrichFleetStateHandler', () => {
    it('should enrich operation name with MineAsteroid', () => {
      const logs = [
        'Program log: Instruction: FleetStateHandler',
        'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3sm..., resource: qBn..., start: 1770038872, amount_mined: 0 })',
      ];
      
      const enriched = enrichFleetStateHandler('FleetStateHandler', logs, 'sig123', 1770038872);
      
      expect(enriched.originalName).toBe('FleetStateHandler');
      expect(enriched.enrichedName).toBe('FleetStateHandler_MineAsteroid');
      expect(enriched.stateType).toBe(FleetStateType.MineAsteroid);
      expect(enriched.stateData).toBeDefined();
      expect(enriched.stateData?.type).toBe('MineAsteroid');
      expect(enriched.txSignature).toBe('sig123');
      expect(enriched.blockTime).toBe(1770038872);
      expect(enriched.timestamp).toBe(1770038872000);
    });

    it('should enrich operation name with MoveSubwarp', () => {
      const logs = [
        'Program log: Instruction: FleetStateHandler',
        'Program log: Current state: MoveSubwarp(MoveSubwarp { from_sector: [-4, -9], to_sector: [-2, -9], fuel_expenditure: 974 })',
      ];
      
      const enriched = enrichFleetStateHandler('FleetStateHandler', logs);
      
      expect(enriched.enrichedName).toBe('FleetStateHandler_MoveSubwarp');
      expect(enriched.stateType).toBe(FleetStateType.MoveSubwarp);
      expect(enriched.stateData?.type).toBe('MoveSubwarp');
      expect(enriched.stateData?.fuel_expenditure).toBe(974);
    });

    it('should enrich operation name with Idle', () => {
      const logs = [
        'Program log: Instruction: FleetStateHandler',
        'Program log: Current state: Idle(Idle { sector: [-2, -9] })',
      ];
      
      const enriched = enrichFleetStateHandler('FleetStateHandler', logs);
      
      expect(enriched.enrichedName).toBe('FleetStateHandler_Idle');
      expect(enriched.stateType).toBe(FleetStateType.Idle);
      expect(enriched.stateData?.type).toBe('Idle');
    });

    it('should not add suffix when state is Unknown', () => {
      const logs = [
        'Program log: Instruction: SomeOther',
      ];
      
      const enriched = enrichFleetStateHandler('FleetStateHandler', logs);
      
      expect(enriched.enrichedName).toBe('FleetStateHandler');
      expect(enriched.stateType).toBe(FleetStateType.Unknown);
      expect(enriched.stateData).toBeUndefined();
    });

    it('should handle empty logs array', () => {
      const enriched = enrichFleetStateHandler('FleetStateHandler', []);
      
      expect(enriched.enrichedName).toBe('FleetStateHandler');
      expect(enriched.stateType).toBe(FleetStateType.Unknown);
    });

    it('should handle missing optional parameters', () => {
      const logs = [
        'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3sm... })',
      ];
      
      const enriched = enrichFleetStateHandler('FleetStateHandler', logs);
      
      expect(enriched.txSignature).toBeUndefined();
      expect(enriched.blockTime).toBeUndefined();
      expect(enriched.timestamp).toBeUndefined();
    });
  });
});

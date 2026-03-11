import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';

describe('ConsensusEngine', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  describe('agent registration', () => {
    it('should register agents', () => {
      expect(engine.getAgents()).toHaveLength(3);
    });

    it('should register additional agents', () => {
      engine.registerAgent(new PropertyAgent());
      expect(engine.getAgents()).toHaveLength(4);
    });
  });

  describe('asset evaluation', () => {
    it('should evaluate real estate asset', async () => {
      const asset: AssetData = {
        id: 'test-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const result = await engine.evaluateAsset(asset);

      expect(result.assetId).toBe('test-prop');
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.avgConfidence).toBeGreaterThan(0);
      expect(result.valuations.length).toBeGreaterThan(0);
    });

    it('should evaluate commodity asset', async () => {
      const asset: AssetData = {
        id: 'test-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Test Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const result = await engine.evaluateAsset(asset);

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should evaluate treasury asset', async () => {
      const asset: AssetData = {
        id: 'test-trs',
        assetClass: AssetClass.TREASURY,
        name: 'Test Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await engine.evaluateAsset(asset);

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should throw for unsupported asset class', async () => {
      const asset: AssetData = {
        id: 'test-equity',
        assetClass: AssetClass.EQUITY,
        name: 'Test Equity',
        description: '',
        metadata: {},
      };

      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
    });
  });

  describe('consensus computation', () => {
    it('should return single valuation as consensus', () => {
      const valuations: ValuationResult[] = [{
        assetId: 'test',
        value: 100000,
        confidence: 0.9,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent-1',
      }];

      const result = engine.computeConsensus('test', valuations);

      expect(result.consensusValue).toBe(100000);
      expect(result.avgConfidence).toBe(0.9);
    });

    it('should compute confidence-weighted average', () => {
      const valuations: ValuationResult[] = [
        {
          assetId: 'test',
          value: 100000,
          confidence: 0.9,
          methodology: 'test',
          dataPoints: [],
          timestamp: new Date(),
          agentId: 'agent-1',
        },
        {
          assetId: 'test',
          value: 120000,
          confidence: 0.6,
          methodology: 'test',
          dataPoints: [],
          timestamp: new Date(),
          agentId: 'agent-2',
        },
      ];

      const result = engine.computeConsensus('test', valuations);

      // Weighted: (100000*0.9 + 120000*0.6) / (0.9+0.6) = 162000/1.5 = 108000
      expect(result.consensusValue).toBe(108000);
      expect(result.valuations).toHaveLength(2);
    });

    it('should boost confidence when multiple agents agree', () => {
      const valuations: ValuationResult[] = [
        { assetId: 'test', value: 100000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a1' },
        { assetId: 'test', value: 102000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a2' },
      ];

      const result = engine.computeConsensus('test', valuations);

      // Average confidence 0.8 + 0.05 agreement bonus = 0.85
      expect(result.avgConfidence).toBe(0.85);
    });

    it('should filter outliers', () => {
      const outlierEngine = new ConsensusEngine(0.2); // 20% threshold

      const valuations: ValuationResult[] = [
        { assetId: 'test', value: 100000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a1' },
        { assetId: 'test', value: 105000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a2' },
        { assetId: 'test', value: 200000, confidence: 0.9, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a3' }, // Outlier
      ];

      const result = outlierEngine.computeConsensus('test', valuations);

      // Outlier (200000) should be filtered — median is 105000, 200000 deviates 90%+
      expect(result.valuations).toHaveLength(2);
      expect(result.consensusValue).toBeLessThan(120000);
    });

    it('should not filter when only 2 valuations', () => {
      const outlierEngine = new ConsensusEngine(0.1);

      const valuations: ValuationResult[] = [
        { assetId: 'test', value: 100000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a1' },
        { assetId: 'test', value: 200000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a2' },
      ];

      const result = outlierEngine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(2);
    });

    it('should throw on empty valuations', () => {
      expect(() => engine.computeConsensus('test', [])).toThrow('No valuations');
    });

    it('should cap confidence at 1', () => {
      const valuations: ValuationResult[] = [
        { assetId: 'test', value: 100000, confidence: 0.99, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a1' },
        { assetId: 'test', value: 100000, confidence: 0.99, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a2' },
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should include methodology description', () => {
      const valuations: ValuationResult[] = [
        { assetId: 'test', value: 100000, confidence: 0.8, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a1' },
        { assetId: 'test', value: 110000, confidence: 0.7, methodology: '', dataPoints: [], timestamp: new Date(), agentId: 'a2' },
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('Confidence-weighted consensus');
      expect(result.methodology).toContain('2/2 agents');
    });
  });
});

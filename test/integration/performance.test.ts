import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';

describe('Performance & Stress Tests', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  describe('bulk property valuations', () => {
    const locations = [
      'manhattan', 'brooklyn', 'san_francisco', 'los_angeles',
      'miami', 'chicago', 'austin', 'seattle', 'hong_kong',
      'singapore', 'london',
    ];

    it('should valuate 44 properties in parallel across all locations', async () => {
      const promises = locations.flatMap((location, i) =>
        Array.from({ length: 4 }, (_, j) =>
          engine.evaluateAsset({
            id: `perf-prop-${i}-${j}`,
            assetClass: AssetClass.REAL_ESTATE,
            name: `Property ${i}-${j}`,
            description: '',
            location,
            metadata: { squareFeet: 1000 + j * 500, condition: 'good' },
          })
        )
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(44);
      results.forEach(r => {
        expect(r.consensusValue).toBeGreaterThan(0);
      });
    });

    it('should valuate properties with all condition types', async () => {
      const conditions = ['excellent', 'good', 'fair', 'poor'];
      const promises = conditions.map(condition =>
        engine.evaluateAsset({
          id: `perf-cond-${condition}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `${condition} Property`,
          description: '',
          location: 'miami',
          metadata: { squareFeet: 2000, condition },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(4);
      // Excellent should have highest value
      expect(results[0].consensusValue).toBeGreaterThan(results[3].consensusValue);
    });
  });

  describe('bulk commodity valuations', () => {
    it('should valuate all 12 commodities', async () => {
      const commodities = [
        'gold', 'silver', 'platinum', 'crude_oil', 'natural_gas',
        'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'lumber', 'cotton',
      ];

      const promises = commodities.map(commodity =>
        engine.evaluateAsset({
          id: `perf-com-${commodity}`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity: 100 },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(12);
      results.forEach(r => expect(r.consensusValue).toBeGreaterThan(0));
    });

    it('should valuate commodities with varying quantities', async () => {
      const quantities = [1, 10, 100, 1000, 10000];
      const promises = quantities.map(quantity =>
        engine.evaluateAsset({
          id: `perf-qty-${quantity}`,
          assetClass: AssetClass.COMMODITY,
          name: `Gold x${quantity}`,
          description: '',
          metadata: { commodity: 'gold', quantity },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      // Values should increase with quantity
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i + 1].consensusValue).toBeGreaterThan(results[i].consensusValue);
      }
    });
  });

  describe('bulk treasury valuations', () => {
    it('should valuate bonds across all maturities', async () => {
      const maturities = [1, 2, 3, 5, 7, 10, 20, 30];
      const promises = maturities.map(maturityYears =>
        engine.evaluateAsset({
          id: `perf-mat-${maturityYears}`,
          assetClass: AssetClass.TREASURY,
          name: `${maturityYears}Y Bond`,
          description: '',
          metadata: { maturityYears, couponRate: 0.04, faceValue: 1000 },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(8);
      results.forEach(r => expect(r.consensusValue).toBeGreaterThan(0));
    });

    it('should valuate bonds across all credit ratings', async () => {
      const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
      const promises = ratings.map(creditRating =>
        engine.evaluateAsset({
          id: `perf-cr-${creditRating}`,
          assetClass: AssetClass.TREASURY,
          name: `${creditRating} Bond`,
          description: '',
          metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(7);
      // AAA should have highest value (lowest spread)
      expect(results[0].consensusValue).toBeGreaterThan(results[6].consensusValue);
    });

    it('should valuate bonds across all bond types', async () => {
      const bondTypes = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];
      const promises = bondTypes.map(bondType =>
        engine.evaluateAsset({
          id: `perf-bt-${bondType}`,
          assetClass: AssetClass.TREASURY,
          name: `${bondType} Bond`,
          description: '',
          metadata: { bondType, maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(4);
      results.forEach(r => expect(r.consensusValue).toBeGreaterThan(0));
    });
  });

  describe('consensus engine stress', () => {
    it('should handle 50 valuations for consensus', () => {
      const valuations: ValuationResult[] = Array.from({ length: 50 }, (_, i) => ({
        assetId: 'stress-test',
        value: 100000 + i * 1000,
        confidence: 0.7 + Math.random() * 0.2,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: `agent-${i}`,
      }));

      const result = engine.computeConsensus('stress-test', valuations);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.valuations.length).toBeGreaterThan(0);
      expect(result.valuations.length).toBeLessThanOrEqual(50);
    });

    it('should handle consensus with mixed outliers and normal values', () => {
      const valuations: ValuationResult[] = [
        // Normal cluster
        ...Array.from({ length: 8 }, (_, i) => ({
          assetId: 'mixed-test',
          value: 100000 + i * 500,
          confidence: 0.85,
          methodology: 'test',
          dataPoints: [],
          timestamp: new Date(),
          agentId: `normal-${i}`,
        })),
        // Outliers
        { assetId: 'mixed-test', value: 500000, confidence: 0.9, methodology: 'test', dataPoints: [], timestamp: new Date(), agentId: 'outlier-high' },
        { assetId: 'mixed-test', value: 10000, confidence: 0.9, methodology: 'test', dataPoints: [], timestamp: new Date(), agentId: 'outlier-low' },
      ];

      const result = engine.computeConsensus('mixed-test', valuations);
      // Outliers should be filtered
      expect(result.valuations.length).toBeLessThan(10);
      // Consensus should be in the normal range
      expect(result.consensusValue).toBeGreaterThan(90000);
      expect(result.consensusValue).toBeLessThan(110000);
    });
  });

  describe('chain bridge conversion stress', () => {
    it('should convert 100 consensus results', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      for (let i = 0; i < 100; i++) {
        const submission = bridge.toSubmission({
          assetId: `stress-${i}`,
          consensusValue: 1000 + i * 100,
          avgConfidence: 0.5 + (i % 50) * 0.01,
          valuations: [],
          methodology: 'test',
          timestamp: new Date(),
        });
        expect(submission.value).toBeGreaterThan(0n);
        expect(submission.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('MCP server with many assets', () => {
    it('should build portfolio with 20 assets', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      for (let i = 0; i < 20; i++) {
        const assetClass = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY][i % 3];
        const metadata: Record<string, unknown> = {};

        if (assetClass === AssetClass.REAL_ESTATE) {
          metadata.squareFeet = 1000 + i * 100;
          metadata.condition = 'good';
        } else if (assetClass === AssetClass.COMMODITY) {
          metadata.commodity = 'gold';
          metadata.quantity = 10 + i;
        } else {
          metadata.maturityYears = 10;
          metadata.couponRate = 0.04;
          metadata.faceValue = 1000;
        }

        await server.handleToolCall('valuate_asset', {
          id: `bulk-${i}`,
          assetClass,
          name: `Asset ${i}`,
          metadata,
        });
      }

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(20);
      expect(portfolio.totalValue).toBeGreaterThan(0);
      expect(portfolio.assets).toHaveLength(20);
    });

    it('should handle repeated get_price calls for same asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'repeat-price',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const prices = [];
      for (let i = 0; i < 10; i++) {
        const result = await server.handleToolCall('get_price', { assetId: 'repeat-price' }) as any;
        prices.push(result.consensusValue);
      }

      // All should be identical
      const first = prices[0];
      prices.forEach(p => expect(p).toBe(first));
    });
  });
});

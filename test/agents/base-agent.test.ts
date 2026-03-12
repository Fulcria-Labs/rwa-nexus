import { BaseValuationAgent } from '../../src/agents/base-agent';
import { AgentConfig, AssetClass, AssetData, DataPoint, ValuationResult } from '../../src/types';

/**
 * Concrete implementation of BaseValuationAgent for testing.
 * Always returns a fixed value and confidence.
 */
class TestAgent extends BaseValuationAgent {
  private readonly fixedValue: number;
  private readonly fixedConfidence: number;
  private readonly dataPointsToReturn: DataPoint[];
  private throwOnGather: boolean = false;
  private throwOnCompute: boolean = false;

  constructor(
    config: AgentConfig,
    value = 100000,
    confidence = 0.8,
    dataPoints: DataPoint[] = [],
  ) {
    super(config);
    this.fixedValue = value;
    this.fixedConfidence = confidence;
    this.dataPointsToReturn = dataPoints;
  }

  setThrowOnGather(shouldThrow: boolean): void {
    this.throwOnGather = shouldThrow;
  }

  setThrowOnCompute(shouldThrow: boolean): void {
    this.throwOnCompute = shouldThrow;
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    if (this.throwOnGather) {
      throw new Error('gatherData failed');
    }
    return this.dataPointsToReturn;
  }

  protected async computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[],
  ): Promise<{ value: number; confidence: number }> {
    if (this.throwOnCompute) {
      throw new Error('computeValuation failed');
    }
    return { value: this.fixedValue, confidence: this.fixedConfidence };
  }

  protected getMethodology(): string {
    return 'Test methodology: fixed value computation';
  }
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    assetClasses: [AssetClass.REAL_ESTATE],
    description: 'Agent for unit testing',
    ...overrides,
  };
}

function makeAsset(overrides: Partial<AssetData> = {}): AssetData {
  return {
    id: 'asset-001',
    assetClass: AssetClass.REAL_ESTATE,
    name: 'Test Asset',
    description: 'Test description',
    metadata: {},
    ...overrides,
  };
}

describe('BaseValuationAgent', () => {
  describe('construction and config', () => {
    it('should store the provided config on construction', () => {
      const config = makeConfig();
      const agent = new TestAgent(config);
      expect(agent.config).toBe(config);
    });

    it('should expose config as readonly', () => {
      const agent = new TestAgent(makeConfig());
      // The config object is exposed; TypeScript marks the property readonly
      expect(agent.config).toBeDefined();
    });

    it('should store all config fields correctly', () => {
      const config = makeConfig({
        id: 'unique-id-42',
        name: 'Special Agent',
        assetClasses: [AssetClass.COMMODITY, AssetClass.TREASURY],
        description: 'Handles commodities and treasuries',
      });
      const agent = new TestAgent(config);
      expect(agent.config.id).toBe('unique-id-42');
      expect(agent.config.name).toBe('Special Agent');
      expect(agent.config.assetClasses).toEqual([AssetClass.COMMODITY, AssetClass.TREASURY]);
      expect(agent.config.description).toBe('Handles commodities and treasuries');
    });
  });

  describe('canValuate', () => {
    it('should return true when asset class is in the config list', () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.REAL_ESTATE] }));
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(true);
    });

    it('should return false when asset class is not in the config list', () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.REAL_ESTATE] }));
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('should return true for each class in a multi-class agent', () => {
      const agent = new TestAgent(
        makeConfig({ assetClasses: [AssetClass.COMMODITY, AssetClass.TREASURY] }),
      );
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(true);
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(true);
    });

    it('should return false for a class not in a multi-class agent', () => {
      const agent = new TestAgent(
        makeConfig({ assetClasses: [AssetClass.COMMODITY, AssetClass.TREASURY] }),
      );
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(agent.canValuate(AssetClass.EQUITY)).toBe(false);
    });

    it('should return false for all classes on an empty-class agent', () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [] }));
      for (const cls of Object.values(AssetClass)) {
        expect(agent.canValuate(cls)).toBe(false);
      }
    });

    it('should handle agent registered for all known asset classes', () => {
      const allClasses = Object.values(AssetClass) as AssetClass[];
      const agent = new TestAgent(makeConfig({ assetClasses: allClasses }));
      for (const cls of allClasses) {
        expect(agent.canValuate(cls)).toBe(true);
      }
    });
  });

  describe('valuate — success path', () => {
    it('should return a ValuationResult with correct assetId', async () => {
      const agent = new TestAgent(makeConfig());
      const result = await agent.valuate(makeAsset({ id: 'my-asset-id' }));
      expect(result.assetId).toBe('my-asset-id');
    });

    it('should use the value returned by computeValuation', async () => {
      const agent = new TestAgent(makeConfig(), 987654.32, 0.77);
      const result = await agent.valuate(makeAsset());
      expect(result.value).toBe(987654.32);
    });

    it('should use the confidence returned by computeValuation', async () => {
      const agent = new TestAgent(makeConfig(), 100, 0.63);
      const result = await agent.valuate(makeAsset());
      expect(result.confidence).toBe(0.63);
    });

    it('should populate agentId from config.id', async () => {
      const agent = new TestAgent(makeConfig({ id: 'my-test-agent' }));
      const result = await agent.valuate(makeAsset());
      expect(result.agentId).toBe('my-test-agent');
    });

    it('should include a timestamp that is close to now', async () => {
      const agent = new TestAgent(makeConfig());
      const before = new Date();
      const result = await agent.valuate(makeAsset());
      const after = new Date();
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include the methodology string from getMethodology()', async () => {
      const agent = new TestAgent(makeConfig());
      const result = await agent.valuate(makeAsset());
      expect(result.methodology).toBe('Test methodology: fixed value computation');
    });

    it('should include the dataPoints returned by gatherData()', async () => {
      const dp: DataPoint = {
        source: 'test_source',
        metric: 'test_metric',
        value: 42,
        timestamp: new Date(),
        weight: 0.5,
      };
      const agent = new TestAgent(makeConfig(), 100, 0.9, [dp]);
      const result = await agent.valuate(makeAsset());
      expect(result.dataPoints).toHaveLength(1);
      expect(result.dataPoints[0].metric).toBe('test_metric');
    });

    it('should pass the asset data to gatherData', async () => {
      let receivedAsset: AssetData | null = null;
      class CapturingAgent extends BaseValuationAgent {
        protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
          receivedAsset = asset;
          return [];
        }
        protected async computeValuation(): Promise<{ value: number; confidence: number }> {
          return { value: 0, confidence: 0 };
        }
        protected getMethodology(): string { return 'capture'; }
      }

      const config = makeConfig();
      const agent = new CapturingAgent(config);
      const asset = makeAsset({ id: 'captured-asset' });
      await agent.valuate(asset);
      expect(receivedAsset).not.toBeNull();
      expect(receivedAsset!.id).toBe('captured-asset');
    });

    it('should pass asset and dataPoints to computeValuation', async () => {
      let receivedDataPoints: DataPoint[] = [];
      const mockDP: DataPoint = {
        source: 's',
        metric: 'm',
        value: 1,
        timestamp: new Date(),
        weight: 1,
      };

      class PassThroughAgent extends BaseValuationAgent {
        protected async gatherData(): Promise<DataPoint[]> {
          return [mockDP];
        }
        protected async computeValuation(
          _asset: AssetData,
          dataPoints: DataPoint[],
        ): Promise<{ value: number; confidence: number }> {
          receivedDataPoints = dataPoints;
          return { value: 0, confidence: 0 };
        }
        protected getMethodology(): string { return 'passthrough'; }
      }

      const agent = new PassThroughAgent(makeConfig());
      await agent.valuate(makeAsset());
      expect(receivedDataPoints).toHaveLength(1);
      expect(receivedDataPoints[0].metric).toBe('m');
    });
  });

  describe('valuate — asset class guard', () => {
    it('should throw when asset class is not supported', async () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.REAL_ESTATE] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.COMMODITY })),
      ).rejects.toThrow();
    });

    it('should include agent id and asset class in error message', async () => {
      const agent = new TestAgent(makeConfig({ id: 'prop-agent', assetClasses: [AssetClass.REAL_ESTATE] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.COMMODITY })),
      ).rejects.toThrow('prop-agent');
    });

    it('should include the mismatched asset class in the error message', async () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.REAL_ESTATE] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.TREASURY })),
      ).rejects.toThrow(AssetClass.TREASURY);
    });

    it('should not throw when asset class matches', async () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.COMMODITY] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.COMMODITY })),
      ).resolves.toBeDefined();
    });

    it('should throw for EQUITY when agent only handles REAL_ESTATE', async () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [AssetClass.REAL_ESTATE] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.EQUITY })),
      ).rejects.toThrow();
    });

    it('should throw for RECEIVABLE when agent handles nothing', async () => {
      const agent = new TestAgent(makeConfig({ assetClasses: [] }));
      await expect(
        agent.valuate(makeAsset({ assetClass: AssetClass.RECEIVABLE })),
      ).rejects.toThrow();
    });
  });

  describe('valuate — error propagation from subclass methods', () => {
    it('should propagate errors thrown by gatherData', async () => {
      const agent = new TestAgent(makeConfig());
      agent.setThrowOnGather(true);
      await expect(agent.valuate(makeAsset())).rejects.toThrow('gatherData failed');
    });

    it('should propagate errors thrown by computeValuation', async () => {
      const agent = new TestAgent(makeConfig());
      agent.setThrowOnCompute(true);
      await expect(agent.valuate(makeAsset())).rejects.toThrow('computeValuation failed');
    });
  });

  describe('ValuationResult structure', () => {
    it('should return all required fields', async () => {
      const agent = new TestAgent(makeConfig());
      const result = await agent.valuate(makeAsset());

      expect(result).toHaveProperty('assetId');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('methodology');
      expect(result).toHaveProperty('dataPoints');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('agentId');
    });

    it('should return timestamp as a Date instance', async () => {
      const agent = new TestAgent(makeConfig());
      const result = await agent.valuate(makeAsset());
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should return dataPoints as an array', async () => {
      const agent = new TestAgent(makeConfig());
      const result = await agent.valuate(makeAsset());
      expect(Array.isArray(result.dataPoints)).toBe(true);
    });

    it('should produce a new timestamp on each call', async () => {
      const agent = new TestAgent(makeConfig());
      const r1 = await agent.valuate(makeAsset({ id: 'a1' }));
      const r2 = await agent.valuate(makeAsset({ id: 'a2' }));
      // Both should be valid dates; the second should be >= the first
      expect(r2.timestamp.getTime()).toBeGreaterThanOrEqual(r1.timestamp.getTime());
    });
  });
});

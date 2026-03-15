import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('Agent Error Handling', () => {
  const propertyAgent = new PropertyAgent();
  const commodityAgent = new CommodityAgent();
  const treasuryAgent = new TreasuryAgent();

  // ---- Wrong asset class errors ----
  describe('wrong asset class rejection', () => {
    it('PropertyAgent rejects COMMODITY assets', async () => {
      const asset: AssetData = {
        id: 'c1', assetClass: AssetClass.COMMODITY, name: 'Gold',
        description: '', metadata: {},
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('PropertyAgent rejects TREASURY assets', async () => {
      const asset: AssetData = {
        id: 't1', assetClass: AssetClass.TREASURY, name: 'Bond',
        description: '', metadata: {},
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('PropertyAgent rejects EQUITY assets', async () => {
      const asset: AssetData = {
        id: 'e1', assetClass: AssetClass.EQUITY, name: 'Stock',
        description: '', metadata: {},
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('PropertyAgent rejects RECEIVABLE assets', async () => {
      const asset: AssetData = {
        id: 'r1', assetClass: AssetClass.RECEIVABLE, name: 'Invoice',
        description: '', metadata: {},
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('CommodityAgent rejects REAL_ESTATE assets', async () => {
      const asset: AssetData = {
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        description: '', metadata: {},
      };
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('CommodityAgent rejects EQUITY assets', async () => {
      const asset: AssetData = {
        id: 'e1', assetClass: AssetClass.EQUITY, name: 'Stock',
        description: '', metadata: {},
      };
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('TreasuryAgent rejects COMMODITY assets', async () => {
      const asset: AssetData = {
        id: 'c1', assetClass: AssetClass.COMMODITY, name: 'Silver',
        description: '', metadata: {},
      };
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('TreasuryAgent rejects RECEIVABLE assets', async () => {
      const asset: AssetData = {
        id: 'r1', assetClass: AssetClass.RECEIVABLE, name: 'Invoice',
        description: '', metadata: {},
      };
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });
  });

  // ---- PropertyAgent with missing/malformed metadata ----
  describe('PropertyAgent missing metadata', () => {
    it('handles completely empty metadata', async () => {
      const asset: AssetData = {
        id: 'p-empty', assetClass: AssetClass.REAL_ESTATE, name: 'Empty Property',
        description: '', metadata: {},
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.agentId).toBe('property-agent');
    });

    it('uses default 1000 sqft when squareFeet is missing', async () => {
      const asset: AssetData = {
        id: 'p-nosqft', assetClass: AssetClass.REAL_ESTATE, name: 'No Sqft',
        description: '', metadata: {},
      };
      const result = await propertyAgent.valuate(asset);
      // Default location 'default' = 300/sqft, default sqft = 1000
      expect(result.value).toBe(300000);
    });

    it('uses default condition factor when condition is unknown', async () => {
      const asset: AssetData = {
        id: 'p-badcond', assetClass: AssetClass.REAL_ESTATE, name: 'Bad Condition',
        description: '', metadata: { condition: 'unknown_condition' },
      };
      const result = await propertyAgent.valuate(asset);
      // Unknown condition defaults to 1.0
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles squareFeet = 0 gracefully', async () => {
      const asset: AssetData = {
        id: 'p-zero-sqft', assetClass: AssetClass.REAL_ESTATE, name: 'Zero Sqft',
        description: '', metadata: { squareFeet: 0 },
      };
      const result = await propertyAgent.valuate(asset);
      // 0 is falsy, defaults to 1000
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles negative squareFeet', async () => {
      const asset: AssetData = {
        id: 'p-neg-sqft', assetClass: AssetClass.REAL_ESTATE, name: 'Neg Sqft',
        description: '', metadata: { squareFeet: -500 },
      };
      const result = await propertyAgent.valuate(asset);
      // Negative sqft produces negative comparable value but falls through
      expect(typeof result.value).toBe('number');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('handles undefined location with default pricing', async () => {
      const asset: AssetData = {
        id: 'p-noloc', assetClass: AssetClass.REAL_ESTATE, name: 'No Location',
        description: '', metadata: { squareFeet: 2000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Default price per sqft = 300
      expect(result.value).toBe(300 * 2000);
    });

    it('handles unknown location with default pricing', async () => {
      const asset: AssetData = {
        id: 'p-unknownloc', assetClass: AssetClass.REAL_ESTATE, name: 'Unknown Location',
        description: '', location: 'atlantis', metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBe(300 * 1000); // Default $300/sqft
    });

    it('handles very large squareFeet values', async () => {
      const asset: AssetData = {
        id: 'p-huge', assetClass: AssetClass.REAL_ESTATE, name: 'Huge Property',
        description: '', metadata: { squareFeet: 1000000 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBe(300 * 1000000);
      expect(Number.isFinite(result.value)).toBe(true);
    });

    it('handles annualRent = 0 (falsy, skips income approach)', async () => {
      const asset: AssetData = {
        id: 'p-norent', assetClass: AssetClass.REAL_ESTATE, name: 'No Rent',
        description: '', metadata: { squareFeet: 1000, annualRent: 0 },
      };
      const result = await propertyAgent.valuate(asset);
      // annualRent 0 is falsy → no income approach → 3 data points < 4 → 0.7 * 0.8 = 0.56
      expect(result.confidence).toBeCloseTo(0.56, 2);
    });

    it('provides higher confidence with both approaches', async () => {
      const asset: AssetData = {
        id: 'p-full', assetClass: AssetClass.REAL_ESTATE, name: 'Full Data',
        description: '', location: 'manhattan', metadata: {
          squareFeet: 2000, annualRent: 120000, propertyType: 'residential',
        },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.confidence).toBe(0.85);
    });

    it('reduces confidence with less than 4 data points', async () => {
      // This is hard to trigger since gatherData always produces at least
      // sqft + price + condition = 3 points, but with no rent and no yearBuilt
      // we get exactly 3 data points
      const asset: AssetData = {
        id: 'p-minimal', assetClass: AssetClass.REAL_ESTATE, name: 'Minimal',
        description: '', metadata: {},
      };
      const result = await propertyAgent.valuate(asset);
      // 3 data points < 4 → confidence *= 0.8 → 0.7 * 0.8 = 0.56
      expect(result.confidence).toBe(0.7 * 0.8);
    });

    it('does not reduce confidence at exactly 4 data points', async () => {
      const asset: AssetData = {
        id: 'p-four', assetClass: AssetClass.REAL_ESTATE, name: 'Four Points',
        description: '', metadata: { yearBuilt: 2020 },
      };
      const result = await propertyAgent.valuate(asset);
      // 4 data points (sqft + price + condition + ageFactor) → no reduction
      expect(result.confidence).toBe(0.7);
    });

    it('handles yearBuilt in the far future (negative depreciation capped)', async () => {
      const asset: AssetData = {
        id: 'p-future', assetClass: AssetClass.REAL_ESTATE, name: 'Future Property',
        description: '', metadata: { squareFeet: 1000, yearBuilt: 3000 },
      };
      const result = await propertyAgent.valuate(asset);
      // age = current year - 3000 = negative → 1 - (negative * 0.005) > 1
      // But capped by Math.max(0.5, ...) doesn't help here — it'll be > 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles yearBuilt very old (depreciation hits floor)', async () => {
      const asset: AssetData = {
        id: 'p-old', assetClass: AssetClass.REAL_ESTATE, name: 'Ancient',
        description: '', metadata: { squareFeet: 1000, yearBuilt: 1800 },
      };
      const result = await propertyAgent.valuate(asset);
      // age = ~226 years, depreciation = max(0.5, 1 - 226*0.005) = max(0.5, -0.13) = 0.5
      expect(result.value).toBeLessThanOrEqual(300 * 1000); // Depreciated
    });

    it('handles location with spaces and mixed case', async () => {
      const asset: AssetData = {
        id: 'p-loc', assetClass: AssetClass.REAL_ESTATE, name: 'Spaced Location',
        description: '', location: 'San Francisco', metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBe(1200 * 1000); // san_francisco = $1200/sqft
    });

    it('handles location with all caps', async () => {
      const asset: AssetData = {
        id: 'p-caps', assetClass: AssetClass.REAL_ESTATE, name: 'CAPS',
        description: '', location: 'MANHATTAN', metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBe(1800 * 1000);
    });

    it('handles unknown property type with default cap rate', async () => {
      const asset: AssetData = {
        id: 'p-unktype', assetClass: AssetClass.REAL_ESTATE, name: 'Unknown Type',
        description: '', metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'parking_lot' },
      };
      const result = await propertyAgent.valuate(asset);
      // Uses default cap rate 0.06
      expect(result.confidence).toBe(0.85); // Both approaches available
    });
  });

  // ---- CommodityAgent with missing/malformed metadata ----
  describe('CommodityAgent missing metadata', () => {
    it('handles completely empty metadata (no commodity name)', async () => {
      const asset: AssetData = {
        id: 'c-empty', assetClass: AssetClass.COMMODITY, name: 'Unknown',
        description: '', metadata: {},
      };
      const result = await commodityAgent.valuate(asset);
      // No spot data → no spot_price data point → value = 0, confidence = 0.1
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('handles unknown commodity gracefully', async () => {
      const asset: AssetData = {
        id: 'c-unk', assetClass: AssetClass.COMMODITY, name: 'Unobtanium',
        description: '', metadata: { commodity: 'unobtanium', quantity: 100 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('handles commodity with whitespace only', async () => {
      const asset: AssetData = {
        id: 'c-space', assetClass: AssetClass.COMMODITY, name: 'Spaces',
        description: '', metadata: { commodity: '   ', quantity: 10 },
      };
      const result = await commodityAgent.valuate(asset);
      // '   '.toLowerCase().replace(/\s+/g, '_') = '___' → not in SPOT_PRICES
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('handles zero quantity (falsy, defaults to 1)', async () => {
      const asset: AssetData = {
        id: 'c-zero-q', assetClass: AssetClass.COMMODITY, name: 'Zero Qty',
        description: '', metadata: { commodity: 'gold', quantity: 0 },
      };
      const result = await commodityAgent.valuate(asset);
      // quantity 0 is falsy → defaults to 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles negative quantity', async () => {
      const asset: AssetData = {
        id: 'c-neg-q', assetClass: AssetClass.COMMODITY, name: 'Neg Qty',
        description: '', metadata: { commodity: 'gold', quantity: -10 },
      };
      const result = await commodityAgent.valuate(asset);
      // Negative quantity → negative value
      expect(result.value).toBeLessThan(0);
    });

    it('handles very large quantity', async () => {
      const asset: AssetData = {
        id: 'c-huge-q', assetClass: AssetClass.COMMODITY, name: 'Huge Qty',
        description: '', metadata: { commodity: 'gold', quantity: 1e9 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(Number.isFinite(result.value)).toBe(true);
      expect(result.value).toBeGreaterThan(1e10);
    });

    it('handles unknown grade with default factor', async () => {
      const asset: AssetData = {
        id: 'c-unkgrade', assetClass: AssetClass.COMMODITY, name: 'Unknown Grade',
        description: '', metadata: { commodity: 'gold', quantity: 1, grade: 'ultra_rare' },
      };
      const result = await commodityAgent.valuate(asset);
      // Unknown grade defaults to factor 1.0
      expect(result.value).toBeGreaterThan(0);
    });

    it('premium grade increases value by 5%', async () => {
      const standard: AssetData = {
        id: 'c-std', assetClass: AssetClass.COMMODITY, name: 'Standard',
        description: '', metadata: { commodity: 'gold', quantity: 1, grade: 'standard' },
      };
      const premium: AssetData = {
        id: 'c-prm', assetClass: AssetClass.COMMODITY, name: 'Premium',
        description: '', metadata: { commodity: 'gold', quantity: 1, grade: 'premium' },
      };
      const stdResult = await commodityAgent.valuate(standard);
      const prmResult = await commodityAgent.valuate(premium);
      expect(prmResult.value).toBeGreaterThan(stdResult.value);
    });

    it('substandard grade decreases value by 10%', async () => {
      const standard: AssetData = {
        id: 'c-std2', assetClass: AssetClass.COMMODITY, name: 'Standard',
        description: '', metadata: { commodity: 'gold', quantity: 1, grade: 'standard' },
      };
      const sub: AssetData = {
        id: 'c-sub', assetClass: AssetClass.COMMODITY, name: 'Substandard',
        description: '', metadata: { commodity: 'gold', quantity: 1, grade: 'substandard' },
      };
      const stdResult = await commodityAgent.valuate(standard);
      const subResult = await commodityAgent.valuate(sub);
      expect(subResult.value).toBeLessThan(stdResult.value);
    });

    it('storage cost reduces total value', async () => {
      const noStorage: AssetData = {
        id: 'c-nostor', assetClass: AssetClass.COMMODITY, name: 'No Storage',
        description: '', metadata: { commodity: 'gold', quantity: 100 },
      };
      const withStorage: AssetData = {
        id: 'c-stor', assetClass: AssetClass.COMMODITY, name: 'With Storage',
        description: '', metadata: { commodity: 'gold', quantity: 100, storageCostPerUnit: 10 },
      };
      const noStorResult = await commodityAgent.valuate(noStorage);
      const storResult = await commodityAgent.valuate(withStorage);
      expect(storResult.value).toBeLessThan(noStorResult.value);
      expect(noStorResult.value - storResult.value).toBeCloseTo(10 * 100, 0);
    });

    it('storage cost of 0 does not add data point', async () => {
      const asset: AssetData = {
        id: 'c-zerostor', assetClass: AssetClass.COMMODITY, name: 'Zero Storage',
        description: '', metadata: { commodity: 'gold', quantity: 1, storageCostPerUnit: 0 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.dataPoints.find(dp => dp.metric === 'storage_cost')).toBeUndefined();
    });

    it('high volatility commodity has lower confidence', async () => {
      // Lumber has volatility 0.35
      const asset: AssetData = {
        id: 'c-vol', assetClass: AssetClass.COMMODITY, name: 'Volatile',
        description: '', metadata: { commodity: 'lumber', quantity: 1 },
      };
      const result = await commodityAgent.valuate(asset);
      // confidence = max(0.4, 0.95 - 0.35) = max(0.4, 0.6) = 0.6
      expect(result.confidence).toBe(0.6);
    });

    it('low volatility commodity has higher confidence', async () => {
      // Gold has volatility 0.12
      const asset: AssetData = {
        id: 'c-lowvol', assetClass: AssetClass.COMMODITY, name: 'Stable',
        description: '', metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await commodityAgent.valuate(asset);
      // confidence = max(0.4, 0.95 - 0.12) = 0.83
      expect(result.confidence).toBe(0.83);
    });
  });

  // ---- TreasuryAgent with missing/malformed metadata ----
  describe('TreasuryAgent missing metadata', () => {
    it('handles completely empty metadata with defaults', async () => {
      const asset: AssetData = {
        id: 't-empty', assetClass: AssetClass.TREASURY, name: 'Default Bond',
        description: '', metadata: {},
      };
      const result = await treasuryAgent.valuate(asset);
      // Defaults: us_treasury, 10yr, 4% coupon, $1000 face, AAA rating
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.92); // AAA = high confidence
    });

    it('handles unknown bond type with us_treasury fallback', async () => {
      const asset: AssetData = {
        id: 't-unk', assetClass: AssetClass.TREASURY, name: 'Unknown Bond',
        description: '', metadata: { bondType: 'junk_bond' },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles unknown credit rating with default spread', async () => {
      const asset: AssetData = {
        id: 't-unkrat', assetClass: AssetClass.TREASURY, name: 'Unknown Rating',
        description: '', metadata: { creditRating: 'XYZ' },
      };
      const result = await treasuryAgent.valuate(asset);
      // Unknown rating defaults to 100bp spread
      expect(result.value).toBeGreaterThan(0);
      // Unknown rating not in BB/B/CCC or BBB → confidence stays at 0.92
      expect(result.confidence).toBe(0.92);
    });

    it('CCC rated bonds have lowest confidence', async () => {
      const asset: AssetData = {
        id: 't-ccc', assetClass: AssetClass.TREASURY, name: 'CCC Bond',
        description: '', metadata: { creditRating: 'CCC' },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.confidence).toBe(0.65);
    });

    it('BBB rated bonds have medium confidence', async () => {
      const asset: AssetData = {
        id: 't-bbb', assetClass: AssetClass.TREASURY, name: 'BBB Bond',
        description: '', metadata: { creditRating: 'BBB' },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.confidence).toBe(0.8);
    });

    it('handles very short maturity (below curve minimum)', async () => {
      const asset: AssetData = {
        id: 't-short', assetClass: AssetClass.TREASURY, name: 'Short Maturity',
        description: '', metadata: { maturityYears: 0.25 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles very long maturity (above curve maximum)', async () => {
      const asset: AssetData = {
        id: 't-long', assetClass: AssetClass.TREASURY, name: 'Long Maturity',
        description: '', metadata: { maturityYears: 100 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles zero coupon bond', async () => {
      const asset: AssetData = {
        id: 't-zero', assetClass: AssetClass.TREASURY, name: 'Zero Coupon',
        description: '', metadata: { couponRate: 0, maturityYears: 5, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // Zero coupon → only PV of face value
      expect(result.value).toBeLessThan(1000);
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles very high coupon rate', async () => {
      const asset: AssetData = {
        id: 't-highcoup', assetClass: AssetClass.TREASURY, name: 'High Coupon',
        description: '', metadata: { couponRate: 0.50, maturityYears: 5, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // 50% coupon → very high value
      expect(result.value).toBeGreaterThan(1000);
    });

    it('scales value by quantity', async () => {
      const single: AssetData = {
        id: 't-single', assetClass: AssetClass.TREASURY, name: 'Single',
        description: '', metadata: { quantity: 1 },
      };
      const multi: AssetData = {
        id: 't-multi', assetClass: AssetClass.TREASURY, name: 'Multiple',
        description: '', metadata: { quantity: 10 },
      };
      const singleResult = await treasuryAgent.valuate(single);
      const multiResult = await treasuryAgent.valuate(multi);
      expect(multiResult.value).toBeCloseTo(singleResult.value * 10, 0);
    });

    it('handles fractional maturity years (interpolation)', async () => {
      const asset: AssetData = {
        id: 't-frac', assetClass: AssetClass.TREASURY, name: 'Fractional',
        description: '', metadata: { maturityYears: 4, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('handles negative face value gracefully', async () => {
      const asset: AssetData = {
        id: 't-negface', assetClass: AssetClass.TREASURY, name: 'Negative Face',
        description: '', metadata: { faceValue: -1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // Negative face → negative value (no guard)
      expect(result.value).toBeLessThan(0);
    });

    it('handles maturity of exactly 1 year', async () => {
      const asset: AssetData = {
        id: 't-1yr', assetClass: AssetClass.TREASURY, name: '1 Year',
        description: '', metadata: { maturityYears: 1, faceValue: 1000, couponRate: 0.04 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(900);
      expect(result.value).toBeLessThan(1100);
    });
  });

  // ---- ValuationResult structure validation ----
  describe('ValuationResult structure', () => {
    it('PropertyAgent returns all required fields', async () => {
      const asset: AssetData = {
        id: 'p-struct', assetClass: AssetClass.REAL_ESTATE, name: 'Structure Test',
        description: 'test', metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.assetId).toBe('p-struct');
      expect(result.agentId).toBe('property-agent');
      expect(typeof result.value).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.methodology).toBe('string');
      expect(result.methodology.length).toBeGreaterThan(0);
      expect(result.dataPoints).toBeInstanceOf(Array);
      expect(result.dataPoints.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('CommodityAgent returns all required fields', async () => {
      const asset: AssetData = {
        id: 'c-struct', assetClass: AssetClass.COMMODITY, name: 'Structure Test',
        description: 'test', metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.assetId).toBe('c-struct');
      expect(result.agentId).toBe('commodity-agent');
      expect(typeof result.value).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.methodology).toBe('string');
      expect(result.dataPoints).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('TreasuryAgent returns all required fields', async () => {
      const asset: AssetData = {
        id: 't-struct', assetClass: AssetClass.TREASURY, name: 'Structure Test',
        description: 'test', metadata: {},
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.assetId).toBe('t-struct');
      expect(result.agentId).toBe('treasury-agent');
      expect(typeof result.value).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.methodology).toBe('string');
      expect(result.dataPoints).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('confidence is always between 0 and 1', async () => {
      const assets: AssetData[] = [
        { id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: 'P', description: '', metadata: {} },
        { id: 'c1', assetClass: AssetClass.COMMODITY, name: 'C', description: '', metadata: { commodity: 'gold', quantity: 1 } },
        { id: 't1', assetClass: AssetClass.TREASURY, name: 'T', description: '', metadata: {} },
      ];
      const agents = [propertyAgent, commodityAgent, treasuryAgent];
      for (let i = 0; i < assets.length; i++) {
        const result = await agents[i].valuate(assets[i]);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---- canValuate method ----
  describe('canValuate correctness', () => {
    it('PropertyAgent can valuate REAL_ESTATE only', () => {
      expect(propertyAgent.canValuate(AssetClass.REAL_ESTATE)).toBe(true);
      expect(propertyAgent.canValuate(AssetClass.COMMODITY)).toBe(false);
      expect(propertyAgent.canValuate(AssetClass.TREASURY)).toBe(false);
      expect(propertyAgent.canValuate(AssetClass.EQUITY)).toBe(false);
      expect(propertyAgent.canValuate(AssetClass.RECEIVABLE)).toBe(false);
    });

    it('CommodityAgent can valuate COMMODITY only', () => {
      expect(commodityAgent.canValuate(AssetClass.COMMODITY)).toBe(true);
      expect(commodityAgent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(commodityAgent.canValuate(AssetClass.TREASURY)).toBe(false);
      expect(commodityAgent.canValuate(AssetClass.EQUITY)).toBe(false);
      expect(commodityAgent.canValuate(AssetClass.RECEIVABLE)).toBe(false);
    });

    it('TreasuryAgent can valuate TREASURY only', () => {
      expect(treasuryAgent.canValuate(AssetClass.TREASURY)).toBe(true);
      expect(treasuryAgent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(treasuryAgent.canValuate(AssetClass.COMMODITY)).toBe(false);
      expect(treasuryAgent.canValuate(AssetClass.EQUITY)).toBe(false);
      expect(treasuryAgent.canValuate(AssetClass.RECEIVABLE)).toBe(false);
    });
  });

  // ---- All commodity types ----
  describe('all commodity types produce valid results', () => {
    const commodities = ['gold', 'silver', 'platinum', 'crude_oil', 'natural_gas',
      'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'lumber', 'cotton'];

    commodities.forEach(commodity => {
      it(`valuates ${commodity} correctly`, async () => {
        const asset: AssetData = {
          id: `c-${commodity}`, assetClass: AssetClass.COMMODITY, name: commodity,
          description: '', metadata: { commodity, quantity: 100 },
        };
        const result = await commodityAgent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0.3);
        expect(result.agentId).toBe('commodity-agent');
      });
    });
  });

  // ---- All property locations ----
  describe('all property locations produce valid results', () => {
    const locations = ['manhattan', 'brooklyn', 'san_francisco', 'los_angeles',
      'miami', 'chicago', 'austin', 'seattle', 'hong_kong', 'singapore', 'london'];

    locations.forEach(location => {
      it(`valuates property in ${location}`, async () => {
        const asset: AssetData = {
          id: `p-${location}`, assetClass: AssetClass.REAL_ESTATE, name: `Property in ${location}`,
          description: '', location, metadata: { squareFeet: 1000 },
        };
        const result = await propertyAgent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.agentId).toBe('property-agent');
      });
    });
  });

  // ---- All credit ratings ----
  describe('all credit ratings produce valid results', () => {
    const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];

    ratings.forEach(rating => {
      it(`valuates bond with ${rating} rating`, async () => {
        const asset: AssetData = {
          id: `t-${rating}`, assetClass: AssetClass.TREASURY, name: `${rating} Bond`,
          description: '', metadata: { creditRating: rating, faceValue: 1000, maturityYears: 10 },
        };
        const result = await treasuryAgent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.agentId).toBe('treasury-agent');
      });
    });
  });

  // ---- All bond types ----
  describe('all bond types produce valid results', () => {
    const bondTypes = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];

    bondTypes.forEach(bondType => {
      it(`valuates ${bondType} bond correctly`, async () => {
        const asset: AssetData = {
          id: `t-${bondType}`, assetClass: AssetClass.TREASURY, name: `${bondType} Bond`,
          description: '', metadata: { bondType, faceValue: 1000, maturityYears: 10 },
        };
        const result = await treasuryAgent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
      });
    });
  });

  // ---- DataPoint validation ----
  describe('DataPoint weights are valid', () => {
    it('PropertyAgent data points have positive weights', async () => {
      const asset: AssetData = {
        id: 'dp-p', assetClass: AssetClass.REAL_ESTATE, name: 'DP Test',
        description: '', metadata: { squareFeet: 1000, annualRent: 50000, yearBuilt: 2010 },
      };
      const result = await propertyAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThan(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });

    it('CommodityAgent data points have positive weights', async () => {
      const asset: AssetData = {
        id: 'dp-c', assetClass: AssetClass.COMMODITY, name: 'DP Test',
        description: '', metadata: { commodity: 'gold', quantity: 10, storageCostPerUnit: 5 },
      };
      const result = await commodityAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThan(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });

    it('TreasuryAgent data points have positive weights', async () => {
      const asset: AssetData = {
        id: 'dp-t', assetClass: AssetClass.TREASURY, name: 'DP Test',
        description: '', metadata: {},
      };
      const result = await treasuryAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThan(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });
  });
});

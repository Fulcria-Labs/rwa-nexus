import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { AssetClass, AssetData } from '../../src/types';

describe('Agent Metadata Validation Tests', () => {
  let propertyAgent: PropertyAgent;
  let commodityAgent: CommodityAgent;
  let treasuryAgent: TreasuryAgent;

  beforeEach(() => {
    propertyAgent = new PropertyAgent();
    commodityAgent = new CommodityAgent();
    treasuryAgent = new TreasuryAgent();
  });

  // ─── REQUIRED FIELD VALIDATION PER ASSET CLASS ────────────────────

  describe('property agent — required field validation', () => {
    it('should produce a valuation even without squareFeet (defaults to 1000)', async () => {
      const asset: AssetData = {
        id: 'prop-no-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No SqFt',
        description: '',
        metadata: {},
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should produce a valuation without location (uses default price)', async () => {
      const asset: AssetData = {
        id: 'prop-no-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Location',
        description: '',
        metadata: { squareFeet: 2000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Default price is 300/sqft
      expect(result.value).toBeGreaterThan(0);
    });

    it('should produce a valuation without condition (defaults to good)', async () => {
      const asset: AssetData = {
        id: 'prop-no-cond',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Condition',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1500 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle completely empty metadata for property', async () => {
      const asset: AssetData = {
        id: 'prop-empty-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Empty Meta',
        description: '',
        metadata: {},
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle property with only annualRent (income approach only)', async () => {
      const asset: AssetData = {
        id: 'prop-rent-only',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Rent Only',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 0, annualRent: 120000, propertyType: 'residential' },
      };
      const result = await propertyAgent.valuate(asset);
      // squareFeet=0 means comparableValue=0, but income approach works
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('commodity agent — required field validation', () => {
    it('should return zero value for missing commodity type', async () => {
      const asset: AssetData = {
        id: 'com-no-type',
        assetClass: AssetClass.COMMODITY,
        name: 'No Commodity Type',
        description: '',
        metadata: { quantity: 100 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should default quantity to 1 when not provided', async () => {
      const asset: AssetData = {
        id: 'com-no-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'No Quantity',
        description: '',
        metadata: { commodity: 'gold' },
      };
      const result = await commodityAgent.valuate(asset);
      // Should use default quantity of 1
      expect(result.value).toBeGreaterThan(2000); // gold ~$2650/oz
    });

    it('should handle missing grade (defaults to standard)', async () => {
      const asset: AssetData = {
        id: 'com-no-grade',
        assetClass: AssetClass.COMMODITY,
        name: 'No Grade',
        description: '',
        metadata: { commodity: 'silver', quantity: 100 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle completely empty metadata for commodity', async () => {
      const asset: AssetData = {
        id: 'com-empty-meta',
        assetClass: AssetClass.COMMODITY,
        name: 'Empty Meta',
        description: '',
        metadata: {},
      };
      const result = await commodityAgent.valuate(asset);
      // No commodity type -> no spot price -> zero value
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('treasury agent — required field validation', () => {
    it('should use defaults when minimal metadata provided', async () => {
      const asset: AssetData = {
        id: 'trs-minimal',
        assetClass: AssetClass.TREASURY,
        name: 'Minimal Bond',
        description: '',
        metadata: {},
      };
      const result = await treasuryAgent.valuate(asset);
      // Uses defaults: maturityYears=10, couponRate=0.04, faceValue=1000
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle missing couponRate (defaults to 0.04)', async () => {
      const asset: AssetData = {
        id: 'trs-no-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'No Coupon',
        description: '',
        metadata: { maturityYears: 5, faceValue: 10000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle missing faceValue (defaults to 1000)', async () => {
      const asset: AssetData = {
        id: 'trs-no-face',
        assetClass: AssetClass.TREASURY,
        name: 'No Face Value',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.05 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle missing maturityYears (defaults to 10)', async () => {
      const asset: AssetData = {
        id: 'trs-no-mat',
        assetClass: AssetClass.TREASURY,
        name: 'No Maturity',
        description: '',
        metadata: { couponRate: 0.04, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle missing creditRating (defaults to AAA)', async () => {
      const asset: AssetData = {
        id: 'trs-no-rating',
        assetClass: AssetClass.TREASURY,
        name: 'No Rating',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // AAA default should give high confidence
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  // ─── NUMERIC RANGE VALIDATION ────────────────────────────────────

  describe('numeric range edge cases — property agent', () => {
    it('should handle negative square footage', async () => {
      const asset: AssetData = {
        id: 'prop-neg-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Negative SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: -500 },
      };
      const result = await propertyAgent.valuate(asset);
      // Negative sqft produces negative value (no validation)
      expect(typeof result.value).toBe('number');
    });

    it('should handle zero square footage', async () => {
      const asset: AssetData = {
        id: 'prop-zero-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Zero SqFt',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 0 },
      };
      const result = await propertyAgent.valuate(asset);
      // 0 * price_per_sqft = 0 comparable value
      expect(typeof result.value).toBe('number');
    });

    it('should handle extremely large square footage', async () => {
      const asset: AssetData = {
        id: 'prop-huge-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Huge SqFt',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000000 },
      };
      const result = await propertyAgent.valuate(asset);
      // 1M sqft * $1800/sqft = $1.8B
      expect(result.value).toBeGreaterThan(1000000000);
    });

    it('should handle negative annual rent', async () => {
      const asset: AssetData = {
        id: 'prop-neg-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Negative Rent',
        description: '',
        location: 'chicago',
        metadata: { squareFeet: 1000, annualRent: -50000, propertyType: 'commercial' },
      };
      const result = await propertyAgent.valuate(asset);
      // Negative rent / cap_rate gives negative income value
      expect(typeof result.value).toBe('number');
    });

    it('should handle fractional square footage', async () => {
      const asset: AssetData = {
        id: 'prop-frac-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Fractional SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 0.5 },
      };
      const result = await propertyAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1000);
    });

    it('should handle year built far in the future', async () => {
      const asset: AssetData = {
        id: 'prop-future-year',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Future Year',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 3000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Negative age -> depreciation > 1.0 (appreciation)
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle year built of 0 (extreme age)', async () => {
      const asset: AssetData = {
        id: 'prop-year-zero',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Year Zero',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 0 },
      };
      const result = await propertyAgent.valuate(asset);
      // Age = 2026, depreciation = max(0.5, 1 - 2026*0.005) = 0.5
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('numeric range edge cases — commodity agent', () => {
    it('should handle negative quantity', async () => {
      const asset: AssetData = {
        id: 'com-neg-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Negative Quantity',
        description: '',
        metadata: { commodity: 'gold', quantity: -10 },
      };
      const result = await commodityAgent.valuate(asset);
      // Negative quantity * spot price = negative value
      expect(result.value).toBeLessThan(0);
    });

    it('should handle zero quantity', async () => {
      const asset: AssetData = {
        id: 'com-zero-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Zero Quantity',
        description: '',
        metadata: { commodity: 'gold', quantity: 0 },
      };
      const result = await commodityAgent.valuate(asset);
      // quantity 0 is falsy, so it defaults to 1 via (meta.quantity as number) || 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle extremely large quantity', async () => {
      const asset: AssetData = {
        id: 'com-huge-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Huge Quantity',
        description: '',
        metadata: { commodity: 'gold', quantity: 1000000 },
      };
      const result = await commodityAgent.valuate(asset);
      // $2650 * 1M = $2.65B
      expect(result.value).toBeGreaterThan(2000000000);
    });

    it('should handle negative storage cost', async () => {
      const asset: AssetData = {
        id: 'com-neg-storage',
        assetClass: AssetClass.COMMODITY,
        name: 'Negative Storage',
        description: '',
        metadata: { commodity: 'wheat', quantity: 100, storageCostPerUnit: -1 },
      };
      const result = await commodityAgent.valuate(asset);
      // Negative storage cost adds value (not deducted)
      expect(typeof result.value).toBe('number');
    });

    it('should handle storage cost exceeding commodity value', async () => {
      const asset: AssetData = {
        id: 'com-high-storage',
        assetClass: AssetClass.COMMODITY,
        name: 'High Storage',
        description: '',
        metadata: { commodity: 'wheat', quantity: 100, storageCostPerUnit: 1000 },
      };
      const result = await commodityAgent.valuate(asset);
      // $5.8/bushel - $1000/bushel storage = deeply negative
      expect(result.value).toBeLessThan(0);
    });

    it('should handle fractional quantity', async () => {
      const asset: AssetData = {
        id: 'com-frac-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Fractional Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 0.001 },
      };
      const result = await commodityAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(10);
    });
  });

  describe('numeric range edge cases — treasury agent', () => {
    it('should handle zero coupon rate (zero-coupon bond)', async () => {
      const asset: AssetData = {
        id: 'trs-zero-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // Should just be PV of face value
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1000);
    });

    it('should handle very high coupon rate (100%)', async () => {
      const asset: AssetData = {
        id: 'trs-high-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'High Coupon',
        description: '',
        metadata: { maturityYears: 5, couponRate: 1.0, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // Annual coupon = $1000, 5 years of coupons + face value
      expect(result.value).toBeGreaterThan(1000);
    });

    it('should handle 30-year maturity', async () => {
      const asset: AssetData = {
        id: 'trs-30yr',
        assetClass: AssetClass.TREASURY,
        name: '30Y Bond',
        description: '',
        metadata: { maturityYears: 30, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle sub-year maturity (0.5 years)', async () => {
      const asset: AssetData = {
        id: 'trs-short',
        assetClass: AssetClass.TREASURY,
        name: 'Short Bond',
        description: '',
        metadata: { maturityYears: 0.5, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // Maturity < 1 means loop doesn't execute; only pvFace matters
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle zero maturity years', async () => {
      const asset: AssetData = {
        id: 'trs-zero-mat',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Maturity',
        description: '',
        metadata: { maturityYears: 0, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // maturityYears 0 is falsy, so defaults to 10 via (meta.maturityYears as number) || 10
      // This gives a standard 10-year bond valuation
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1100);
    });

    it('should handle negative face value', async () => {
      const asset: AssetData = {
        id: 'trs-neg-face',
        assetClass: AssetClass.TREASURY,
        name: 'Negative Face',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: -1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeLessThan(0);
    });

    it('should handle very large face value', async () => {
      const asset: AssetData = {
        id: 'trs-large-face',
        assetClass: AssetClass.TREASURY,
        name: 'Large Face',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000000 },
      };
      const result = await treasuryAgent.valuate(asset);
      expect(result.value).toBeGreaterThan(500000);
    });

    it('should produce lower confidence for high-yield ratings', async () => {
      const assets = ['AAA', 'BB', 'B', 'CCC'].map(rating => ({
        id: `trs-${rating}`,
        assetClass: AssetClass.TREASURY as AssetClass,
        name: `${rating} Bond`,
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: rating },
      }));

      const results = await Promise.all(assets.map(a => treasuryAgent.valuate(a)));
      // AAA should have highest confidence
      expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
      // BB, B, CCC should all have lower confidence
      expect(results[1].confidence).toBeLessThanOrEqual(0.65);
      expect(results[2].confidence).toBeLessThanOrEqual(0.65);
      expect(results[3].confidence).toBeLessThanOrEqual(0.65);
    });
  });

  // ─── MISSING/NULL/UNDEFINED METADATA FIELDS ───────────────────────

  describe('missing/null/undefined metadata fields', () => {
    it('should handle metadata with null values for property', async () => {
      const asset: AssetData = {
        id: 'prop-null',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Null Meta',
        description: '',
        location: 'miami',
        metadata: { squareFeet: null as unknown as number },
      };
      const result = await propertyAgent.valuate(asset);
      // null || 1000 -> uses default 1000
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle metadata with undefined values for commodity', async () => {
      const asset: AssetData = {
        id: 'com-undef',
        assetClass: AssetClass.COMMODITY,
        name: 'Undef Meta',
        description: '',
        metadata: { commodity: undefined as unknown as string, quantity: 10 },
      };
      const result = await commodityAgent.valuate(asset);
      // undefined commodity -> no spot price
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle metadata with null quantity for commodity', async () => {
      const asset: AssetData = {
        id: 'com-null-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Null Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: null as unknown as number },
      };
      const result = await commodityAgent.valuate(asset);
      // null || 1 -> uses default 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle metadata with undefined couponRate for treasury', async () => {
      const asset: AssetData = {
        id: 'trs-undef-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Undef Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: undefined, faceValue: 1000 },
      };
      const result = await treasuryAgent.valuate(asset);
      // undefined || 0.04 -> uses default 0.04
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle metadata with NaN values for property sqft', async () => {
      const asset: AssetData = {
        id: 'prop-nan',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'NaN SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: NaN },
      };
      const result = await propertyAgent.valuate(asset);
      // NaN is truthy, so it won't default to 1000; NaN * price = NaN
      expect(typeof result.value).toBe('number');
    });

    it('should handle metadata with boolean values where number expected', async () => {
      const asset: AssetData = {
        id: 'prop-bool',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Bool SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: true as unknown as number },
      };
      const result = await propertyAgent.valuate(asset);
      // true cast to number = 1
      expect(typeof result.value).toBe('number');
    });

    it('should handle metadata with string values where number expected', async () => {
      const asset: AssetData = {
        id: 'com-str-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'String Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: '10' as unknown as number },
      };
      const result = await commodityAgent.valuate(asset);
      // '10' as number behavior depends on JS coercion
      expect(typeof result.value).toBe('number');
    });
  });

  // ─── MALICIOUS STRING INJECTION IN METADATA ───────────────────────

  describe('malicious string injection in metadata', () => {
    it('should handle SQL injection in location', async () => {
      const asset: AssetData = {
        id: 'prop-sqli',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'SQL Injection',
        description: '',
        location: "'; DROP TABLE properties; --",
        metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Unknown location -> default price
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle XSS payload in commodity name', async () => {
      const asset: AssetData = {
        id: 'com-xss',
        assetClass: AssetClass.COMMODITY,
        name: '<script>alert("xss")</script>',
        description: '',
        metadata: { commodity: '<img src=x onerror=alert(1)>', quantity: 10 },
      };
      const result = await commodityAgent.valuate(asset);
      // XSS string won't match any commodity -> zero value
      expect(result.value).toBe(0);
    });

    it('should handle path traversal in location', async () => {
      const asset: AssetData = {
        id: 'prop-path',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Path Traversal',
        description: '',
        location: '../../../etc/passwd',
        metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Unknown location -> default price
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle unicode exploitation in metadata', async () => {
      const asset: AssetData = {
        id: 'com-unicode',
        assetClass: AssetClass.COMMODITY,
        name: 'Unicode',
        description: '',
        metadata: { commodity: 'gold\u0000', quantity: 10 },
      };
      const result = await commodityAgent.valuate(asset);
      // 'gold\0' won't match 'gold'
      expect(typeof result.value).toBe('number');
    });

    it('should handle very long string in location', async () => {
      const asset: AssetData = {
        id: 'prop-long-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Long Location',
        description: '',
        location: 'a'.repeat(100000),
        metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Very long location -> default price
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle empty string commodity', async () => {
      const asset: AssetData = {
        id: 'com-empty',
        assetClass: AssetClass.COMMODITY,
        name: 'Empty Commodity',
        description: '',
        metadata: { commodity: '', quantity: 10 },
      };
      const result = await commodityAgent.valuate(asset);
      // Empty string won't match any commodity
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle special characters in bond type', async () => {
      const asset: AssetData = {
        id: 'trs-special',
        assetClass: AssetClass.TREASURY,
        name: 'Special Bond Type',
        description: '',
        metadata: {
          maturityYears: 10,
          couponRate: 0.04,
          faceValue: 1000,
          bondType: '"; require("child_process").exec("rm -rf /")',
        },
      };
      const result = await treasuryAgent.valuate(asset);
      // Unknown bond type -> falls back to us_treasury yields
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle JSON injection in credit rating', async () => {
      const asset: AssetData = {
        id: 'trs-json',
        assetClass: AssetClass.TREASURY,
        name: 'JSON Injection',
        description: '',
        metadata: {
          maturityYears: 10,
          couponRate: 0.04,
          faceValue: 1000,
          creditRating: '{"$gt":""}',
        },
      };
      const result = await treasuryAgent.valuate(asset);
      // Unknown credit rating -> default spread of 100
      expect(result.value).toBeGreaterThan(0);
    });
  });

  // ─── ASSET TYPE MISMATCHES ────────────────────────────────────────

  describe('asset type mismatches — sending wrong metadata to wrong agent', () => {
    it('should reject commodity metadata sent to property agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100 },
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject property metadata sent to commodity agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-2',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 2000 },
      };
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject treasury metadata sent to property agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-3',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject property metadata sent to treasury agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-4',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        metadata: { squareFeet: 2000 },
      };
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject commodity metadata sent to treasury agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-5',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100 },
      };
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject treasury metadata sent to commodity agent', async () => {
      const asset: AssetData = {
        id: 'mismatch-6',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04 },
      };
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should handle EQUITY class rejected by all standard agents', async () => {
      const asset: AssetData = {
        id: 'equity-1',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: { ticker: 'AAPL' },
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should handle RECEIVABLE class rejected by all standard agents', async () => {
      const asset: AssetData = {
        id: 'rcv-1',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Invoice',
        description: '',
        metadata: { amount: 50000, dueDate: '2025-12-31' },
      };
      await expect(propertyAgent.valuate(asset)).rejects.toThrow('cannot valuate');
      await expect(commodityAgent.valuate(asset)).rejects.toThrow('cannot valuate');
      await expect(treasuryAgent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should handle property agent processing with commodity-style metadata gracefully', async () => {
      // Property agent receives REAL_ESTATE class but with commodity-style metadata
      const asset: AssetData = {
        id: 'cross-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Cross Meta',
        description: '',
        location: 'miami',
        metadata: { commodity: 'gold', quantity: 100 }, // commodity metadata, not property
      };
      const result = await propertyAgent.valuate(asset);
      // Property agent ignores commodity-specific fields, uses defaults
      // squareFeet defaults to 1000, no annualRent, condition defaults to 'good'
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle consensus engine routing mismatched metadata correctly', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      // REAL_ESTATE class with commodity metadata
      const asset: AssetData = {
        id: 'route-mismatch',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Route Test',
        description: '',
        location: 'manhattan',
        metadata: { commodity: 'gold', quantity: 100, squareFeet: 500 },
      };

      const result = await engine.evaluateAsset(asset);
      // Only PropertyAgent handles REAL_ESTATE
      expect(result.valuations).toHaveLength(1);
      expect(result.valuations[0].agentId).toBe('property-agent');
    });
  });

  // ─── PROPERTY CONDITION AND LOCATION EDGE CASES ───────────────────

  describe('property condition and location edge cases', () => {
    it('should handle unknown condition string', async () => {
      const asset: AssetData = {
        id: 'prop-unk-cond',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Condition',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition: 'terrible' },
      };
      const result = await propertyAgent.valuate(asset);
      // Unknown condition -> factor 1.0
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle location with spaces (normalized to underscores)', async () => {
      const asset: AssetData = {
        id: 'prop-space-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Space Location',
        description: '',
        location: 'San Francisco',
        metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Should normalize to san_francisco and get $1200/sqft
      expect(result.value).toBeGreaterThan(1000000);
    });

    it('should handle location with mixed case', async () => {
      const asset: AssetData = {
        id: 'prop-case-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Case Location',
        description: '',
        location: 'MANHATTAN',
        metadata: { squareFeet: 1000 },
      };
      const result = await propertyAgent.valuate(asset);
      // Should normalize to manhattan
      expect(result.value).toBeGreaterThan(1500000);
    });

    it('should handle all known property types for cap rate', async () => {
      const propertyTypes = ['residential', 'commercial', 'industrial', 'retail'];
      for (const propertyType of propertyTypes) {
        const asset: AssetData = {
          id: `prop-type-${propertyType}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: propertyType,
          description: '',
          location: 'miami',
          metadata: { squareFeet: 1000, annualRent: 50000, propertyType },
        };
        const result = await propertyAgent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.confidence).toBe(0.85); // Both approaches available
      }
    });
  });
});

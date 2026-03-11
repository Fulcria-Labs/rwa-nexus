import { ethers } from 'ethers';
import { ConsensusResult, OracleSubmission } from '../types';

/**
 * Bridge between AI consensus engine and on-chain RWAOracle contract.
 * Submits AI-attested valuations to BNB Chain.
 */
export class ChainBridge {
  private provider: ethers.Provider;
  private signer: ethers.Signer | null;
  private oracleAddress: string;
  private oracleAbi: ethers.InterfaceAbi;

  constructor(config: {
    rpcUrl: string;
    oracleAddress: string;
    privateKey?: string;
  }) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = config.privateKey
      ? new ethers.Wallet(config.privateKey, this.provider)
      : null;
    this.oracleAddress = config.oracleAddress;
    this.oracleAbi = [
      'function submitValuation(bytes32 assetId, uint256 value, uint256 confidence, string methodology) external',
      'function getPrice(bytes32 assetId) external view returns (uint256 value, uint256 confidence, uint256 lastUpdated)',
      'function getValuationCount(bytes32 assetId) external view returns (uint256)',
      'function getValuation(bytes32 assetId, uint256 index) external view returns (tuple(uint256 value, uint256 confidence, uint256 timestamp, address agent, string methodology))',
      'function authorizedAgents(address) external view returns (bool)',
      'function getAssetCount() external view returns (uint256)',
      'event ValuationSubmitted(bytes32 indexed assetId, address indexed agent, uint256 value, uint256 confidence)',
      'event ConsensusReached(bytes32 indexed assetId, uint256 consensusValue, uint256 numAgents)',
    ];
  }

  /**
   * Convert a consensus result to an oracle submission and send on-chain.
   */
  async submitConsensus(consensus: ConsensusResult): Promise<string> {
    if (!this.signer) {
      throw new Error('No signer configured. Set privateKey to submit on-chain.');
    }

    const contract = new ethers.Contract(this.oracleAddress, this.oracleAbi, this.signer);

    const submission = this.toSubmission(consensus);
    const tx = await contract.submitValuation(
      ethers.encodeBytes32String(submission.assetId.slice(0, 31)),
      submission.value,
      submission.confidence,
      submission.methodology
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Read the current on-chain price for an asset.
   */
  async getOnChainPrice(assetId: string): Promise<{
    value: bigint;
    confidence: bigint;
    lastUpdated: bigint;
  }> {
    const contract = new ethers.Contract(this.oracleAddress, this.oracleAbi, this.provider);
    const assetIdBytes = ethers.encodeBytes32String(assetId.slice(0, 31));
    const [value, confidence, lastUpdated] = await contract.getPrice(assetIdBytes);
    return { value, confidence, lastUpdated };
  }

  /**
   * Check if an address is an authorized oracle agent.
   */
  async isAuthorizedAgent(address: string): Promise<boolean> {
    const contract = new ethers.Contract(this.oracleAddress, this.oracleAbi, this.provider);
    return contract.authorizedAgents(address);
  }

  /**
   * Convert ConsensusResult to on-chain submission format.
   */
  toSubmission(consensus: ConsensusResult): OracleSubmission {
    // Convert USD value to 18 decimal fixed point
    const value = ethers.parseUnits(consensus.consensusValue.toFixed(2), 18);
    // Convert confidence 0-1 to 0-10000 basis points
    const confidence = Math.round(consensus.avgConfidence * 10000);

    return {
      assetId: consensus.assetId,
      value,
      confidence,
      methodology: consensus.methodology,
    };
  }

  /**
   * Get the signer's address.
   */
  async getSignerAddress(): Promise<string> {
    if (!this.signer) throw new Error('No signer configured');
    return this.signer.getAddress();
  }

  /**
   * Get current BNB balance of the signer.
   */
  async getBalance(): Promise<bigint> {
    if (!this.signer) throw new Error('No signer configured');
    const address = await this.signer.getAddress();
    return this.provider.getBalance(address);
  }
}

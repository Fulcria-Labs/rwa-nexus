// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RWAOracle
 * @notice On-chain oracle for AI-attested real-world asset valuations.
 *         Multiple AI agents submit valuations; consensus determines the final price.
 */
contract RWAOracle is Ownable {
    struct Valuation {
        uint256 value;          // USD value (18 decimals)
        uint256 confidence;     // Confidence score 0-10000 (basis points)
        uint256 timestamp;
        address agent;
        string methodology;     // Brief description of valuation approach
    }

    struct AssetPrice {
        uint256 consensusValue;
        uint256 avgConfidence;
        uint256 lastUpdated;
        uint256 numValuations;
    }

    // assetId => array of recent valuations
    mapping(bytes32 => Valuation[]) public valuations;
    // assetId => consensus price
    mapping(bytes32 => AssetPrice) public prices;
    // Authorized AI agent addresses
    mapping(address => bool) public authorizedAgents;
    // All registered asset IDs
    bytes32[] public assetIds;
    mapping(bytes32 => bool) public assetExists;

    uint256 public minAgentsForConsensus = 2;
    uint256 public maxValuationAge = 24 hours;

    event ValuationSubmitted(bytes32 indexed assetId, address indexed agent, uint256 value, uint256 confidence);
    event ConsensusReached(bytes32 indexed assetId, uint256 consensusValue, uint256 numAgents);
    event AgentAuthorized(address indexed agent);
    event AgentRevoked(address indexed agent);

    constructor() Ownable(msg.sender) {}

    function authorizeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent);
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    /**
     * @notice Submit an AI-attested valuation for an asset.
     * @param assetId Unique identifier for the real-world asset
     * @param value Assessed value in USD (18 decimals)
     * @param confidence Confidence score 0-10000
     * @param methodology Brief description of how the valuation was computed
     */
    function submitValuation(
        bytes32 assetId,
        uint256 value,
        uint256 confidence,
        string calldata methodology
    ) external {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        require(confidence <= 10000, "Confidence must be <= 10000");
        require(value > 0, "Value must be positive");

        if (!assetExists[assetId]) {
            assetIds.push(assetId);
            assetExists[assetId] = true;
        }

        valuations[assetId].push(Valuation({
            value: value,
            confidence: confidence,
            timestamp: block.timestamp,
            agent: msg.sender,
            methodology: methodology
        }));

        emit ValuationSubmitted(assetId, msg.sender, value, confidence);

        _tryConsensus(assetId);
    }

    /**
     * @notice Attempt to compute consensus from recent valuations.
     *         Uses confidence-weighted average of valuations within maxValuationAge.
     */
    function _tryConsensus(bytes32 assetId) internal {
        Valuation[] storage vals = valuations[assetId];

        uint256 weightedSum;
        uint256 totalWeight;
        uint256 count;
        uint256 cutoff = block.timestamp > maxValuationAge
            ? block.timestamp - maxValuationAge
            : 0;

        for (uint256 i = vals.length; i > 0; i--) {
            Valuation storage v = vals[i - 1];
            if (v.timestamp < cutoff) break;

            weightedSum += v.value * v.confidence;
            totalWeight += v.confidence;
            count++;
        }

        if (count >= minAgentsForConsensus && totalWeight > 0) {
            uint256 consensus = weightedSum / totalWeight;
            uint256 avgConf = totalWeight / count;

            prices[assetId] = AssetPrice({
                consensusValue: consensus,
                avgConfidence: avgConf,
                lastUpdated: block.timestamp,
                numValuations: count
            });

            emit ConsensusReached(assetId, consensus, count);
        }
    }

    function getPrice(bytes32 assetId) external view returns (uint256 value, uint256 confidence, uint256 lastUpdated) {
        AssetPrice storage p = prices[assetId];
        return (p.consensusValue, p.avgConfidence, p.lastUpdated);
    }

    function getValuationCount(bytes32 assetId) external view returns (uint256) {
        return valuations[assetId].length;
    }

    function getValuation(bytes32 assetId, uint256 index) external view returns (Valuation memory) {
        return valuations[assetId][index];
    }

    function getAssetCount() external view returns (uint256) {
        return assetIds.length;
    }

    function setMinAgentsForConsensus(uint256 min) external onlyOwner {
        minAgentsForConsensus = min;
    }

    function setMaxValuationAge(uint256 maxAge) external onlyOwner {
        maxValuationAge = maxAge;
    }
}

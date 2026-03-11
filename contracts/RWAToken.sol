// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RWAToken
 * @notice ERC-1155 multi-token representing tokenized real-world assets.
 *         Each token ID represents a distinct asset class/property.
 */
contract RWAToken is ERC1155, Ownable {
    struct AssetMetadata {
        string assetType;       // e.g., "real_estate", "commodity", "treasury"
        string description;
        string externalURI;     // IPFS or URL to full asset data
        uint256 totalValue;     // Total appraised value in USD (18 decimals)
        uint256 createdAt;
        bool active;
    }

    uint256 public nextTokenId;
    mapping(uint256 => AssetMetadata) public assets;
    mapping(uint256 => address) public assetOracle;  // Oracle authorized to update valuations

    event AssetCreated(uint256 indexed tokenId, string assetType, string description, uint256 totalValue);
    event AssetValuationUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue, address indexed oracle);
    event AssetDeactivated(uint256 indexed tokenId);

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    /**
     * @notice Create a new RWA token representing a real-world asset.
     * @param assetType Category of the asset
     * @param description Human-readable description
     * @param externalURI Link to full asset documentation
     * @param totalValue Initial appraised value (USD, 18 decimals)
     * @param supply Number of fractional tokens to mint
     * @param oracle Address authorized to update this asset's valuation
     */
    function createAsset(
        string calldata assetType,
        string calldata description,
        string calldata externalURI,
        uint256 totalValue,
        uint256 supply,
        address oracle
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextTokenId++;

        assets[tokenId] = AssetMetadata({
            assetType: assetType,
            description: description,
            externalURI: externalURI,
            totalValue: totalValue,
            createdAt: block.timestamp,
            active: true
        });

        assetOracle[tokenId] = oracle;
        _mint(msg.sender, tokenId, supply, "");

        emit AssetCreated(tokenId, assetType, description, totalValue);
    }

    /**
     * @notice Update the valuation of an asset. Only callable by the asset's oracle.
     */
    function updateValuation(uint256 tokenId, uint256 newValue) external {
        require(msg.sender == assetOracle[tokenId], "Not authorized oracle");
        require(assets[tokenId].active, "Asset not active");

        uint256 oldValue = assets[tokenId].totalValue;
        assets[tokenId].totalValue = newValue;

        emit AssetValuationUpdated(tokenId, oldValue, newValue, msg.sender);
    }

    /**
     * @notice Deactivate an asset (e.g., if underlying asset is sold/destroyed).
     */
    function deactivateAsset(uint256 tokenId) external onlyOwner {
        require(assets[tokenId].active, "Already inactive");
        assets[tokenId].active = false;
        emit AssetDeactivated(tokenId);
    }

    /**
     * @notice Get the per-token value based on total supply.
     */
    function tokenValue(uint256 tokenId) external view returns (uint256) {
        // Note: ERC-1155 doesn't track total supply natively.
        // In production, we'd track this. For demo, return totalValue.
        return assets[tokenId].totalValue;
    }

    function getAsset(uint256 tokenId) external view returns (AssetMetadata memory) {
        return assets[tokenId];
    }

    function setOracle(uint256 tokenId, address newOracle) external onlyOwner {
        assetOracle[tokenId] = newOracle;
    }
}

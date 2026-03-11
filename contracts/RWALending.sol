// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRWAOracle {
    function getPrice(bytes32 assetId) external view returns (uint256 value, uint256 confidence, uint256 lastUpdated);
}

interface IRWAToken {
    function getAsset(uint256 tokenId) external view returns (
        string memory assetType,
        string memory description,
        string memory externalURI,
        uint256 totalValue,
        uint256 createdAt,
        bool active
    );
}

/**
 * @title RWALending
 * @notice Simple lending pool that accepts tokenized RWAs as collateral.
 *         Loan-to-value ratios are determined by AI oracle confidence scores.
 */
contract RWALending is ERC1155Holder, Ownable {
    struct Loan {
        address borrower;
        uint256 tokenId;
        uint256 collateralAmount;   // Number of RWA tokens deposited
        uint256 loanAmount;         // BNB borrowed (wei)
        uint256 interestRate;       // Annual rate in basis points
        uint256 startTime;
        bool active;
    }

    IERC1155 public rwaToken;
    IRWAOracle public oracle;

    uint256 public baseLTV = 5000;           // 50% base LTV
    uint256 public highConfidenceLTV = 7000;  // 70% LTV for high-confidence valuations
    uint256 public confidenceThreshold = 8000; // 80% confidence needed for higher LTV
    uint256 public baseInterestRate = 500;    // 5% annual
    uint256 public nextLoanId;

    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerLoans;

    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 tokenId, uint256 loanAmount);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 repayAmount);
    event LoanLiquidated(uint256 indexed loanId, address indexed liquidator);

    constructor(address _rwaToken, address _oracle) Ownable(msg.sender) {
        rwaToken = IERC1155(_rwaToken);
        oracle = IRWAOracle(_oracle);
    }

    /**
     * @notice Borrow BNB against RWA token collateral.
     * @param tokenId The RWA token ID to use as collateral
     * @param amount Number of RWA tokens to deposit
     * @param oracleAssetId The oracle asset ID for price lookup
     */
    function borrow(uint256 tokenId, uint256 amount, bytes32 oracleAssetId) external {
        require(amount > 0, "Amount must be positive");

        (uint256 value, uint256 confidence, uint256 lastUpdated) = oracle.getPrice(oracleAssetId);
        require(value > 0, "No oracle price available");
        require(block.timestamp - lastUpdated < 1 days, "Oracle price too stale");

        // Determine LTV based on oracle confidence
        uint256 ltv = confidence >= confidenceThreshold ? highConfidenceLTV : baseLTV;
        uint256 maxLoan = (value * amount * ltv) / (10000 * 1e18);

        require(address(this).balance >= maxLoan, "Insufficient pool liquidity");

        // Transfer collateral
        rwaToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        uint256 loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            tokenId: tokenId,
            collateralAmount: amount,
            loanAmount: maxLoan,
            interestRate: baseInterestRate,
            startTime: block.timestamp,
            active: true
        });
        borrowerLoans[msg.sender].push(loanId);

        payable(msg.sender).transfer(maxLoan);
        emit LoanCreated(loanId, msg.sender, tokenId, maxLoan);
    }

    /**
     * @notice Repay a loan and reclaim collateral.
     */
    function repay(uint256 loanId) external payable {
        Loan storage loan = loans[loanId];
        require(loan.active, "Loan not active");
        require(loan.borrower == msg.sender, "Not borrower");

        uint256 interest = _calculateInterest(loan);
        uint256 totalDue = loan.loanAmount + interest;
        require(msg.value >= totalDue, "Insufficient repayment");

        loan.active = false;
        rwaToken.safeTransferFrom(address(this), msg.sender, loan.tokenId, loan.collateralAmount, "");

        // Refund excess
        if (msg.value > totalDue) {
            payable(msg.sender).transfer(msg.value - totalDue);
        }

        emit LoanRepaid(loanId, msg.sender, totalDue);
    }

    function _calculateInterest(Loan storage loan) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - loan.startTime;
        return (loan.loanAmount * loan.interestRate * elapsed) / (10000 * 365 days);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    receive() external payable {}
}

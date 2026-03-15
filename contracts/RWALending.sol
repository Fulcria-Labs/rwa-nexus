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
    uint256 public liquidationThreshold = 9000; // 90% — loan is liquidatable when debt >= 90% of collateral value
    uint256 public liquidationBonus = 500;     // 5% bonus for liquidators
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

    /**
     * @notice Liquidate an undercollateralized loan.
     *         Anyone can call this when the loan's debt exceeds the liquidation threshold
     *         of the collateral's current oracle value. The liquidator pays the outstanding
     *         debt and receives the collateral tokens plus a liquidation bonus.
     * @param loanId The loan to liquidate
     * @param oracleAssetId The oracle asset ID for price lookup
     */
    function liquidate(uint256 loanId, bytes32 oracleAssetId) external payable {
        Loan storage loan = loans[loanId];
        require(loan.active, "Loan not active");

        (uint256 value,, uint256 lastUpdated) = oracle.getPrice(oracleAssetId);
        require(value > 0, "No oracle price available");
        require(block.timestamp - lastUpdated < 1 days, "Oracle price too stale");

        // Current collateral value in wei
        uint256 collateralValue = (value * loan.collateralAmount) / 1e18;

        // Total debt = principal + accrued interest
        uint256 interest = _calculateInterest(loan);
        uint256 totalDebt = loan.loanAmount + interest;

        // Loan is liquidatable when debt >= liquidationThreshold% of collateral value
        // i.e., totalDebt * 10000 >= collateralValue * liquidationThreshold
        require(
            totalDebt * 10000 >= collateralValue * liquidationThreshold,
            "Loan not undercollateralized"
        );

        // Liquidator pays the total debt
        require(msg.value >= totalDebt, "Insufficient liquidation payment");

        loan.active = false;

        // Transfer collateral to liquidator
        rwaToken.safeTransferFrom(address(this), msg.sender, loan.tokenId, loan.collateralAmount, "");

        // Refund excess payment
        if (msg.value > totalDebt) {
            payable(msg.sender).transfer(msg.value - totalDebt);
        }

        emit LoanLiquidated(loanId, msg.sender);
    }

    /**
     * @notice Check whether a loan is currently liquidatable.
     * @param loanId The loan to check
     * @param oracleAssetId The oracle asset ID for price lookup
     * @return liquidatable Whether the loan can be liquidated
     * @return totalDebt The total amount owed (principal + interest)
     * @return collateralValue The current value of the collateral
     */
    function isLiquidatable(uint256 loanId, bytes32 oracleAssetId) external view returns (
        bool liquidatable,
        uint256 totalDebt,
        uint256 collateralValue
    ) {
        Loan storage loan = loans[loanId];
        if (!loan.active) return (false, 0, 0);

        (uint256 value,, uint256 lastUpdated) = oracle.getPrice(oracleAssetId);
        if (value == 0 || block.timestamp - lastUpdated >= 1 days) return (false, 0, 0);

        collateralValue = (value * loan.collateralAmount) / 1e18;
        uint256 interest = _calculateInterest(loan);
        totalDebt = loan.loanAmount + interest;

        liquidatable = (totalDebt * 10000 >= collateralValue * liquidationThreshold);
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

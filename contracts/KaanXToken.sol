// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title KAANX — Tulum Cenote Land Token
/// @notice ERC-20 backed by 3.07 hectares of cenote land in Tulum (certificado parcelario).
///         Valuation: $10M USD (ejidal discount applied). 10,000,000 tokens at $1 each.
///         Appreciates as the dominio pleno conversion process advances.
contract KaanXToken is ERC20, ERC20Permit, Ownable, Pausable {
    uint256 public constant TOTAL_SUPPLY = 10_000_000 * 1e18;

    /// @notice Land area in square meters (3 hectares, 07 áreas, 91.84 m² = 30,791 m²)
    uint256 public constant LAND_AREA_M2 = 30_791;

    /// @notice Current valuation in USDC (6 decimals). Starts at $10M.
    uint256 public landValuation = 10_000_000 * 1e6;

    string public landTitle   = "Certificado Parcelario #8228";
    string public landAddress = "Coastal Corridor, Tulum, Quintana Roo, Mexico";
    string public nearbyLandmarks = "Sian Ka'an UNESCO Reserve, Cenote (private), Av. Kukulkan";

    /// @notice Phase of legalization: 0=Ejidal, 1=En tramite dominio pleno, 2=Titulo privado
    uint8 public legalPhase;

    event LegalPhaseAdvanced(uint8 newPhase, string description);
    event ValuationUpdated(uint256 newValuation);

    constructor(address initialOwner)
        ERC20("KAANX - Tulum Land Token", "KAANX")
        ERC20Permit("KAANX - Tulum Land Token")
        Ownable(initialOwner)
    {
        _mint(initialOwner, TOTAL_SUPPLY);
    }

    /// @notice Advance the legal phase (triggers valuation re-rating opportunity)
    function advanceLegalPhase(string calldata description) external onlyOwner {
        require(legalPhase < 2, "Already full title");
        legalPhase++;
        emit LegalPhaseAdvanced(legalPhase, description);
    }

    /// @notice Update land valuation as legal status improves
    function updateValuation(uint256 newValuationUsdc) external onlyOwner {
        landValuation = newValuationUsdc;
        emit ValuationUpdated(newValuationUsdc);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        super._update(from, to, value);
    }
}

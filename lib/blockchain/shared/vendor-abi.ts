/**
 * DG Token Vendor ABI Definitions
 *
 * Minimal ABI subset for DGTokenVendor (Base Sepolia deployment)
 * Used by hooks and verification strategies for contract interactions.
 */

// Core Read Functions
export const DG_TOKEN_VENDOR_ABI = [
    {
        inputs: [],
        name: "getExchangeRate",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getFeeConfig",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "maxFeeBps", type: "uint256" },
                    { internalType: "uint256", name: "minFeeBps", type: "uint256" },
                    { internalType: "uint256", name: "buyFeeBps", type: "uint256" },
                    { internalType: "uint256", name: "sellFeeBps", type: "uint256" },
                    { internalType: "uint256", name: "rateChangeCooldown", type: "uint256" },
                    { internalType: "uint256", name: "appChangeCooldown", type: "uint256" },
                ],
                internalType: "struct IDGTokenVendor.FeeConfig",
                name: "_feeConfig",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getTokenConfig",
        outputs: [
            {
                components: [
                    { internalType: "contract IERC20", name: "baseToken", type: "address" },
                    { internalType: "contract IERC20", name: "swapToken", type: "address" },
                    { internalType: "uint256", name: "exchangeRate", type: "uint256" },
                ],
                internalType: "struct IDGTokenVendor.TokenConfig",
                name: "_tokenConfig",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "user", type: "address" }],
        name: "getUserState",
        outputs: [
            {
                components: [
                    { internalType: "enum IDGTokenVendor.UserStage", name: "stage", type: "uint8" },
                    { internalType: "uint256", name: "points", type: "uint256" },
                    { internalType: "uint256", name: "fuel", type: "uint256" },
                    { internalType: "uint256", name: "lastStage3MaxSale", type: "uint256" },
                    { internalType: "uint256", name: "dailySoldAmount", type: "uint256" },
                    { internalType: "uint256", name: "dailyWindowStart", type: "uint256" },
                ],
                internalType: "struct IDGTokenVendor.UserState",
                name: "_userState",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "enum IDGTokenVendor.UserStage", name: "_stage", type: "uint8" }],
        name: "getStageConfig",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "burnAmount", type: "uint256" },
                    { internalType: "uint256", name: "upgradePointsThreshold", type: "uint256" },
                    { internalType: "uint256", name: "upgradeFuelThreshold", type: "uint256" },
                    { internalType: "uint256", name: "fuelRate", type: "uint256" },
                    { internalType: "uint256", name: "pointsAwarded", type: "uint256" },
                    { internalType: "uint256", name: "qualifyingBuyThreshold", type: "uint256" },
                    { internalType: "uint256", name: "maxSellBps", type: "uint256" },
                    { internalType: "uint256", name: "dailyLimitMultiplier", type: "uint256" },
                ],
                internalType: "struct IDGTokenVendor.StageConfig",
                name: "_stageConfig",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getStageConstants",
        outputs: [
            {
                components: [
                    { internalType: "uint256", name: "maxSellCooldown", type: "uint256" },
                    { internalType: "uint256", name: "dailyWindow", type: "uint256" },
                    { internalType: "uint256", name: "minBuyAmount", type: "uint256" },
                    { internalType: "uint256", name: "minSellAmount", type: "uint256" },
                ],
                internalType: "struct IDGTokenVendor.StageConstants",
                name: "_stageConstants",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "paused",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "user", type: "address" }],
        name: "hasValidKey",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    // Core User Actions (Write Functions)
    {
        inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
        name: "buyTokens",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
        name: "sellTokens",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "lightUp",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "upgradeStage",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
] as const;

// Type exports for TypeScript consumers
export type DGTokenVendorABI = typeof DG_TOKEN_VENDOR_ABI;

import { defineWalletSetup } from '@synthetixio/synpress';
import { MetaMask } from '@synthetixio/synpress/playwright';

// Default test mnemonic for hardhat/anvil
const SEED_PHRASE = 'test test test test test test test test test test test junk';
const PASSWORD = 'Password123!';

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
    const metamask = new MetaMask(context, walletPage, PASSWORD);

    await metamask.importWallet(SEED_PHRASE);

    // Optional: Add network configuration if needed later
});

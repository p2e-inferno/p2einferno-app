import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import basicSetup from '../wallet-setup/basic.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));

const { expect } = test;

test('should load the homepage and show connect button', async ({
    context,
    page,
    metamaskPage,
    extensionId,
}) => {
    new MetaMask(
        context,
        metamaskPage,
        basicSetup.walletPassword,
        extensionId
    );

    await page.goto('/');

    // Verify the connect button is present
    // Note: Adjust selector to match your actual app's button
    const connectButton = page.locator('button:has-text("Connect wallet"), button:has-text("Connect")').first();
    await expect(connectButton).toBeVisible();
});

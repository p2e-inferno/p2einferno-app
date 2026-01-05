import { testWithSynpress } from '@synthetixio/synpress';
import { metaMaskFixtures } from '@synthetixio/synpress/playwright';
import basicSetup from '../wallet-setup/basic.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));

const { expect } = test;

test('should load the homepage and show connect button', async ({
    page,
}) => {
    // Navigate to homepage
    await page.goto('/');

    // Check that the page loaded
    await expect(page).toHaveTitle(/P2E Inferno/i);

    // Look for a connect wallet button (adjust selector based on your actual UI)
    const connectButton = page.locator('button:has-text("Connect"), button:has-text("Connect wallet")').first();
    await expect(connectButton).toBeVisible();

    console.log('✅ Homepage loaded successfully with connect button visible');
});

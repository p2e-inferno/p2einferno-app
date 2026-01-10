import { testWithSynpress } from "@synthetixio/synpress";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress/playwright";
import basicSetup from "../wallet-setup/basic.setup";

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;

async function clickFirstMatching(
  page: any,
  labels: RegExp[],
) {
  for (const label of labels) {
    const locator = page.getByRole("button", { name: label }).first();
    if (await locator.count()) {
      await locator.click();
      return;
    }
  }
  throw new Error(`No matching button found: ${labels.map(String).join(", ")}`);
}

test("lobby connects via Privy + MetaMask", async ({
  context,
  page,
  metamaskPage,
  extensionId,
}) => {
  const metamask = new MetaMask(
    context,
    metamaskPage,
    basicSetup.walletPassword,
    extensionId,
  );

  await page.goto("/lobby");

  // If we're already authenticated, the LobbyLayout will render the real lobby shell.
  const alreadyInLobby = await page
    .getByText("Infernal Lobby", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);

  if (!alreadyInLobby) {
    // Not-authenticated state: LobbyLayout renders LobbyConnectWalletState.
    await expect(
      page.getByRole("heading", { name: /welcome to the/i }),
    ).toBeVisible();

    const connectButton = page.getByRole("button", { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
    await expect(connectButton).toBeEnabled();

    await connectButton.click();

    // Privy login modal (in-DOM) should appear.
    await expect(
      page.getByRole("heading", { name: /log in or sign up/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Choose "Continue with a wallet" then pick MetaMask.
    await clickFirstMatching(page, [/continue with a wallet/i]);
    await clickFirstMatching(page, [/metamask/i, /browser wallet/i, /injected/i]);

    // MetaMask should prompt to connect to the dapp.
    await metamask.connectToDapp();

    // Privy typically requests a signature to authenticate.
    // If no signature request appears (e.g. already connected), this is a no-op.
    try {
      await metamask.confirmSignature();
    } catch {
      // ignore
    }

    // Wait for lobby shell to show up.
    await expect(page.getByText("Infernal Lobby", { exact: false })).toBeVisible(
      { timeout: 30_000 },
    );
  }
});

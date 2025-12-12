# Synpress E2E Testing Setup

## Overview
Successfully integrated **Synpress v4** for end-to-end testing of Web3 wallet interactions with MetaMask. Configuration follows official Synpress documentation patterns.

## Configuration Files

### 1. Playwright Configuration
**File:** [`playwright.config.ts`](file:///Users/applemac/Documents/projects/p2einferno-app/playwright.config.ts)

```typescript
export default defineConfig({
    testDir: './tests/e2e',
    use: {
        baseURL: 'http://localhost:3000',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
```

### 2. Wallet Setup File
**File:** [`tests/wallet-setup/basic.setup.ts`](file:///Users/applemac/Documents/projects/p2einferno-app/tests/wallet-setup/basic.setup.ts)

Defines MetaMask wallet configuration using test mnemonic and password.

### 3. Example E2E Test
**File:** [`tests/e2e/example.spec.ts`](file:///Users/applemac/Documents/projects/p2einferno-app/tests/e2e/example.spec.ts)

Demonstrates homepage loading and wallet connection button verification.

## How to Run E2E Tests

### Step 1: Build Wallet Cache (One-Time Setup)
Before running tests, build the MetaMask wallet cache:

```bash
npx synpress ./tests/wallet-setup
```

This command:
- Downloads MetaMask extension (v11.9.1)
- Creates a cached browser context with wallet pre-configured
- Stores cache in `.cache-synpress/` directory

**Note:** This step only needs to be run once, or when wallet setup files change.

### Step 2: Run E2E Tests
```bash
npm run test:e2e
```

This will:
- Start the Next.js dev server automatically
- Run Playwright tests with MetaMask extension loaded
- Use the cached wallet setup

## Troubleshooting

### Cache Hash Mismatch Error
```
Error: Cache for [hash] does not exist. Create it first!
```

**Root Cause:** This is a known Synpress issue (#1103) where the CLI generates a different hash than Playwright runtime expects.

**Solution:** Rename the cached wallet folder to match the expected hash:
```bash
# 1. Build cache
npx synpress ./tests/wallet-setup

# 2. Note the hash in .cache-synpress/ (e.g., 532f685e346606c2a803)

# 3. Run test to see expected hash in error (e.g., 08a20e3c7fc77e6ae298)

# 4. Rename the folder
mv .cache-synpress/[cli-hash] .cache-synpress/[expected-hash]
```

### MetaMask Download Timeout (504 Error)
```
Error downloading the file - [Axios] Request failed with status code 504
```

**Causes:**
- Network connectivity issues
- GitHub releases API rate limiting
- Temporary GitHub outage

**Solutions:**
1. Wait a few minutes and retry
2. Check internet connection
3. Try using a VPN if behind corporate firewall
4. Download MetaMask manually and place in cache directory

### Test File Import Errors
Ensure test files import the wallet setup:
```typescript
import basicSetup from '../wallet-setup/basic.setup';
const test = testWithSynpress(metaMaskFixtures(basicSetup));
```

## Key Synpress Concepts

### Wallet Cache
- Synpress caches browser contexts with pre-configured wallets
- Each unique wallet setup gets a unique hash
- Cache significantly speeds up test execution
- Located in `.cache-synpress/` (git-ignored)

### Test Fixtures
Available fixtures in tests:
- `context`: Playwright browser context
- `page`: Main application page
- `metamaskPage`: MetaMask extension page
- `extensionId`: MetaMask extension ID
- `metamask`: MetaMask controller instance

### Wallet Setup Function
The `defineWalletSetup` function:
- Takes a password and async setup function
- Runs once to configure wallet state
- Can import wallets, add networks, change settings
- **Cannot** send transactions (blockchain state must remain clean)

## Next Steps

1. **Expand Test Coverage:**
   - Add wallet connection flow tests
   - Test transaction signing
   - Test network switching

2. **Create Additional Wallet Setups:**
   - `connected.setup.ts`: Pre-connected to dApp
   - `multi-network.setup.ts`: Multiple networks configured

3. **CI Integration:**
   - Add E2E tests to GitHub Actions
   - Use `--headless` flag for CI environments
   - Cache `.cache-synpress` directory for faster CI runs

## References
- [Synpress Documentation](https://docs.synpress.io/)
- [Wallet Cache Guide](https://docs.synpress.io/docs/guides/wallet-cache)
- [Playwright Integration](https://docs.synpress.io/docs/guides/playwright)
- [MetaMask API Reference](https://docs.synpress.io/api-reference/playwright/classes/MetaMask)

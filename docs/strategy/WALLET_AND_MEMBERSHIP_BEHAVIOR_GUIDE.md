# P2E Inferno Wallet and Membership Behavior Guide

> Last Updated: March 10, 2026
> Purpose: Support-safe reference for how wallet selection, linked wallets, membership checks, and wallet ownership guards work in the current app implementation.

## Why This Document Exists

Users commonly get confused about:

- embedded wallet vs external wallet behavior
- when the app checks the current wallet vs any linked wallet
- why a membership NFT on one wallet unlocks some features but not others
- why Privy can show a wallet as linked while the app still rejects it

This guide explains the actual behavior implemented in the app so support, product, and AI-assisted help can answer consistently.

## Core Mental Model

There are three separate ideas that users often mix together:

### 1. Linked wallet

A linked wallet is any wallet attached to the user's Privy account.

### 2. Active wallet

The active wallet is the wallet the app is currently using for wallet-dependent actions. The app does not simply pick any browser wallet. It chooses from wallets that are linked to the user's Privy account.

### 3. Wallet holding the NFT or membership

Some checks care about whether any linked wallet holds a valid NFT or key. Other actions require the exact wallet performing the action to hold the NFT or key.

That distinction is the source of most user confusion.

## How Wallet Selection Works

The app uses a shared wallet-selection rule:

1. Prefer a linked external wallet that is currently available on the device.
2. If no linked external wallet is available, fall back to the embedded Privy wallet.
3. Never intentionally use an unlinked browser wallet.

This means:

- if a user linked MetaMask but opens the app on a device where that wallet is unavailable, the app can fall back to the embedded wallet
- the app may show a fallback notice when this happens
- this is expected behavior, not a bug

## Embedded Wallet vs External Wallet

### Embedded wallet

The embedded wallet is the wallet managed inside the Privy account experience. It is always the most reliable fallback because it is available anywhere the user is signed in.

### External wallet

An external wallet is a user-controlled wallet such as MetaMask or another injected wallet. The app prefers it when it is both linked and actually available on the current device.

### Practical implication

A user may have an external wallet linked to their account, but if that wallet is not currently available in the browser or device session, the app can operate from the embedded wallet instead.

## Linked Accounts Page Behavior

On the profile page:

- linked external wallets can be displayed and unlinked
- the embedded wallet is treated differently and is not presented as a normal unlinkable external wallet
- if multiple external wallets are linked, the UI highlights the wallet currently in use and can show others in a dropdown

This page is informational. It does not by itself guarantee that every linked wallet is usable for every feature.

## The Rule That Matters Most

Some features use:

- any linked wallet has the required NFT or verification

Other features use:

- the current active wallet must hold the NFT or key because that wallet is the one signing or transacting

Support should always identify which of those two models applies before advising the user.

## Feature-by-Feature Behavior

## DG Vendor / DG Market

The vendor has two separate gates:

### Gate 1: GoodDollar verification

GoodDollar verification is treated at the user level across linked wallets.

If any linked wallet is verified, the user is treated as verified for vendor access.

### Gate 2: Vendor membership key

The vendor checks membership across all linked wallets, but trading is only allowed when the active wallet itself has the vendor key.

That means:

- if the active wallet holds the key, the user can trade
- if another linked wallet holds the key but the active wallet does not, the app can detect that a linked wallet has access, but the user still needs to switch to the wallet that actually holds the key before trading

Support guidance:

- "Verified but cannot trade" often means GoodDollar passed, but the active wallet does not hold the vendor key
- "Another wallet on this account has access" means the user needs to switch to the linked wallet that actually holds the membership key

## DG Nation Membership Status and Renewal

The subscription card checks for DG Nation membership across linked wallets, but renewal behavior is stricter.

### Status display

If the active wallet has the membership key, the card shows normal membership status and renewal options.

If another linked wallet has the membership key, the card shows that membership exists on another linked wallet and tells the user to switch to that wallet to view status and renew.

### Crypto purchase

If the current wallet does not have membership, the user can purchase membership for the current wallet.

### Crypto renewal

Renewing an existing membership is tied to the wallet that actually owns the key being extended.

If membership exists only on another linked wallet, the user must switch to that wallet to renew the existing membership. The app does not treat "another linked wallet has a key" as sufficient for renewing from the current wallet.

### XP renewal

XP renewal is also tied to the wallet the backend identifies for the authenticated session when checking the current DG Nation key. It should be treated as renewal of the membership on the wallet that already owns the active key, not as a generic "renew any linked wallet" action.

Support guidance:

- if the user sees "membership found on another linked wallet," tell them to switch to that wallet to renew the existing membership
- if they want membership on the current wallet instead, they may need to purchase membership for that wallet rather than renew the other wallet's key

## DG Pullout / Withdrawal

Withdrawal is more permissive than vendor trading.

For pullout:

- the signing wallet must belong to the authenticated user's linked wallets
- the app validates that wallet ownership against Privy
- the app also enforces the internal wallet-link guard
- DG Nation membership is checked across all linked wallets, not only the signing wallet

That means a user can pass the membership requirement if any linked wallet has the valid DG Nation key, even if the wallet used to sign the withdrawal is a different linked wallet on the same account.

Support guidance:

- withdrawal failure is not automatically because the NFT is on a different linked wallet
- first check whether the signing wallet is linked to the same account
- then check whether at least one linked wallet has DG Nation membership
- then check XP balance and withdrawal limits

## Quest and Prerequisite Checks

Some quest and prerequisite checks also evaluate key ownership across linked wallets rather than only the current wallet.

This is intentional where the product treats access as belonging to the user account context rather than to a single currently selected wallet.

## GoodDollar Verification Behavior

GoodDollar verification is treated as a user-level status across linked wallets:

- if any linked wallet is verified, the user is treated as verified
- the app reconciles that on-chain status back into app state

However, the app also enforces ownership rules:

- one verified wallet cannot be reused to verify a different app account
- one app account cannot keep switching between multiple verified wallets as if they were all the same verification identity

So a wallet can be GoodDollar-verified on-chain and still be blocked at the app level if it conflicts with the app's ownership rules.

## Why Privy Can Show Linked But the App Still Rejects the Wallet

This is one of the most important support cases.

The app does not trust a linked wallet only because Privy says it is linked right now. It also maintains an internal wallet ownership guard so a wallet cannot silently move between different app accounts.

### What the app enforces

For guarded flows, the app checks:

1. the wallet is currently linked to the authenticated Privy account
2. the wallet is allowed under the app's immutable wallet-to-user mapping

If a wallet was previously claimed by a different app account, the app can reject it even if Privy currently shows it as linked to the new account.

### Why this exists

This prevents account confusion, replay, and cross-account wallet reassignment problems.

### What the user sees

The user may experience:

- Privy says the wallet is linked
- the app says the wallet cannot be used with this account

That is not a contradiction. It means the wallet passed the current Privy link check but failed the app-level ownership guard.

### Support guidance

When this happens, tell the user:

- the wallet is already associated with another app account in this app's records
- they need to reconnect that wallet to the original account, or use the correct original account, or contact support for account recovery handling

Do not describe this as a simple UI sync issue.

## Troubleshooting Matrix

### User can access some areas but cannot trade on the vendor

Most likely cause:

- GoodDollar verification passed at the account level
- vendor key exists on another linked wallet
- active wallet does not hold the vendor key

### User can pull out DG even though the active wallet does not hold the NFT

This can be expected.

Reason:

- withdrawal membership check is account-wide across linked wallets
- the signing wallet only needs to be a valid linked wallet on the same account

### User cannot renew membership from the current wallet

Most likely cause:

- the membership key exists on a different linked wallet
- renewal must be done from the wallet that actually holds the existing membership key

### User linked a wallet in Privy but app rejects it

Most likely cause:

- the wallet is already mapped to another app account in the app's wallet-link guard

### User is verified in GoodDollar but app still blocks access

Possible cause:

- the wallet conflicts with the app's verification ownership mapping
- the verified wallet is already tied to another user or the user already has a different verified wallet locked to the account

## Support Summary

When investigating wallet-related access issues, support should ask these questions in order:

1. Which wallet is currently active in the app?
2. Which wallets are linked to the user's Privy account?
3. Which linked wallet actually holds the NFT, key, or verification?
4. Is this feature checking any linked wallet, or the active wallet only?
5. Is the wallet failing because of the app's ownership guard rather than because of Privy linking itself?

If support keeps those five questions separate, most wallet confusion cases become straightforward to resolve.

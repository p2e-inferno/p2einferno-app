# P2E Inferno Wallets, Membership, and Access Playbook

> Last Updated: March 11, 2026
> Purpose: A practical guide for choosing the right wallet setup, understanding how access works, and avoiding the most common wallet and membership mistakes in P2E Inferno.

## Who This Is For

This playbook is for:

- users deciding whether to use an embedded wallet, an external wallet, or both
- users confused about why a feature works in one place but not another
- support or AI assistants helping users with membership, renewal, vendor, or pullout issues

This is the action-oriented companion to the deeper wallet behavior reference documentation.

## The One Rule To Remember

In P2E Inferno, these are not the same thing:

- a wallet that is linked
- the wallet that is active right now
- the wallet that actually holds the NFT or membership key

Most wallet confusion comes from mixing those three up.

## The Three Wallet Questions

Before troubleshooting any access issue, ask:

1. Which wallets are linked to the account?
2. Which wallet is active right now?
3. Which wallet actually holds the NFT, key, or verification status?

If those three answers are clear, most access problems become straightforward.

## Embedded Wallet vs External Wallet

## Embedded wallet

The embedded wallet is the wallet managed through the Privy account experience.

It is useful because:

- it is the most portable fallback
- it can work even when an external wallet is unavailable on the current device
- it reduces setup friction for new users

It is often the best starting wallet for users who want simplicity.

## External wallet

An external wallet is a wallet such as MetaMask or another user-controlled wallet available on the current device.

It is useful because:

- users may already keep assets or memberships there
- it gives a familiar Web3 workflow
- it is often the preferred wallet when it is linked and available

It is often the better choice for users who already have an established wallet setup.

## How the App Chooses a Wallet

The app does not blindly use any browser wallet it sees.

It follows a safer rule:

1. prefer a linked external wallet that is actually available on the device
2. otherwise fall back to the embedded wallet
3. do not intentionally use an unlinked wallet

This means:

- a linked MetaMask wallet may not be used if MetaMask is not available on the current device
- the app may fall back to the embedded wallet in that situation
- this is normal behavior, not random switching

## What Setup Is Best For Most Users

## Best simple setup

For users who want the easiest path:

- keep the embedded wallet available
- link one external wallet only if there is a clear reason to use it

This gives flexibility without too much confusion.

## Best setup for users with existing assets or memberships

If a user already holds:

- a membership key
- important tokens
- a verified identity flow

on an external wallet, then that wallet should usually stay linked and be treated as the primary action wallet for the relevant features.

## Best setup for advanced users

Advanced users can safely use:

- embedded wallet as fallback
- external wallet for primary onchain participation

But they need to remember that some actions depend on the active wallet, not just the linked account set.

## When Wallet Location Matters

This is the most important practical distinction.

## Some features check any linked wallet

These features behave more like account-level access.

In those cases, the app may allow progress if any linked wallet on the account satisfies the requirement.

## Some features require the active wallet itself

These features behave more like wallet-specific access.

In those cases, the app needs the currently active wallet to be the wallet that actually holds the NFT or key.

The user experience changes depending on which model a feature uses.

## Feature Guide

## Vendor / DG Market

Vendor access involves two separate checks:

### GoodDollar verification

GoodDollar verification is treated at the account level across linked wallets.

If any linked wallet is verified, that part of vendor access can pass.

### Vendor membership key

Vendor membership is stricter.

The app can detect whether another linked wallet holds the required key, but actual vendor actions depend on the active wallet being the wallet that holds the key.

This affects:

- buy
- sell
- light up
- stage upgrade

Best practice:

- if a user wants to use vendor actions, switch to the wallet that actually holds the vendor membership key

## DG Nation Membership Status

The membership status UI can detect membership across linked wallets.

That means the app may tell the user:

- membership exists on another linked wallet

This is helpful, but it does not mean every action can proceed from the current wallet.

Best practice:

- if the user wants to view or manage the existing membership cleanly, switch to the wallet that actually holds it

## Membership Purchase

If the current wallet does not have membership, the user can often purchase membership for the current wallet.

This is usually the right move when the user wants:

- a clean setup on the wallet they are actively using now

Best practice:

- if the user wants continuity with an existing membership, switch wallets
- if the user wants fresh access on the current wallet, purchase membership for that wallet

## Membership Renewal

Renewal is stricter than initial purchase.

Renewing an existing membership is tied to the wallet that actually owns the membership key being extended.

Best practice:

- renew from the wallet that already holds the key

If the user sees:

- membership found on another linked wallet

the correct advice is usually:

- switch to that wallet to renew the existing membership

## Pullout / Withdrawal

Withdrawal is more flexible than vendor trading.

For pullout:

- the signing wallet must be linked to the authenticated account
- the app validates wallet ownership
- DG Nation membership can be satisfied across linked wallets
- xDG balance and limits still matter

This means:

- a user may still be allowed to pull out DG even if the active wallet does not hold the membership NFT, as long as another linked wallet on the same account does

Best practice:

- if withdrawal fails, check all of these:
  - is the signing wallet linked
  - does any linked wallet hold DG Nation membership
- does the user have enough xDG
  - is the requested amount within the limit

## Stage Upgrade

Vendor stage upgrade is wallet-specific in practice.

The current wallet needs:

- valid membership on that wallet
- enough points
- enough fuel

If the membership is on another linked wallet, the user may see a hint that the key exists elsewhere, but they still need to switch wallets or obtain membership on the current wallet.

## GoodDollar Verification

GoodDollar verification is treated more like account-level identity status across linked wallets.

However, the app still enforces ownership integrity:

- one verified wallet cannot simply be reused across multiple app accounts
- one account cannot freely rotate between multiple conflicting verified wallet identities

Best practice:

- use a stable wallet identity for verification-related flows
- do not assume that on-chain verification alone overrides app-level ownership rules

## How To Choose the Right Wallet for the Job

## Use the embedded wallet when:

- you want the lowest-friction setup
- you need a reliable fallback across devices
- you do not already have critical memberships or assets elsewhere

## Use the external wallet when:

- it already holds the membership you need
- it is the wallet you intend to use for vendor actions
- it is your established Web3 identity

## Use both when:

- you want resilience and fallback
- you understand that active wallet and key-holding wallet can diverge
- you are comfortable managing that distinction

## Common Mistakes To Avoid

## 1. Assuming linked means active

A wallet can be linked but not currently active in the app.

## 2. Assuming any linked wallet can perform every action

Some actions care only that the account has access somewhere. Others require the active wallet itself to hold the key.

## 3. Renewing from the wrong wallet

If the membership lives on another linked wallet, the safest renewal path is to switch to that wallet.

## 4. Ignoring the linked-wallet ownership guard

Privy can show a wallet as linked, but the app can still reject it if that wallet is already bound to another app account in the app's ownership mapping.

## 5. Treating pullout rules as identical to vendor rules

They are not the same.

Withdrawal can pass with membership on any linked wallet, while vendor actions usually require the active key-holding wallet.

## A Good Decision Guide

If the user is unsure what to do, use this logic:

### I just want the easiest setup

- use the embedded wallet first
- link an external wallet only if needed later

### I already own the membership on an external wallet

- link that wallet
- switch to it when using membership-dependent features

### I want to trade or level up in the vendor

- make sure the active wallet is the wallet holding the vendor membership key

### I want to pull out DG

- make sure the signing wallet is linked
- confirm at least one linked wallet has DG Nation membership
- confirm xDG and limits are satisfied

### I see “wallet linked” in Privy but the app rejects it

- treat this as an ownership conflict case, not just a wallet-connection issue

## Support Summary

The best support approach is:

1. identify the active wallet
2. identify all linked wallets
3. identify where the NFT or key actually lives
4. identify whether this feature is account-wide or wallet-specific
5. only then advise the user to switch, renew, purchase, or relink

That order prevents most incorrect support guidance.

## Short Version

The best wallet setup in P2E Inferno is the one that matches the job:

- embedded wallet for simplicity and fallback
- external wallet for established identity or key-holding actions
- both together for flexibility, if the user understands the difference

Most access issues are solved by answering one question clearly:

**Does this feature care about any linked wallet, or the active wallet specifically?**

# Unlock Protocol in P2E Inferno Playbook

> Last Updated: March 18, 2026
> Purpose: A practical guide to what Unlock Protocol is, the common use cases it supports, and how P2E Inferno uses it for memberships, access, and renewals.

## Who This Is For

This playbook is for:

- users asking what Unlock Protocol is
- users confused about why memberships, renewals, or access checks behave the way they do
- support or AI assistants explaining wallet, membership, renewal, or access flows in plain language

This document is intentionally user-safe. It explains product behavior and protocol concepts without exposing sensitive internal admin or security operations.

## What Unlock Protocol Is

Unlock Protocol is an onchain membership and subscription protocol.

In simple terms:

- a **Lock** is a smart contract that issues memberships
- a **Key** is the NFT membership issued by that lock
- a key can include an expiration date, so it can behave more like a time-based membership or subscription than a typical collectible NFT

That matters because many NFT systems are good at proving ownership, but not at handling ongoing membership state cleanly over time.

Unlock is specifically designed for use cases like:

- memberships
- subscriptions
- token-gated or NFT-gated access
- event or community access
- event ticketing and onchain RSVPs
- certifications or credential-like experiences
- recurring or renewable access models

## Why Unlock Is Useful

Unlock is useful when a product needs more than a simple one-time NFT.

It is built for cases where a project wants to manage things like:

- whether a membership is currently valid
- whether a key has expired
- whether a membership can be renewed
- whether access depends on the current wallet holding a valid key

This makes it a strong fit for products that want onchain access control without building a custom membership system from scratch.

## Unlock DAO and governance

Unlock Protocol is not just a product maintained by one company. It also has a governance layer.

At a practical level:

- Unlock DAO is the community of governance token holders who govern the protocol
- the current governance token is **UP**
- UP is on **Base**
- UP replaced the older **UDT** governance token model

Governance happens in a few layers:

- community discussion in public channels and forums
- offchain signaling through Snapshot-style voting
- onchain governance for executable protocol proposals

In simple terms, that means protocol changes are not supposed to depend only on Unlock Labs deciding everything privately. The governance design is meant to let the DAO discuss, vote on, and execute protocol-level decisions.

For support or AI explanations, the safest short version is:

Unlock Protocol is governed by Unlock DAO, whose governance token is UP on Base. Community discussions can happen offchain, while executable protocol changes are handled through onchain governance.

## Why this matters for P2E Inferno users

Most P2E Inferno users do not need to understand DAO governance in detail to use the app.

But it can still be useful to know that:

- Unlock is a live protocol with a real governance system
- memberships and access behavior come from a protocol with its own rules and upgrade path
- protocol-level governance is separate from app-level support decisions inside P2E Inferno

That helps explain why Unlock should be understood as infrastructure, not as a P2E Inferno-only feature.

## Unlock as an event ticketing option

Unlock is also widely used as an event ticketing and RSVP system.

In practice, that means teams can use it to:

- create an event page
- issue onchain tickets or RSVP credentials
- scan or verify attendance
- gate access to online or in-person events
- connect attendance with wallet-based identity and follow-on experiences

This matters because Unlock is not only for subscriptions or memberships. It is also a practical option for communities, conferences, meetups, and branded activations that want ticketing and access to happen onchain.

Unlock also has a current event product experience often described as **Events by Unlock Labs**, which focuses on fast event-page creation, ticketing, and attendance flows.

Recent public examples in the Unlock ecosystem show this clearly. Unlock has been used for event flows and ticketing around conference and community experiences such as:

- FarCon-related event ticketing
- PizzaDAO and other community event activations
- DappCon and other ecosystem events
- educational, meetup, and creator-focused event experiences

So when a user asks whether Unlock is only a membership tool, the answer is no. It is commonly used both for ongoing access and for event ticketing.

## Important Unlock Terms

## Lock

A lock is the membership smart contract.

Think of it as the source of truth for a specific access system.

## Key

A key is the NFT membership issued by a lock.

In Unlock, a key is not just a collectible. It can represent active access that expires, renews, or unlocks specific behavior in an app.

## Valid key

A valid key means the membership is still active according to the lock.

If the key is expired, the user may still own the NFT, but the app can treat the membership as inactive.

## Renewal

Renewal extends the validity period of an existing key.

No brand-new membership NFT needs to be created for a standard renewal flow. The existing key can simply be extended.

## How P2E Inferno Uses Unlock Protocol

P2E Inferno uses Unlock as part of its membership and access layer.

The most important product-level uses are:

- DG Nation membership and related access checks
- membership renewal behavior
- membership-aware wallet and linked-wallet behavior
- feature gating in areas where access depends on valid membership state

P2E Inferno currently uses Unlock mainly for membership and access behavior, not as the main user-facing ticketing layer described in this playbook's broader Unlock examples.

## DG Nation membership

P2E Inferno uses an Unlock lock for DG Nation membership.

At a practical level, this means:

- membership status is tied to ownership of a valid key
- some parts of the app care whether a user has membership somewhere on a linked account set
- some actions care whether the currently active wallet is the one that actually holds the key

This is why a user can sometimes see that membership exists, but still hit friction in a specific flow.

## Renewals

P2E Inferno supports membership renewal flows that depend on the existing membership key.

In practical terms:

- renewal is tied to the existing key being extended
- renewal behavior is stricter than broad account-level membership detection
- the wallet holding the renewable key often matters

This is one reason support guidance should not treat "membership exists somewhere" as meaning every membership action will work from every wallet.

## Wallet and access behavior

Unlock itself tracks membership state onchain, but the app experience depends on wallet context too.

Inside P2E Inferno, these are not always the same:

- a linked wallet
- the currently active wallet
- the wallet that actually holds the membership key

That distinction explains many common user questions around:

- why a membership badge appears
- why renewal may fail from one wallet but succeed from another
- why a membership-gated action may still require switching wallets

## Feature gating

Unlock-backed membership is part of how P2E Inferno decides whether certain experiences should open up for a user.

Depending on the feature, the app may check:

- whether any linked wallet satisfies a membership requirement
- whether the active wallet itself holds the required key
- whether the membership is still valid and not expired

This is especially relevant in areas involving:

- DG Nation membership
- vendor-related membership behavior
- renewal and access continuity
- wallet-sensitive user journeys

## What Support or AI Should Say

When a user asks what Unlock Protocol is, the safest short explanation is:

Unlock Protocol is the onchain membership system behind some access and renewal behavior in P2E Inferno. It uses membership NFTs called keys, issued by lock contracts, to track whether access is active, expired, or renewable. More broadly, Unlock is also used across web3 for memberships, subscriptions, and event ticketing.

When a user asks how P2E Inferno uses it, the safest short explanation is:

P2E Inferno uses Unlock to power membership-style access, especially DG Nation membership, renewal flows, and some wallet-sensitive access checks. In practice, that means the app may look at whether a valid membership key exists and which wallet actually holds it.

When a user asks what Unlock DAO is, the safest short explanation is:

Unlock DAO is the governance community behind Unlock Protocol. The current governance token is UP on Base, and the DAO participates in protocol decisions through discussion, voting, and onchain governance processes.

## Common User Questions

## "Is Unlock Protocol the same thing as my wallet?"

No.

The wallet is how the user signs and holds assets.
Unlock is the membership system whose lock contracts issue the membership key NFTs.

## "Is Unlock Protocol just for memberships?"

No.

Memberships are one of its core uses, but Unlock is also used for subscriptions, token-gated access, and event ticketing.

## "What is Unlock DAO?"

Unlock DAO is the governance community for Unlock Protocol.

The short version is:

- UP token holders participate in governance
- governance now centers on UP on Base
- protocol decisions can be discussed offchain and executed onchain

## "Does P2E Inferno use the DAO directly?"

Not in the day-to-day sense most users mean.

P2E Inferno uses Unlock as protocol infrastructure for membership and access behavior. That is different from a user participating in Unlock DAO governance directly.

## "If I own the NFT, why does access not work?"

Owning the NFT is not always enough by itself.

The app may also care about:

- whether the key is still valid and unexpired
- whether the active wallet is the one holding it
- whether the feature checks linked-wallet state or active-wallet state

## "Does renewal create a new membership?"

Usually no.

Renewal normally extends the existing key rather than minting an entirely new membership NFT for the same access.

## "Why does the app say I have membership somewhere else?"

Because P2E Inferno can sometimes detect membership across linked wallets.

That does not mean every feature will work from the current wallet. Some flows still depend on the active wallet holding the key directly.

## What This Playbook Does Not Cover

This playbook does not document:

- sensitive internal admin workflows
- privileged contract-management operations
- internal security controls
- hidden operational procedures

If deeper operator-only behavior needs to be documented, that should live in internal engineering or ops documentation, not in the user-facing KB.

## Safe Summary

Unlock Protocol is the membership infrastructure layer behind important parts of P2E Inferno's access model.

In P2E Inferno, it is best understood as:

- the system that powers DG Nation-style membership keys
- part of the logic behind renewal and expiration behavior
- part of the reason wallet context matters for some gated experiences

If a user is confused about membership or access, the most useful next step is usually to clarify:

1. which wallet is active now
2. which wallet actually holds the membership key
3. whether the issue is about access, renewal, or a membership-gated action

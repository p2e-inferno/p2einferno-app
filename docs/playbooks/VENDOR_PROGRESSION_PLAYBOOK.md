# P2E Inferno Vendor Progression Playbook

> Last Updated: March 10, 2026
> Purpose: A practical guide to how the DG Token Vendor works as a progression system inside P2E Inferno. This playbook explains the core ideas behind the vendor, the user journey through membership and stages, and how vendor actions connect to the wider ecosystem.

## Who This Is For

This playbook is for:

- users who want to understand the DG Token Vendor beyond the swap interface
- support or AI assistants helping users who are blocked by membership, stage, or wallet issues
- anyone trying to understand how vendor participation fits into the broader app journey

This is not an admin or contract-management document.

It is a user and ecosystem progression document.

## What the Vendor Actually Is

The DG Token Vendor is not just a place to buy and sell tokens.

It is a structured progression system built around:

- gated access
- participation rules
- visible advancement
- incentives tied to action
- long-term engagement through stages

At a high level, the vendor exists to turn token interaction into a meaningful progression loop rather than a random or purely extractive experience.

In the wider P2E Inferno ecosystem, the vendor acts as:

- an economic engine
- a progression engine
- an access layer
- a behavioral reinforcement system

## The Core Philosophy

The vendor is designed around a simple idea:

**participation should be structured, visible, and earned**

Instead of treating token access as a flat feature, the vendor creates a journey:

- first get access
- then participate
- then accumulate progress resources
- then unlock deeper privileges through stage advancement

This makes the vendor more than a market. It becomes a gamified progression environment.

## The Main Building Blocks

The vendor revolves around a small number of concepts:

- membership access
- buying
- selling
- points
- fuel
- stages
- limits and thresholds

Those systems work together rather than independently.

## Membership Comes First

The vendor is membership-gated.

At the contract level, users need a valid key from a whitelisted collection in order to use core vendor functions like:

- buying
- selling
- light up
- stage upgrade

In the app, this means vendor participation begins with access.

If a user does not have valid vendor membership on the active wallet, they are not truly inside the vendor progression loop yet.

## Membership in the App

In the app implementation, vendor access has two important layers:

### 1. Verification layer

The DG Market UI requires GoodDollar verification.

This is treated account-wide across linked wallets. If any linked wallet is verified, the user is considered verified for vendor access.

### 2. Membership key layer

Vendor membership key logic is stricter.

The app can detect whether any linked wallet holds a valid vendor key, but actual vendor actions require the active wallet itself to be the key-holding wallet.

That means:

- another linked wallet holding the key may explain why the user “has access somewhere”
- but buying, selling, lighting up, and upgrading still depend on the wallet currently in use

This distinction is one of the most common sources of user confusion.

## The User Journey Through the Vendor

The intended journey looks like this:

1. gain valid access
2. make qualifying participation actions
3. accumulate points
4. light up to accumulate fuel
5. meet thresholds for the next stage
6. upgrade intentionally
7. repeat at a higher level with stronger privileges

This is what turns the vendor from a simple token interface into a progression path.

## Stages

The vendor uses three stages:

- **Pleb**
- **Hustler**
- **OG**

Each stage changes how the system behaves for the user.

As a user rises in stage, they gain better progression-related advantages such as:

- improved thresholds and reward logic
- better limits
- stronger participation status

Stage progression is not automatic.

Users must qualify for the next stage.

## Points

Points are primarily earned through qualifying buy activity.

A buy only contributes to stage progression if it meets the qualifying threshold for the user’s current stage.

That means not every buy is equally meaningful for progression.

The vendor is intentionally designed so that:

- participation matters
- thresholds matter
- strategic action matters

Points are one half of stage progression.

## Fuel

Fuel is the other half of stage progression.

Fuel is primarily gained through the **Light Up** action.

In practice, Light Up:

- burns tokens
- increases fuel
- supports stage advancement
- can also affect daily sell dynamics in the vendor model

Fuel matters because stage progression is not just about doing one kind of action repeatedly. It requires participation across the vendor system.

## Light Up

Light Up is one of the most important vendor-specific actions.

In the app, Light Up is treated as an intentional multi-step user action:

- the app loads the current burn configuration for the user’s current stage
- approval may be required first
- then the burn transaction is submitted

For a user, the practical meaning of Light Up is:

- sacrifice now to build progression capacity

It is not just another button. It is one of the mechanisms that makes the vendor progression loop deeper than simple buying and selling.

## Buying

Buying is more than token acquisition in this system.

It can also be a progression action.

Why it matters:

- buys can award points when they meet the stage-specific qualifying threshold
- points feed stage advancement
- buying is one of the clearest ways users move deeper into the vendor journey

In the app, buying also depends on:

- valid vendor configuration being loaded
- a valid active key-holding wallet
- sufficient balance
- minimum buy amount rules
- approval flow for token spending

## Selling

Selling is also part of progression, but it is more constrained than users may expect.

The vendor model includes:

- stage-based sell limits
- daily sell logic
- fuel interaction
- stronger constraints at higher-stakes moments
- OG-specific cooldown behavior on maximum-sized sales

So selling should not be thought of as a fully free extraction mechanic.

It is part of the rule-based system and is intentionally governed by progression-sensitive limits.

## Why the Vendor Is Not an Extractive System

The best way to understand the vendor is:

- it rewards participation
- it imposes structure
- it encourages long-term engagement
- it makes progression legible

The wrong way to understand it is:

- free access to immediate extraction

The system is explicitly built against that mindset by using:

- stage rules
- thresholds
- fuel requirements
- membership gating
- daily sell limits
- cooldowns

These are not accidental frictions. They are the design.

## How Stage Progression Works in Practice

At a user level, stage progression requires:

- the current active wallet has valid membership
- the vendor is not paused
- the user has enough points for the next stage
- the user has enough fuel for the next stage

Only when those conditions are true can the user upgrade.

In the app, the stage UI exposes this directly through:

- current stage
- current points
- current fuel
- progress to next stage
- blocked reasons when upgrade is not yet possible

This is useful because it makes progression visible instead of mysterious.

## Common Blocked States

## 1. Membership is on another linked wallet

This is one of the most common cases.

The app may detect:

- the account has vendor membership somewhere

but still block the action because:

- the active wallet does not hold that membership key

This often affects:

- buy
- sell
- light up
- upgrade stage

## 2. Verified but not eligible to act

A user may pass GoodDollar verification but still be blocked from vendor actions.

This usually means:

- verification passed at the account level
- but the active wallet does not hold the required vendor key

## 3. Insufficient points

The user may be active in the vendor but has not yet accumulated enough qualifying points for the next stage.

## 4. Insufficient fuel

The user may have enough points but not enough fuel.

This usually means they have not used Light Up enough to meet the next threshold.

## 5. Vendor paused

The vendor can be unavailable due to paused state.

This is not a user mistake. It is a system state issue.

## How Vendor Progression Connects to the Rest of the App

The vendor does not sit outside the app’s main progression story.

It connects back into the ecosystem through:

- membership-gated access
- wallet and identity flow
- quests that verify vendor actions like buy, sell, light up, and level up
- daily quest eligibility that can depend on vendor stage
- broader participation and status inside the user’s journey

This means vendor progression should be understood as:

- one powerful progression lane inside the broader P2E Inferno system

not:

- the only meaningful path in the app

## Vendor Actions Inside Quests

The quest system directly supports vendor-linked task types such as:

- vendor buy
- vendor sell
- vendor light up
- vendor level up

This matters because it turns vendor participation into:

- verifiable quest activity
- guided challenge-based progress
- a bridge between economic mechanics and structured user progression

So for many users, the vendor is not only explored through the vendor page. It is also encountered through quest-driven action.

## Vendor and Daily Quests

Daily quests can also depend on vendor progression.

For example, daily quest eligibility can evaluate:

- minimum vendor stage
- other requirements like verification, lock key ownership, or balances

That means vendor progression can quietly shape what a user is eligible to do in their recurring daily participation loop.

This is one of the clearest examples of why the vendor matters as part of the app ecosystem rather than as a standalone market.

## A Healthy Vendor Strategy

For most users, the healthiest approach to the vendor is:

1. understand access first
2. confirm the correct wallet is active
3. learn what stage you are in
4. make qualifying actions intentionally
5. treat points and fuel as progression resources, not random stats
6. upgrade only when you clearly understand what it unlocks

This leads to better outcomes than treating the vendor as a place to click around without understanding the system.

## What New Users Should Not Do

Users should avoid:

- assuming any linked wallet is interchangeable with the active wallet
- treating vendor membership as globally usable from every wallet context
- focusing only on selling without understanding stage and daily limit rules
- ignoring Light Up and then wondering why stage progression stalls
- assuming verification alone equals full vendor readiness

## Support Guidance

When helping a user with vendor issues, support should ask:

1. Is the user GoodDollar verified?
2. Which wallet is active right now?
3. Does that active wallet hold the vendor membership key?
4. Is the user blocked by access, points, fuel, or pause state?
5. Is the user trying to trade, light up, or upgrade from the wrong wallet?

Those five questions resolve most vendor-related confusion quickly.

## Short Version

The DG Token Vendor is a membership-gated progression system built around:

- access
- participation
- points
- fuel
- stages
- rule-based advancement

Users progress best when they:

1. use the correct wallet
2. understand the membership gate
3. make qualifying actions intentionally
4. build both points and fuel
5. treat stage upgrades as earned progression, not automatic entitlement

That is how the vendor creates real long-term value inside P2E Inferno.

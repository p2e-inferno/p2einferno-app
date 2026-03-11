# Rewards, Renewal, and Pullout Playbook

## Purpose

This playbook explains how rewards, membership renewal, and DG pullout fit together in P2E Inferno. It is meant to help users and support teams understand the difference between building value in the app, maintaining access, and realizing rewards without confusing these as the same action.

## Who This Is For

- Users trying to understand what xDG, DG, and membership actually do
- Users deciding whether they should renew, keep progressing, or pull out DG
- Support teams helping users who are confused about wallet, membership, or withdrawal behavior

## Core Principle

P2E Inferno is designed around meaningful participation. Rewards are part of the ecosystem, but they are not the whole point of it. The strongest path through the platform is:

learn -> participate -> prove work -> earn progression -> maintain access -> realize value intentionally

This means:

- rewards should reinforce progress, not replace it
- renewal is about continuity and staying active in the ecosystem
- pullout is a gated action, not the default goal of participation

## The Three Value Layers

### 1. xDG and earned progression

xDG is the platform's branded term for earned value inside the app. It is connected to activity, proof of work, progression, and continued participation. In practical terms, xDG is one of the ways users see that their effort inside the ecosystem has produced something meaningful.

xDG is not just a score. It can also matter operationally, including for renewal and pullout flows.

### xDG vs DG

This is one of the most important distinctions for support to explain clearly.

In practical app terms:

- xDG refers to the in-app earned balance and progression side
- DG refers to the token side users are trying to realize, withdraw, trade, or talk about more directly

They are related, but they are not interchangeable.

The cleanest mental model is:

- xDG lives in the app domain
- DG lives in the blockchain wallet domain once it has been pulled out

Until pullout happens, the user should not expect xDG to appear as wallet-held DG.

Support should treat xDG as:

- earned value inside the app's progression system
- something that can be used in flows like xDG renewal
- the balance logic that matters for pullout eligibility

Support should treat DG as:

- the token outcome users usually have in mind when they talk about withdrawal or realized reward
- the asset involved more directly in pullout and token-oriented conversations
- something users may also encounter through vendor-related language and market behavior

The simplest safe explanation is:

- xDG is the app-side earned value state
- DG is the realized token side
- the app connects them, but they should not be described as identical

### The custody boundary

Pullout is the boundary between:

- in-app earned value
- user-controlled wallet-held token value

Before pullout:

- a user may see xDG in their profile
- that value is still in the app domain
- it is not yet wallet-held DG under the user's direct custody

After pullout:

- the eligible value is processed through the withdrawal flow
- DG is transferred on-chain
- the user can then see the DG token in the wallet that received it

This is the key answer to a very common support question:

- "Why do I see 5000 xDG in my profile but 0 DG in my wallet?"

The correct answer is:

- the 5000 xDG is still in the app domain
- it has not yet crossed the pullout boundary into the blockchain wallet domain
- until the user completes a successful pullout, it should not be expected to appear as DG in the wallet

### Why users get confused

Users often collapse all reward language into "DG" because that is the token they recognize most easily.

That creates recurring confusion such as:

- "I earned DG already, so why can I not withdraw it?"
- "Is my xDG the same as DG?"
- "Why does renewal use xDG but pullout talks about DG?"

The correct support position is:

- the app uses different value layers for progression and realization
- xDG is part of the progression layer
- DG is part of the realized token layer
- a user can have meaningful earned value in the app without that meaning every reward concept is already DG in the same sense

### 2. Membership and continuity

Membership is what keeps a user in the active access layer of the ecosystem. It can affect what the user can do in the app and whether they can access vendor-linked or gated features.

Renewal exists because access continuity matters. A user who wants to keep operating smoothly should think about renewal before access lapses, not only after something stops working.

### 3. Pullout as realized value

Pullout is the action that lets a user convert eligible in-app value into DG through the app's withdrawal flow. This is intentionally more controlled than normal participation and includes membership, wallet, balance, and limit checks.

Pullout should be understood as a valid but deliberate action, not as the main measure of success in the app.

## How Rewards Fit Into the Ecosystem

The app is built so different systems reinforce each other:

- bootcamps and milestones help users learn and prove work
- quests and daily quests reinforce consistency and action
- vendor-linked mechanics reinforce progression and access
- rewards acknowledge participation and progress
- renewal helps users preserve continuity
- pullout gives users a controlled way to realize part of that value

This means a healthy user journey is not "earn as fast as possible and exit." It is closer to:

- get oriented
- participate meaningfully
- build a track record
- use rewards intelligently
- renew when continuity matters
- pull out only when it fits the user's broader goals

## Renewal

### What renewal is

Renewal extends an existing membership. It is not the same thing as first-time access purchase.

In the current implementation:

- initial purchase is handled separately
- renewal supports crypto
- renewal also supports xDG
- Paystack is not currently available as a renewal path

### What xDG renewal is

xDG renewal allows a user to extend an existing membership using xDG rather than only using crypto. The app fetches a renewal quote first, then computes:

- base cost
- service fee
- total cost
- user affordability
- projected renewal duration

This makes xDG renewal useful for users who have already built value in the ecosystem and want to use that value to maintain access.

### Important renewal rule

xDG renewal is for renewing an existing membership. It is not the path for buying membership for the first time.

If a user has no active key, xDG renewal should not be framed as the solution. The user first needs a valid membership state.

### Wallet nuance for renewal

Renewal is stricter than some other membership-gated flows.

The live implementation checks the current membership state against the wallet in the authenticated Privy context. That means support should not assume that "membership somewhere among linked wallets" is always enough for renewal to work the same way it may for other features.

If a user says:

- "I definitely have the NFT on one of my wallets"
- "Privy shows my wallets linked"
- "renewal is still not working"

the support answer should include the possibility that the renewal flow is tied to the current wallet context more strictly than broad linked-wallet ownership checks.

### When renewal is the right move

Renewal is usually the right action when:

- the user wants continuity of access
- the user is actively participating and wants to stay in the ecosystem
- the user already has membership and wants to avoid interruptions
- the user wants to use earned xDG to maintain access instead of paying only with crypto

## Pullout

### What pullout is

Pullout is the app flow that allows eligible users to withdraw DG based on their in-app balance and access state.

This is not an unrestricted action. It is protected by multiple checks.

In practical terms, pullout is the step that moves value from:

- xDG in the app domain

to:

- DG in the user's wallet on-chain

### What the app checks for pullout

In the current implementation, pullout depends on:

- a valid DG Nation membership state
- a linked and valid signing wallet
- enough xDG balance
- minimum withdrawal threshold
- daily withdrawal limits
- valid signed request data

### Membership nuance for pullout

Pullout is more permissive than some other wallet-sensitive features.

For pullout, the membership requirement can be satisfied across the user's linked wallets. This means:

- the membership NFT does not always need to sit on the currently active wallet
- a user can still qualify if membership is on another linked wallet
- the signing wallet still has to be a valid linked wallet that the app accepts

This is one of the most important support distinctions in the app.

If a user asks why pullout works while another membership-related feature does not, the answer may be that pullout checks membership across linked wallets, while the other feature may depend more directly on the active wallet or current wallet context.

### Balance and limits matter

Even with valid membership, a user cannot pull out freely without meeting the amount rules. The app validates:

- amount must be positive
- amount must meet the minimum pullout amount
- amount must not exceed the user's available xDG balance
- amount must not exceed daily withdrawal constraints

This means users should not think of pullout as "membership equals unlimited withdrawal." Membership is only one part of eligibility.

### Why pullout is intentionally strict

Pullout moves value out of the app's internal progression loop into an externalized token action. Because of that, the app uses stricter verification, including signed requests and backend validation.

That is a feature, not friction for its own sake.

## Renewal vs Pullout

These actions should not be confused.

Renewal is about:

- keeping access active
- preserving continuity
- staying in the ecosystem

Pullout is about:

- realizing eligible value
- moving through a gated withdrawal path
- acting on earned balance under constraints

Support and users should avoid framing pullout as the opposite of renewal. A user may need both at different times depending on their goals.

## Common Mistakes

### Mistake 1: treating rewards as the whole product

The app is not meant to be reduced to extraction. Rewards make more sense when tied to learning, proof, participation, and continuity.

### Mistake 2: treating xDG as if it were already the same thing as DG

It is better to explain these as connected but different layers:

- xDG is the earned in-app value side
- DG is the realized token side

This distinction matters especially for renewal, eligibility, and pullout conversations.

### Mistake 3: trying xDG renewal without an active membership state

xDG renewal is not a first-purchase shortcut. It extends an existing membership.

### Mistake 3: assuming all wallet-gated features use the same rule

They do not.

Examples:

- pullout can accept membership across linked wallets
- renewal can be stricter about the wallet context being used
- vendor and other gated actions may depend even more directly on the active wallet or the wallet that actually holds the key

### Mistake 4: thinking linked in Privy always means accepted by the app

A wallet can appear linked in Privy and still be rejected by the app if it fails the app's wallet-link guard or active-wallet requirements.

### Mistake 5: ignoring minimums and daily limits

Users sometimes focus only on whether they have membership and forget that pullout also depends on amount rules and balance availability.

## Practical Guidance

### If the user wants continuity

- renew before access becomes a problem
- use xDG renewal when eligible and when it makes sense
- make sure the renewal flow is being attempted from the right wallet context

### If the user wants to realize value

- confirm membership eligibility
- confirm the signing wallet is valid and linked
- confirm the amount meets minimum and limit rules
- treat pullout as a deliberate action, not a default habit

### If the user is unsure which path to take

The simplest decision rule is:

- choose renewal when the goal is to stay active and maintain access
- choose pullout when the goal is to realize eligible DG and the user meets the gated conditions
- choose continued participation when the user is still building value and does not yet need to renew or pull out

## Support Answer Template: xDG vs DG

If a user asks whether xDG and DG are the same, the support-safe answer is:

"Not exactly. xDG is the earned in-app value and progression side. DG is the token side users usually mean when they talk about withdrawing, trading, or realizing value. Pullout is the boundary where eligible in-app value becomes wallet-held DG. Until pullout happens, seeing xDG in the profile does not mean the user will already see DG in the wallet."

## Short Version

P2E Inferno rewards meaningful participation. xDG represents earned in-app value. Renewal helps preserve continuity of access. Pullout lets eligible users realize DG through a controlled flow.

The main things to remember are:

- xDG renewal is for extending membership, not buying it for the first time
- pullout is gated by membership, wallet validity, balance thresholds, and limits
- pullout can recognize membership across linked wallets
- not every membership-related feature follows the same wallet rule
- the best use of the system is participation first, rewards second, extraction last

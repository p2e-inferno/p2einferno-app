# P2E Inferno Navigation Map

> Last Updated: March 11, 2026
> Category: Navigation Map
> Purpose: A KB-safe navigation reference that helps users and AI assistants answer "where do I find X?" and "which part of the app should I use for Y?" without relying on internal implementation details.

## How To Use This Document

Use this document to answer questions like:

- Where do I find my profile?
- Where do I go to continue a bootcamp application?
- Where are quests and daily actions?
- Where do I manage wallet-related actions?
- Where do I find vendor-related features?

Do not use this document to answer:

- deep eligibility rules
- support diagnostics for failed actions
- admin-only workflows
- security-sensitive implementation behavior

Those belong in separate KB-safe sources such as playbooks and rule references.

## Main Navigation Model

P2E Inferno has two primary navigation layers:

1. Public pages for discovery, applications, and payment
2. Lobby pages for ongoing participation, account activity, and progression

As a rule:

- use the public site to learn about the platform, discover offerings, and start an application
- use the lobby to continue active participation after sign-in

## Public Site Areas

### Home

Route: `/`

Use this area to:

- understand what P2E Inferno is
- discover major product areas
- access high-level marketing and onboarding content

### Bootcamps Listing

Route: `/bootcamps`

Use this area to:

- browse available bootcamps
- compare structured learning paths
- choose a bootcamp before entering an application flow

### Bootcamp Details

Route pattern: `/bootcamp/[id]`

Use this area to:

- read about a specific bootcamp
- review the program at a higher level
- move toward the relevant cohort or application path

### Application Flow

Route pattern: `/apply/[cohortId]`

Use this area to:

- submit an application for a specific cohort
- continue the registration path after selecting a cohort

If a user asks where to apply for a cohort, this is the main destination.

### Payment Page

Route pattern: `/payment/[applicationId]`

Use this area to:

- complete payment for an existing application
- continue a registration that already progressed past application submission

If a user already applied but has not finished paying, this is the main page they need.

### Quests Landing

Route: `/quests`

Use this area to:

- discover the quests offering from the public side
- understand the quest experience before entering the lobby flow

## Lobby Overview

### Lobby Home

Route: `/lobby`

This is the main operating hub for active users.

Use this area to:

- see current progress and activity
- access quick actions
- find current enrollments
- continue active participation flows
- orient around the next meaningful action

If a user does not know where to start after signing in, the lobby is usually the right answer.

### Lobby Apply Area

Route: `/lobby/apply`

Use this area to:

- continue bootcamp application-related activity from inside the lobby
- find application-related follow-up actions

### Current Bootcamp Access

Route: `/lobby/bootcamps/enrolled`

Use this area to:

- find currently enrolled bootcamps
- confirm access to active cohort participation

If a user says they already registered and wants to find their cohort, this is one of the most relevant destinations.

### Specific Enrolled Cohort View

Route pattern: `/lobby/bootcamps/[cohortId]`

Use this area to:

- access the active cohort experience
- view milestone-based progress
- work through structured learning steps

If a user asks where milestones or milestone tasks live after enrollment, this is the core destination.

### Lobby Quests

Route: `/lobby/quests`

Use this area to:

- browse active quests from the signed-in experience
- enter practical action-based learning flows

### Specific Quest View

Route pattern: `/lobby/quests/[id]`

Use this area to:

- view a specific quest
- see quest tasks and completion steps
- continue quest progress and related claim actions

### Profile

Route: `/lobby/profile`

Use this area to:

- view account and profile information
- review linked wallets
- access wallet-related account actions
- find profile-centered progression and value features

If a user asks where to check linked wallets, account details, or some membership-related personal information, start here.

### Vendor

Route: `/lobby/vendor`

Use this area to:

- access the DG Token Vendor experience
- perform vendor-related actions such as buying, selling, and progression-related activity
- interact with vendor-specific mechanics when the user is already eligible

If a user asks where token trading or vendor progression happens, this is the main answer.

### Achievements

Route: `/lobby/achievements`

Use this area to:

- view achievement-oriented progress and recognition signals

### Bounties

Route: `/lobby/bounties`

Use this area to:

- access bounty-related participation if available in the current experience

### Events

Route: `/lobby/events`

Use this area to:

- access event-related participation if available in the current experience

## Where Common User Needs Usually Live

### Wallet and Account Setup

Primary destination:

- `/lobby/profile`

Related context:

- the wallet address dropdown and linked-wallet areas are part of the account and participation setup experience

Use this answer for questions such as:

- Where do I check my linked wallets?
- Where do I manage wallet-related account information?
- Where do I see which wallet I am using?

### Bootcamp Applications and Registration

Primary destinations:

- `/bootcamps`
- `/bootcamp/[id]`
- `/apply/[cohortId]`
- `/payment/[applicationId]`

Lobby follow-up destination:

- `/lobby/apply`

Use this answer for questions such as:

- Where do I apply for a cohort?
- Where do I continue my application?
- Where do I complete payment?

### Active Cohort Participation

Primary destinations:

- `/lobby/bootcamps/enrolled`
- `/lobby/bootcamps/[cohortId]`

Use this answer for questions such as:

- Where do I find my enrolled bootcamp?
- Where do I see milestones?
- Where do I continue my cohort progress?

### Quests and Daily Participation

Primary destinations:

- `/lobby/quests`
- `/lobby/quests/[id]`
- `/lobby`

Use this answer for questions such as:

- Where do I find quests?
- Where do I continue a quest?
- Where do I find my next daily or repeat participation action?

### Vendor and Token Interaction

Primary destination:

- `/lobby/vendor`

Related destination:

- `/lobby/profile`

Use this answer for questions such as:

- Where do I buy or sell DG?
- Where is the vendor?
- Where do vendor progression actions happen?

If the user is asking about value realization or account-linked value features rather than market-style actions, profile may also be relevant.

### Pullout, Withdrawal, and Value-Realization Features

Primary destination:

- `/lobby/profile`

Use this answer for questions such as:

- Where do I pull out DG?
- Where do I see withdrawal-related account actions?
- Where do I review profile-based value features?

### GoodDollar Verification

Primary destinations:

- `/lobby`
- `/gooddollar-verification`
- `/gooddollar/verification`

Use this answer for questions such as:

- Where do I verify my identity?
- Where do I complete GoodDollar verification?

In many user journeys, the lobby is the best starting point because verification prompts are surfaced there.

## Best First Answer Patterns

When users ask for location help, prefer answers in this format:

- feature or goal
- best page
- backup page if the first one is not visible
- short reason

Examples:

- To continue an existing cohort application, go to `/payment/[applicationId]`. If you no longer have that page open, check the lobby for incomplete application follow-up.
- To work on an enrolled bootcamp, go to `/lobby/bootcamps/enrolled` and open the relevant cohort.
- To manage vendor actions, go to `/lobby/vendor`.
- To review wallets and profile-linked account features, go to `/lobby/profile`.

## Scope Guardrails

This navigation map intentionally avoids:

- admin routes
- internal-only tools
- implementation details about components or APIs
- sensitive access logic
- deep troubleshooting flows

It exists to help users and AI systems locate the right area of the app quickly and safely.

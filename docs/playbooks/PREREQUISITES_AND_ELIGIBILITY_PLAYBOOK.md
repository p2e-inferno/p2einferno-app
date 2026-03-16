# P2E Inferno Prerequisites and Eligibility Playbook

> Last Updated: March 14, 2026
> Purpose: A practical guide to the prerequisite and eligibility systems currently used in P2E Inferno. This playbook explains what kinds of requirements exist, where they apply, where users go in the app to satisfy them, and how support or AI assistants should reason about blocked actions.

## Who This Is For

- support agents helping users who are blocked from starting or completing something
- AI assistants that need to explain why a user is ineligible and what to do next
- users who want to understand what they need before a milestone, quest, or daily quest can proceed

## What This Playbook Answers

Use this document for questions like:

- Why can I not start this quest?
- Why is this daily quest unavailable to me?
- What prerequisites exist in the app right now?
- Where do I complete GoodDollar verification?
- Where do I check if I meet a vendor stage requirement?
- Where do I find milestone tasks after I enroll?
- What is the difference between a prerequisite, a completion step, and a claim step?

## Core Idea

Not every blocked action in P2E Inferno is the same kind of problem.

A user may be blocked because:

- they are not in the right part of the app yet
- they are missing access or enrollment
- they have not completed a prerequisite action
- they have not passed a verification gate
- they are using the wrong wallet context
- they have completed the work but have not finished the claim or finalization step

Support works best when it identifies the exact type of gate first.

## The Main Eligibility Layers

The current app uses several distinct requirement layers:

1. account and wallet readiness
2. enrollment and access readiness
3. prerequisite completion requirements
4. verification requirements
5. vendor and progression requirements
6. balance-based requirements
7. timing and completion-state requirements

These can appear alone or in combination.

## Where Users Go in the App

These are the main user-facing locations tied to prerequisites and eligibility:

- `/lobby`
  - best first stop after sign-in
  - often surfaces the next meaningful action and GoodDollar prompts
- `/lobby/profile`
  - linked wallets
  - active wallet context
  - account and wallet-centered actions
- `/gooddollar-verification`
  - direct GoodDollar verification flow
- `/lobby/bootcamps/enrolled`
  - active enrolled bootcamp access
- `/lobby/bootcamps/[cohortId]`
  - milestones and milestone tasks after enrollment
- `/lobby/quests`
  - active signed-in quest discovery
- `/lobby/quests/[id]`
  - quest details, tasks, and prerequisite-linked quest flow
- `/lobby/quests/daily/[runId]`
  - started daily quest runs and daily quest task flow
- `/lobby/vendor`
  - vendor actions and vendor-stage-related activity

## The Most Important Support Distinction

Three things are often confused:

- prerequisite to start
- requirement to complete
- claim or finalization step after completion

These are not interchangeable.

Examples:

- a quest may require another quest to be completed before it can be started
- a milestone task may be startable, but still require submission evidence and review before it counts
- a daily quest may have all tasks finished, but still require reward claim, key claim, or completion bonus claim

Support should not treat "I did the task" as meaning the entire flow is finished.

## Requirement Type 1: Account and Wallet Readiness

This is the most basic layer.

Some actions require:

- being signed in
- having a connected wallet
- having the correct active wallet selected
- using a wallet that the app recognizes as linked and valid

This matters especially for:

- wallet-sensitive eligibility checks
- vendor actions
- daily quest start flow
- anything that evaluates eligibility against the current wallet context

### Where users handle this

- `/lobby/profile`
- wallet connection flow
- linked wallet controls in the profile area

### Support guidance

If a user says:

- "I can see the feature but cannot start it"
- "the app says wallet required"
- "Privy shows linked but the app still blocks me"

then wallet context should be checked before deeper explanations.

For deeper wallet behavior, use:

- [WALLET_AND_MEMBERSHIP_BEHAVIOR_GUIDE.md](/Users/applemac/Developer/projects/p2einferno-app/docs/strategy/WALLET_AND_MEMBERSHIP_BEHAVIOR_GUIDE.md)
- [WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md)

## Requirement Type 2: Enrollment and Cohort Access

Milestones do not currently use the same visible prerequisite model as quests and daily quests.

For milestone access, the main gate is:

- the user must be enrolled in the cohort

The cohort milestone API checks that the user has an enrollment in the cohort with a valid status such as:

- enrolled
- active
- completed

This means milestone access is primarily an access-and-enrollment question, not a generic quest-style prerequisite question.

### Where users handle this

- start from `/bootcamps` or `/bootcamp/[id]`
- apply at `/apply/[cohortId]`
- complete payment at `/payment/[applicationId]`
- continue access at `/lobby/bootcamps/enrolled`
- work through milestones at `/lobby/bootcamps/[cohortId]`

### Support guidance

If a user says:

- "I cannot see my milestones"
- "the bootcamp page says I do not have access"
- "I paid but the cohort is missing"

the first check should be:

- is the user actually enrolled in that cohort

This is usually not a GoodDollar or vendor-stage issue.

For registration-specific handling, use:

- [BOOTCAMP_AND_COHORT_REGISTRATION_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/BOOTCAMP_AND_COHORT_REGISTRATION_PLAYBOOK.md)

## Requirement Type 3: Milestone Timing and Completion Criteria

Milestones and milestone tasks are more structured than quests.

The important current gates are:

- cohort enrollment
- milestone timing
- task submission requirements
- validation criteria
- possible admin review
- reward claim state

Milestone pages prevent task action before a milestone start date when one is configured.

This means a user can be enrolled and still not be ready to act on a milestone yet if the milestone has not started.

### Where users see this

- `/lobby/bootcamps/[cohortId]`

### How users satisfy it

- stay enrolled in the cohort
- wait for the milestone window if timing-gated
- submit the required proof or artifact for the task
- complete any review or claim step that remains

### What is genuinely important here

Milestones are not mainly blocked by broad ecosystem prerequisites. They are mainly governed by:

- access to the cohort
- the program timeline
- proof-of-work submission rules

That is a different mental model from quests and daily quests.

## Requirement Type 4: Quest Prerequisites

Quests use a clearer prerequisite system than milestones.

The current live quest prerequisite types are:

- prerequisite quest completion
- prerequisite key ownership
- GoodDollar verification

These are checked before a quest can be started, and the same prerequisite logic is also enforced again for key quest actions such as task completion and quest completion.

### 4A. Prerequisite quest completion

Some quests require another quest to be completed first.

What the app checks:

- whether the prerequisite quest exists in the user's quest progress as completed

What users should do:

- go to `/lobby/quests`
- open the prerequisite quest
- complete it fully

What support should remember:

- "started" is not enough
- the prerequisite quest must be completed

### 4B. Prerequisite key ownership

Some quests require the user to hold a valid key associated with the prerequisite quest lock.

What the app checks:

- key ownership across the user's linked wallets

What users should do:

- determine which key is required
- make sure at least one linked wallet on the same account holds that key

What support should remember:

- this check is broader than "active wallet only"
- it is checking linked-wallet ownership, not just visible quest progress

### 4C. GoodDollar verification

Some quests require GoodDollar face verification.

What the app checks:

- whether the user is face verified
- whether the verification has expired

What users should do:

- start from `/lobby` if prompted there
- or go directly to `/gooddollar-verification`

What support should remember:

- expired verification should be treated as missing verification
- this is not the same as completing a prerequisite quest

### Where quest prerequisites are surfaced

- `/lobby/quests`
- `/lobby/quests/[id]`

The quest UI can explicitly guide users to:

- the prerequisite quest page
- the GoodDollar verification flow

## Requirement Type 5: Daily Quest Eligibility

Daily quests use a different eligibility model from standard quests.

The current live daily quest eligibility types are:

- GoodDollar verification
- required lock key ownership
- minimum vendor stage
- minimum ERC20 token balance on a configured chain

These are evaluated per daily quest template and returned as structured requirement results.

### 5A. GoodDollar verification

This works similarly to quest verification gating.

Users satisfy it by completing GoodDollar verification.

Main location:

- `/gooddollar-verification`
- or prompts surfaced from `/lobby`

### 5B. Required lock key

Some daily quests require a valid key from a specific lock.

What the app checks:

- valid key ownership across linked wallets

What users should do:

- obtain the required key or membership
- confirm it exists on a wallet linked to the same account

### 5C. Minimum vendor stage

Some daily quests require the user to have reached a minimum vendor stage.

What the app checks:

- the current vendor stage for the evaluated wallet context

What users should do:

- go to `/lobby/vendor`
- continue vendor participation until the required stage is reached

What support should remember:

- this is not solved by GoodDollar verification alone
- this is not solved only by owning a key if the stage itself is still too low

### 5D. ERC20 token balance

Some daily quests require a minimum ERC20 balance on a configured chain.

What the app checks:

- whether the evaluated wallet meets the minimum token balance requirement

What users should do:

- use the wallet being evaluated for the requirement
- make sure the required token balance is actually present on the correct chain

What support should remember:

- a user may hold the token on another chain or another wallet and still fail the requirement

### Where daily eligibility is surfaced

- `/lobby/quests`
- `/lobby/quests/daily/[runId]`

The daily quest cards can show explicit requirement badges such as:

- GoodDollar Verification Required
- Key Required
- Vendor Level Required
- Token Balance Required

## Requirement Type 6: Vendor and Progression Readiness

Vendor readiness is a larger progression layer that can affect:

- direct vendor actions
- daily quest eligibility
- broader ecosystem participation

The most important current vendor-facing requirements are:

- GoodDollar verification
- relevant membership or key ownership
- vendor stage readiness
- correct active wallet context for wallet-specific vendor actions

### Where users handle this

- `/lobby/vendor`
- `/lobby/profile`
- `/gooddollar-verification`

### Support guidance

If the user is blocked by:

- stage
- membership
- verification
- vendor action readiness

then use this playbook as the routing layer and consult:

- [VENDOR_PROGRESSION_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md)

## Requirement Type 7: Balance-Based Readiness

Balance requirements currently appear most clearly in:

- daily quest ERC20 balance checks
- XP or xDG availability for pullout or renewal-related flows

This matters because users often think:

- "I have the account"
- "I have the wallet"
- "I have the membership"

therefore the action should be available

That is not always enough.

Some actions are blocked because the user lacks:

- enough token balance
- enough XP or xDG
- the balance on the correct chain
- the balance on the evaluated wallet

For renewal and pullout balance logic, use:

- [REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md)

## Requirement Type 8: Review, Claim, and Finalization States

Many users confuse eligibility with finalization.

Even after a user is eligible and completes the core action, they may still be waiting on:

- admin review
- task reward claim
- quest key claim
- daily quest completion bonus claim

This means support should distinguish:

- can the user start
- can the user submit
- did the system verify it
- is there still a claim step left

These are separate states.

## The Current Live Requirement Types at a Glance

Across the app today, the meaningful requirement types are:

- connected or valid wallet context
- cohort enrollment
- milestone timing
- submission requirements and validation criteria
- prerequisite quest completion
- prerequisite key ownership
- GoodDollar face verification
- minimum vendor stage
- required lock key ownership
- minimum ERC20 token balance
- reward claim and completion finalization state

This is the current practical map the assistant should reason from.

## How Support Should Diagnose Blocked Actions

Use this order:

1. What exactly is the user trying to do?
   - open milestone content
   - submit milestone work
   - start a quest
   - complete a quest task
   - start a daily quest
   - claim a reward
2. What app area are they in?
   - bootcamp
   - quest
   - daily quest
   - vendor
3. What kind of gate is most likely?
   - enrollment
   - prerequisite completion
   - verification
   - key ownership
   - stage
   - balance
   - claim pending
4. Where should the user go next?
   - profile
   - GoodDollar verification
   - prerequisite quest
   - vendor page
   - bootcamp enrolled cohort page
   - payment or registration flow

## Best Next-Step Guidance by Block Type

### If the user is blocked from milestones

- confirm cohort enrollment first
- send them to `/lobby/bootcamps/enrolled` or `/lobby/bootcamps/[cohortId]`
- check whether the milestone has started yet

### If the user is blocked from a quest

- check prerequisite quest completion
- check GoodDollar verification
- check prerequisite key ownership
- send them to the prerequisite quest or verification flow as appropriate

### If the user is blocked from a daily quest

- check GoodDollar verification
- check required lock key
- check vendor stage
- check token balance requirement
- tell them which specific requirement badge or failure reason matters

### If the user completed work but still looks blocked

- check whether review is pending
- check whether reward claim is still pending
- check whether quest key claim or completion bonus claim is still pending

## What This Playbook Intentionally Does Not Replace

This document is the routing and synthesis layer.

Use these deeper docs when needed:

- [NAVIGATION_MAP.md](/Users/applemac/Developer/projects/p2einferno-app/docs/categories/NAVIGATION_MAP.md)
- [GETTING_STARTED_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/GETTING_STARTED_PLAYBOOK.md)
- [LEARNING_AND_PROGRESS_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/LEARNING_AND_PROGRESS_PLAYBOOK.md)
- [WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md)
- [WALLET_AND_MEMBERSHIP_BEHAVIOR_GUIDE.md](/Users/applemac/Developer/projects/p2einferno-app/docs/strategy/WALLET_AND_MEMBERSHIP_BEHAVIOR_GUIDE.md)
- [VENDOR_PROGRESSION_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md)
- [BOOTCAMP_AND_COHORT_REGISTRATION_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/BOOTCAMP_AND_COHORT_REGISTRATION_PLAYBOOK.md)
- [REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md](/Users/applemac/Developer/projects/p2einferno-app/docs/playbooks/REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md)

## Short Version

P2E Inferno currently uses multiple requirement systems, not one:

- milestones are mainly governed by enrollment, timing, and completion criteria
- quests are mainly gated by prerequisite quest completion, prerequisite key ownership, and GoodDollar verification
- daily quests are mainly gated by GoodDollar verification, lock-key requirements, vendor stage, and ERC20 balance

The assistant should identify which system the user is in first, then explain the exact gate, then send the user to the part of the app where that requirement can actually be satisfied.

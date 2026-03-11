# P2E Inferno Status and Outcomes Reference

> Last Updated: March 11, 2026
> Category: Status and Outcomes Reference
> Purpose: A KB-safe reference for understanding common user-visible states, outcomes, and progress meanings across P2E Inferno. This document helps AI systems explain what a status means without exposing internal-only implementation details.

## How To Use This Document

Use this document to answer questions like:

- What does pending mean here?
- I finished the task, why is it not complete?
- What does verified mean?
- What does enrolled mean?
- Why does something show claimed or not claimed?
- What is the difference between started and completed?

Do not use this document as the primary source for:

- step-by-step instructions
- deep troubleshooting
- admin-only review workflows
- internal database state explanations

Those belong in other KB sources.

## Core Interpretation Rule

In P2E Inferno, users often think a single action means everything is done.

In reality, many flows have multiple stages such as:

- started
- submitted
- verified
- claimable
- claimed
- completed

That means a user may be genuinely partway through a valid flow even if the final outcome is not yet visible.

## Registration and Access Outcomes

### Applied

Meaning:

- the user submitted an application for a cohort

What it does not guarantee:

- payment is complete
- enrollment exists
- access is already visible in the lobby

### Payment Pending

Meaning:

- the registration flow reached the payment stage, but the payment is not yet fully reflected as complete

What it usually means in practice:

- the user may still need to complete payment
- or the payment may have happened but not yet been fully reflected in the app

### Payment Completed or Successful

Meaning:

- the payment itself is considered complete

What it does not always guarantee:

- enrollment is already reflected
- lobby access is already visible

### Enrolled

Meaning:

- the user has gained cohort access as a participant

What this usually implies:

- the cohort should appear in the user's active or enrolled bootcamp area

### Access Visible in the Lobby

Meaning:

- the user can see the relevant enrolled experience in the lobby

Important distinction:

- payment completion and visible access are related, but they are not always the exact same stage

## Learning and Participation Outcomes

### Started

Meaning:

- the user began a flow, quest, or recurring activity

What it does not mean:

- all requirements are complete
- rewards are already claimable
- the full experience is finalized

### In Progress

Meaning:

- the user is actively partway through a flow, program, or action path

Typical interpretation:

- progress exists
- more steps are still required

### Submitted

Meaning:

- the user has provided the required proof, answer, file, link, or other evidence for a task

What it does not guarantee:

- the submission has already been approved
- the reward has already been claimed

### Pending Review

Meaning:

- the user's submission exists but still needs confirmation or review before it fully counts

Best explanation:

- the user has completed the submission step, but the platform has not yet finalized the result

### Verified

Meaning:

- the relevant action, proof, or requirement has been confirmed as valid

What it usually indicates:

- the user passed the validation layer for that specific action

Important distinction:

- verified does not always mean every related reward or finalization step is already complete

### Completed

Meaning:

- the relevant requirements for that task, milestone, quest, or recurring flow have been satisfied

Common confusion:

- users may treat task completion and full quest completion as the same thing
- in some flows, a claim step or final bonus step may still remain

### Fully Completed

Meaning:

- the user has satisfied the action requirements and any remaining completion-related outcome steps have also been finished

Best use:

- use this wording when a system needs to distinguish basic completion from a truly final state

## Quest and Daily Quest Outcome Patterns

### Task Completed

Meaning:

- the task itself is done

What may still remain:

- reward claim
- quest-level completion
- key claim
- final bonus claim

### Reward Claim Pending

Meaning:

- the underlying task or action may be complete, but the user still has a claimable reward that has not yet been finalized

### Key Claim Pending

Meaning:

- the main participation work may be complete, but the user still has a key-related completion outcome to finalize

### Completion Bonus Claim Pending

Meaning:

- the core daily quest work may be done, but a final bonus outcome still remains

### Fully Completed Daily Quest

Meaning:

- the user has completed the daily quest and finalized the remaining reward-related completion steps

## Verification and Proof Outcomes

### Not Verified

Meaning:

- the requirement has not yet been confirmed as valid

Possible interpretations:

- the user has not submitted proof yet
- the proof was not accepted yet
- the relevant requirement has not been satisfied

### Verification Passed

Meaning:

- the required proof or condition has been confirmed successfully

### Verification Failed

Meaning:

- the submitted proof or qualifying condition did not satisfy the requirement

Best explanation:

- this usually means the requirement was checked and did not meet the expected rule, not that the entire account is broken

### Attestation Pending

Meaning:

- the relevant action is moving through an attestation-related outcome path, but the final attestation result is not yet complete

### Attested

Meaning:

- a verifiable attestation record exists for the relevant action, achievement, or status

### Certificate Available to Claim

Meaning:

- the user has met the conditions required to claim a certificate

### Certificate Claimed

Meaning:

- the user has already completed the certificate claim outcome

Common confusion:

- users may think finishing a bootcamp always means the certificate has already been claimed automatically

## Membership, Wallet, and Access Outcomes

### Linked

Meaning:

- a wallet is associated with the user's account

What it does not guarantee:

- that wallet is the active wallet right now
- that wallet can perform every gated action

### Active

Meaning:

- the wallet or experience is currently the one in use

### Verified Identity

Meaning:

- the user has passed the platform's human-verification layer

What it does not always guarantee:

- the user is eligible for every gated feature

### Membership Active

Meaning:

- the user has an active qualifying membership state for the relevant experience

Important distinction:

- a user can have membership somewhere in the account context while still being blocked in a wallet-specific flow

### Membership Expired

Meaning:

- the prior qualifying access state is no longer current

### Eligible

Meaning:

- the user currently satisfies the relevant conditions for a specific action or feature

### Ineligible

Meaning:

- one or more required conditions are not currently satisfied

Best explanation:

- ineligible usually points to a missing requirement for that specific action, not a general platform failure

## Vendor and Progression Outcomes

### Vendor Access Available

Meaning:

- the user can enter the relevant vendor participation flow under the current conditions

### Blocked

Meaning:

- the user cannot proceed with the current vendor or gated action under the present conditions

Common safe explanation:

- blocked usually means a requirement is missing, such as the wrong active wallet, missing membership context, insufficient progression resources, or another unmet condition

### Stage Reached

Meaning:

- the user is currently recognized at a specific progression stage

### Upgrade Available

Meaning:

- the user appears to have satisfied the conditions needed for the next stage transition

### Upgrade Not Yet Available

Meaning:

- the user is active in the progression system but has not yet met the threshold for the next stage

## Rewards and Value Outcomes

### Claimable

Meaning:

- the relevant reward or outcome is available to be claimed now

### Claimed

Meaning:

- the user has already finalized that reward or outcome

### Withdrawal or Pullout Available

Meaning:

- the user currently appears to satisfy the main conditions needed to use the pullout flow

### Withdrawal or Pullout Unavailable

Meaning:

- one or more pullout requirements are not currently satisfied

## Good Answer Patterns

When explaining a state to a user:

1. name the state clearly
2. explain what it confirms
3. explain what it does not confirm
4. avoid implying a platform-wide failure unless that is actually the case

Good examples:

- "Pending review means your submission was received, but the final confirmation step has not happened yet."
- "Completed does not always mean fully finalized. In some quest flows, a reward claim can still remain."
- "Enrolled means you should have participant access to the cohort, even if the lobby view still needs to reflect it."
- "Verified means that specific requirement passed. It does not always mean every related reward step is already finished."
- "Ineligible usually means this specific action is gated by a requirement you have not met yet."

## Scope Guardrails

This reference intentionally avoids:

- internal database status codes
- admin-only moderation detail
- sensitive wallet-security logic
- low-level implementation state machines

It exists to help users and AI systems interpret visible outcomes and progress states accurately and safely.

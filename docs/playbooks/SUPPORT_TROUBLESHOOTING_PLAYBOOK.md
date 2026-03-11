# Support Troubleshooting Playbook

## Purpose

This playbook helps support teams and AI-assisted support resolve the most common user issues in P2E Inferno without guessing. It is symptom-first, grounded in current app behavior, and designed to separate wallet, membership, progression, vendor, renewal, and pullout problems that users often collapse into one complaint.

## Who This Is For

- Support agents handling user-facing issues
- AI support systems retrieving action-oriented help
- Product and ops teams that need a consistent support mental model

## First Principle

Most "the app is broken" reports in this area are actually one of these:

- the wrong wallet is active
- the right wallet is linked but not currently usable
- membership exists, but on a different linked wallet
- the user passed one gate but failed another
- Privy shows linked, but the app rejects the wallet under the app-level guard
- the user is trying to renew, trade, or pull out under the wrong assumptions

Support should not answer from the surface symptom alone. Identify the exact gate that failed.

## The Five Questions To Ask First

Before diagnosing any wallet, membership, or progression issue, ask:

1. Which wallets are linked to the account?
2. Which wallet is active right now?
3. Which wallet actually holds the NFT or membership key?
4. What action is the user trying to perform right now?
5. What exact message, button state, or failure behavior are they seeing?

These five answers usually reveal whether the issue is:

- account-level
- wallet-specific
- membership-specific
- verification-specific
- limit or balance-related

## The Core Support Distinction

Do not assume all gated features use the same wallet rule.

In this app:

- some checks work across linked wallets
- some actions require the active wallet itself
- some flows also require the wallet to pass the app's internal wallet-link guard

That is why a user may say:

- "This works in one place"
- "but not in another place"

without the app being inconsistent.

## Troubleshooting Workflow

Use this order:

1. Confirm the user action:
   - vendor action
   - renewal
   - purchase
   - pullout
   - daily quest
   - general membership status
2. Confirm wallet state:
   - linked wallets
   - active wallet
   - wallet holding the key or NFT
3. Confirm gate type:
   - any linked wallet allowed
   - active wallet required
   - active wallet plus app guard required
4. Confirm balance, eligibility, or limits:
   - xDG balance
   - daily caps
   - verification
   - quest conditions
5. Only then give the user the next action.

## Common Support Cases

## Case 1: "Privy shows my wallet is linked, but the app rejects it"

### Most likely cause

The wallet passed the current Privy link check but failed the app's wallet ownership guard.

### What is happening

The app does not rely only on "currently linked in Privy." For guarded flows, it also checks whether that wallet is allowed under the app's internal wallet-to-user ownership rules.

This means a wallet can look linked in Privy and still be rejected by the app.

### Correct support guidance

Tell the user:

- the wallet appears linked at the identity layer
- but the app has a separate ownership guard for protected flows
- the wallet may already be associated with another app account

### What not to say

Do not describe this as a simple sync issue or a random UI bug.

## Case 2: "I have the NFT, but the feature still says I don't"

### Most likely cause

The NFT or membership key is on a linked wallet, but not on the active wallet required for the current action.

### What is happening

Users often assume "my account has it somewhere" should work everywhere. That is not true for wallet-specific actions.

### Correct support guidance

Check:

- whether the NFT is on a different linked wallet
- whether the feature requires the active wallet itself

Then advise:

- if the feature is wallet-specific, switch to the wallet that actually holds the NFT or key
- if the feature is linked-wallet tolerant, continue diagnosis elsewhere

## Case 3: "I can see membership, but I cannot renew"

### Most likely cause

Membership exists on another linked wallet, but the user is trying to renew from the wrong wallet context.

### What is happening

The app can detect that membership exists on another linked wallet, but renewal is stricter than general status detection.

xDG renewal and existing membership renewal are tied to the current authenticated wallet context more strictly than broad linked-wallet discovery.

### Correct support guidance

Tell the user:

- the app can see membership on another linked wallet
- but the renewal flow needs the correct wallet context for the key being renewed
- they should switch to the wallet that actually owns the membership key

### Important clarification

If the user wants access on the current wallet instead of continuing the old one, the right answer may be purchase rather than renewal.

## Case 4: "I can pull out DG, but I cannot use the vendor"

### Most likely cause

The two features use different membership rules.

### What is happening

Pullout is more permissive:

- membership can be satisfied across linked wallets
- the signing wallet still has to be valid and linked

Vendor actions are stricter:

- the active wallet needs to be the one that actually holds the relevant vendor key or access state for the action

### Correct support guidance

Tell the user:

- pullout and vendor are not using the same wallet rule
- pullout can work because another linked wallet satisfies membership
- vendor action may still require switching to the wallet that actually holds the necessary key

## Case 5: "I am verified, but vendor access still fails"

### Most likely cause

The user passed GoodDollar verification but failed the vendor membership or active wallet requirement.

### What is happening

Vendor access has multiple gates. Verification is not the same thing as having the active wallet correctly positioned for vendor trading or stage-linked actions.

### Correct support guidance

Check separately:

- GoodDollar verification status
- whether any linked wallet has the required membership key
- whether the active wallet is the one that actually holds it

Tell the user that being verified does not automatically mean the current wallet is eligible to trade or use vendor actions.

## Case 6: "Daily quest says I am not eligible"

### Most likely cause

The user failed one of the quest constraints, not necessarily all progression access.

### What is happening

Daily quests can depend on conditions such as:

- membership or key ownership
- vendor stage
- GoodDollar verification
- token balances
- account state for that specific quest

Users often interpret a failed daily quest check as "my account is broken," when in reality they failed a specific quest rule.

### Correct support guidance

Support should isolate which quest condition failed rather than speaking in broad platform terms.

Use language like:

- this looks like a quest eligibility issue, not a full account issue
- daily quests can have specific conditions that do not apply everywhere else

## Case 7: "Why can I not renew with xDG?"

### Most likely cause

One of these is true:

- the user does not currently have an active membership to renew
- the user is using the wrong wallet context
- the user cannot afford the xDG renewal quote

### What is happening

xDG renewal is not a first-time purchase path. It is an extension path for an existing membership, with quote and affordability checks.

### Correct support guidance

Check:

- whether the user has an active key
- whether the wallet context matches the wallet that owns the key
- whether the user has enough xDG for the quoted total cost

Then explain:

- xDG renewal extends an existing membership
- it does not replace first purchase

## Case 8: "Why can I not pull out DG?"

### Most likely cause

One or more of the actual pullout gates failed.

### What is happening

Pullout is a controlled flow with multiple checks:

- valid linked signing wallet
- app-level wallet acceptance
- valid membership state across linked wallets
- enough xDG balance
- minimum pullout amount
- daily limit compliance
- signed request validity

### Correct support guidance

Do not answer only from membership.

Check in order:

1. is the signing wallet linked and valid for the account
2. does any linked wallet satisfy membership
3. does the user have enough xDG
4. is the amount above the minimum
5. is the amount within daily limits

## Case 9: "The app switched wallets and now things are different"

### Most likely cause

The app changed from an unavailable external wallet to the embedded wallet fallback, or the user is on a different device where the external wallet is not available.

### What is happening

The app prefers a linked external wallet when it is available. If it is not available on the current device or browser context, the app can fall back to the embedded wallet.

That can change which features appear available if the embedded wallet does not hold the same key or NFT.

### Correct support guidance

Explain:

- the app prefers a linked external wallet when available
- otherwise it can fall back to the embedded wallet
- wallet-dependent access may change because the active wallet changed

Then advise the user to reconnect or switch back to the intended wallet if needed.

## Fast Decision Guide

If the user says:

- "linked but rejected"
  - think wallet-link guard
- "membership exists but cannot renew"
  - think wrong wallet context for renewal
- "can withdraw but cannot trade"
  - think different wallet rule for pullout vs vendor
- "verified but still blocked"
  - think passed verification, failed another gate
- "daily quest broken"
  - think quest-specific eligibility condition
- "wallet changed and things stopped working"
  - think active wallet changed, not necessarily account damage

## Good Support Language

Use language like:

- "This looks like a wallet-context issue, not a full account issue."
- "The app can see your linked wallet, but this action requires the wallet that actually holds the key."
- "This feature checks membership across linked wallets, but this other feature does not."
- "You passed one gate, but this action has an additional requirement."
- "This looks like a quest eligibility rule rather than a platform-wide failure."

## Language To Avoid

Avoid saying:

- "The app is glitching"
- "Privy is wrong"
- "Your wallet is definitely fine"
- "All membership checks work the same way"
- "If it is linked, it should work everywhere"

Those phrases make the problem harder to resolve.

## Escalate When

Escalate beyond normal support handling when:

- the wallet appears to be blocked by historical ownership mapping and the user cannot recover the original account context
- the user has contradictory onchain and app-state behavior that cannot be explained by wallet context, membership location, or limits
- signed pullout or renewal behavior fails after all normal eligibility checks appear satisfied
- the user may need account recovery or data correction rather than normal guidance

## Short Version

Most support issues in this part of the app are not random failures. They come from users mixing up:

- linked wallet
- active wallet
- wallet holding the NFT or key
- feature-specific gate rules

Support works best when it identifies the exact failed gate first, then gives the user the next correct action instead of a generic explanation.

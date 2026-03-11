# Bootcamp and Cohort Registration Playbook

## Purpose

This playbook helps support teams and AI-assisted support resolve bootcamp and cohort registration issues across both fiat and crypto payment flows. It is based on the live application, payment, verification, and enrollment logic in the app.

## Who This Is For

- Support agents helping users register for a cohort
- AI support systems answering payment and enrollment questions
- Product and ops teams that need a clean mental model of where registration problems happen

## The Registration Model

A user does not become enrolled just by landing on a cohort page or filling the form.

The actual path is:

1. choose a cohort
2. submit an application
3. get routed to the payment page
4. complete payment through fiat or crypto
5. payment gets verified
6. application status updates
7. enrollment is created or reflected
8. the user gains access to the cohort in the lobby

Support should always identify which stage the user reached before diagnosing the problem.

## The Most Important Distinction

These are not the same state:

- application created
- payment pending
- payment completed
- enrollment created
- access visible in the lobby

Users often treat all of them as one thing and say "I registered already." Support should translate that into the actual stage.

## Registration Entry Points

Users can enter the flow from:

- the public bootcamp page
- a specific cohort page
- the lobby apply flow

The cohort page routes users to `/apply/[cohortId]`, and a successful application routes them to `/payment/[applicationId]`.

## How Application Creation Works

When a user submits the application:

- the app validates required fields
- the app validates the email format
- the app blocks duplicate applications for the same cohort
- the app blocks new applications if the user is already enrolled in another cohort of the same bootcamp
- the app creates an `applications` record
- if the user is linked to a profile, the app also creates `user_application_status`

This means support should not jump straight to payment if the user may have been blocked at application creation.

## Payment Method Model

The app uses payment method by currency:

- `NGN` uses Paystack
- `USD` uses blockchain payment

That means support should think of "fiat vs crypto" not only as a preference, but as two different backend flows.

## Fiat Registration Flow

For NGN registration:

1. the app initializes a Paystack transaction
2. a pending payment transaction is stored
3. the user completes payment in the Paystack popup
4. Paystack webhook is expected to confirm the charge
5. the app updates payment records and application status
6. the user is redirected back toward the lobby

There is also a fallback verification path if webhook timing is delayed.

## Crypto Registration Flow

For USD registration:

1. the app initializes a blockchain payment reference
2. the app stores a pending blockchain payment transaction
3. the user purchases the cohort key on-chain from the selected wallet
4. the app submits the transaction hash for backend verification
5. an Edge Function verifies the payment in the background
6. the payment transaction status is updated
7. the user is redirected once verification succeeds

This means support should distinguish:

- transaction submitted on-chain
- transaction verified by the app
- enrollment/access reflected in-app

Those are related, but not identical events.

## Enrollment and Access Reflection

After successful payment:

- the payment status should move to completed or success
- enrollment should exist in `bootcamp_enrollments`
- the lobby should reflect the cohort under current enrollments

There is also logic in the app and admin tooling for reconciliation when payment and enrollment state drift apart.

This matters because a user may be genuinely paid but still not see the cohort immediately if the payment and enrollment records have fallen out of sync.

## Support Workflow

Use this order:

1. confirm the cohort the user intended to join
2. confirm whether the application was created
3. confirm whether the user reached the payment page
4. confirm payment method:
   - fiat via Paystack
   - crypto via blockchain
5. confirm whether the payment actually completed
6. confirm whether the app reflects payment completion
7. confirm whether enrollment exists in the lobby
8. only then diagnose the broken stage

## Common Support Cases

## Case 1: "I cannot apply for the cohort"

### Most likely cause

One of the application guards blocked the request.

### What is happening

The app blocks:

- duplicate applications for the same cohort
- applications from users already enrolled in another cohort of the same bootcamp
- invalid or incomplete application data

### Correct support guidance

Check whether the user:

- already has a pending or completed application for that cohort
- is already enrolled in that bootcamp under another cohort
- is trying to reapply instead of continuing an existing pending payment

If they already have a pending application, direct them back to payment rather than telling them to apply again.

## Case 2: "I applied, but I cannot find how to pay"

### Most likely cause

The application exists, but the user lost the payment page path or is now entering from the lobby.

### What is happening

After application submission, the user is redirected to `/payment/[applicationId]`. If they leave that page, the lobby can still surface incomplete applications that need payment.

### Correct support guidance

Tell the user to:

- go to the lobby
- look for incomplete or pending applications
- use the "Complete Payment" action if available

If the app shows a pending application, the user usually does not need to create a new application.

## Case 3: "Paystack did not finish and I do not know whether I am registered"

### Most likely cause

The Paystack popup flow ended ambiguously, or webhook confirmation has not yet been reflected.

### What is happening

The fiat flow depends on:

- Paystack initialization
- payment completion in Paystack
- webhook or fallback verification
- app-side status update

So "payment popup closed" is not the same as "registration completed."

### Correct support guidance

Check:

- whether the user was charged
- whether the application still shows payment pending
- whether the lobby still shows an incomplete application

If the user was charged but the app still shows pending, this is likely a verification or reconciliation issue rather than a failed application.

## Case 4: "I paid with Paystack, but I am not enrolled"

### Most likely cause

Payment succeeded, but enrollment or status reflection did not complete cleanly.

### What is happening

The app is designed to create or reflect enrollment after payment success, but support should treat "payment confirmed" and "cohort visible in lobby" as separate checks.

### Correct support guidance

Check:

1. does the application show payment completed
2. does the lobby still show it as pending
3. does the user have access under current enrollments

If payment is completed but the user still appears stuck in pending state, this is a reconciliation case, not a "pay again" case.

## Case 5: "My crypto transaction succeeded, but the app still says pending"

### Most likely cause

The on-chain transaction was submitted, but backend verification has not completed or has failed to reflect yet.

### What is happening

The crypto flow has distinct stages:

- wallet transaction submitted
- transaction hash sent to backend
- background verification via Edge Function
- payment transaction status update

Support should not assume that a visible wallet transaction automatically means the app has already finalized registration.

### Correct support guidance

Ask for:

- the wallet used
- the transaction hash
- the cohort involved

Then explain:

- on-chain success and app verification are related but separate
- if funds left the wallet but the app timed out, support should treat this as a verification follow-up, not as a fresh-payment instruction

## Case 6: "The app says I am already enrolled, but I cannot access the cohort I wanted"

### Most likely cause

The user is already enrolled in the same bootcamp under another cohort, and the app correctly blocked duplicate registration into a second cohort.

### What is happening

The app prevents multiple registrations into different cohorts of the same bootcamp.

### Correct support guidance

Tell the user:

- the app treats enrollment at the bootcamp level when guarding duplicate cohort registration
- they may already have active access through another cohort

Then help them locate the enrolled cohort in the lobby instead of trying to make a second payment.

## Case 7: "I paid, but the lobby still says payment pending"

### Most likely cause

There is a status mismatch between payment state and user-visible application state.

### What is happening

The lobby explicitly surfaces some mismatches so they can be resolved instead of hidden.

This is why a user may see:

- payment completed underneath
- but a pending-style application alert in the lobby

### Correct support guidance

Treat this as a reconciliation problem.

Do not tell the user to submit a second payment immediately. First verify whether:

- payment already completed
- enrollment already exists
- the lobby is surfacing a stale or mismatched state

## Case 8: "The app will not let me pay again"

### Most likely cause

The app is correctly blocking duplicate payment because:

- payment is already completed
- the user is already enrolled in that bootcamp
- the user already has a valid pending application

### What is happening

Both the fiat and crypto initialization endpoints validate duplicate or already-enrolled states before proceeding.

### Correct support guidance

Tell the user:

- the app is preventing duplicate payment intentionally
- the next step is to recover the existing application or enrollment state, not create a new charge

## Case 9: "Crypto payment says wallet not connected or wrong wallet"

### Most likely cause

The crypto path depends on an active wallet and a valid on-chain purchase flow.

### What is happening

The blockchain payment flow requires:

- a connected wallet
- a valid wallet address
- the correct selected chain context
- successful purchase flow through the current wallet

### Correct support guidance

Check:

- whether the wallet is connected
- whether the user is using the intended wallet
- whether the cohort lock address and amount flow initialized successfully

If the issue is at wallet-connection stage, this is not yet a payment verification issue.

## Case 10: "I used the wrong currency or wrong payment route"

### Most likely cause

The user is trying to use the wrong backend for the selected amount.

### What is happening

The current design is strict:

- NGN goes through Paystack
- USD goes through blockchain

### Correct support guidance

Do not frame this as the app randomly refusing payment. Explain that the payment route is determined by the selected currency and the current cohort pricing.

## Good Support Language

Use language like:

- "This looks like an application-stage issue, not a payment-stage issue."
- "Your payment may be complete, but the enrollment reflection may still need reconciliation."
- "The blockchain transaction and the app verification are separate steps."
- "You likely do not need to pay again. We need to confirm whether the existing payment already succeeded."
- "The app prevents duplicate cohort registration inside the same bootcamp."

## Language To Avoid

Avoid saying:

- "Just pay again"
- "The app lost your payment"
- "If the popup closed, the payment failed"
- "If the transaction mined, registration must already be complete"
- "You can register for another cohort in the same bootcamp anyway"

Those statements are often wrong and can make the problem worse.

## Escalate When

Escalate beyond normal support handling when:

- the user was charged in Paystack but app payment status is still not resolved after normal verification time
- an on-chain crypto payment clearly succeeded but the backend never reflected completion
- the user has a payment-completed state but no enrollment and no normal self-recovery path
- the user appears blocked by conflicting or orphaned application records
- the user may need admin-side reconciliation rather than normal end-user guidance

## Short Version

Support should break registration issues into stages:

- application created
- payment initiated
- payment completed
- payment verified
- enrollment reflected
- cohort access visible

Most registration issues are not "the whole flow failed." They are one stage failing to catch up with the next one. Identifying that exact stage is the key to resolving the problem correctly.

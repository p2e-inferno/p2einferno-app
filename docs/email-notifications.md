# Email Notifications

This project sends transactional emails for payments, renewals, withdrawals, and new user signups.
Email delivery is handled via Mailgun and is designed to be non-blocking for core workflows.

## Triggers
- Payment success (Paystack webhook + manual verification)
- Blockchain payment verification (Supabase Edge Function)
- XP subscription renewal success
- DG withdrawal success
- New user profile creation (welcome email)

## Deduplication
All transactional emails are deduplicated using the `email_events` table.
Each send attempt uses a `dedup_key` that controls the semantics:
- `profile:${userProfileId}` for welcome emails (send only once per profile)
- `payment:${recipientEmail}` for payment notifications
- `withdrawal:${withdrawalId}` for withdrawals

## Environment Variables
Set these in `.env.local` and Supabase secrets (Edge Functions):

```
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_API_KEY=key-xxxxxxxxxxxx
MAILGUN_FROM="P2E Inferno <noreply@yourdomain.com>"
MAILGUN_API_URL=https://api.mailgun.net
MAILGUN_TEST_MODE=false
NEXT_PUBLIC_APP_URL=https://app.p2einferno.com
```

## Retry Strategy
Failed sends are recorded with `status = failed` in `email_events`.
Optional: enqueue into `email_send_queue` for scheduled retries or manual admin replays.

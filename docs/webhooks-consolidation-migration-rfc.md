# Webhooks Consolidation Migration RFC

## Objective

Standardize webhook ingress paths and reduce endpoint fragmentation while preserving backwards compatibility for existing provider callback URLs.

## Current State

Runtime webhook ingress endpoints:
- `app/api/webhooks/meta/whatsapp/route.ts`
- `app/api/webhooks/meta/whatsapp/health/route.ts`
- `pages/api/webhooks/telegram.ts`
- `pages/api/payment/webhook.ts`

Observations:
- Mixed router generations (App Router + Pages Router).
- Inconsistent URL taxonomy:
  - Telegram is under `/api/webhooks/...`
  - Paystack is under `/api/payment/webhook`
- Shared logic is partially colocated with route files rather than consistently in provider modules.

## Decision

Adopt one canonical ingress convention:

- `app/api/webhooks/<provider>/route.ts`

Keep legacy endpoints as thin compatibility wrappers during migration.

## Target Architecture

Canonical endpoints:
- `app/api/webhooks/meta/whatsapp/route.ts` (already canonical)
- `app/api/webhooks/telegram/route.ts`
- `app/api/webhooks/paystack/route.ts`

Internal shared modules:
- `lib/webhooks/meta-whatsapp/*` (already present)
- `lib/webhooks/telegram/*`
- `lib/webhooks/paystack/*`

Legacy wrappers (temporary):
- `pages/api/webhooks/telegram.ts` -> delegate to canonical telegram handler
- `pages/api/payment/webhook.ts` -> delegate to canonical paystack handler

## Non-Goals

- Changing provider payload semantics.
- Changing auth/signature models.
- Immediate deletion of legacy endpoints.

## Migration Plan

### Phase 1: Introduce Canonical Endpoints

1. Add `app/api/webhooks/telegram/route.ts`.
2. Add `app/api/webhooks/paystack/route.ts`.
3. Move provider-specific business logic into `lib/webhooks/{provider}` modules.

### Phase 2: Convert Legacy Endpoints to Wrappers

1. Replace logic in `pages/api/webhooks/telegram.ts` with a thin adapter/proxy to canonical code.
2. Replace logic in `pages/api/payment/webhook.ts` with a thin adapter/proxy to canonical code.
3. Ensure no duplicated business logic remains in legacy wrappers.

### Phase 3: Provider Callback Migration

1. Update Telegram webhook callback to `/api/webhooks/telegram`.
2. Update Paystack webhook callback to `/api/webhooks/paystack`.
3. Keep old callbacks active during grace period.

### Phase 4: Deprecation and Removal

1. Monitor old endpoint traffic.
2. When old callback traffic reaches zero for a defined period, remove wrappers.

## Compatibility Strategy

- Legacy routes remain reachable during migration.
- Canonical routes become the only location for logic changes.
- Wrappers remain pass-through only.

## Security Requirements

- Preserve current signature verification behavior per provider.
- Preserve timing-safe compare where used.
- Keep secrets strictly in server-side env vars.
- Do not log raw sensitive payloads.

## Testing Strategy

Required tests per provider:
- Signature/auth pass/fail.
- Supported/unsupported method behavior.
- Valid payload success path.
- Error path behavior.

Migration-specific tests:
- Wrapper routes delegate correctly to canonical logic.
- Canonical and wrapper responses remain behaviorally equivalent.

## Rollout Checklist

1. Canonical route created.
2. Logic extracted to `lib/webhooks/{provider}`.
3. Wrapper converted and covered by tests.
4. Provider dashboard callback updated.
5. Monitor logs/metrics for failures and retry spikes.
6. Remove wrapper only after stable no-traffic window.

## Risks and Mitigations

Risk: Callback URL mismatch during cutover.
- Mitigation: Keep wrappers live; update provider config first, remove later.

Risk: Divergent behavior between wrapper and canonical endpoint.
- Mitigation: Wrapper-only delegation and equivalence tests.

Risk: Breaking hidden consumers of legacy paths.
- Mitigation: Track endpoint traffic before removal.

## Acceptance Criteria

- All webhook business logic is canonicalized under `app/api/webhooks/*` + `lib/webhooks/*`.
- Legacy pages routes contain no business logic (wrapper only).
- Provider callbacks are switched to canonical paths.
- Tests pass for canonical routes and wrappers.

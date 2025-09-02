# Content Security Policy (CSP) Implementation Guide

## Overview
This document summarizes the CSP implementation for the p2einferno-app, including:
- CSP endpoint setup
- Testing methodology
- Production rollout strategy

---

## 1. Implementation Summary

### Key Components Implemented:
1. **CSP Report Endpoint**
   - Location: `pages/api/security/csp-report.ts`
   - Features:
     - Supports both `application/csp-report` and `application/json` content types
     - Rate limiting (5 requests/minute per IP)
     - Input validation and sanitization
     - Multi-channel logging (console + external services)

2. **Next.js Configuration**
   - Updated `next.config.js` with:
     - CSP directives for all resources
     - Reporting endpoint configuration
     - Security headers (X-Frame-Options, Permissions-Policy)

3. **Testing Results**
   - Verified with:
     - Manual curl tests
     - Browser console violations
     - Edge case testing (malformed reports)

---

## 2. Technical Details

### CSP Directives (from next.config.js) - Updated
```javascript
const directives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `script-src 'self' https://challenges.cloudflare.com https://js.paystack.co${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://*.supabase.co https://api.paystack.co https://pulse.walletconnect.org https://api.web3modal.org https://sepolia.base.org https://mainnet.base.org",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://checkout.paystack.com https://js.paystack.co https://*.paystack.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "report-uri /api/security/csp-report",
  "report-to default"
];
```

### Endpoint Features
- **Rate Limiting**: Prevents abuse with 5 requests/minute per IP
- **Content Type Handling**:
  ```typescript
  if (contentType.includes('application/csp-report')) {
    report = parsedBody['csp-report'];
  } else {
    report = parsedBody; // application/json
  }
  ```
- **Validation**: Checks for required fields (`document-uri`, `violated-directive`)

---

## 3. Production Rollout Plan

### ✅ Phase 1: Report-Only Mode (Completed)
1. ✅ Monitor violations for 1-2 weeks
2. ✅ Address all legitimate violations
3. ✅ Verify no critical functionality is broken

### ✅ Phase 2: Enforcement Mode (Completed - January 2025)
1. ✅ Change header in `next.config.js`:
   ```diff
   - 'Content-Security-Policy-Report-Only'
   + 'Content-Security-Policy'
   ```
2. ✅ Monitor reports for new violations
3. ✅ **Critical fixes applied**:
   - Added WalletConnect domains: `https://pulse.walletconnect.org`, `https://api.web3modal.org`
   - Added Base network RPC: `https://sepolia.base.org`, `https://mainnet.base.org`
   - Verified full Web3 functionality across all pages

### Phase 3: Optimization (Future)
1. Add nonces for inline scripts
2. Implement hashes for static resources
3. Tighten directives based on violation analysis

---

## 4. Maintenance

### Monitoring:
- Review violation reports weekly
- Set up alerts for:
  - Sudden spike in violations
  - Violations from new domains

### Updating Policies:
1. Document all changes to CSP directives
2. Test in Report-Only mode before enforcement
3. Update this guide with changes

---

## 5. Web3 Integration Details

### Domains Added for Full Functionality
**WalletConnect/Reown Integration:**
- `https://pulse.walletconnect.org` - Analytics and telemetry
- `https://api.web3modal.org` - Configuration API for Web3Modal
- `wss://relay.walletconnect.com` - WebSocket relay
- `wss://relay.walletconnect.org` - WebSocket relay
- `https://verify.walletconnect.com` - Verification services
- `https://verify.walletconnect.org` - Verification services

**Blockchain RPC Endpoints:**
- `https://sepolia.base.org` - Base Sepolia testnet
- `https://mainnet.base.org` - Base mainnet
- `https://*.rpc.privy.systems` - Privy RPC services

**Other Integrations:**
- `https://auth.privy.io` - Privy authentication
- `https://*.supabase.co` - Database connections
- `https://api.paystack.co` - Payment processing
- `https://challenges.cloudflare.com` - Cloudflare challenges

### Testing Verification
All pages tested with enforcement mode:
- ✅ Homepage (`/`) - No violations
- ✅ Lobby page (`/lobby`) - No violations  

---

## 6. Troubleshooting

### Common Issues and Solutions

**Issue**: `Refused to connect to 'https://sepolia.base.org'`
**Solution**: Ensure Base network RPC endpoints are included in `connect-src`

**Issue**: `Refused to connect to 'https://pulse.walletconnect.org'`
**Solution**: Add WalletConnect analytics domain to `connect-src`

**Issue**: Wallet connection failures
**Solution**: Verify all WalletConnect domains are allowed in both `connect-src` and `frame-src`

---

## Appendix: Testing Commands

### Test with curl:
```bash
# Standard CSP format
curl -X POST -H "Content-Type: application/csp-report" -d '{"csp-report":{"document-uri":"https://example.com","violated-directive":"script-src-elem"}}' http://localhost:3000/api/security/csp-report

# JSON format
curl -X POST -H "Content-Type: application/json" -d '{"document-uri":"https://example.com","violated-directive":"style-src"}' http://localhost:3000/api/security/csp-report
```

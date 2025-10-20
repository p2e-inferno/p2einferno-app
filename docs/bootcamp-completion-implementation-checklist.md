# Bootcamp Completion Implementation Checklist

This document tracks the implementation status of the bootcamp completion system, including the certificate image handling system.

## Quick Status Overview

**Last Updated**: 2025-10-19
**Overall Status**: ✅ **CORE SYSTEM COMPLETE** (Optional enhancements remain)

### Implementation Breakdown

| Component | Status | Details |
|-----------|--------|---------|
| Database Schema (Migration 085) | ✅ Complete | Certificate image URL column, HTTPS constraint, indexes, Storage bucket |
| Certificate Image Service | ✅ Complete | URL validation, storage/retrieval with 19 passing tests |
| API Endpoints | ✅ Complete | Preview with blockchain verification, save-url with 8 passing tests |
| Client Components | ✅ Complete | Auto-save, blockchain identity resolution, retry fallback |
| Security & Validation | ✅ Complete | URL validation, HTTPS enforcement, ownership checks, blockchain verification |
| User Activity Tracking | 🔴 Optional | Certificate claim/image events not logged to user_activities |
| Dashboard Integration | 🔴 Optional | Certificate display in profile/dashboard not implemented |
| Admin Interface | 🔴 Optional | Certificate management UI not implemented |

**Key Achievement**: Migration 085 successfully implements all critical certificate image handling features including blockchain identity resolution (basename → ENS → wallet address priority) and automatic certificate storage with retry fallback.

---

## Database Schema Verification

1. **Bootcamp Enrollments Table**:
   - ✅ `enrollment_status`: Changes from 'active' to 'completed' when all milestones are done
   - ✅ `certificate_issued`: Boolean flag set when NFT is claimed
   - ✅ `completion_date`: Timestamp when all milestones are completed
   - ✅ `milestones_completed_at`: Timestamp when all milestones are completed
   - ✅ `certificate_issued_at`: Timestamp when certificate NFT is claimed
   - ✅ `certificate_tx_hash`: Transaction hash of the NFT claim
   - ✅ `certificate_attestation_uid`: UID of the EAS attestation (if successful)
   - ✅ `certificate_last_error`: Last error encountered during certificate claiming
   - ✅ `certificate_last_error_at`: Timestamp of the last error
   - ✅ `certificate_retry_count`: Number of retry attempts
   - ✅ `certificate_claim_in_progress`: Lock flag for concurrent operations
   - ✅ `certificate_image_url`: URL of the stored certificate image (added in migration 085)

2. **Database Trigger**:
   - ✅ `trg_check_bootcamp_completion`: Fires on milestone completion to check if bootcamp is complete
   - ✅ Updates `enrollment_status`, `completion_date`, and `milestones_completed_at`
   - ✅ Adds an entry to `user_activities` with type 'bootcamp_completed'

## Schema Updates

1. **Certificate Image Storage** (Migration 085 - COMPLETED):
   - ✅ Added `certificate_image_url` column to `bootcamp_enrollments` table
   - ✅ Added HTTPS constraint to prevent insecure URLs (`certificate_url_https_only`)
   - ✅ Created index for efficient lookups (`idx_be_certificate_image_url`)
   - ✅ Created Supabase Storage bucket 'certificates' with public read access
   - ✅ Set up RLS policies for authenticated uploads, updates, and deletes

## API Endpoints Verification

1. **User Certificate Claim**:
   - ✅ `POST /api/bootcamp/certificate/claim`: Claims the certificate NFT
   - ✅ Checks if the user is eligible (all milestones completed)
   - ✅ Grants an NFT key to the user
   - ✅ Updates database with transaction hash
   - ✅ Attempts attestation (optional)
   - ✅ Certificate image generation/storage handled client-side (by design)

2. **Certificate Preview**:
   - ✅ `GET /api/user/bootcamp/[cohortId]/certificate-preview`: Returns preview data
   - ✅ Checks for stored image URL for claimed certificates (via `CertificateImageService`)
   - ✅ Returns stored image URL when available instead of generating new preview
   - ✅ Checks blockchain state to verify NFT ownership (via `getHasValidKey` contract call)
   - ✅ Resolves blockchain identity (basename → ENS → wallet address)

3. **Certificate Image Management Endpoints**:
   - ✅ `POST /api/certificate/save-url`: Save certificate image URL after upload
   - ⚠️ `GET /api/user/bootcamp/[cohortId]/certificate-image`: Merged into certificate-preview endpoint

## Client-Side Components

1. **Certificate Claim Button**:
   - ✅ Disabled when bootcamp not completed
   - ✅ Disabled when certificate already claimed
   - ✅ Shows "Claim Certificate" when eligible
   - ✅ Shows "Certificate Claimed" when already claimed
   - ✅ Checks blockchain state via API (server-side verification in certificate-preview endpoint)
   - ✅ Preview triggers modal which auto-saves certificate image after successful claim

2. **Certificate Preview Modal**:
   - ✅ Shows certificate preview
   - ✅ Allows downloading certificate
   - ✅ Handles stored image URLs (displays stored image when available)
   - ✅ Auto-saves certificate to Supabase Storage for claimed certificates
   - ✅ Shows "Retry Save" button only if auto-save fails

## Storage Solution

1. **Supabase Storage Setup** (Migration 085):
   - ✅ Created 'certificates' bucket with public read access
   - ✅ Set up RLS policies for authenticated uploads, updates, and deletes
   - ✅ Configured for client-side uploads (CORS handled by Supabase automatically)

## Username Resolution

1. **Certificate Username Resolution**:
   - ✅ Implemented resolution priority: basename > ENS > full address (via `identity-resolver.ts`)
   - ✅ Server-side resolution with 1-hour in-memory cache (reduces RPC calls)
   - ✅ Certificate preview API uses blockchain identity resolution
   - ✅ Fallback to display_name if no wallet or resolution fails

## Data Integrity & Security

1. **URL Validation** (via `CertificateImageService`):
   - ✅ Validates all certificate image URLs against Supabase Storage domain only
   - ✅ Ensures only HTTPS URLs are stored (database constraint + application validation)
   - ✅ Verifies user ownership before saving URLs (via enrollment ownership check)
   - ✅ Comprehensive test coverage for validation logic

2. **Blockchain State Verification**:
   - ✅ Certificate preview API verifies NFT ownership via `getHasValidKey` blockchain call
   - ✅ Consistent method using `createPublicClientUnified()` and `COMPLETE_LOCK_ABI`
   - ✅ Returns blockchain state separately from database state for client verification

## User Experience Improvements

1. **Completion Status Display**:
   - ✅ Show completion badge when bootcamp is completed
   - ✅ Show certificate claimed status when certificate is issued
   - 🔴 **Missing**: Show certificate image in user's profile/dashboard (integration pending)

2. **Error Handling**:
   - ✅ Handle attestation failures gracefully
   - ✅ Allow retrying attestation
   - ✅ Handle image upload failures gracefully (auto-save with retry fallback)

## Admin Interface

1. **Completion Management**:
   - ✅ Fix stuck completion statuses
   - ✅ Grant keys directly
   - ✅ Bulk fix operations
   - ✅ Force-unlock claim locks
   - 🔴 **Missing**: View and manage certificate images

## Integration Points

1. **User Profile Integration**:
   - 🔴 Show completed bootcamps with certificates
   - 🔴 Show certificate image in user profile

2. **Dashboard Integration**:
   - 🔴 Show completion status in dashboard
   - 🔴 Show certificate claim button for completed bootcamps
   - 🔴 Show certificate image for claimed certificates

## User Activity Tracking

1. **Bootcamp Completion Activity**:
   - ✅ Log bootcamp completion in `user_activities` (via database trigger)

2. **Certificate-Specific Activities** (Optional Enhancements):
   - 🔴 **Missing**: Log certificate NFT claim in `user_activities`
   - 🔴 **Missing**: Log certificate image generation/storage in `user_activities`
   - Note: These are optional enhancements for better analytics and user history tracking

## Implementation Status

All phases of the certificate image handling implementation have been completed. See below for reference implementation details.

### Phase 1: Database Schema Update (Migration 085) ✅ COMPLETED

```sql
-- supabase/migrations/085_certificate_image_storage.sql

-- Add column to store certificate image URL
ALTER TABLE public.bootcamp_enrollments
  ADD COLUMN IF NOT EXISTS certificate_image_url TEXT;

-- Add constraint to ensure HTTPS URLs only (security)
ALTER TABLE public.bootcamp_enrollments
  ADD CONSTRAINT certificate_url_https_only
  CHECK (certificate_image_url IS NULL OR certificate_image_url LIKE 'https://%');

-- Index for efficient lookups of certificates with stored images
CREATE INDEX IF NOT EXISTS idx_be_certificate_image_url
  ON public.bootcamp_enrollments (cohort_id, user_profile_id)
  WHERE certificate_image_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.bootcamp_enrollments.certificate_image_url IS
  'Permanent URL to generated certificate image from Supabase Storage. Must be HTTPS.';
```

### Phase 2: Storage Setup ✅ COMPLETED

Implemented in Migration 085 alongside schema updates.

```sql
-- Create public bucket for certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Public read access
CREATE POLICY "Public read access for certificates"
ON storage.objects FOR SELECT
USING (bucket_id = 'certificates');

-- RLS policy: Authenticated users can upload
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'certificates');
```

### Phase 3: Certificate Image Service ✅ COMPLETED

Implemented in `lib/bootcamp-completion/certificate/image-service.ts` with comprehensive test coverage.

Reference implementation:

```typescript
// lib/bootcamp-completion/certificate/image-service.ts

import { getLogger } from '@/lib/utils/logger';
import { createAdminClient } from '@/lib/supabase/server';

const log = getLogger('bootcamp-completion:certificate:image-service');

// Simple URL validation - must be from Supabase Storage
function isValidCertificateUrl(url: string): boolean {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;

    // Must be HTTPS and from our Supabase Storage certificates bucket
    return url.startsWith(`${supabaseUrl}/storage/v1/object/public/certificates/`);
  } catch {
    return false;
  }
}

export class CertificateImageService {
  /**
   * Store certificate image URL in database
   */
  static async storeCertificateImage(
    enrollmentId: string,
    imageUrl: string
  ): Promise<boolean> {
    if (!isValidCertificateUrl(imageUrl)) {
      log.error('Invalid certificate URL', { enrollmentId, imageUrl });
      return false;
    }

    try {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('bootcamp_enrollments')
        .update({ certificate_image_url: imageUrl })
        .eq('id', enrollmentId);

      if (error) throw error;

      log.info('Certificate image stored', { enrollmentId });
      return true;
    } catch (error) {
      log.error('Failed to store certificate image', { enrollmentId, error });
      return false;
    }
  }

  /**
   * Get stored certificate image URL
   */
  static async getCertificateImage(enrollmentId: string): Promise<string | null> {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('bootcamp_enrollments')
        .select('certificate_image_url')
        .eq('id', enrollmentId)
        .single();

      if (error || !data?.certificate_image_url) return null;

      // Validate URL is from Supabase Storage
      if (!isValidCertificateUrl(data.certificate_image_url)) {
        log.warn('Invalid certificate URL in database', { enrollmentId });
        return null;
      }

      return data.certificate_image_url;
    } catch (error) {
      log.error('Failed to get certificate image', { enrollmentId, error });
      return null;
    }
  }
}
```

### Phase 4: API Endpoint to Save Certificate URL ✅ COMPLETED

Implemented in `app/api/certificate/save-url/route.ts` with comprehensive security validation and test coverage.

Reference implementation:

```typescript
// app/api/certificate/save-url/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:certificate:save-url');

export async function POST(req: NextRequest) {
  const user = await getPrivyUserFromNextRequest(req);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { enrollmentId, imageUrl } = await req.json();

  // Validate URL is from Supabase Storage
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!imageUrl.startsWith(`${supabaseUrl}/storage/v1/object/public/certificates/`)) {
    log.warn('Invalid certificate URL', { imageUrl });
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Verify user owns this enrollment
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('privy_user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const { data: enrollment } = await supabase
    .from('bootcamp_enrollments')
    .select('id')
    .eq('id', enrollmentId)
    .eq('user_profile_id', profile.id)
    .single();

  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  // Save URL to database
  const { error } = await supabase
    .from('bootcamp_enrollments')
    .update({ certificate_image_url: imageUrl })
    .eq('id', enrollmentId);

  if (error) {
    log.error('Failed to save certificate URL', { error });
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }

  log.info('Certificate URL saved', { enrollmentId });
  return NextResponse.json({ success: true });
}
```

### Phase 5: Update Certificate Preview Endpoint ✅ COMPLETED

Fully implemented in `app/api/user/bootcamp/[cohortId]/certificate-preview/route.ts` with blockchain verification and identity resolution.

Reference implementation shows the key additions:

```typescript
// app/api/user/bootcamp/[cohortId]/certificate-preview/route.ts

// Add after fetching enrollment data:

// Check blockchain: does user actually have the NFT?
let hasKey = false;
if (userAddress && program.lock_address) {
  const client = createPublicClientUnified();
  hasKey = await client.readContract({
    address: program.lock_address as Address,
    abi: COMPLETE_LOCK_ABI,
    functionName: "getHasValidKey",
    args: [userAddress as Address],
  });
}

// If user has NFT and we have stored image, return it
if (hasKey && enrollment.certificate_image_url) {
  const imageUrl = await CertificateImageService.getCertificateImage(enrollment.id);
  if (imageUrl) {
    return NextResponse.json({
      success: true,
      storedImageUrl: imageUrl,
      isClaimed: true,
      hasKey,
    });
  }
}

// For username, resolve using the following priority:
// 1. Base name (from Base network)
// 2. ENS name (from Ethereum Mainnet)
// 3. Full wallet address (not truncated)
const userName = userAddress ? 
  await resolveCertificateUsername(userAddress, profileData.display_name) : 
  (profileData.display_name || 'Anonymous User');
```

### Phase 6: Client-Side Auto-Save Component ✅ COMPLETED

Implemented in `components/bootcamp/CertificatePreviewModal.tsx` with automatic upload after certificate claim and retry fallback.

Reference implementation shows the key features:

```typescript
// In CertificateClaimButton or a new SaveCertificateButton component

import { createBrowserClient } from '@/lib/supabase/client';

const handleSaveCertificate = async () => {
  try {
    // Generate certificate image
    const { blob } = await generateCertificate({
      element: certificateRef.current,
      data: certificateData,
    });

    // Upload to Supabase Storage
    const fileName = `${enrollmentId}-${Date.now()}.png`;
    const supabase = createBrowserClient();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('certificates')
      .upload(fileName, blob, {
        contentType: 'image/png',
        cacheControl: '31536000', // 1 year
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload failed:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('certificates')
      .getPublicUrl(fileName);

    // Save URL to database
    const response = await fetch('/api/certificate/save-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        imageUrl: publicUrl,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save certificate URL');
    }

    toast.success('Certificate saved successfully!');
  } catch (error) {
    toast.error('Failed to save certificate');
    console.error(error);
  }
};
```

## Implementation Summary

The bootcamp completion and certificate image handling system is **fully implemented and operational**, providing:

### ✅ Completed Features

1. **Database Schema** (Migration 085):
   - Certificate image URL storage with HTTPS constraint
   - Efficient indexing for lookups
   - Supabase Storage bucket with RLS policies

2. **API Layer**:
   - Certificate preview endpoint with blockchain verification and identity resolution
   - Certificate URL save endpoint with security validation
   - Comprehensive test coverage (19 unit tests + 8 API tests)

3. **Client Components**:
   - Auto-save functionality for certificate images after claim
   - Blockchain identity resolution (basename → ENS → wallet address)
   - Retry fallback for failed uploads
   - Preview modal with stored image support

4. **Security & Data Integrity**:
   - URL validation (Supabase Storage domain only)
   - HTTPS-only constraint
   - User ownership verification
   - Blockchain state verification via smart contract calls

### 🔴 Optional Enhancements (Not Critical)

1. **User Activity Tracking**:
   - Log certificate claim events in user_activities table
   - Log certificate image generation events

2. **Dashboard/Profile Integration**:
   - Display certificate images in user profile
   - Show certificate gallery in dashboard

3. **Admin Interface**:
   - View and manage certificate images
   - Regenerate certificates if needed

The core system is complete, secure, and provides an excellent user experience. The optional enhancements above would add analytics and admin capabilities but are not required for the system to function properly.

---

## Optional Features Implementation Guide

This section provides detailed specifications for the optional enhancement features. These features are **not required** for core certificate functionality but would enhance user engagement, analytics, and administrative capabilities.

### Feature 1: User Activity Tracking (Certificate Events)

#### Overview
Extend the existing `user_activities` table tracking to include certificate-specific events. Currently, only bootcamp completion is logged via database trigger. This enhancement adds tracking for certificate claims and image generation.

#### What Gets Tracked

**New Activity Types:**
- `certificate_claimed`: When user successfully claims NFT certificate
- `certificate_image_saved`: When certificate image is saved to storage
- `certificate_downloaded`: When user downloads their certificate
- `certificate_shared`: When user shares certificate (if sharing feature added)

#### User Benefits

**Activity Feed/Timeline Example:**
```
Your Activity
─────────────────────────────
🎓 Certificate Claimed          2 hours ago
   Web3 Fundamentals Bootcamp
   Transaction: 0xabc...def

📸 Certificate Generated        2 hours ago
   Image saved to your profile

🏆 Bootcamp Completed           1 day ago
   All 5 milestones achieved!

✅ Milestone Completed          2 days ago
   "Deploy Your First Smart Contract"

🎯 Quest Completed              3 days ago
   "Build a DeFi Protocol"
```

**Profile Stats Dashboard:**
```
┌─────────────────────────────┐
│  Your Achievements          │
├─────────────────────────────┤
│  🎓 3 Certificates Earned   │
│  📊 This month              │
│                             │
│  🏆 5 Bootcamps Completed   │
│  ⭐ 15 Total Milestones     │
│  🔥 7 Day Streak            │
└─────────────────────────────┘
```

#### Where It Shows Up

1. **User Profile Page**
   - Activity timeline showing recent achievements
   - Chronological feed of all certificate-related events
   - Filter by event type (claims, completions, downloads)

2. **Dashboard Home**
   - "Recent Activity" widget
   - Achievement notifications
   - Progress streaks

3. **Notifications Center**
   - Real-time alerts: "Congratulations! Your certificate is ready"
   - Reminder: "Don't forget to claim your certificate for [Bootcamp]"
   - Social proof: "[User] just earned a certificate in [Bootcamp]"

4. **Email Digests**
   - Weekly summary: "You earned 2 certificates this week"
   - Monthly report: "Your learning journey in [Month]"
   - Achievement milestones: "You've earned your 5th certificate!"

5. **Analytics Dashboard** (Admin)
   - Certificate claim rate: "85% of completions result in claims"
   - Time to claim: "Average 2.3 hours after completion"
   - Download rate: "92% download their certificates"

#### Implementation Approach

**Database Schema:**
```sql
-- No schema changes needed - user_activities table already exists
-- Just add new activity types:

-- Example insert for certificate claim
INSERT INTO user_activities (
  user_profile_id,
  activity_type,
  metadata,
  created_at
) VALUES (
  'profile-uuid',
  'certificate_claimed',
  jsonb_build_object(
    'bootcamp_id', 'bootcamp-uuid',
    'cohort_id', 'cohort-uuid',
    'enrollment_id', 'enrollment-uuid',
    'tx_hash', '0xabc...def',
    'attestation_uid', 'uid-if-available'
  ),
  NOW()
);
```

**API Integration Points:**
1. **Certificate Claim API** (`/api/bootcamp/certificate/claim`):
   - Add activity log after successful claim
   - Include transaction hash in metadata

2. **Certificate Save URL API** (`/api/certificate/save-url`):
   - Add activity log after successful storage save
   - Include storage URL in metadata

3. **Certificate Download** (Client-side):
   - Optional: POST to `/api/user/activity/log` on download
   - Track download patterns

**UI Component Example:**
```typescript
// components/profile/ActivityFeed.tsx
export function ActivityFeed({ userId }: { userId: string }) {
  const activities = useUserActivities(userId, {
    types: ['bootcamp_completed', 'certificate_claimed', 'certificate_image_saved'],
    limit: 10
  });

  return (
    <div className="space-y-4">
      {activities.map(activity => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}
```

#### Why It's Optional
- ✅ Core certificate functionality works without activity tracking
- ✅ Users can still claim, view, and download certificates
- ✅ Primarily adds engagement and analytics value
- ⚠️ Requires UI development for activity feed components
- ⚠️ Increases database writes (minimal performance impact)

---

### Feature 2: Dashboard Integration

#### Overview
Display completed bootcamps and claimed certificates prominently on the main dashboard. Currently, certificates are only visible within the bootcamp detail pages. This enhancement brings certificates to the forefront of the user experience.

#### Current State vs. Enhanced State

**Current:**
- Certificates viewable only in bootcamp detail pages
- Users must navigate: Dashboard → Bootcamps → Specific Bootcamp → Certificate
- No visual reminder of achievements on main dashboard

**Enhanced:**
- Certificates displayed on main dashboard
- One-click access to view/download
- Visual achievement showcase
- Clear indication of claimable certificates

#### Dashboard Layout Design

**"Your Certificates" Section:**
```
┌─────────────────────────────────────────────────────────┐
│ 🏆 Your Certificates (3)                    [View All] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐             │
│  │ [Certificate    │  │ [Certificate    │             │
│  │  Thumbnail]     │  │  Thumbnail]     │             │
│  │                 │  │                 │             │
│  │ Web3 Fundament. │  │ DeFi Mastery    │             │
│  │ Completed:      │  │ Completed:      │             │
│  │ Jan 15, 2025    │  │ Dec 20, 2024    │             │
│  │                 │  │                 │             │
│  │ [View] [Download│  │ [View] [Download│             │
│  │       [Share]   │  │       [Share]   │             │
│  └─────────────────┘  └─────────────────┘             │
│                                                         │
│  ┌─────────────────┐                                   │
│  │ [Certificate    │                                   │
│  │  Thumbnail]     │                                   │
│  │                 │                                   │
│  │ NFT Development │                                   │
│  │ Completed:      │                                   │
│  │ Nov 8, 2024     │                                   │
│  │                 │                                   │
│  │ [View] [Download│                                   │
│  │       [Share]   │                                   │
│  └─────────────────┘                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**"Bootcamps In Progress" with Claim Prompts:**
```
┌─────────────────────────────────────────────────────────┐
│ 📚 Bootcamps In Progress                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Smart Contract Security                                │
│  Progress: ████████░░ 80% (4/5 milestones)             │
│  Next: "Security Auditing Fundamentals"                 │
│  [Continue →]                                           │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  NFT Development                    ✅ READY TO CLAIM!  │
│  Progress: ██████████ 100% (5/5 milestones)            │
│                                                         │
│  🎉 Congratulations! All milestones completed.          │
│  [🎓 Claim Certificate Now!] [Preview Certificate]      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Quick Stats Widget:**
```
┌──────────────────────────┐
│  Your Achievements       │
├──────────────────────────┤
│  🎓  3 Certificates      │
│  🏆  5 Bootcamps         │
│  ✅  47 Milestones       │
│  🔥  12 Day Streak       │
│                          │
│  [View Profile]          │
└──────────────────────────┘
```

#### User Experience Flow

**Scenario 1: Certificate Ready to Claim**
```
User logs in
    ↓
Dashboard loads
    ↓
Sees prominent banner: "🎉 You completed NFT Development! Claim your certificate"
    ↓
User clicks [Claim Certificate Now!]
    ↓
Certificate preview modal opens (already implemented)
    ↓
User clicks [Claim Certificate]
    ↓
Transaction processes
    ↓
Success notification: "Certificate claimed! ✓"
    ↓
Dashboard updates automatically:
  - Certificate moves to "Your Certificates" section
  - In-progress section updates
  - Stats widget increments certificate count
```

**Scenario 2: Quick Certificate Access**
```
User wants to download certificate for job application
    ↓
Opens dashboard (not buried in bootcamp pages)
    ↓
Sees "Your Certificates" section
    ↓
Clicks [Download] on desired certificate
    ↓
Certificate downloads immediately (no navigation needed)
    ↓
User can quickly share/upload to LinkedIn
```

**Scenario 3: Social Sharing**
```
User proud of achievement
    ↓
Dashboard shows certificate prominently
    ↓
Clicks [Share] button on certificate
    ↓
Share modal opens with options:
  - Twitter: Pre-filled tweet with certificate image
  - LinkedIn: Share to profile
  - Copy Link: Direct link to certificate view
    ↓
User shares on social media
    ↓
Drives engagement and platform awareness
```

#### Implementation Components

**1. Dashboard Certificate Gallery Component:**
```typescript
// components/dashboard/CertificateGallery.tsx
export function CertificateGallery() {
  const { data: certificates } = useUserCertificates();

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          🏆 Your Certificates ({certificates.length})
        </h2>
        <Link href="/profile/certificates">View All →</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {certificates.map(cert => (
          <CertificateCard key={cert.id} certificate={cert} />
        ))}
      </div>
    </section>
  );
}
```

**2. Claimable Certificates Alert:**
```typescript
// components/dashboard/ClaimableCertificates.tsx
export function ClaimableCertificates() {
  const { data: claimable } = useClaimableCertificates();

  if (claimable.length === 0) return null;

  return (
    <Alert className="mb-6 bg-gradient-to-r from-flame-yellow/20 to-flame-orange/20">
      <Trophy className="h-5 w-5" />
      <AlertTitle>🎉 Certificate Ready to Claim!</AlertTitle>
      <AlertDescription>
        You completed {claimable[0].bootcampName}.
        <Button onClick={() => openClaimModal(claimable[0])}>
          Claim Your Certificate Now!
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

**3. Achievement Stats Widget:**
```typescript
// components/dashboard/AchievementStats.tsx
export function AchievementStats() {
  const stats = useUserStats();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Achievements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatRow icon="🎓" label="Certificates" value={stats.certificates} />
        <StatRow icon="🏆" label="Bootcamps" value={stats.bootcamps} />
        <StatRow icon="✅" label="Milestones" value={stats.milestones} />
        <StatRow icon="🔥" label="Day Streak" value={stats.streak} />
      </CardContent>
    </Card>
  );
}
```

**4. Data Fetching Hook:**
```typescript
// hooks/useUserCertificates.ts
export function useUserCertificates() {
  return useQuery({
    queryKey: ['user-certificates'],
    queryFn: async () => {
      const res = await fetch('/api/user/certificates');
      return res.json();
    }
  });
}
```

**5. Required API Endpoint:**
```typescript
// app/api/user/certificates/route.ts
export async function GET(req: NextRequest) {
  const user = await getPrivyUserFromNextRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Fetch all certificates for user
  const { data: certificates } = await supabase
    .from('bootcamp_enrollments')
    .select(`
      id,
      completion_date,
      certificate_issued,
      certificate_image_url,
      cohorts(
        name,
        bootcamp_programs(name, lock_address)
      )
    `)
    .eq('user_profile_id', profileId)
    .eq('enrollment_status', 'completed')
    .eq('certificate_issued', true);

  return NextResponse.json({ certificates });
}
```

#### User Benefits

**Visibility & Motivation:**
- ✅ Certificates prominently displayed (not hidden)
- ✅ Visual reminder of learning journey
- ✅ Motivates continued participation
- ✅ Gamification through stats display

**Quick Access:**
- ✅ Download certificates without deep navigation
- ✅ Share achievements directly from dashboard
- ✅ One-click to view all credentials

**Status Awareness:**
- ✅ Clear indication when certificate is ready to claim
- ✅ See all bootcamp statuses at a glance
- ✅ Track progress across multiple bootcamps

**Social Proof:**
- ✅ Easy sharing to social media
- ✅ Professional credential display
- ✅ Drives platform engagement

#### Why It's Optional
- ✅ Core certificate claiming works without dashboard integration
- ✅ Users can still access certificates via bootcamp pages
- ⚠️ Requires significant UI/UX development work
- ⚠️ Needs responsive design for mobile/tablet
- ⚠️ Additional API endpoints needed
- ⚠️ Increased page load (more data fetching)

---

### Feature 3: Profile Integration

#### Overview
Display earned certificates on the user's public profile page, creating a verifiable credential showcase similar to LinkedIn's "Licenses & Certifications" section, but with blockchain verification.

#### Current State vs. Enhanced State

**Current:**
- Profile shows: display name, wallet address, basic info
- No certificate display
- No achievement showcase
- No social proof of completed bootcamps

**Enhanced:**
- Certificate gallery on public profile
- Blockchain-verified credentials
- Professional portfolio showcase
- Shareable profile link with achievements

#### Profile Page Layout

**Public Profile View:**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              👤 Jane Developer                           │
│              jane.base.eth                               │
│              0x1234...5678                               │
│              Member since: Nov 2024                      │
│              [Edit Profile] (if own profile)             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🎓 Certificates & Achievements                          │
│                                                          │
│  [Grid of Certificate Thumbnails]                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │          │ │          │ │          │               │
│  │  Web3    │ │   DeFi   │ │   NFT    │               │
│  │  Fund.   │ │  Master  │ │   101    │               │
│  │          │ │          │ │          │               │
│  │ Jan 2025 │ │ Dec 2024 │ │ Nov 2024 │               │
│  │          │ │          │ │          │               │
│  │ [View ✓] │ │ [View ✓] │ │ [View ✓] │               │
│  └──────────┘ └──────────┘ └──────────┘               │
│                                                          │
│  ✓ = Blockchain verified                                │
│  Click any certificate to view full size                 │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Learning Stats                                       │
│  • 3 Bootcamps Completed                                 │
│  • 15 Milestones Achieved                                │
│  • 45 Quests Completed                                   │
│  • Active for 89 days                                    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🏆 Recent Achievements                                  │
│  • Completed "DeFi Mastery" bootcamp - 2 weeks ago      │
│  • Earned "Smart Contract Expert" badge - 3 weeks ago   │
│  • Completed 10 milestones - 1 month ago                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Certificate Detail Modal (when clicking thumbnail):**
```
┌──────────────────────────────────────────────────────────┐
│  🎓 Web3 Fundamentals Certificate                        │
│                                                          │
│  [Full-size certificate image displayed here]            │
│                                                          │
│  ────────────────────────────────────────────────────    │
│                                                          │
│  📋 Certificate Details                                  │
│  • Issued to: jane.base.eth                              │
│  • Bootcamp: Web3 Fundamentals                           │
│  • Completion Date: January 15, 2025                     │
│  • Lock Address: 0xabc...def                             │
│                                                          │
│  🔗 Blockchain Verification                              │
│  • NFT Verified: ✅ Yes                                  │
│  • Transaction: 0xabc...def [View on Basescan →]        │
│  • Attestation: Available [View →]                       │
│                                                          │
│  [Download Certificate] [Share] [Close]                  │
└──────────────────────────────────────────────────────────┘
```

#### User Experience Scenarios

**Scenario 1: Job Application**
```
Developer applies for Web3 position
    ↓
Includes P2E Inferno profile link in application
    ↓
Hiring manager clicks link → Views profile
    ↓
Sees certificate gallery immediately
    ↓
Clicks certificate → Views full-size certificate
    ↓
Clicks [View on Basescan] → Verifies NFT ownership on blockchain
    ↓
Hiring manager thinks: "These are verified credentials, not just claims"
    ↓
Increased trust and credibility for candidate
```

**Scenario 2: Community Building**
```
User completes bootcamp
    ↓
Posts on Twitter: "Just completed @P2EInferno Web3 bootcamp! 🎓"
    ↓
Includes profile link: p2einferno.com/profile/jane.base.eth
    ↓
Community members click link
    ↓
Profile shows certificate gallery + stats
    ↓
Users see: "This person has real, verified skills"
    ↓
Builds trust and credibility in community
    ↓
Drives platform awareness and new sign-ups
```

**Scenario 3: Professional Networking**
```
User attends Web3 conference
    ↓
Shares profile QR code on business card
    ↓
Contact scans QR → Opens profile
    ↓
Instantly sees credentials and achievements
    ↓
Contact: "Impressive! Let's connect on LinkedIn too"
    ↓
Faster networking and trust building
```

**Scenario 4: Portfolio Building**
```
Developer building Web3 portfolio
    ↓
Links to P2E Inferno profile from:
  - GitHub README
  - Personal website
  - LinkedIn profile
  - Twitter bio
    ↓
Anyone visiting these sites can:
  - See verified credentials
  - Verify blockchain ownership
  - Assess skill level
    ↓
Professional credibility established
```

#### Implementation Components

**1. Profile Page with Certificates:**
```typescript
// app/profile/[username]/page.tsx
export default async function ProfilePage({
  params
}: {
  params: { username: string }
}) {
  const profile = await getUserProfile(params.username);
  const certificates = await getUserCertificates(profile.id);

  return (
    <div className="container mx-auto py-8">
      <ProfileHeader user={profile} />

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-6">
          🎓 Certificates & Achievements
        </h2>
        <CertificateGallery certificates={certificates} />
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">📊 Learning Stats</h2>
        <UserStats userId={profile.id} />
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">🏆 Recent Achievements</h2>
        <RecentAchievements userId={profile.id} />
      </section>
    </div>
  );
}
```

**2. Certificate Gallery Component:**
```typescript
// components/profile/CertificateGallery.tsx
export function CertificateGallery({
  certificates
}: {
  certificates: Certificate[]
}) {
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  if (certificates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Trophy className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p>No certificates earned yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {certificates.map(cert => (
          <CertificateCard
            key={cert.id}
            certificate={cert}
            onClick={() => setSelectedCert(cert)}
          />
        ))}
      </div>

      <CertificateDetailModal
        certificate={selectedCert}
        open={!!selectedCert}
        onClose={() => setSelectedCert(null)}
      />
    </>
  );
}
```

**3. Certificate Card with Verification Badge:**
```typescript
// components/profile/CertificateCard.tsx
export function CertificateCard({
  certificate,
  onClick
}: CertificateCardProps) {
  const { data: verified } = useBlockchainVerification(
    certificate.lockAddress,
    certificate.userWallet
  );

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardHeader>
        <div className="relative">
          {certificate.imageUrl ? (
            <Image
              src={certificate.imageUrl}
              alt={`${certificate.bootcampName} Certificate`}
              width={400}
              height={300}
              className="rounded-lg"
            />
          ) : (
            <div className="h-48 bg-gray-800 rounded-lg flex items-center justify-center">
              <Trophy className="h-16 w-16 text-gray-600" />
            </div>
          )}

          {verified && (
            <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Verified
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <h3 className="font-bold text-lg mb-2">{certificate.bootcampName}</h3>
        <p className="text-sm text-gray-400">
          Completed: {formatDate(certificate.completionDate)}
        </p>
      </CardContent>

      <CardFooter>
        <Button variant="outline" size="sm" className="w-full">
          View Certificate →
        </Button>
      </CardFooter>
    </Card>
  );
}
```

**4. Certificate Detail Modal with Blockchain Verification:**
```typescript
// components/profile/CertificateDetailModal.tsx
export function CertificateDetailModal({
  certificate,
  open,
  onClose
}: CertificateDetailModalProps) {
  const { data: verification } = useBlockchainVerification(
    certificate?.lockAddress,
    certificate?.userWallet
  );

  if (!certificate) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            🎓 {certificate.bootcampName} Certificate
          </DialogTitle>
        </DialogHeader>

        {/* Certificate Image */}
        <div className="mb-6">
          <Image
            src={certificate.imageUrl}
            alt="Certificate"
            width={1200}
            height={800}
            className="rounded-lg shadow-xl"
          />
        </div>

        {/* Certificate Details */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-bold mb-3">📋 Certificate Details</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-400">Issued to:</dt>
                <dd className="font-mono">{certificate.userName}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Bootcamp:</dt>
                <dd>{certificate.bootcampName}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Completion Date:</dt>
                <dd>{formatDate(certificate.completionDate)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Lock Address:</dt>
                <dd className="font-mono text-xs break-all">
                  {certificate.lockAddress}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="font-bold mb-3">🔗 Blockchain Verification</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-400">NFT Verified:</dt>
                <dd className="flex items-center gap-2">
                  {verification?.hasKey ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-green-500">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-500">Not Found</span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Transaction:</dt>
                <dd>
                  <a
                    href={`https://basescan.org/tx/${certificate.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-flame-yellow hover:underline flex items-center gap-1"
                  >
                    {truncateAddress(certificate.txHash)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
              {certificate.attestationUid && (
                <div>
                  <dt className="text-gray-400">Attestation:</dt>
                  <dd>
                    <a
                      href={`https://base.easscan.org/attestation/view/${certificate.attestationUid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-flame-yellow hover:underline flex items-center gap-1"
                    >
                      View on EAS
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Actions */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => downloadCertificate(certificate)}>
            <Download className="h-4 w-4 mr-2" />
            Download Certificate
          </Button>
          <Button onClick={() => shareCertificate(certificate)}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**5. Public Profile API Endpoint:**
```typescript
// app/api/profile/[username]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params;
  const supabase = createAdminClient();

  // Find user by username (basename, ENS, or display_name)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .or(`display_name.eq.${username},wallet_address.eq.${username}`)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Get certificates
  const { data: certificates } = await supabase
    .from('bootcamp_enrollments')
    .select(`
      id,
      completion_date,
      certificate_issued_at,
      certificate_tx_hash,
      certificate_attestation_uid,
      certificate_image_url,
      cohorts(
        name,
        bootcamp_programs(name, lock_address)
      )
    `)
    .eq('user_profile_id', profile.id)
    .eq('enrollment_status', 'completed')
    .eq('certificate_issued', true);

  return NextResponse.json({
    profile: {
      displayName: profile.display_name,
      walletAddress: profile.wallet_address,
      memberSince: profile.created_at,
    },
    certificates,
    stats: {
      bootcampsCompleted: certificates.length,
      // ... other stats
    }
  });
}
```

**6. Blockchain Verification Hook:**
```typescript
// hooks/useBlockchainVerification.ts
export function useBlockchainVerification(
  lockAddress: string | undefined,
  userWallet: string | undefined
) {
  return useQuery({
    queryKey: ['blockchain-verification', lockAddress, userWallet],
    queryFn: async () => {
      if (!lockAddress || !userWallet) return { hasKey: false };

      const client = createPublicClientUnified();
      const hasKey = await client.readContract({
        address: lockAddress as Address,
        abi: COMPLETE_LOCK_ABI,
        functionName: 'getHasValidKey',
        args: [userWallet as Address],
      });

      return { hasKey };
    },
    enabled: !!lockAddress && !!userWallet,
  });
}
```

#### User Benefits

**Credibility & Proof:**
- ✅ Showcase verified credentials to employers/community
- ✅ Blockchain verification prevents fraud
- ✅ Professional portfolio showcase
- ✅ Instant credibility check

**Social Proof:**
- ✅ Share profile link on LinkedIn, Twitter, GitHub
- ✅ QR codes for business cards
- ✅ Build reputation in Web3 community
- ✅ Drive platform awareness

**Comparison with Traditional Credentials:**

| Feature | LinkedIn Certificates | P2E Inferno (with Profile Integration) |
|---------|----------------------|----------------------------------------|
| Display | ✅ Yes | ✅ Yes |
| Verification | ❌ Self-reported | ✅ Blockchain-verified |
| Fraud Prevention | ❌ Easily faked | ✅ NFT ownership required |
| Visual Proof | ❌ Text only | ✅ Certificate images |
| Instant Verification | ❌ Manual check needed | ✅ One-click blockchain check |
| Portability | ❌ Platform-locked | ✅ Decentralized, owned by user |

#### Why It's Optional
- ✅ Core certificate functionality works without profile integration
- ✅ Users can manually share downloaded certificates
- ⚠️ Requires public profile system (privacy considerations)
- ⚠️ Significant UI/UX development effort
- ⚠️ Needs username/URL routing system
- ⚠️ Additional API endpoints required
- ⚠️ Blockchain verification adds RPC load

---

### Feature 4: Admin Interface (Certificate Management)

#### Overview
Admin dashboard for viewing, managing, and troubleshooting certificate images. Provides tools for quality control, user support, and storage management.

#### Current Admin Capabilities

**Existing Admin Tools:**
- ✅ Grant keys directly to users
- ✅ Fix stuck completion statuses
- ✅ Bulk fix operations
- ✅ Force-unlock claim locks

**Missing Admin Tools:**
- ❌ View certificate images
- ❌ Regenerate certificates
- ❌ Delete invalid/outdated certificates
- ❌ Debug failed certificate generation/storage
- ❌ Storage usage monitoring
- ❌ Bulk certificate operations

#### Admin Dashboard Design

**Certificate Management Dashboard:**
```
┌──────────────────────────────────────────────────────────────┐
│  🔧 Admin: Certificate Management                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Search: [username or bootcamp]              [Search]       │
│                                                              │
│  Filters: [All Status ▼] [All Bootcamps ▼] [Date Range ▼] │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ User: jane.base.eth (Jane Developer)                    ││
│  │ Bootcamp: Web3 Fundamentals                             ││
│  │ Cohort: January 2025                                    ││
│  │ Status: ✅ Claimed | 📸 Image Saved                     ││
│  │                                                         ││
│  │ Certificate Image:                                      ││
│  │ [Thumbnail Preview]                                     ││
│  │                                                         ││
│  │ Certificate URL:                                        ││
│  │ https://...supabase.co/.../abc123.png                  ││
│  │                                                         ││
│  │ Details:                                                ││
│  │ • Claimed: Jan 15, 2025 3:42 PM                        ││
│  │ • NFT Verified: ✅ Yes                                  ││
│  │ • Tx Hash: 0xabc...def [View →]                        ││
│  │ • Attestation: eas:0x123...abc [View →]                ││
│  │                                                         ││
│  │ [View Full] [Regenerate] [Delete] [Download]           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ User: bob.eth (Bob Smith)                               ││
│  │ Bootcamp: DeFi Mastery                                  ││
│  │ Cohort: December 2024                                   ││
│  │ Status: ⚠️ Claimed | ❌ Image Save Failed               ││
│  │                                                         ││
│  │ Error Details:                                          ││
│  │ • Last Error: Storage upload timeout                   ││
│  │ • Error Time: Jan 14, 2025 11:23 PM                    ││
│  │ • Retry Count: 3/3                                      ││
│  │ • User Notified: No                                     ││
│  │                                                         ││
│  │ [Force Regenerate] [Manual Upload] [View Logs]         ││
│  │ [Notify User] [Reset Retry Counter]                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ User: alice.eth (Alice Johnson)                         ││
│  │ Bootcamp: Smart Contract Security                       ││
│  │ Cohort: November 2024                                   ││
│  │ Status: ✅ Claimed | ⚠️ Image Validation Warning        ││
│  │                                                         ││
│  │ Warning: Certificate displays outdated ENS name         ││
│  │ • Current Name: alice.eth                               ││
│  │ • Certificate Shows: alice-old.eth                      ││
│  │                                                         ││
│  │ [Regenerate with Updated Name] [Dismiss Warning]       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Pagination: [← Previous] Page 1 of 15 [Next →]            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Storage Management Dashboard:**
```
┌──────────────────────────────────────────────────────────────┐
│  💾 Storage Management                                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Total Storage Used: 1.2 GB / 10 GB                         │
│  ████████████░░░░░░░░ 12% used                              │
│                                                              │
│  Certificate Images: 1,247 files                            │
│  Average File Size: 982 KB                                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Storage Breakdown                                       ││
│  │                                                         ││
│  │ • Valid Certificates:     1,180 files (1.15 GB)        ││
│  │ • Failed Uploads:         45 files (43 MB)             ││
│  │ • Duplicate Images:       15 files (14 MB)             ││
│  │ • Orphaned Files:         7 files (6 MB)               ││
│  │                                                         ││
│  │ [Clean Up Duplicates] [Remove Orphaned Files]          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Recent Activity:                                            │
│  • 23 certificates uploaded today                           │
│  • 2 failed uploads (auto-retry in progress)                │
│  • 1 manual regeneration by admin                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Bulk Operations Interface:**
```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ Bulk Certificate Operations                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Operation:                                           │
│  [Regenerate Certificates ▼]                                │
│                                                              │
│  Scope:                                                      │
│  ⚪ All Certificates                                         │
│  ⚪ Specific Bootcamp: [Select Bootcamp ▼]                  │
│  🔘 Date Range: [Jan 1, 2025] to [Jan 31, 2025]            │
│  ⚪ Custom Selection (manual pick)                          │
│                                                              │
│  Reason for Regeneration:                                    │
│  ☑ Update blockchain identity (ENS/basename changes)        │
│  ☐ Fix rendering issue                                      │
│  ☐ Update certificate template                              │
│  ☐ Replace outdated branding                                │
│                                                              │
│  ⚠️ Warning: This operation will regenerate 47 certificates │
│              and may take 3-5 minutes.                      │
│                                                              │
│  [Start Bulk Operation] [Cancel]                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[After starting operation:]

┌──────────────────────────────────────────────────────────────┐
│  Operation Progress:                                         │
│  ████████████████░░░░ 80% (38/47 certificates)              │
│                                                              │
│  Status:                                                     │
│  • Successfully regenerated: 37                              │
│  • In progress: 1                                            │
│  • Failed: 0                                                 │
│  • Remaining: 9                                              │
│                                                              │
│  Estimated time remaining: 45 seconds                        │
│                                                              │
│  [View Detailed Log] [Stop Operation]                       │
└──────────────────────────────────────────────────────────────┘
```

#### Admin Use Cases & Workflows

**Use Case 1: User Support - Wrong Name on Certificate**
```
User Support Ticket:
"My certificate shows my old ENS name, not my current one"

Admin Workflow:
1. Admin logs into certificate management dashboard
2. Searches for user: "bob.eth"
3. Finds certificate with outdated name
4. Clicks [Regenerate]
5. System:
   - Fetches current blockchain identity (basename/ENS)
   - Generates new certificate with updated name
   - Uploads to storage
   - Updates database with new URL
6. Admin clicks [Notify User]
7. User receives email: "Your certificate has been updated!"
8. User downloads new certificate with correct name

Time to Resolution: ~2 minutes
```

**Use Case 2: Quality Control - Template Update**
```
Platform Update:
New certificate template design rolled out

Admin Workflow:
1. Admin goes to Bulk Operations
2. Selects "Regenerate Certificates"
3. Scope: "All Certificates"
4. Reason: "Update certificate template"
5. Reviews: "This will regenerate 1,247 certificates"
6. Clicks [Start Bulk Operation]
7. System processes all certificates in background
8. Admin monitors progress dashboard
9. Operation completes in 12 minutes
10. Admin reviews sample certificates for quality
11. Success! All certificates now use new template

Benefit: Consistent branding across all certificates
```

**Use Case 3: Debugging Failed Upload**
```
Monitoring Alert:
"Certificate upload failed 3 times for user alice.eth"

Admin Workflow:
1. Admin sees failed upload in dashboard (red status)
2. Clicks [View Logs] on failed certificate
3. Sees error details:
   "Error: Storage bucket 'certificates' upload timeout
    Timestamp: 2025-01-15 23:45:12
    File Size: 1.2 MB
    Network: Supabase Storage API timeout"
4. Admin identifies issue: Temporary network problem
5. Clicks [Reset Retry Counter]
6. Clicks [Force Regenerate]
7. System retries upload
8. Success! Certificate saved
9. Admin clicks [Notify User]
10. User receives: "Your certificate is now available"

Time to Resolution: ~5 minutes
```

**Use Case 4: Storage Cleanup**
```
Monthly Maintenance:
Storage usage approaching 80%

Admin Workflow:
1. Admin opens Storage Management Dashboard
2. Reviews breakdown:
   - 15 duplicate certificates (14 MB)
   - 7 orphaned files (6 MB)
   - 45 failed upload remnants (43 MB)
3. Clicks [Clean Up Duplicates]
   - System keeps most recent version
   - Deletes older duplicates
   - Frees 14 MB
4. Clicks [Remove Orphaned Files]
   - System identifies files not in database
   - Safely deletes orphaned files
   - Frees 6 MB
5. Manually reviews failed uploads
   - Deletes unrecoverable files
   - Frees 43 MB
6. Total space freed: 63 MB

Result: Storage optimized, no user impact
```

**Use Case 5: Certificate Verification for User**
```
External Request:
Employer wants to verify candidate's certificate

Admin Workflow:
1. Employer emails: "Can you verify certificate for bob.eth?"
2. Admin searches for "bob.eth" in dashboard
3. Views certificate details:
   - Certificate exists: ✅
   - NFT verified on blockchain: ✅
   - Tx hash: 0xabc...def
   - Attestation: Available
4. Admin clicks [View Full Certificate]
5. Reviews certificate image matches claim
6. Sends verification email to employer:
   "Certificate verified. Details:
    - User: bob.eth
    - Bootcamp: Web3 Fundamentals
    - Completion: Jan 15, 2025
    - Blockchain TX: https://basescan.org/tx/0xabc...def
    - Certificate Image: [Attached]"

Time to Resolution: ~3 minutes
Outcome: Employer trusts verification, hires candidate
```

#### Implementation Components

**1. Admin Certificate Dashboard Page:**
```typescript
// app/admin/certificates/page.tsx
export default async function AdminCertificatesPage({
  searchParams
}: {
  searchParams: { search?: string; status?: string; page?: string }
}) {
  const certificates = await getAdminCertificates({
    search: searchParams.search,
    status: searchParams.status,
    page: parseInt(searchParams.page || '1')
  });

  return (
    <AdminLayout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">
          🔧 Certificate Management
        </h1>

        <CertificateFilters />
        <CertificateList certificates={certificates} />
        <Pagination total={certificates.total} />
      </div>
    </AdminLayout>
  );
}
```

**2. Certificate List Item Component:**
```typescript
// components/admin/CertificateListItem.tsx
export function CertificateListItem({ cert }: { cert: AdminCertificate }) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await fetch('/api/admin/certificates/regenerate', {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: cert.enrollmentId })
      });
      toast.success('Certificate regenerated successfully');
      router.refresh();
    } catch (error) {
      toast.error('Failed to regenerate certificate');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">{cert.userName}</h3>
            <p className="text-sm text-gray-400">
              {cert.bootcampName} • {cert.cohortName}
            </p>
          </div>
          <CertificateStatus status={cert.status} />
        </div>
      </CardHeader>

      <CardContent>
        {cert.imageUrl ? (
          <div className="flex gap-4">
            <Image
              src={cert.imageUrl}
              alt="Certificate Thumbnail"
              width={200}
              height={150}
              className="rounded"
            />
            <div className="flex-1">
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-gray-400">Certificate URL:</dt>
                  <dd className="font-mono text-xs truncate">{cert.imageUrl}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Claimed:</dt>
                  <dd>{formatDate(cert.claimedAt)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">NFT Verified:</dt>
                  <dd>{cert.nftVerified ? '✅ Yes' : '❌ No'}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : cert.error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Image Save Failed</AlertTitle>
            <AlertDescription>
              {cert.error} • Retry count: {cert.retryCount}/3
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => window.open(cert.imageUrl)}>
          View Full
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => deleteCertificate(cert.id)}>
          Delete
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadCertificate(cert.imageUrl)}>
          Download
        </Button>
      </CardFooter>
    </Card>
  );
}
```

**3. Regenerate Certificate API:**
```typescript
// app/api/admin/certificates/regenerate/route.ts
export async function POST(req: NextRequest) {
  // Verify admin access
  const isAdmin = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { enrollmentId } = await req.json();

  try {
    // Get enrollment details
    const supabase = createAdminClient();
    const { data: enrollment } = await supabase
      .from('bootcamp_enrollments')
      .select(`
        id,
        user_profile_id,
        completion_date,
        cohorts(bootcamp_programs(name, lock_address)),
        user_profiles(wallet_address, display_name)
      `)
      .eq('id', enrollmentId)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // Resolve latest blockchain identity
    const identity = await resolveBlockchainIdentity(enrollment.user_profiles.wallet_address);

    // Generate new certificate server-side (using Puppeteer or similar)
    const certificateBlob = await generateCertificateServerSide({
      bootcampName: enrollment.cohorts.bootcamp_programs.name,
      userName: identity.displayName,
      completionDate: enrollment.completion_date,
      lockAddress: enrollment.cohorts.bootcamp_programs.lock_address
    });

    // Upload to storage
    const fileName = `${enrollmentId}-${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('certificates')
      .upload(fileName, certificateBlob, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('certificates')
      .getPublicUrl(fileName);

    // Delete old certificate if exists
    if (enrollment.certificate_image_url) {
      const oldFileName = enrollment.certificate_image_url.split('/').pop();
      await supabase.storage.from('certificates').remove([oldFileName]);
    }

    // Update database
    await supabase
      .from('bootcamp_enrollments')
      .update({ certificate_image_url: publicUrl })
      .eq('id', enrollmentId);

    log.info('Certificate regenerated by admin', { enrollmentId, fileName });

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl
    });
  } catch (error) {
    log.error('Failed to regenerate certificate', { error, enrollmentId });
    return NextResponse.json(
      { error: 'Failed to regenerate certificate' },
      { status: 500 }
    );
  }
}
```

**4. Bulk Operations API:**
```typescript
// app/api/admin/certificates/bulk-regenerate/route.ts
export async function POST(req: NextRequest) {
  const isAdmin = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { scope, filters } = await req.json();

  // Get certificates to regenerate based on scope
  const enrollments = await getEnrollmentsForBulkOperation(scope, filters);

  log.info('Starting bulk certificate regeneration', {
    count: enrollments.length,
    scope,
    filters
  });

  // Process in background (use queue system for production)
  processBulkRegenerationInBackground(enrollments);

  return NextResponse.json({
    success: true,
    operationId: generateOperationId(),
    totalCount: enrollments.length,
    message: `Regenerating ${enrollments.length} certificates`
  });
}
```

**5. Storage Management Component:**
```typescript
// components/admin/StorageManagement.tsx
export function StorageManagement() {
  const { data: stats } = useStorageStats();

  const handleCleanupDuplicates = async () => {
    await fetch('/api/admin/storage/cleanup-duplicates', { method: 'POST' });
    toast.success('Duplicates cleaned up');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>💾 Storage Management</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Storage Used</span>
              <span>{stats.usedGB} GB / {stats.totalGB} GB</span>
            </div>
            <Progress value={stats.percentUsed} />
          </div>

          <div>
            <h3 className="font-bold mb-3">Storage Breakdown</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Valid Certificates:</dt>
                <dd>{stats.validCount} files ({stats.validSize})</dd>
              </div>
              <div className="flex justify-between">
                <dt>Failed Uploads:</dt>
                <dd>{stats.failedCount} files ({stats.failedSize})</dd>
              </div>
              <div className="flex justify-between">
                <dt>Duplicate Images:</dt>
                <dd>{stats.duplicateCount} files ({stats.duplicateSize})</dd>
              </div>
              <div className="flex justify-between">
                <dt>Orphaned Files:</dt>
                <dd>{stats.orphanedCount} files ({stats.orphanedSize})</dd>
              </div>
            </dl>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCleanupDuplicates}
              variant="outline"
              size="sm"
            >
              Clean Up Duplicates
            </Button>
            <Button
              onClick={handleRemoveOrphaned}
              variant="outline"
              size="sm"
            >
              Remove Orphaned Files
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### Admin Benefits

**User Support:**
- ✅ Quickly resolve certificate issues
- ✅ Regenerate certificates with updated info
- ✅ Debug failed uploads
- ✅ Verify certificates for external parties
- ✅ Proactive quality control

**Platform Management:**
- ✅ Monitor certificate generation health
- ✅ Track storage usage
- ✅ Bulk operations for template updates
- ✅ Clean up storage efficiently
- ✅ Maintain certificate quality

**Analytics & Insights:**
- ✅ Certificate claim rates
- ✅ Average time to claim
- ✅ Download statistics
- ✅ Failure rate monitoring
- ✅ Storage growth trends

#### Why It's Optional
- ✅ Core certificate system works without admin interface
- ✅ Issues can be resolved via direct database access
- ✅ Manual support possible for small scale
- ⚠️ Requires significant development effort
- ⚠️ Needs role-based access control (RBAC)
- ⚠️ Background job processing system needed
- ⚠️ Most useful at scale (100+ certificates)

---

## Implementation Priority & Impact Matrix

| Feature | User Impact | Admin Impact | Dev Effort | Priority |
|---------|-------------|--------------|------------|----------|
| **User Activity Tracking** | Medium | Low | Medium | 3 |
| **Dashboard Integration** | High | Low | High | 1 |
| **Profile Integration** | High | Low | High | 2 |
| **Admin Interface** | Low | High | Very High | 4 |

### Recommended Implementation Order

1. **Dashboard Integration** (Sprint 1-2)
   - Highest user-facing impact
   - Improves engagement immediately
   - Showcases platform value

2. **Profile Integration** (Sprint 3-4)
   - Enables social proof and sharing
   - Differentiates platform
   - Drives user acquisition

3. **User Activity Tracking** (Sprint 5)
   - Foundation for analytics
   - Enables personalization
   - Supports future features

4. **Admin Interface** (Sprint 6+)
   - Most useful at scale
   - Can be done gradually
   - Less urgent than user-facing features

### Quick Wins (Low Effort, High Impact)

If resources are limited, consider implementing these smaller features first:

1. **Basic Dashboard Certificate Count** (1-2 days)
   - Just show count and list
   - No thumbnail gallery needed

2. **Certificate Claim Reminder** (1 day)
   - Simple banner on dashboard
   - "You have 1 unclaimed certificate"

3. **Profile Link Sharing** (1 day)
   - Add "Share Profile" button
   - Copy link to clipboard

4. **Admin Search** (2-3 days)
   - Simple search for certificates
   - Basic view without regeneration

These quick wins provide value while full features are being developed.

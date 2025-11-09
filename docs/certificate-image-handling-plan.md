# Bootcamp Certificate Image Handling Plan

## ⚠️ REVISION NOTES

**Last Updated:** 2025-10-18
**Status:** Revised - Supabase Storage approach (ready for implementation)

### Key Changes from Initial Draft:
1. **Removed Over-Engineering**: Eliminated excessive Zod validation, complex wrapper hooks, defensive programming
2. **Removed Puppeteer**: No server-side rendering - use existing client-side `html-to-image` generation
3. **Removed S3/Cloudinary**: Use Supabase Storage instead (already in stack, simpler)
4. **Simplified Upload**: Client-side upload after image generation
5. **Bug Fixes**: Check blockchain state for NFT ownership, not just database
6. **Pragmatic Approach**: Leverage existing tools, avoid new dependencies
7. **Reduced Time Estimate**: From 30-35 hours to 8-12 hours

## Overview

This document outlines the implementation plan for enhancing the bootcamp certificate system to handle certificate images persistently and display blockchain identities on certificates.

### Key Requirements

1. **Image Persistence**:
   - Before claiming NFT: Generate certificate image on-demand (preview only)
   - After claiming NFT: Client-side upload generated image to Supabase Storage
   - Subsequent views: Retrieve the saved image URL (with validation) instead of regenerating

2. **User Identification Priority**:
   - Replace username with blockchain identity in this priority order:
     1. Base name (from Base network)
     2. ENS name (from Ethereum Mainnet)
     3. Full wallet address (not truncated)
   - **NEW:** Implement caching layer for name resolution (1-hour TTL)

3. **Certificate Claim Flow**:
   - Use blockchain `hasValidKey` check (not just database state)
   - Disable claim button when NFT is already claimed
   - Store certificate image URL in database after successful claim
   - **NEW:** Validate all stored URLs against whitelist before returning

## Implementation Plan

### Phase 1: Database Schema Update

Add a column to store certificate image URLs with validation:

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
  'Permanent URL to generated certificate image from Supabase Storage. Must be HTTPS. Validated against Supabase Storage domain in application code.';
```

**Migration Notes:**
- Constraint ensures only HTTPS URLs can be stored (prevents HTTP/data URIs)
- Application layer validates URLs are from Supabase Storage domain
- Index optimized for queries that check if a user has a stored certificate

### Phase 2: Certificate Image Service

**Note:** The codebase already has `useENSResolution.ts` that resolves names. We'll reuse that logic server-side.

Create a simple service for image URL storage and validation:

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

### Phase 3: Update Certificate Preview API

**Key Changes Needed:**
1. Check blockchain for NFT ownership (not just database `certificate_issued`)
2. Return stored image URL if user has NFT and image exists
3. Use existing `useENSResolution` logic for name resolution

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

// Otherwise, generate preview data (name resolution happens here)
// Use the same ENS resolution logic from useENSResolution.ts
```

### Phase 4: Create API to Save Certificate URL

After client-side upload to Supabase Storage, save the URL in database:

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

**Note:** The client handles image generation and upload; this API only persists the URL.

### Phase 5: Update Certificate Claim Button

**Simple Fix:** Just use the existing `alreadyClaimed` prop but verify it against blockchain state on mount.

```typescript
// components/bootcamp-completion/CertificateClaimButton.tsx

// Add a useEffect to check blockchain state:
useEffect(() => {
  if (!lockAddress || !userAddress) return;

  const checkKey = async () => {
    const client = createPublicClientUnified();
    const hasNFT = await client.readContract({
      address: lockAddress as Address,
      abi: COMPLETE_LOCK_ABI,
      functionName: "getHasValidKey",
      args: [userAddress as Address],
    });
    setHasBlockchainKey(hasNFT);
  };

  checkKey();
}, [lockAddress, userAddress]);

// Use: const isClaimed = hasBlockchainKey || alreadyClaimed;
```

**Alternative:** If the existing `useHasValidKey` hook is confusing, just check blockchain directly in the component.

### Phase 6: Update Certificate Preview Modal

**Minimal Change:** Just add a `storedImageUrl` prop. If provided, show it instead of generating.

```typescript
// components/bootcamp/CertificatePreviewModal.tsx

import React, { useRef, useState, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { X, Download, Loader2 } from "lucide-react";
import {
  CertificateTemplate,
  type CertificateData,
} from "./CertificateTemplate";
import {
  generateCertificate,
  downloadCertificate,
  generateCertificateFilename,
} from "@/lib/certificate/generator";

interface CertificatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificateData?: CertificateData;
  storedImageUrl?: string;
  isClaimed?: boolean;
}

export const CertificatePreviewModal: React.FC<
  CertificatePreviewModalProps
> = ({ open, onOpenChange, certificateData, storedImageUrl, isClaimed = false }) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use the stored image if available and certificate is claimed
  useEffect(() => {
    if (open) {
      if (storedImageUrl && isClaimed) {
        setGeneratedImage(storedImageUrl);
        setIsGenerating(false);
        setError(null);
      } else if (certificateData) {
        // Generate preview automatically when modal opens
        setTimeout(() => {
          handleGeneratePreview();
        }, 100);
      } else {
        setError("No certificate data available");
      }
    }
  }, [open, storedImageUrl, isClaimed, certificateData]);

  const handleGeneratePreview = useCallback(async () => {
    // If we have a stored image and it's claimed, use that
    if (storedImageUrl && isClaimed) {
      setGeneratedImage(storedImageUrl);
      return;
    }

    // Otherwise generate a new preview
    if (!certificateRef.current || !certificateData) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateCertificate({
        data: certificateData,
        element: certificateRef.current,
      });

      setGeneratedImage(result.dataUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate preview",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [certificateData, storedImageUrl, isClaimed]);

  const handleDownload = async () => {
    // If we have the stored/generated image, download it directly
    if (generatedImage) {
      try {
        // For storedImageUrl (which is a URL) we need to fetch it first
        if (storedImageUrl && isClaimed) {
          const response = await fetch(generatedImage);
          const blob = await response.blob();
          
          // Generate filename
          const filename = certificateData
            ? generateCertificateFilename(
                certificateData.bootcampName,
                certificateData.userName
              )
            : "certificate.png";
          
          downloadCertificate(blob, filename);
          return;
        }
        
        // For data URLs from generateCertificate, we can use them directly
        if (!certificateRef.current || !certificateData) return;
        
        const result = await generateCertificate({
          data: certificateData,
          element: certificateRef.current,
        });
        
        const filename = generateCertificateFilename(
          certificateData.bootcampName,
          certificateData.userName
        );
        
        downloadCertificate(result.blob, filename);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to download");
      }
      return;
    }

    // Fallback: generate a new certificate
    if (!certificateRef.current || !certificateData) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateCertificate({
        data: certificateData,
        element: certificateRef.current,
      });

      const filename = generateCertificateFilename(
        certificateData.bootcampName,
        certificateData.userName,
      );

      downloadCertificate(result.blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[95vw] max-w-6xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-xl border border-gray-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-2xl font-bold text-white">
              {isClaimed ? "Certificate" : "Certificate Preview"}
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>

          {/* Certificate Preview */}
          <div className="mb-6">
            {isGenerating && !generatedImage && (
              <div className="flex items-center justify-center h-[500px] bg-gray-800 rounded-lg">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 text-flame-yellow animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Generating preview...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {generatedImage && !isGenerating && (
              <div className="bg-gray-800 rounded-lg p-4 overflow-auto">
                <Image
                  src={generatedImage}
                  alt="Certificate"
                  width={1200}
                  height={800}
                  className="mx-auto max-w-full h-auto rounded shadow-2xl"
                  unoptimized
                />
              </div>
            )}
          </div>

          {/* Hidden certificate template for rendering */}
          {certificateData && (
            <div className="absolute -left-[9999px] -top-[9999px]">
              <CertificateTemplate
                data={certificateData}
                innerRef={certificateRef}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            {/* Only show regenerate for previews, not for claimed certificates */}
            {!isClaimed && certificateData && (
              <button
                onClick={handleGeneratePreview}
                disabled={isGenerating}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Regenerate"
                )}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={isGenerating || !generatedImage}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-flame-yellow to-flame-orange text-gray-900 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Certificate
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### Phase 7: Supabase Storage Setup and Client-Side Upload

Set up Supabase Storage bucket and implement client-side upload flow:

#### Step 7.1: Create Storage Bucket

```sql
-- Run via Supabase dashboard or SQL editor (one-time setup)

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

-- RLS policy: Users can update their own certificates (optional)
CREATE POLICY "Users can update their own certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'certificates')
WITH CHECK (bucket_id = 'certificates');
```

#### Step 7.2: Client-Side Upload Implementation

Update the certificate claim/preview flow to upload to Supabase Storage:

```typescript
// In CertificatePreviewModal or CertificateClaimButton component

import { createBrowserClient } from '@/lib/supabase/client';
import { generateCertificate, generateCertificateFilename } from '@/lib/certificate/generator';

const handleSaveCertificate = async () => {
  try {
    // 1. Generate certificate image (already works with html-to-image)
    const { blob } = await generateCertificate({
      element: certificateRef.current,
      data: certificateData,
    });

    // 2. Upload to Supabase Storage
    const fileName = `${enrollmentId}-${Date.now()}.png`;
    const supabase = createBrowserClient();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('certificates')
      .upload(fileName, blob, {
        contentType: 'image/png',
        cacheControl: '31536000', // 1 year
        upsert: false, // Don't overwrite existing
      });

    if (uploadError) {
      console.error('Upload failed:', uploadError);
      throw uploadError;
    }

    // 3. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('certificates')
      .getPublicUrl(fileName);

    // 4. Save URL to database via API
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

    console.log('Certificate saved successfully!');

  } catch (error) {
    console.error('Failed to save certificate:', error);
  }
};
```

**Upload Flow:**
1. User claims NFT (existing flow)
2. User clicks "Save Certificate" or automatically after claim
3. Generate image with `html-to-image` (already implemented)
4. Upload blob to Supabase Storage
5. Save public URL in database via `/api/certificate/save-url`
6. Future views: Load from saved URL

## Implementation Steps

1. **Database Update**:
   - Create and apply migration to add certificate_image_url column to bootcamp_enrollments table

2. **Supabase Storage Setup**:
   - Create 'certificates' bucket (public read)
   - Set up RLS policies for authenticated uploads

3. **Service Implementation**:
   - Create CertificateImageService for URL validation and storage
   - Create API route to save certificate URLs after upload

4. **API Updates**:
   - Update certificate preview API to check for stored images and return them
   - Verify blockchain state before showing stored certificates

5. **UI Component Updates**:
   - Add upload functionality after certificate generation
   - Update CertificatePreviewModal to handle stored image URLs
   - Add blockchain state verification in CertificateClaimButton

## Testing Strategy

1. **Preview Generation Testing**:
   - Test certificate preview for users without NFT claims
   - Verify blockchain identity resolution (basename/ENS/address)

2. **Certificate Claiming Flow**:
   - Test full claim flow including image generation and storage
   - Verify certificate image persists after claim

3. **Viewing Claimed Certificates**:
   - Test retrieving stored images for claimed certificates
   - Verify no regeneration occurs for already claimed certificates

4. **Edge Cases**:
   - Test behavior when storage fails
   - Test behavior with incomplete user profiles
   - Test with and without wallet connections

## Dependencies

1. **Supabase Storage**: Already included in Supabase client (no new dependencies)
2. **html-to-image**: Already used for client-side certificate generation
3. **Viem**: Already used for blockchain interactions and ENS/basename resolution

## Migration Strategy for Existing Certificates

For existing completed certificates without stored images:

### Lazy Upload on Demand (Recommended)

Users upload their own certificates when they first view them:

**How it works:**
1. User with existing NFT visits certificate page
2. Certificate generates client-side (already implemented)
3. UI shows "Save Certificate" button
4. User clicks → uploads to Supabase Storage → saves URL
5. Future views load from stored URL

**Pros:**
- No server-side migration needed
- User controls when upload happens
- Spreads storage load over time
- Only stores for active users

**Cons:**
- Requires user action (not automatic)
- Existing certificate holders must re-visit page

**Note:** Since certificates are cosmetic (NFT is source of truth), there's no urgency to backfill old certificates. Users can upload when they need to share/download.

## Security Checklist

Before deploying to production:

- [ ] Database has HTTPS-only constraint on `certificate_image_url`
- [ ] Supabase Storage bucket 'certificates' is created and set to public
- [ ] RLS policies configured: public read, authenticated upload
- [ ] URL validation checks Supabase Storage domain in `isValidCertificateUrl`
- [ ] `/api/certificate/save-url` verifies user owns enrollment before saving
- [ ] Preview API checks blockchain state (`getHasValidKey`) before showing certificates
- [ ] Client-side upload uses authenticated Supabase client

## Testing Checklist

**Unit Tests:**
- URL validation (reject HTTP, non-whitelisted domains)
- Name resolution priority (basename > ENS > address)
- Image service storage/retrieval

**Integration Tests:**
- Full claim flow (bootcamp → NFT → image → preview)
- Blockchain identity resolution for different user types
- Storage failure handling (NFT claim succeeds even if image gen fails)
- URL validation against tampering

## Implementation Priority

1. **Database & Storage Setup** (~1-2 hours)
   - Migration for `certificate_image_url` column
   - Create Supabase Storage bucket with RLS policies
   - `CertificateImageService` with URL validation

2. **API Implementation** (~2-3 hours)
   - Create `/api/certificate/save-url` endpoint
   - Update preview API to check blockchain state and return stored images
   - Verify user ownership before saving URLs

3. **UI Updates** (~3-4 hours)
   - Add upload functionality to CertificatePreviewModal
   - Add "Save Certificate" button after generation
   - Update CertificateClaimButton to show blockchain state
   - Handle upload errors gracefully

4. **Testing & Deployment** (~2-3 hours)
   - Test upload flow end-to-end
   - Verify URL validation works
   - Test blockchain state checks
   - Deploy

**Total:** ~8-12 hours

## Monitoring & Observability

**Key Metrics:**
- Certificate generation success/failure rate
- Average generation time
- Storage upload failures
- URL validation failures
- Cache hit rate (stored vs generated on-demand)

**Log Events:**
- `certificate_generation_metrics` - generation time and size
- `certificate_url_validation_failed` - rejected URLs
- `certificate_retrieval` - cache hits vs misses

## Conclusion

This plan provides a simple, pragmatic solution for certificate image persistence:

**Key Features:**
1. **No New Dependencies:** Uses existing Supabase Storage (already in stack)
2. **No Server Complexity:** Client-side upload with existing `html-to-image` generation
3. **Security:** HTTPS validation, Supabase Storage domain check, RLS policies
4. **Bug Fixes:** Check blockchain state (not just database) for NFT ownership

**What This Enables:**
- Persistent certificate images (no regeneration after upload)
- Blockchain identity display (basename > ENS > address)
- User-controlled upload (lazy migration on demand)
- Simple Supabase Storage integration

**Benefits Over Original Approach:**
- ❌ **Removed:** Puppeteer (~50MB), AWS SDK, Cloudinary SDK, complex server-side rendering
- ✅ **Added:** Simple client-side upload to existing Supabase Storage
- ⏱️ **Time Saved:** 8-12 hours (down from 15-20 hours)
- 💰 **Cost Saved:** No additional cloud services (AWS/Cloudinary)

**Estimate:** 8-12 hours of implementation time.

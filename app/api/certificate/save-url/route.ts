import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { getLogger } from '@/lib/utils/logger';
import { isValidCertificateUrl } from '@/lib/bootcamp-completion/certificate/image-service';

const log = getLogger('api:certificate:save-url');

/**
 * POST /api/certificate/save-url
 * Save certificate image URL to database after client-side upload to Supabase Storage
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const user = await getPrivyUserFromNextRequest(req);
    if (!user?.id) {
      log.warn('Unauthorized request to save certificate URL');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { enrollmentId, imageUrl, base64ImageData } = await req.json();

    if (!enrollmentId || (!imageUrl && !base64ImageData)) {
      log.warn('Missing required fields', { enrollmentId, hasImageUrl: !!imageUrl, hasBase64Data: !!base64ImageData });
      return NextResponse.json(
        { error: 'Missing enrollmentId and either imageUrl or base64ImageData' },
        { status: 400 }
      );
    }

    // Get supabase client early since we might need it for upload
    const supabase = createAdminClient();
    let finalImageUrl = imageUrl;

    // Handle base64 image data upload (server-side)
    if (base64ImageData && !imageUrl) {
      try {
        log.info('Processing base64 image data', { enrollmentId });
        
        // Convert base64 to blob
        const base64Data = base64ImageData.replace(/^data:image\/[a-z]+;base64,/, '');
        
        if (!base64Data) {
          throw new Error('Invalid base64 data format');
        }
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });

        log.info('Converted base64 to blob', { 
          enrollmentId, 
          blobSize: blob.size,
          blobType: blob.type 
        });

        // Upload to Supabase Storage using admin client
        const fileName = `${enrollmentId}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('certificates')
          .upload(fileName, blob, {
            contentType: 'image/png',
            cacheControl: '31536000', // 1 year
            upsert: false,
          });

        if (uploadError) {
          log.error('Failed to upload certificate image', {
            enrollmentId,
            fileName,
            error: uploadError,
          });
          return NextResponse.json(
            { error: 'Failed to upload certificate image' },
            { status: 500 }
          );
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('certificates')
          .getPublicUrl(fileName);

        finalImageUrl = publicUrl;
        log.info('Certificate image uploaded successfully', {
          enrollmentId,
          fileName,
          publicUrl,
        });
      } catch (error) {
        log.error('Error processing base64 image data', {
          enrollmentId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        return NextResponse.json(
          { error: 'Failed to process image data' },
          { status: 500 }
        );
      }
    }

    // Validate URL is from Supabase Storage (only if imageUrl was provided)
    if (imageUrl && !isValidCertificateUrl(imageUrl)) {
      log.warn('Invalid certificate URL', { imageUrl, userId: user.id });
      return NextResponse.json(
        { error: 'Invalid URL. Must be from Supabase Storage certificates bucket.' },
        { status: 400 }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('privy_user_id', user.id)
      .single();

    if (profileError || !profile) {
      log.error('Profile not found', { userId: user.id, error: profileError });
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Verify user owns this enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('bootcamp_enrollments')
      .select('id, user_profile_id')
      .eq('id', enrollmentId)
      .eq('user_profile_id', profile.id)
      .single();

    if (enrollmentError || !enrollment) {
      log.warn('Enrollment not found or access denied', {
        enrollmentId,
        userId: user.id,
        profileId: profile.id,
        error: enrollmentError,
      });
      return NextResponse.json(
        { error: 'Enrollment not found or access denied' },
        { status: 404 }
      );
    }

    // Save certificate URL to database
    const { error: updateError } = await supabase
      .from('bootcamp_enrollments')
      .update({ certificate_image_url: finalImageUrl })
      .eq('id', enrollmentId);

    if (updateError) {
      log.error('Failed to save certificate URL', {
        enrollmentId,
        error: updateError,
      });
      return NextResponse.json(
        { error: 'Failed to save certificate URL' },
        { status: 500 }
      );
    }

    log.info('Certificate URL saved successfully', {
      enrollmentId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Certificate URL saved successfully',
      imageUrl: finalImageUrl,
    });
  } catch (error) {
    log.error('Unexpected error in save-url endpoint', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

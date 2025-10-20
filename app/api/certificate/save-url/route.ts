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
    const { enrollmentId, imageUrl } = await req.json();

    if (!enrollmentId || !imageUrl) {
      log.warn('Missing required fields', { enrollmentId, imageUrl });
      return NextResponse.json(
        { error: 'Missing enrollmentId or imageUrl' },
        { status: 400 }
      );
    }

    // Validate URL is from Supabase Storage
    if (!isValidCertificateUrl(imageUrl)) {
      log.warn('Invalid certificate URL', { imageUrl, userId: user.id });
      return NextResponse.json(
        { error: 'Invalid URL. Must be from Supabase Storage certificates bucket.' },
        { status: 400 }
      );
    }

    // Get user profile
    const supabase = createAdminClient();
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
      .update({ certificate_image_url: imageUrl })
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
    });
  } catch (error) {
    log.error('Unexpected error in save-url endpoint', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

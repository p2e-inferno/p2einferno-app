import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { computeUserApplicationStatus } from '@/lib/types/application-status';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:cohorts:applications');

type CohortApplication = {
  id: string;
  user_name: string;
  user_email: string;
  experience_level: string;
  motivation: string;
  payment_status: string;
  application_status: string;
  user_application_status: string;
  enrollment_status?: string;
  created_at: string;
  updated_at: string;
  amount_paid?: number;
  currency?: string;
  needs_reconciliation: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { cohortId } = await params;
  if (!cohortId) {
    return NextResponse.json({ error: 'Invalid cohort ID' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: rawApplications, error: applicationsError } = await supabase
      .from('applications')
      .select(`
        id,
        user_name,
        user_email,
        experience_level,
        motivation,
        payment_status,
        application_status,
        total_amount,
        currency,
        created_at,
        updated_at,
        user_profiles (
          id,
          privy_user_id
        ),
        user_application_status!user_application_status_application_id_fkey (
          status,
          amount_paid,
          currency
        ),
        payment_transactions!payment_transactions_application_id_fkey (
          amount,
          currency,
          status
        )
      `)
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false });

    if (applicationsError) {
      log.error('applications fetch error', { applicationsError, cohortId });
      return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }

    const userProfileIds =
      rawApplications
        ?.map((app: any) => {
          const userProfile = Array.isArray(app.user_profiles)
            ? app.user_profiles[0]
            : app.user_profiles;
          return userProfile?.id;
        })
        .filter(Boolean) || [];

    let enrollments: Array<{ user_profile_id: string; enrollment_status: string }> | null = null;
    if (userProfileIds.length > 0) {
      const { data } = await supabase
        .from('bootcamp_enrollments')
        .select('user_profile_id, enrollment_status')
        .eq('cohort_id', cohortId)
        .in('user_profile_id', userProfileIds);
      enrollments = data || null;
    }

    const applications: CohortApplication[] = (rawApplications || []).map((app: any) => {
      const userStatus = Array.isArray(app.user_application_status)
        ? app.user_application_status[0]
        : app.user_application_status;

      const userProfile = Array.isArray(app.user_profiles)
        ? app.user_profiles[0]
        : app.user_profiles;

      const enrollment = enrollments?.find(
        (entry) => entry.user_profile_id === userProfile?.id
      );
      const enrollmentStatus = enrollment?.enrollment_status;

      const expectedStatus = computeUserApplicationStatus(
        app.payment_status as any,
        app.application_status as any,
        enrollmentStatus as any
      );

      const currentUserStatus = userStatus?.status || 'payment_pending';
      const needsReconciliation = currentUserStatus !== expectedStatus;

      let amountPaid = userStatus?.amount_paid;
      let currency = userStatus?.currency || app.currency;

      if (!amountPaid && app.payment_transactions?.length > 0) {
        const successfulPayment = app.payment_transactions.find(
          (pt: any) => pt.status === 'success'
        );
        if (successfulPayment) {
          amountPaid = successfulPayment.amount;
          currency = successfulPayment.currency;
        }
      }

      if (!amountPaid) {
        amountPaid = app.total_amount;
      }

      return {
        id: app.id,
        user_name: app.user_name,
        user_email: app.user_email,
        experience_level: app.experience_level,
        motivation: app.motivation,
        payment_status: app.payment_status,
        application_status: app.application_status,
        user_application_status: currentUserStatus,
        enrollment_status: enrollmentStatus,
        created_at: app.created_at,
        updated_at: app.updated_at,
        amount_paid: amountPaid,
        currency,
        needs_reconciliation: needsReconciliation,
      };
    });

    const stats = {
      total_applications: applications.length,
      pending_payment: applications.filter((app) =>
        ['payment_pending', 'draft'].includes(app.user_application_status)
      ).length,
      payment_completed: applications.filter(
        (app) => app.payment_status === 'completed'
      ).length,
      enrolled: applications.filter(
        (app) =>
          app.user_application_status === 'enrolled' || app.enrollment_status === 'active'
      ).length,
      revenue: applications
        .filter((app) => app.payment_status === 'completed' && app.amount_paid)
        .reduce((sum, app) => sum + (app.amount_paid || 0), 0),
      needs_reconciliation: applications.filter((app) => app.needs_reconciliation).length,
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          applications,
          stats,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    log.error('cohort applications unexpected error', { error, cohortId });
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

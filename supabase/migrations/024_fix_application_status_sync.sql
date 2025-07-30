-- Migration: Fix application status synchronization and missing records
-- This migration addresses data inconsistencies between applications and user_application_status tables
-- and creates missing payment_transactions records for completed applications

-- ============================================================================
-- 1. Sync user_application_status with applications table
-- ============================================================================

-- Update user_application_status.status to match applications.payment_status
-- This ensures consistency between the two tables
UPDATE user_application_status 
SET 
  status = applications.payment_status,
  updated_at = NOW()
FROM applications 
WHERE user_application_status.application_id = applications.id 
  AND user_application_status.status != applications.payment_status;

-- ============================================================================
-- 2. Create missing payment_transactions for completed applications
-- ============================================================================

-- Insert payment_transactions records for applications that are marked as completed
-- but don't have corresponding payment records
INSERT INTO payment_transactions (
  application_id,
  payment_reference,
  status,
  payment_method,
  metadata,
  created_at,
  updated_at
)
SELECT 
  a.id,
  'legacy-' || a.id || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
  'success',
  'unknown',
  jsonb_build_object(
    'migrated', true,
    'migratedAt', NOW(),
    'migratedBy', 'system',
    'reason', 'Missing payment record for completed application',
    'originalApplicationStatus', a.application_status,
    'originalPaymentStatus', a.payment_status
  ),
  a.created_at,
  NOW()
FROM applications a
LEFT JOIN payment_transactions pt ON pt.application_id = a.id
WHERE a.payment_status = 'completed' 
  AND pt.id IS NULL;

-- ============================================================================
-- 3. Create missing enrollments for completed applications
-- ============================================================================

-- Insert enrollment records for applications that are completed but don't have enrollments
INSERT INTO enrollments (
  user_profile_id,
  cohort_id,
  enrollment_status,
  enrolled_at,
  created_at,
  updated_at
)
SELECT DISTINCT
  up.id,
  a.cohort_id,
  'active',
  COALESCE(pt.created_at, a.created_at),
  NOW(),
  NOW()
FROM applications a
INNER JOIN user_profiles up ON up.email = a.user_email OR up.privy_user_id = a.user_email
LEFT JOIN enrollments e ON e.user_profile_id = up.id AND e.cohort_id = a.cohort_id
LEFT JOIN payment_transactions pt ON pt.application_id = a.id
WHERE a.payment_status = 'completed'
  AND a.application_status = 'submitted'
  AND e.id IS NULL
  AND up.id IS NOT NULL;

-- ============================================================================
-- 4. Add indexes for better performance on reconciliation queries
-- ============================================================================

-- Index for finding applications by payment status
CREATE INDEX IF NOT EXISTS idx_applications_payment_status 
ON applications(payment_status) 
WHERE payment_status IN ('pending', 'completed', 'failed');

-- Index for finding payment transactions by application
CREATE INDEX IF NOT EXISTS idx_payment_transactions_application_id 
ON payment_transactions(application_id);

-- Index for finding user application status mismatches
CREATE INDEX IF NOT EXISTS idx_user_application_status_mismatch 
ON user_application_status(application_id, status);

-- ============================================================================
-- 5. Update stats for affected users
-- ============================================================================

-- Refresh any cached stats that might be affected by these changes
-- This ensures the lobby stats are accurate after the migration

-- Note: If you have any cached stats tables or functions, update them here
-- For now, we'll just ensure the data is consistent

-- ============================================================================
-- Migration completed
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 024 completed: Fixed % user_application_status records, created % payment_transactions records, created % enrollment records',
    (SELECT COUNT(*) FROM user_application_status uas 
     JOIN applications a ON uas.application_id = a.id 
     WHERE uas.status = a.payment_status),
    (SELECT COUNT(*) FROM payment_transactions WHERE payment_reference LIKE 'legacy-%'),
    (SELECT COUNT(*) FROM enrollments WHERE created_at >= NOW() - INTERVAL '1 minute');
END $$;
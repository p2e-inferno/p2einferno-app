-- Supabase Seed Data for Local Development
-- This file provides sample data for local development and testing
-- Run with: supabase db reset

-- Note: This seed file is for local development only
-- Do not include sensitive production data

-- ============================================================================
-- Sample Bootcamp Programs
-- ============================================================================

INSERT INTO bootcamp_programs (id, name, description, duration_weeks, max_reward_dgt, lock_manager_granted, image_url)
VALUES
  ('550e8400-e29b-41d4-a716-446655440010', 'Web3 Fundamentals', 'Learn the basics of Web3 development, blockchain technology, and smart contracts', 8, 500, false, NULL),
  ('550e8400-e29b-41d4-a716-446655440011', 'DeFi Development', 'Advanced course on building DeFi applications and protocols', 12, 1000, false, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Sample Cohorts
-- ============================================================================

INSERT INTO cohorts (
  id,
  bootcamp_program_id,
  name,
  start_date,
  end_date,
  registration_deadline,
  max_participants,
  status,
  lock_manager_granted,
  naira_amount,
  usdt_amount
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440020',
    '550e8400-e29b-41d4-a716-446655440010',
    'Web3 Fundamentals Q1 2025',
    '2025-01-15',
    '2025-03-15',
    '2025-01-10',
    50,
    'upcoming',
    false,
    50000,
    100
  ),
  (
    '550e8400-e29b-41d4-a716-446655440021',
    '550e8400-e29b-41d4-a716-446655440011',
    'DeFi Development Q2 2025',
    '2025-04-01',
    '2025-06-30',
    '2025-03-25',
    30,
    'upcoming',
    false,
    75000,
    150
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Sample Program Highlights
-- ============================================================================

INSERT INTO program_highlights (cohort_id, content, order_index)
VALUES
  ('550e8400-e29b-41d4-a716-446655440020', 'Interactive live sessions with industry experts', 1),
  ('550e8400-e29b-41d4-a716-446655440020', 'Hands-on smart contract development', 2),
  ('550e8400-e29b-41d4-a716-446655440020', 'Build and deploy your first DApp', 3),
  ('550e8400-e29b-41d4-a716-446655440021', 'Deep dive into DeFi protocols and mechanisms', 1),
  ('550e8400-e29b-41d4-a716-446655440021', 'Build your own DEX or lending protocol', 2),
  ('550e8400-e29b-41d4-a716-446655440021', 'Security best practices and auditing', 3)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Sample Program Requirements
-- ============================================================================

INSERT INTO program_requirements (cohort_id, content, order_index)
VALUES
  ('550e8400-e29b-41d4-a716-446655440020', 'Basic understanding of programming concepts', 1),
  ('550e8400-e29b-41d4-a716-446655440020', 'Familiarity with JavaScript/TypeScript', 2),
  ('550e8400-e29b-41d4-a716-446655440020', 'Dedicated 10-15 hours per week', 3),
  ('550e8400-e29b-41d4-a716-446655440021', 'Completed Web3 Fundamentals or equivalent', 1),
  ('550e8400-e29b-41d4-a716-446655440021', 'Strong understanding of Solidity', 2),
  ('550e8400-e29b-41d4-a716-446655440021', 'Dedicated 15-20 hours per week', 3)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Sample Quests
-- ============================================================================

INSERT INTO quests (id, title, description, total_reward, is_active, lock_manager_granted, image_url)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Set Up Your Web3 Wallet',
    'Learn how to create and secure your first Web3 wallet',
    50,
    true,
    false,
    NULL
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Make Your First Transaction',
    'Send your first blockchain transaction on testnet',
    100,
    true,
    false,
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Sample Quest Tasks
-- ============================================================================

INSERT INTO quest_tasks (
  quest_id,
  title,
  description,
  task_type,
  verification_method,
  reward_amount,
  order_index,
  requires_admin_review,
  input_required,
  input_label,
  input_placeholder
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Install MetaMask',
    'Download and install the MetaMask browser extension',
    'custom',
    'manual',
    20,
    1,
    false,
    true,
    'MetaMask Wallet Address',
    '0x...'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Backup Your Seed Phrase',
    'Safely store your 12-word recovery phrase',
    'custom',
    'manual',
    30,
    2,
    false,
    false,
    NULL,
    NULL
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Connect to Base Sepolia',
    'Add Base Sepolia testnet to your wallet',
    'custom',
    'manual',
    30,
    1,
    false,
    true,
    'Wallet Address on Base Sepolia',
    '0x...'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Get Testnet Tokens',
    'Claim testnet ETH from a faucet',
    'custom',
    'manual',
    30,
    2,
    false,
    true,
    'Transaction Hash',
    '0x...'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Send a Transaction',
    'Send testnet ETH to another address',
    'custom',
    'manual',
    40,
    3,
    true,
    true,
    'Transaction Hash',
    '0x...'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- This seed file provides minimal sample data for local development.
--
-- To customize:
-- 1. Add more bootcamp programs, cohorts, and quests as needed
-- 2. Adjust dates to match your development timeline
-- 3. Update rewards and pricing for testing scenarios
--
-- To reset your local database with this seed data:
--   supabase db reset
--
-- To apply migrations without seed data:
--   supabase migration up
--
-- ============================================================================

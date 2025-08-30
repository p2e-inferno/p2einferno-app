-- Sample data for P2E Inferno app
-- This populates the database with test data for development

-- Insert sample bootcamp program
INSERT INTO public.bootcamp_programs (id, name, description, duration_weeks, max_reward_dgt) VALUES
(uuid_generate_v4(), 'Infernal Sparks', 'Master the fundamentals of Web3 and join the P2E Inferno community through hands-on experience and real-world applications.', 8, 24000);

-- Insert sample cohort
INSERT INTO public.cohorts (id, bootcamp_program_id, name, start_date, end_date, max_participants, current_participants, registration_deadline, status) VALUES
(uuid_generate_v4(), (SELECT id FROM public.bootcamp_programs WHERE name = 'Infernal Sparks'), 'Infernal Sparks Cohort 1', '2025-09-01', '2025-09-29', 100, 5, '2025-08-25', 'open');

-- Insert sample quests
INSERT INTO public.quests (id, title, description, total_reward, is_active) VALUES
(uuid_generate_v4(), 'Welcome to the Inferno', 'Complete your profile setup and join the P2E Inferno community', 5000, true),
(uuid_generate_v4(), 'Web3 Foundation', 'Learn the basics of Web3 and complete fundamental tasks', 10000, true),
(uuid_generate_v4(), 'Community Engagement', 'Engage with the community and complete social tasks', 8000, true);

-- Insert sample quest tasks for Quest 1 (Welcome to the Inferno)
INSERT INTO public.quest_tasks (quest_id, title, description, task_type, verification_method, reward_amount, order_index) VALUES
((SELECT id FROM public.quests WHERE title = 'Welcome to the Inferno'), 'Link Email Account', 'Connect your email address to your profile', 'link_email', 'email_verification', 1000, 1),
((SELECT id FROM public.quests WHERE title = 'Welcome to the Inferno'), 'Connect Wallet', 'Link your Web3 wallet to get started', 'link_wallet', 'wallet_connection', 1500, 2),
((SELECT id FROM public.quests WHERE title = 'Welcome to the Inferno'), 'Sign Terms of Service', 'Read and sign our Terms of Service', 'sign_tos', 'digital_signature', 1000, 3),
((SELECT id FROM public.quests WHERE title = 'Welcome to the Inferno'), 'Link Farcaster', 'Connect your Farcaster account for community access', 'link_farcaster', 'farcaster_verification', 1500, 4);

-- Insert sample quest tasks for Quest 2 (Web3 Foundation)
INSERT INTO public.quest_tasks (quest_id, title, description, task_type, verification_method, reward_amount, order_index) VALUES
((SELECT id FROM public.quests WHERE title = 'Web3 Foundation'), 'Complete Profile', 'Fill out your complete user profile', 'link_email', 'profile_completion', 2000, 1),
((SELECT id FROM public.quests WHERE title = 'Web3 Foundation'), 'Join Discord', 'Join our Discord community server', 'link_farcaster', 'discord_verification', 2000, 2),
((SELECT id FROM public.quests WHERE title = 'Web3 Foundation'), 'First Transaction', 'Complete your first Web3 transaction', 'link_wallet', 'transaction_verification', 3000, 3),
((SELECT id FROM public.quests WHERE title = 'Web3 Foundation'), 'Knowledge Quiz', 'Pass the Web3 fundamentals quiz', 'sign_tos', 'quiz_completion', 3000, 4);

-- Insert sample quest tasks for Quest 3 (Community Engagement)
INSERT INTO public.quest_tasks (quest_id, title, description, task_type, verification_method, reward_amount, order_index) VALUES
((SELECT id FROM public.quests WHERE title = 'Community Engagement'), 'Share on Social', 'Share about P2E Inferno on social media', 'link_farcaster', 'social_verification', 2000, 1),
((SELECT id FROM public.quests WHERE title = 'Community Engagement'), 'Refer a Friend', 'Invite a friend to join the community', 'link_email', 'referral_verification', 3000, 2),
((SELECT id FROM public.quests WHERE title = 'Community Engagement'), 'Community Discussion', 'Participate in community discussions', 'link_farcaster', 'discussion_participation', 2000, 3),
((SELECT id FROM public.quests WHERE title = 'Community Engagement'), 'Feedback Survey', 'Complete the community feedback survey', 'sign_tos', 'survey_completion', 1000, 4);
-- Create quests table
CREATE TABLE IF NOT EXISTS public.quests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    total_reward INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quest tasks table
CREATE TABLE IF NOT EXISTS public.quest_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    task_type VARCHAR(50) NOT NULL, -- 'link_email', 'link_wallet', 'link_farcaster', 'sign_tos'
    reward_amount INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user quest progress table
CREATE TABLE IF NOT EXISTS public.user_quest_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_reward_claimed INTEGER DEFAULT 0,
    UNIQUE(user_id, quest_id)
);

-- Create user task completions table
CREATE TABLE IF NOT EXISTS public.user_task_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
    quest_progress_id UUID NOT NULL REFERENCES public.user_quest_progress(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verification_data JSONB, -- Store any verification data (e.g., signature, linked account info)
    reward_claimed BOOLEAN DEFAULT false,
    reward_claimed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, task_id)
);

-- Create terms of service signatures table
CREATE TABLE IF NOT EXISTS public.tos_signatures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    signature TEXT NOT NULL,
    message TEXT NOT NULL,
    tos_version VARCHAR(20) NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tos_version)
);

-- Create indexes for better performance
CREATE INDEX idx_quest_tasks_quest_id ON public.quest_tasks(quest_id);
CREATE INDEX idx_user_quest_progress_user_id ON public.user_quest_progress(user_id);
CREATE INDEX idx_user_quest_progress_quest_id ON public.user_quest_progress(quest_id);
CREATE INDEX idx_user_task_completions_user_id ON public.user_task_completions(user_id);
CREATE INDEX idx_user_task_completions_task_id ON public.user_task_completions(task_id);
CREATE INDEX idx_tos_signatures_user_id ON public.tos_signatures(user_id);
CREATE INDEX idx_tos_signatures_wallet_address ON public.tos_signatures(wallet_address);

-- Enable Row Level Security
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tos_signatures ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Quests are viewable by all authenticated users
CREATE POLICY "Quests are viewable by authenticated users" ON public.quests
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Quest tasks are viewable by all authenticated users
CREATE POLICY "Quest tasks are viewable by authenticated users" ON public.quest_tasks
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Users can view their own quest progress
CREATE POLICY "Users can view own quest progress" ON public.user_quest_progress
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own quest progress
CREATE POLICY "Users can create own quest progress" ON public.user_quest_progress
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own quest progress
CREATE POLICY "Users can update own quest progress" ON public.user_quest_progress
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can view their own task completions
CREATE POLICY "Users can view own task completions" ON public.user_task_completions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own task completions
CREATE POLICY "Users can create own task completions" ON public.user_task_completions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own task completions
CREATE POLICY "Users can update own task completions" ON public.user_task_completions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can view their own TOS signatures
CREATE POLICY "Users can view own TOS signatures" ON public.tos_signatures
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own TOS signatures
CREATE POLICY "Users can create own TOS signatures" ON public.tos_signatures
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Insert the "Rosy beginnings" quest
INSERT INTO public.quests (title, description, image_url, total_reward)
VALUES (
    'Rosy beginnings',
    'Welcome, aspiring Infernal! Begin your journey into the blazing depths of Web3. Complete these essential tasks to secure your identity and join our burning brotherhood. Each step forges you stronger in the fires of decentralization.',
    '/images/quests/rosy-beginnings.svg',
    4000
);

-- Get the quest ID for inserting tasks
DO $$
DECLARE
    quest_id UUID;
BEGIN
    SELECT id INTO quest_id FROM public.quests WHERE title = 'Rosy beginnings' LIMIT 1;
    
    -- Insert tasks for the quest
    INSERT INTO public.quest_tasks (quest_id, title, description, task_type, reward_amount, order_index)
    VALUES 
        (quest_id, 'Link Your Email', 'Connect your email address to receive important updates and secure your account recovery options.', 'link_email', 1000, 1),
        (quest_id, 'Link Your Wallet', 'Connect your Web3 wallet to unlock the full power of decentralized interactions.', 'link_wallet', 1000, 2),
        (quest_id, 'Link Your Farcaster', 'Join the Web3 social revolution by connecting your Farcaster account.', 'link_farcaster', 1000, 3),
        (quest_id, 'Sign the Infernal Pact', 'Read and sign our Terms of Service to officially become an Infernal.', 'sign_tos', 1000, 4);
END $$;

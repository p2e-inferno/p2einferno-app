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

-- Add image_url column to quests table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quests' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE public.quests ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Create quest tasks table
CREATE TABLE IF NOT EXISTS public.quest_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    task_type VARCHAR(50) NOT NULL, -- 'link_email', 'link_wallet', 'link_farcaster', 'sign_tos'
    verification_method VARCHAR(50) NOT NULL,
    reward_amount INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user quest progress table
CREATE TABLE IF NOT EXISTS public.user_quest_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- Changed from UUID to TEXT to match existing schema
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_reward_claimed INTEGER DEFAULT 0,
    UNIQUE(user_id, quest_id)
);

-- Create user task completions table
CREATE TABLE IF NOT EXISTS public.user_task_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- Changed from UUID to TEXT to match existing schema
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
    user_id TEXT NOT NULL, -- Changed from UUID to TEXT to match existing schema
    wallet_address VARCHAR(42) NOT NULL,
    signature TEXT NOT NULL,
    message TEXT NOT NULL,
    tos_version VARCHAR(20) NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tos_version)
);

-- Create indexes for better performance (with conditional checks)
DO $$
BEGIN
    -- Check if index exists before creating it
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_quest_tasks_quest_id'
    ) THEN
        CREATE INDEX idx_quest_tasks_quest_id ON public.quest_tasks(quest_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_quest_progress_user_id'
    ) THEN
        CREATE INDEX idx_user_quest_progress_user_id ON public.user_quest_progress(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_quest_progress_quest_id'
    ) THEN
        CREATE INDEX idx_user_quest_progress_quest_id ON public.user_quest_progress(quest_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_task_completions_user_id'
    ) THEN
        CREATE INDEX idx_user_task_completions_user_id ON public.user_task_completions(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_task_completions_task_id'
    ) THEN
        CREATE INDEX idx_user_task_completions_task_id ON public.user_task_completions(task_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tos_signatures_user_id'
    ) THEN
        CREATE INDEX idx_tos_signatures_user_id ON public.tos_signatures(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tos_signatures_wallet_address'
    ) THEN
        CREATE INDEX idx_tos_signatures_wallet_address ON public.tos_signatures(wallet_address);
    END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tos_signatures ENABLE ROW LEVEL SECURITY;

-- Create RLS policies with conditional checks
DO $$
BEGIN
    -- Drop existing policies if they exist to avoid errors
    DROP POLICY IF EXISTS "Quests are viewable by authenticated users" ON public.quests;
    DROP POLICY IF EXISTS "Quest tasks are viewable by authenticated users" ON public.quest_tasks;
    DROP POLICY IF EXISTS "Users can view own quest progress" ON public.user_quest_progress;
    DROP POLICY IF EXISTS "Users can create own quest progress" ON public.user_quest_progress;
    DROP POLICY IF EXISTS "Users can update own quest progress" ON public.user_quest_progress;
    DROP POLICY IF EXISTS "Users can view own task completions" ON public.user_task_completions;
    DROP POLICY IF EXISTS "Users can create own task completions" ON public.user_task_completions;
    DROP POLICY IF EXISTS "Users can update own task completions" ON public.user_task_completions;
    DROP POLICY IF EXISTS "Users can view own TOS signatures" ON public.tos_signatures;
    DROP POLICY IF EXISTS "Users can create own TOS signatures" ON public.tos_signatures;
END $$;

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
    USING (auth.uid()::text = user_id);

-- Users can insert their own quest progress
CREATE POLICY "Users can create own quest progress" ON public.user_quest_progress
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own quest progress
CREATE POLICY "Users can update own quest progress" ON public.user_quest_progress
    FOR UPDATE
    USING (auth.uid()::text = user_id);

-- Users can view their own task completions
CREATE POLICY "Users can view own task completions" ON public.user_task_completions
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Users can insert their own task completions
CREATE POLICY "Users can create own task completions" ON public.user_task_completions
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own task completions
CREATE POLICY "Users can update own task completions" ON public.user_task_completions
    FOR UPDATE
    USING (auth.uid()::text = user_id);

-- Users can view their own TOS signatures
CREATE POLICY "Users can view own TOS signatures" ON public.tos_signatures
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Users can insert their own TOS signatures
CREATE POLICY "Users can create own TOS signatures" ON public.tos_signatures
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Check if the quest already exists before inserting
DO $$
DECLARE
    quest_exists BOOLEAN;
    quest_id UUID;
BEGIN
    -- Check if the quest already exists
    SELECT EXISTS (
        SELECT 1 FROM public.quests WHERE title = 'Rosy beginnings'
    ) INTO quest_exists;
    
    -- Insert the quest only if it doesn't exist
    IF NOT quest_exists THEN
        -- Insert the "Rosy beginnings" quest
        INSERT INTO public.quests (title, description, image_url, total_reward)
        VALUES (
            'Rosy beginnings',
            'Welcome, aspiring Infernal! Begin your journey into the blazing depths of Web3. Complete these essential tasks to secure your identity and join our burning brotherhood. Each step forges you stronger in the fires of decentralization.',
            '/images/quests/rosy-beginnings.svg',
            4000
        )
        RETURNING id INTO quest_id;
        
        -- Insert tasks for the quest
        INSERT INTO public.quest_tasks (quest_id, title, description, task_type, verification_method, reward_amount, order_index)
        VALUES 
            (quest_id, 'Link Your Email', 'Connect your email address to receive important updates and secure your account recovery options.', 'link_email', 'email_verification', 1000, 1),
            (quest_id, 'Link Your Wallet', 'Connect your Web3 wallet to unlock the full power of decentralized interactions.', 'link_wallet', 'wallet_connection', 1000, 2),
            (quest_id, 'Link Your Farcaster', 'Join the Web3 social revolution by connecting your Farcaster account.', 'link_farcaster', 'farcaster_verification', 1000, 3),
            (quest_id, 'Sign the Infernal Pact', 'Read and sign our Terms of Service to officially become an Infernal.', 'sign_tos', 'signature_verification', 1000, 4);
    END IF;
END $$;

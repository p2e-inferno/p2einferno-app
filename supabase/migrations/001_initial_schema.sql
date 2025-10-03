-- Initial schema for P2E Inferno app
-- This creates all the necessary tables for quests, bootcamps, and applications

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Create quests table
CREATE TABLE public.quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    total_reward INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create quest_tasks table
CREATE TABLE public.quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('link_email', 'link_wallet', 'link_farcaster', 'sign_tos')),
    verification_method TEXT NOT NULL,
    reward_amount INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create user_quest_progress table
CREATE TABLE public.user_quest_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, -- Privy user ID
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    reward_claimed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, quest_id)
);
-- Create user_task_completions table
CREATE TABLE public.user_task_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, -- Privy user ID
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
    verification_data JSONB,
    reward_claimed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, task_id)
);
-- Create tos_signatures table
CREATE TABLE public.tos_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, -- Privy user ID
    wallet_address TEXT NOT NULL,
    signature TEXT NOT NULL,
    message TEXT NOT NULL,
    tos_version TEXT NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tos_version)
);
-- Create bootcamp_programs table
CREATE TABLE public.bootcamp_programs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_weeks INTEGER NOT NULL,
    max_reward_dgt INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create cohorts table
CREATE TABLE public.cohorts (
    id TEXT PRIMARY KEY,
    bootcamp_program_id TEXT NOT NULL REFERENCES public.bootcamp_programs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 100,
    current_participants INTEGER NOT NULL DEFAULT 0,
    registration_deadline DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'upcoming')) DEFAULT 'upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create applications table
CREATE TABLE public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id TEXT NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    experience_level TEXT NOT NULL CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
    motivation TEXT NOT NULL,
    goals TEXT[] NOT NULL DEFAULT '{}',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    application_status TEXT NOT NULL CHECK (application_status IN ('draft', 'submitted', 'approved', 'rejected')) DEFAULT 'draft',
    discount_code TEXT,
    total_amount INTEGER,
    currency TEXT CHECK (currency IN ('NGN', 'USD')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('crypto', 'fiat')) DEFAULT 'fiat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create indexes for better performance
CREATE INDEX idx_quest_tasks_quest_id ON public.quest_tasks(quest_id);
CREATE INDEX idx_quest_tasks_order_index ON public.quest_tasks(order_index);
CREATE INDEX idx_user_quest_progress_user_id ON public.user_quest_progress(user_id);
CREATE INDEX idx_user_quest_progress_quest_id ON public.user_quest_progress(quest_id);
CREATE INDEX idx_user_task_completions_user_id ON public.user_task_completions(user_id);
CREATE INDEX idx_user_task_completions_quest_id ON public.user_task_completions(quest_id);
CREATE INDEX idx_user_task_completions_task_id ON public.user_task_completions(task_id);
CREATE INDEX idx_tos_signatures_user_id ON public.tos_signatures(user_id);
CREATE INDEX idx_applications_cohort_id ON public.applications(cohort_id);
CREATE INDEX idx_applications_user_email ON public.applications(user_email);
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers for updated_at columns
CREATE TRIGGER update_quests_updated_at BEFORE UPDATE ON public.quests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quest_tasks_updated_at BEFORE UPDATE ON public.quest_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_quest_progress_updated_at BEFORE UPDATE ON public.user_quest_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bootcamp_programs_updated_at BEFORE UPDATE ON public.bootcamp_programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cohorts_updated_at BEFORE UPDATE ON public.cohorts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Enable Row Level Security (RLS) - recommended for production
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tos_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootcamp_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
-- Create RLS policies (basic ones - you may want to customize these)
-- Allow read access to quests and quest_tasks for authenticated users
CREATE POLICY "Allow read access to quests" ON public.quests FOR SELECT USING (is_active = true);
CREATE POLICY "Allow read access to quest_tasks" ON public.quest_tasks FOR SELECT USING (true);
CREATE POLICY "Allow read access to bootcamp_programs" ON public.bootcamp_programs FOR SELECT USING (true);
CREATE POLICY "Allow read access to cohorts" ON public.cohorts FOR SELECT USING (true);
-- Allow users to manage their own progress and completions
CREATE POLICY "Users can manage their own quest progress" ON public.user_quest_progress 
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage their own task completions" ON public.user_task_completions 
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage their own TOS signatures" ON public.tos_signatures 
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage their own applications" ON public.applications 
    FOR ALL USING (auth.uid()::text = user_email OR auth.email() = user_email);
-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.quests TO authenticated;
GRANT SELECT ON public.quest_tasks TO authenticated;
GRANT SELECT ON public.bootcamp_programs TO authenticated;
GRANT SELECT ON public.cohorts TO authenticated;
GRANT ALL ON public.user_quest_progress TO authenticated;
GRANT ALL ON public.user_task_completions TO authenticated;
GRANT ALL ON public.tos_signatures TO authenticated;
GRANT ALL ON public.applications TO authenticated;

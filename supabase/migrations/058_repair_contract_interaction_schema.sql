-- 058_repair_contract_interaction_schema.sql
-- Repair migration: Add missing contract interaction fields to milestone_tasks
-- This migration is idempotent and safe to run multiple times

-- Add contract interaction columns if they don't exist
ALTER TABLE public.milestone_tasks 
ADD COLUMN IF NOT EXISTS contract_network VARCHAR(50),
ADD COLUMN IF NOT EXISTS contract_address TEXT,
ADD COLUMN IF NOT EXISTS contract_method VARCHAR(100);

-- Add check constraint for contract_network (safe with IF NOT EXISTS pattern)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'milestone_tasks_contract_network_check'
    ) THEN
        ALTER TABLE public.milestone_tasks 
        ADD CONSTRAINT milestone_tasks_contract_network_check 
        CHECK (contract_network IS NULL OR contract_network IN ('base', 'base-sepolia'));
    END IF;
END $$;

-- Add check constraint for contract_address (safe with IF NOT EXISTS pattern)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'milestone_tasks_contract_address_check'
    ) THEN
        ALTER TABLE public.milestone_tasks 
        ADD CONSTRAINT milestone_tasks_contract_address_check 
        CHECK (contract_address IS NULL OR contract_address ~ '^0x[a-fA-F0-9]{40}$');
    END IF;
END $$;

-- Add validation constraint for contract interaction tasks
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'milestone_tasks_contract_interaction_validation'
    ) THEN
        ALTER TABLE public.milestone_tasks 
        ADD CONSTRAINT milestone_tasks_contract_interaction_validation 
        CHECK (
            (task_type != 'contract_interaction') OR 
            (task_type = 'contract_interaction' AND contract_network IS NOT NULL AND contract_address IS NOT NULL AND contract_method IS NOT NULL)
        );
    END IF;
END $$;

-- Add performance indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_contract_network ON public.milestone_tasks(contract_network);
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_contract_address ON public.milestone_tasks(contract_address);

-- Add column comments for documentation
COMMENT ON COLUMN public.milestone_tasks.contract_network IS 'Blockchain network for contract interaction tasks (base, base-sepolia)';
COMMENT ON COLUMN public.milestone_tasks.contract_address IS 'Smart contract address for contract interaction tasks (Ethereum address format)';
COMMENT ON COLUMN public.milestone_tasks.contract_method IS 'Contract method/function name that users should interact with';
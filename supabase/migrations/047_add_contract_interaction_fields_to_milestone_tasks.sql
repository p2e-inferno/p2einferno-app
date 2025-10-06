-- 047_add_contract_interaction_fields_to_milestone_tasks.sql
-- Add fields to support contract interaction tasks

-- Add contract interaction fields to milestone_tasks
ALTER TABLE public.milestone_tasks 
ADD COLUMN IF NOT EXISTS contract_network VARCHAR(50),
ADD COLUMN IF NOT EXISTS contract_address TEXT,
ADD COLUMN IF NOT EXISTS contract_method VARCHAR(100);
-- Add check constraint for contract_network to ensure valid networks
ALTER TABLE public.milestone_tasks 
ADD CONSTRAINT milestone_tasks_contract_network_check 
CHECK (contract_network IS NULL OR contract_network IN ('base', 'base-sepolia'));
-- Add check constraint for contract_address to ensure valid Ethereum address format when provided
ALTER TABLE public.milestone_tasks 
ADD CONSTRAINT milestone_tasks_contract_address_check 
CHECK (contract_address IS NULL OR contract_address ~ '^0x[a-fA-F0-9]{40}$');
-- Add validation to ensure contract fields are provided when task_type is 'contract_interaction'
ALTER TABLE public.milestone_tasks 
ADD CONSTRAINT milestone_tasks_contract_interaction_validation 
CHECK (
  (task_type != 'contract_interaction') OR 
  (task_type = 'contract_interaction' AND contract_network IS NOT NULL AND contract_address IS NOT NULL AND contract_method IS NOT NULL)
);
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_contract_network ON public.milestone_tasks(contract_network);
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_contract_address ON public.milestone_tasks(contract_address);
-- Add comments to document the fields
COMMENT ON COLUMN public.milestone_tasks.contract_network IS 'Blockchain network for contract interaction tasks (base, base-sepolia)';
COMMENT ON COLUMN public.milestone_tasks.contract_address IS 'Smart contract address for contract interaction tasks (Ethereum address format)';
COMMENT ON COLUMN public.milestone_tasks.contract_method IS 'Contract method/function name that users should interact with';

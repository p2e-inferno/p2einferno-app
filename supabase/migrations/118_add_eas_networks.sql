CREATE TABLE IF NOT EXISTS public.eas_networks (
  name TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_testnet BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT false,
  eas_contract_address TEXT NOT NULL,
  schema_registry_address TEXT NOT NULL,
  eip712_proxy_address TEXT,
  eas_scan_base_url TEXT,
  explorer_base_url TEXT,
  rpc_url TEXT,
  source TEXT,
  source_commit TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view eas networks"
  ON public.eas_networks
  FOR SELECT
  USING (true);

CREATE TRIGGER update_eas_networks_updated_at
  BEFORE UPDATE ON public.eas_networks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.eas_networks (
  name,
  chain_id,
  display_name,
  is_testnet,
  enabled,
  eas_contract_address,
  schema_registry_address,
  explorer_base_url,
  source
) VALUES
  (
    'optimism-mainnet',
    10,
    'Optimism Mainnet',
    false,
    false,
    '0x4200000000000000000000000000000000000021',
    '0x4200000000000000000000000000000000000020',
    'https://optimistic.etherscan.io',
    'static-seed'
  ),
  (
    'optimism-sepolia',
    11155420,
    'Optimism Sepolia',
    true,
    false,
    '0x4200000000000000000000000000000000000021',
    '0x4200000000000000000000000000000000000020',
    'https://optimistic.etherscan.io',
    'static-seed'
  ),
  (
    'base',
    8453,
    'Base Mainnet',
    false,
    true,
    '0x4200000000000000000000000000000000000021',
    '0x4200000000000000000000000000000000000020',
    'https://base.blockscout.com',
    'static-seed'
  ),
  (
    'base-sepolia',
    84532,
    'Base Sepolia',
    true,
    true,
    '0x4200000000000000000000000000000000000021',
    '0x4200000000000000000000000000000000000020',
    'https://base.blockscout.com',
    'static-seed'
  ),
  (
    'ethereum-mainnet',
    1,
    'Ethereum Mainnet',
    false,
    false,
    '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587',
    '0xA7b39296258348C78294F95B872b282326A97BDF',
    'https://etherscan.io',
    'static-seed'
  ),
  (
    'arbitrum-one',
    42161,
    'Arbitrum One',
    false,
    false,
    '0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92',
    '0x5ece93bE4BDCF293Ed61FA78698B594F2135AF34',
    'https://arbiscan.io',
    'static-seed'
  ),
  (
    'arbitrum-nova',
    42170,
    'Arbitrum Nova',
    false,
    false,
    '0x21d8d4eE83b80bc0Cc0f2B7df3117Cf212d02901',
    '0xB8566376dFe68B76FA985D5448cc2FbD578412a2',
    'https://nova.arbiscan.io',
    'static-seed'
  )
ON CONFLICT (name) DO UPDATE SET
  chain_id = EXCLUDED.chain_id,
  display_name = EXCLUDED.display_name,
  is_testnet = EXCLUDED.is_testnet,
  enabled = EXCLUDED.enabled,
  eas_contract_address = EXCLUDED.eas_contract_address,
  schema_registry_address = EXCLUDED.schema_registry_address,
  explorer_base_url = EXCLUDED.explorer_base_url,
  source = EXCLUDED.source,
  updated_at = now();

COMMENT ON TABLE public.eas_networks IS 'EAS network configuration for schema deployment and attestation operations';
COMMENT ON COLUMN public.eas_networks.enabled IS 'Controls visibility in admin UI and API validation';
COMMENT ON COLUMN public.eas_networks.rpc_url IS 'Optional RPC override; falls back to app RPC config when null';

UPDATE public.eas_networks
SET eas_scan_base_url = CASE name
  WHEN 'ethereum-mainnet' THEN 'https://easscan.org'
  WHEN 'optimism-mainnet' THEN 'https://optimism.easscan.org'
  WHEN 'optimism-sepolia' THEN 'https://optimism-sepolia.easscan.org'
  WHEN 'base' THEN 'https://base.easscan.org'
  WHEN 'base-sepolia' THEN 'https://base-sepolia.easscan.org'
  WHEN 'arbitrum-one' THEN 'https://arbitrum.easscan.org'
  WHEN 'arbitrum-nova' THEN 'https://arbitrum-nova.easscan.org'
  ELSE eas_scan_base_url
END
WHERE name IN (
  'ethereum-mainnet',
  'optimism-mainnet',
  'optimism-sepolia',
  'base',
  'base-sepolia',
  'arbitrum-one',
  'arbitrum-nova'
);

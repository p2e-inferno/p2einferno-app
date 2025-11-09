-- 082_unify_bootcamp_completion_schema.sql
-- Unify Bootcamp Completion schema to canonical cohort-aware definition

UPDATE public.attestation_schemas
SET 
  description = 'Bootcamp completion attestation with cohort tracking',
  schema_definition = 'string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash',
  updated_at = now()
WHERE schema_uid = '0xp2e_bootcamp_completion_001';


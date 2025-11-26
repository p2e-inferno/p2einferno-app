-- Ensure only the service role can insert/update/delete activation grants
DROP POLICY IF EXISTS "Service role manages all grants"
  ON public.user_activation_grants;

CREATE POLICY "Service role manages all grants"
  ON public.user_activation_grants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

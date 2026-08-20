CREATE POLICY "deny_direct_client_access"
ON public."ComplianceIntelligenceItem"
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "deny_direct_client_access"
ON public."ComplianceIntelligenceSource"
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

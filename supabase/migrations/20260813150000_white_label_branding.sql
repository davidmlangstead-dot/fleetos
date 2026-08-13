ALTER TABLE public."CompanyControl"
  ADD COLUMN IF NOT EXISTS "brandName" text,
  ADD COLUMN IF NOT EXISTS "brandTagline" text,
  ADD COLUMN IF NOT EXISTS "brandLogoUrl" text,
  ADD COLUMN IF NOT EXISTS "brandPrimaryColor" text NOT NULL DEFAULT '#197B58',
  ADD COLUMN IF NOT EXISTS "brandAccentColor" text NOT NULL DEFAULT '#32C58B',
  ADD COLUMN IF NOT EXISTS "brandSidebarColor" text NOT NULL DEFAULT '#0E1B2C',
  ADD COLUMN IF NOT EXISTS "brandSupportEmail" text,
  ADD COLUMN IF NOT EXISTS "brandSupportPhone" text,
  ADD COLUMN IF NOT EXISTS "showPoweredBy" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "marketplaceEnabled" boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandName_length_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandName_length_check"
      CHECK ("brandName" IS NULL OR char_length("brandName") BETWEEN 2 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandTagline_length_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandTagline_length_check"
      CHECK ("brandTagline" IS NULL OR char_length("brandTagline") <= 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandLogoUrl_length_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandLogoUrl_length_check"
      CHECK ("brandLogoUrl" IS NULL OR char_length("brandLogoUrl") <= 2048);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandPrimaryColor_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandPrimaryColor_check"
      CHECK ("brandPrimaryColor" ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandAccentColor_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandAccentColor_check"
      CHECK ("brandAccentColor" ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyControl_brandSidebarColor_check') THEN
    ALTER TABLE public."CompanyControl" ADD CONSTRAINT "CompanyControl_brandSidebarColor_check"
      CHECK ("brandSidebarColor" ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

COMMENT ON COLUMN public."CompanyControl"."brandName" IS 'Customer-facing product name for this company white-label experience.';
COMMENT ON COLUMN public."CompanyControl"."brandLogoUrl" IS 'HTTPS URL for a public customer-facing logo; validated by the authenticated API.';
COMMENT ON COLUMN public."CompanyControl"."showPoweredBy" IS 'Controls whether the authenticated and public shells display the FleetOS attribution.';
COMMENT ON COLUMN public."CompanyControl"."marketplaceEnabled" IS 'Tenant-level control for exposing the cross-company marketplace navigation.';

DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'EmployerStatus'
      AND n.nspname = target_schema
      AND e.enumlabel = 'PENDING_PAYMENT'
  ) THEN
    EXECUTE format('ALTER TYPE %I."EmployerStatus" ADD VALUE ''PENDING_PAYMENT''', target_schema);
  END IF;
END
$$;

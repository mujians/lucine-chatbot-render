-- Add WAITING_CLIENT to SessionStatus enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'WAITING_CLIENT'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SessionStatus')
    ) THEN
        ALTER TYPE "SessionStatus" ADD VALUE 'WAITING_CLIENT';
    END IF;
END $$;

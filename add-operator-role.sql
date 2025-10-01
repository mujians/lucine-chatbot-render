-- Add role column to Operator table
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'OPERATOR';

-- Set admin user to ADMIN role (username = 'admin')
UPDATE "Operator" SET "role" = 'ADMIN' WHERE "username" = 'admin';

-- Create index on role
CREATE INDEX IF NOT EXISTS "Operator_role_idx" ON "Operator"("role");

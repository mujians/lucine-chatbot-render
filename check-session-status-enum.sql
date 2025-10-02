-- Check current values in SessionStatus enum
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SessionStatus')
ORDER BY enumsortorder;

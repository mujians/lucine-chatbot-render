-- ========================================
-- DATABASE SCHEMA VERIFICATION SCRIPT
-- ========================================

\echo '=== CHECKING ENUMS ==='

-- 1. SessionStatus enum (expected 8 values)
\echo '\n1. SessionStatus (should have 8 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SessionStatus')
ORDER BY enumsortorder;

-- 2. SenderType enum (expected 4 values)
\echo '\n2. SenderType (should have 4 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SenderType')
ORDER BY enumsortorder;

-- 3. TicketStatus enum (expected 5 values)
\echo '\n3. TicketStatus (should have 5 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TicketStatus')
ORDER BY enumsortorder;

-- 4. Priority enum (expected 4 values)
\echo '\n4. Priority (should have 4 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Priority')
ORDER BY enumsortorder;

-- 5. ContactMethod enum (expected 4 values)
\echo '\n5. ContactMethod (should have 4 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ContactMethod')
ORDER BY enumsortorder;

-- 6. QueueStatus enum (expected 4 values)
\echo '\n6. QueueStatus (should have 4 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'QueueStatus')
ORDER BY enumsortorder;

-- 7. SLAStatus enum (expected 5 values)
\echo '\n7. SLAStatus (should have 5 values):'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SLAStatus')
ORDER BY enumsortorder;

\echo '\n=== CHECKING TABLES ==='

-- List all tables
\echo '\nAll tables in database:'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo '\n=== CHECKING COLUMNS IN KEY TABLES ==='

-- ChatSession columns
\echo '\nChatSession columns:'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'ChatSession'
ORDER BY ordinal_position;

-- Operator columns
\echo '\nOperator columns:'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Operator'
ORDER BY ordinal_position;

-- SLARecord columns
\echo '\nSLARecord columns:'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'SLARecord'
ORDER BY ordinal_position;

-- QueueEntry columns
\echo '\nQueueEntry columns:'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'QueueEntry'
ORDER BY ordinal_position;

\echo '\n=== CHECKING INDEXES ==='

-- List indexes for key tables
\echo '\nIndexes on ChatSession:'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'ChatSession';

\echo '\nIndexes on Operator:'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'Operator';

\echo '\n=== VERIFICATION COMPLETE ==='

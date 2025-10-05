/**
 * 🔄 LOGGER MIGRATION SCRIPT
 * Automated script to replace console.log with logger calls
 * Run with: node scripts/migrate-to-logger.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Files to migrate (high priority only)
const filesToMigrate = [
  // Services
  'services/queue-service.js',
  'services/health-service.js',
  'services/sla-service.js',
  'services/timeout-service.js',
  'services/twilio-service.js',

  // Chat routes
  'routes/chat/index.js',
  'routes/chat/ai-handler.js',
  'routes/chat/escalation-handler.js',
  'routes/chat/ticket-handler.js',
  'routes/chat/polling-handler.js',
  'routes/chat/resume-handler.js',
  'routes/chat/session-handler.js',

  // Main routes
  'routes/operators.js',
  'routes/tickets.js',
  'routes/users.js',
  'routes/analytics.js',

  // Utils (if they have logging)
  'utils/notifications.js',
  'utils/automated-texts.js',
  'utils/error-handler.js'
];

// Migration patterns
const migrations = [
  // Auth logging
  {
    pattern: /console\.log\(['"`]✅ Auto-assigned chat from queue on login:['"`],\s*(.+?)\)/g,
    replacement: 'logger.auth.autoAssign(operator.id, $1)'
  },
  {
    pattern: /console\.log\(['"`]👋 Operator \$\{(.+?)\} logged out['"`]\)/g,
    replacement: 'logger.auth.logout($1)'
  },

  // Queue logging
  {
    pattern: /console\.log\(['"`]📋 Session \$\{(.+?)\} added to queue['"`]\)/g,
    replacement: 'logger.queue.added($1, priority)'
  },
  {
    pattern: /console\.log\(['"`]✅ Session added to queue:['"`],\s*(.+?)\)/g,
    replacement: 'logger.queue.added(session.sessionId, priority, { queueInfo: $1 })'
  },

  // Chat logging
  {
    pattern: /console\.log\(['"`]✅ Escalated to operator:['"`],\s*(.+?)\)/g,
    replacement: 'logger.chat.escalated(session.sessionId, $1)'
  },
  {
    pattern: /console\.log\(['"`]💬 Chat ended:['"`],\s*(.+?)\)/g,
    replacement: 'logger.chat.ended(session.sessionId, $1)'
  },

  // WebSocket logging
  {
    pattern: /console\.log\(['"`]🔌 Operator (.+?) connected['"`]\)/g,
    replacement: 'logger.websocket.connected("operator", $1)'
  },
  {
    pattern: /console\.log\(['"`]🔌 Widget (.+?) connected['"`]\)/g,
    replacement: 'logger.websocket.connected("widget", $1)'
  },

  // Generic error logging
  {
    pattern: /console\.error\(['"`]❌ (.+?):['"`],\s*(.+?)\)/g,
    replacement: 'logger.error("ERROR", "$1", $2)'
  },
  {
    pattern: /console\.warn\(['"`]⚠️\s*(.+?):['"`],\s*(.+?)\)/g,
    replacement: 'logger.warn("WARNING", "$1", { error: $2 })'
  },

  // Generic info logging with emoji
  {
    pattern: /console\.log\(['"`][🔍📊🎯👤✅❌📋💬🔌⏱️]\s*(.+?)['"`]\)/g,
    replacement: 'logger.info("INFO", "$1")'
  }
];

function addLoggerImport(content, filePath) {
  // Check if logger is already imported
  if (content.includes('import logger from')) {
    return content;
  }

  // Find the last import statement
  const imports = content.match(/^import .+ from .+;$/gm);
  if (!imports || imports.length === 0) {
    return content;
  }

  const lastImport = imports[imports.length - 1];
  const relativePath = filePath.split('/').length === 2 ? '../' : '../../';
  const loggerImport = `import logger from '${relativePath}utils/logger.js';`;

  return content.replace(lastImport, `${lastImport}\n${loggerImport}`);
}

function migrateFile(filePath) {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { migrated: false, reason: 'not_found' };
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  let migrationsApplied = 0;

  // Apply migrations
  for (const migration of migrations) {
    const matches = content.match(migration.pattern);
    if (matches && matches.length > 0) {
      content = content.replace(migration.pattern, migration.replacement);
      migrationsApplied += matches.length;
      changed = true;
    }
  }

  if (changed) {
    // Add logger import
    content = addLoggerImport(content, filePath);

    // Write back
    fs.writeFileSync(fullPath, content, 'utf8');
    return { migrated: true, count: migrationsApplied };
  }

  return { migrated: false, reason: 'no_matches' };
}

// Main execution
console.log('🚀 Starting logger migration...\n');

let totalMigrated = 0;
let totalFiles = 0;
let totalReplacements = 0;

for (const file of filesToMigrate) {
  const result = migrateFile(file);

  if (result.migrated) {
    console.log(`✅ ${file} - ${result.count} replacements`);
    totalMigrated++;
    totalReplacements += result.count;
  } else if (result.reason === 'not_found') {
    console.log(`⚠️  ${file} - not found`);
  } else {
    console.log(`⏭️  ${file} - no matches`);
  }

  totalFiles++;
}

console.log(`\n📊 Migration complete!`);
console.log(`   Files processed: ${totalFiles}`);
console.log(`   Files migrated: ${totalMigrated}`);
console.log(`   Total replacements: ${totalReplacements}`);
console.log(`\n⚠️  Manual review recommended for complex cases`);
console.log(`   Remaining console.log statements can be migrated manually`);

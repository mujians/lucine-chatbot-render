#!/usr/bin/env node
/**
 * 🧪 END-TO-END AUTOMATED TEXTS TEST
 * Creates real test sessions, tests all flows, cleans up
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(emoji, message, color = colors.reset) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function logTest(name, passed, actual = '', expected = '') {
  testResults.total++;
  const result = {
    name,
    passed,
    actual,
    expected
  };
  testResults.details.push(result);

  if (passed) {
    testResults.passed++;
    log('✅', `PASS: ${name}`, colors.green);
    if (actual) log('   ', `Got: ${actual}`, colors.cyan);
  } else {
    testResults.failed++;
    log('❌', `FAIL: ${name}`, colors.red);
    log('   ', `Expected: ${expected}`, colors.yellow);
    log('   ', `Got: ${actual}`, colors.cyan);
  }
}

// Test sessions to clean up
const testSessionIds = [];
const testTicketIds = [];
const testOperatorIds = [];

/**
 * Cleanup function - removes all test data
 */
async function cleanup() {
  log('🧹', 'Cleaning up test data...', colors.yellow);

  try {
    // Delete test messages
    for (const sessionId of testSessionIds) {
      await prisma.message.deleteMany({
        where: { sessionId }
      });
    }

    // Delete test operator chats
    await prisma.operatorChat.deleteMany({
      where: { sessionId: { in: testSessionIds } }
    });

    // Delete test tickets
    await prisma.ticket.deleteMany({
      where: { id: { in: testTicketIds } }
    });

    // Delete test sessions
    await prisma.chatSession.deleteMany({
      where: { sessionId: { in: testSessionIds } }
    });

    // Delete test operators
    await prisma.operator.deleteMany({
      where: { id: { in: testOperatorIds } }
    });

    log('✅', `Cleaned up ${testSessionIds.length} sessions, ${testTicketIds.length} tickets`, colors.green);

  } catch (error) {
    log('⚠️', `Cleanup error: ${error.message}`, colors.yellow);
  }
}

/**
 * Create test operator
 */
async function createTestOperator() {
  const operator = await prisma.operator.create({
    data: {
      username: `test-op-${Date.now()}`,
      email: 'test@test.com',
      name: 'Test Operator',
      displayName: 'TestOp',
      avatar: '🧪',
      role: 'OPERATOR',
      passwordHash: 'test-hash',
      isActive: true,
      isOnline: true
    }
  });

  testOperatorIds.push(operator.id);
  return operator;
}

/**
 * Create test session
 */
async function createTestSession(status = 'ACTIVE') {
  const sessionId = `test-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session = await prisma.chatSession.create({
    data: {
      sessionId,
      status,
      startedAt: new Date(),
      lastActivity: new Date()
    }
  });

  testSessionIds.push(sessionId);
  return session;
}

/**
 * TEST 1: operator_greeting
 */
async function test_operator_greeting() {
  log('🧪', 'TEST 1: operator_greeting', colors.blue);

  try {
    // Create session and operator
    const session = await createTestSession('WAITING_OPERATOR');
    const operator = await createTestOperator();

    // Simulate operator taking chat
    const operatorChat = await prisma.operatorChat.create({
      data: {
        sessionId: session.sessionId,
        operatorId: operator.id
      }
    });

    // Update session status
    await prisma.chatSession.update({
      where: { sessionId: session.sessionId },
      data: { status: 'WITH_OPERATOR' }
    });

    // Get automated text
    const greetingText = await prisma.automatedText.findUnique({
      where: { key: 'operator_greeting' }
    });

    logTest(
      'operator_greeting exists in DB',
      !!greetingText,
      greetingText ? 'Found' : 'Not found',
      'Found'
    );

    logTest(
      'operator_greeting is active',
      greetingText?.isActive === true,
      greetingText?.isActive,
      true
    );

    logTest(
      'operator_greeting has correct text',
      greetingText?.text?.includes('Ciao!'),
      greetingText?.text?.substring(0, 50),
      'Starts with "Ciao!"'
    );

  } catch (error) {
    logTest('operator_greeting', false, error.message, 'No errors');
  }
}

/**
 * TEST 2: closure_request with smartActions
 */
async function test_closure_request() {
  log('🧪', 'TEST 2: closure_request', colors.blue);

  try {
    const text = await prisma.automatedText.findUnique({
      where: { key: 'closure_request' }
    });

    logTest(
      'closure_request exists',
      !!text,
      text ? 'Found' : 'Not found'
    );

    logTest(
      'closure_request text correct',
      text?.text === 'Posso aiutarti con qualcos\'altro?',
      text?.text,
      'Posso aiutarti con qualcos\'altro?'
    );

    logTest(
      'closure_request is active',
      text?.isActive === true,
      text?.isActive,
      true
    );

  } catch (error) {
    logTest('closure_request', false, error.message);
  }
}

/**
 * TEST 3: Ticket flow texts
 */
async function test_ticket_texts() {
  log('🧪', 'TEST 3: Ticket flow texts', colors.blue);

  try {
    // Test all ticket-related texts
    const ticketKeys = [
      'ticket_start',
      'ticket_ask_name',
      'ticket_ask_contact',
      'ticket_ask_additional',
      'ticket_created',
      'ticket_name_invalid',
      'ticket_contact_invalid',
      'ticket_cancel',
      'ticket_already_exists'
    ];

    for (const key of ticketKeys) {
      const text = await prisma.automatedText.findUnique({
        where: { key }
      });

      logTest(
        `${key} exists and active`,
        text && text.isActive,
        text ? 'Found & Active' : 'Missing',
        'Found & Active'
      );
    }

  } catch (error) {
    logTest('ticket_texts', false, error.message);
  }
}

/**
 * TEST 4: Queue texts
 */
async function test_queue_texts() {
  log('🧪', 'TEST 4: Queue texts', colors.blue);

  try {
    const queueKeys = [
      'queue_no_operators',
      'queue_all_busy',
      'operator_no_online',
      'operator_all_busy'
    ];

    for (const key of queueKeys) {
      const text = await prisma.automatedText.findUnique({
        where: { key }
      });

      logTest(
        `${key} exists and active`,
        text && text.isActive,
        text ? 'Found & Active' : 'Missing'
      );
    }

  } catch (error) {
    logTest('queue_texts', false, error.message);
  }
}

/**
 * TEST 5: Closure texts
 */
async function test_closure_texts() {
  log('🧪', 'TEST 5: Closure flow texts', colors.blue);

  try {
    const closureKeys = ['chat_continue', 'chat_end_goodbye'];

    for (const key of closureKeys) {
      const text = await prisma.automatedText.findUnique({
        where: { key }
      });

      logTest(
        `${key} exists and active`,
        text && text.isActive,
        text ? 'Found & Active' : 'Missing'
      );
    }

  } catch (error) {
    logTest('closure_texts', false, error.message);
  }
}

/**
 * TEST 6: Variable interpolation
 */
async function test_variable_interpolation() {
  log('🧪', 'TEST 6: Variable interpolation', colors.blue);

  try {
    // Test ticket_ask_contact with {name} interpolation
    const text = await prisma.automatedText.findUnique({
      where: { key: 'ticket_ask_contact' }
    });

    logTest(
      'ticket_ask_contact has {name} placeholder',
      text?.text?.includes('{name}'),
      text?.text?.includes('{name}') ? 'Contains {name}' : 'Missing {name}',
      'Contains {name}'
    );

    // Test ticket_created with multiple placeholders
    const ticketCreatedText = await prisma.automatedText.findUnique({
      where: { key: 'ticket_created' }
    });

    const hasTicketNumber = ticketCreatedText?.text?.includes('{ticketNumber}');
    const hasContact = ticketCreatedText?.text?.includes('{contact}');
    const hasResumeUrl = ticketCreatedText?.text?.includes('{resumeUrl}');

    logTest(
      'ticket_created has all placeholders',
      hasTicketNumber && hasContact && hasResumeUrl,
      `{ticketNumber}: ${hasTicketNumber}, {contact}: ${hasContact}, {resumeUrl}: ${hasResumeUrl}`,
      'All present'
    );

  } catch (error) {
    logTest('variable_interpolation', false, error.message);
  }
}

/**
 * TEST 7: Text formatting (markdown, emoji)
 */
async function test_text_formatting() {
  log('🧪', 'TEST 7: Text formatting', colors.blue);

  try {
    // Test bold markdown
    const queueBusy = await prisma.automatedText.findUnique({
      where: { key: 'queue_all_busy' }
    });

    logTest(
      'queue_all_busy has bold markdown',
      queueBusy?.text?.includes('**'),
      queueBusy?.text?.includes('**') ? 'Has **bold**' : 'No markdown',
      'Has **bold**'
    );

    // Test emoji
    const ticketStart = await prisma.automatedText.findUnique({
      where: { key: 'ticket_start' }
    });

    logTest(
      'ticket_start has emoji',
      ticketStart?.text?.includes('🎫'),
      ticketStart?.text?.includes('🎫') ? 'Has emoji' : 'No emoji',
      'Has emoji'
    );

  } catch (error) {
    logTest('text_formatting', false, error.message);
  }
}

/**
 * TEST 8: All 19 texts present
 */
async function test_all_texts_present() {
  log('🧪', 'TEST 8: All 19 texts present', colors.blue);

  try {
    const allKeys = [
      'operator_greeting',
      'operator_connected',
      'queue_no_operators',
      'queue_all_busy',
      'operator_no_online',
      'operator_all_busy',
      'ticket_start',
      'ticket_ask_name',
      'ticket_ask_contact',
      'ticket_created',
      'closure_request',
      'chat_continue',
      'chat_end_goodbye',
      'ticket_cancel',
      'ticket_ask_additional',
      'ticket_name_invalid',
      'ticket_contact_invalid',
      'ticket_already_exists',
      'resume_welcome'
    ];

    const count = await prisma.automatedText.count({
      where: { key: { in: allKeys } }
    });

    logTest(
      'All 19 texts in database',
      count === 19,
      `${count}/19`,
      '19/19'
    );

    // Check all are active
    const activeCount = await prisma.automatedText.count({
      where: {
        key: { in: allKeys },
        isActive: true
      }
    });

    logTest(
      'All 19 texts are active',
      activeCount === 19,
      `${activeCount}/19`,
      '19/19'
    );

  } catch (error) {
    logTest('all_texts_present', false, error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  log('🚀', 'AUTOMATED TEXTS - E2E TEST SUITE', colors.blue);
  console.log('='.repeat(70) + '\n');

  try {
    await test_operator_greeting();
    console.log('');

    await test_closure_request();
    console.log('');

    await test_ticket_texts();
    console.log('');

    await test_queue_texts();
    console.log('');

    await test_closure_texts();
    console.log('');

    await test_variable_interpolation();
    console.log('');

    await test_text_formatting();
    console.log('');

    await test_all_texts_present();
    console.log('');

    // Summary
    console.log('='.repeat(70));
    log('📊', 'TEST RESULTS', colors.blue);
    console.log('='.repeat(70));
    log('✅', `Passed: ${testResults.passed}/${testResults.total}`, colors.green);
    log('❌', `Failed: ${testResults.failed}/${testResults.total}`, colors.red);

    const passRate = Math.round((testResults.passed / testResults.total) * 100);
    log('📈', `Success Rate: ${passRate}%`, passRate >= 80 ? colors.green : colors.red);
    console.log('='.repeat(70) + '\n');

    // Cleanup
    await cleanup();

    // Disconnect
    await prisma.$disconnect();

    // Exit
    process.exit(testResults.failed > 0 ? 1 : 0);

  } catch (error) {
    log('💥', `Fatal error: ${error.message}`, colors.red);
    console.error(error);
    await cleanup();
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run tests
runAllTests();

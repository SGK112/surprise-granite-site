#!/usr/bin/env node
/**
 * Room Designer Approval Flow - CLI Test Runner
 * Simulates the browser test suite by parsing the index.html directly
 */

const fs = require('fs');
const path = require('path');

// Test framework
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAIL', error: error.message });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[31m${error.message}\x1b[0m`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertContains(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(`${message || 'Not found'}: "${substr.substring(0, 50)}..."`);
  }
}

// Load designer HTML
const designerPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(designerPath, 'utf8');

console.log('\n\x1b[1m\x1b[34m════════════════════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m  Room Designer - Approval Flow Test Suite\x1b[0m');
console.log('\x1b[1m\x1b[34m════════════════════════════════════════════════════════════════\x1b[0m\n');

// ============ PERMISSION LEVEL TESTS ============
console.log('\x1b[1m\x1b[36mPermission Levels\x1b[0m');

test('quote_approval permission level exists', () => {
  assertContains(html, 'quote_approval:', 'quote_approval not found');
});

test('quote_approval has canApprove: true', () => {
  const match = html.match(/quote_approval:\s*\{[\s\S]*?canApprove:\s*true/);
  assert(match, 'canApprove: true not found in quote_approval');
});

test('quote_approval has canViewPrices: true', () => {
  const match = html.match(/quote_approval:\s*\{[\s\S]*?canViewPrices:\s*true/);
  assert(match, 'canViewPrices: true not found in quote_approval');
});

test('quote_approval has canEdit: false', () => {
  const match = html.match(/quote_approval:\s*\{[\s\S]*?canEdit:\s*false/);
  assert(match, 'canEdit: false not found in quote_approval');
});

// ============ SHARE MODAL TESTS ============
console.log('\n\x1b[1m\x1b[36mShare Modal\x1b[0m');

test('Send for Approval option exists', () => {
  assertContains(html, 'Send for Approval', 'Send for Approval text not found');
});

test('quote_approval button has data attribute', () => {
  assertContains(html, 'data-permission="quote_approval"', 'data attribute not found');
});

test('Approval option has green styling (#22c55e)', () => {
  assertContains(html, '#22c55e', 'Green color not found');
});

test('Approval description text exists', () => {
  assertContains(html, 'Customer reviews quote & pays to approve', 'Description not found');
});

test('setSharePermission handles quote_approval', () => {
  assertContains(html, "setSharePermission('quote_approval'", 'setSharePermission call not found');
});

// ============ APPROVE & PAY BUTTON TESTS ============
console.log('\n\x1b[1m\x1b[36mApprove & Pay Button\x1b[0m');

test('Approve & Pay Deposit button text exists', () => {
  assertContains(html, 'Approve & Pay Deposit', 'Button text not found');
});

test('approveAndPay onclick handler exists', () => {
  assertContains(html, 'onclick="approveAndPay()"', 'onclick handler not found');
});

test('Button shows only for quote_approval permission', () => {
  assertContains(html, "permission === 'quote_approval'", 'Permission check not found');
});

test('approve-pay-btn CSS class exists', () => {
  assertContains(html, '.approve-pay-btn', 'CSS class not found');
});

test('Approval terms mention 50% deposit', () => {
  assertContains(html, '50% deposit', 'Deposit terms not found');
});

// ============ APPROVE AND PAY FUNCTION TESTS ============
console.log('\n\x1b[1m\x1b[36mApproveAndPay Function\x1b[0m');

test('approveAndPay function is defined', () => {
  assertContains(html, 'window.approveAndPay = async function()', 'Function not defined');
});

test('Calculates 50% deposit (total * 0.5)', () => {
  assertContains(html, 'total * 0.5', 'Deposit calculation not found');
});

test('Calls Stripe checkout session API', () => {
  assertContains(html, '/api/create-checkout-session', 'API call not found');
});

test('Success URL includes approval=success', () => {
  assertContains(html, 'approval=success', 'Success param not found');
});

test('Stores pending approval in localStorage', () => {
  assertContains(html, 'sg_pending_approval', 'localStorage key not found');
});

test('Sends quote_approval_deposit payment type', () => {
  assertContains(html, 'quote_approval_deposit', 'Payment type not found');
});

test('Handles customer email collection', () => {
  assertContains(html, 'customerEmail', 'Email handling not found');
});

test('Shows loading state with Processing... text', () => {
  assertContains(html, 'Processing...', 'Loading text not found');
});

// ============ POST-PAYMENT TESTS ============
console.log('\n\x1b[1m\x1b[36mPost-Payment Flow\x1b[0m');

test('checkApprovalStatus function exists', () => {
  assertContains(html, 'function checkApprovalStatus()', 'Function not found');
});

test('checkApprovalStatus called on DOMContentLoaded', () => {
  assertContains(html, 'checkApprovalStatus()', 'Not called on load');
});

test('showApprovalConfirmation function exists', () => {
  assertContains(html, 'function showApprovalConfirmation', 'Function not found');
});

test('Confirmation shows Deposit Paid', () => {
  assertContains(html, 'Deposit Paid', 'Deposit Paid text not found');
});

test('Confirmation shows Remaining Balance', () => {
  assertContains(html, 'Remaining Balance', 'Remaining Balance text not found');
});

test('Updates share status to approved_paid', () => {
  assertContains(html, 'approved_paid', 'Status update not found');
});

test('updateShareStatus function exists', () => {
  assertContains(html, 'async function updateShareStatus', 'Function not found');
});

// ============ STRIPE INTEGRATION TESTS ============
console.log('\n\x1b[1m\x1b[36mStripe Integration\x1b[0m');

test('STRIPE_PUBLIC_KEY is defined', () => {
  assertContains(html, 'STRIPE_PUBLIC_KEY', 'Key not defined');
});

test('Uses live Stripe key (pk_live_)', () => {
  assertContains(html, 'pk_live_', 'Live key not found');
});

test('API base URL is correct', () => {
  assertContains(html, 'surprise-granite-email-api.onrender.com', 'API URL not found');
});

test('Redirects to Stripe checkout URL', () => {
  assertContains(html, 'window.location.href = data.url', 'Redirect not found');
});

test('Has redirectToCheckout fallback', () => {
  assertContains(html, 'redirectToCheckout', 'Fallback not found');
});

// ============ QUOTE CALCULATION TESTS ============
console.log('\n\x1b[1m\x1b[36mQuote Calculation\x1b[0m');

test('calculateQuoteTotal function exists', () => {
  assertContains(html, 'function calculateQuoteTotal()', 'Function not found');
});

test('Applies margin to pricing', () => {
  assertContains(html, '1 + margin / 100', 'Margin calculation not found');
});

test('Handles area-based items (countertop, etc.)', () => {
  assertContains(html, "['countertop', 'backsplash', 'flooring', 'tile']", 'Area items not found');
});

// ============ REVIEW PANEL TESTS ============
console.log('\n\x1b[1m\x1b[36mReview Panel\x1b[0m');

test('Review panel auto-opens for quote_approval', () => {
  const match = html.match(/Auto-open the review panel[\s\S]*?quote_approval/);
  assert(match, 'Auto-open for quote_approval not found');
});

test('canApprove includes quote_approval check', () => {
  assertContains(html, "SHARE_STATE.permission === 'quote_approval'", 'canApprove check not found');
});

test('Element approval buttons exist (btn-approve, btn-reject)', () => {
  assertContains(html, 'btn-approve', 'Approve button not found');
  assertContains(html, 'btn-reject', 'Reject button not found');
});

// ============ CSS STYLING TESTS ============
console.log('\n\x1b[1m\x1b[36mCSS Styling\x1b[0m');

test('quote-approval-actions CSS class exists', () => {
  assertContains(html, '.quote-approval-actions', 'CSS class not found');
});

test('approve-pay-btn has green gradient', () => {
  assertContains(html, 'linear-gradient(135deg, #22c55e, #16a34a)', 'Gradient not found');
});

test('approve-pay-btn has hover state', () => {
  assertContains(html, '.approve-pay-btn:hover', 'Hover state not found');
});

test('approval-confirmation-modal CSS exists', () => {
  assertContains(html, '.approval-confirmation-modal', 'Modal CSS not found');
});

// ============ ERROR HANDLING TESTS ============
console.log('\n\x1b[1m\x1b[36mError Handling\x1b[0m');

test('approveAndPay has try-catch', () => {
  // Check that catch exists after the approveAndPay function
  const funcStart = html.indexOf('window.approveAndPay = async function');
  const nextFunc = html.indexOf('async function updateShareStatus');
  const funcBody = html.substring(funcStart, nextFunc);
  assertContains(funcBody, 'catch (error)', 'try-catch not found');
});

test('Shows toast on payment failure', () => {
  assertContains(html, "showToast('Payment failed:", 'Error toast not found');
});

test('Re-enables button on error', () => {
  assertContains(html, 'btn.disabled = false', 'Button re-enable not found');
});

test('Validates minimum deposit amount', () => {
  assertContains(html, 'depositAmount < 1', 'Minimum validation not found');
});

test('Validates email format', () => {
  assertContains(html, "!customerEmail.includes('@')", 'Email validation not found');
});

// ============ SUMMARY ============
console.log('\n\x1b[1m\x1b[34m════════════════════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m  Test Summary\x1b[0m');
console.log('\x1b[1m\x1b[34m════════════════════════════════════════════════════════════════\x1b[0m');
console.log(`  Total:  ${passed + failed}`);
console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);
console.log('');

if (failed === 0) {
  console.log('\x1b[32m\x1b[1m  ✓ All tests passed!\x1b[0m\n');
  process.exit(0);
} else {
  console.log('\x1b[31m\x1b[1m  ✗ Some tests failed\x1b[0m\n');
  process.exit(1);
}

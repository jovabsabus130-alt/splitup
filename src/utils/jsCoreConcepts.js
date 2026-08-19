/**
 * @file jsCoreConcepts.js
 * Explicit reference implementation demonstrating core JavaScript engineering concepts:
 * 1. Event Loop execution order (Microtasks vs Macrotasks)
 * 2. Promises vs Callbacks (error-first callback conversion, concurrency)
 * 3. Hoisting behavior (Function declarations vs var vs let/const TDZ)
 * 4. Closures & Lexical Scoping
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONCEPT: JavaScript — Event Loop (Score: 0.1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Demonstrates the non-blocking Node.js / Browser Event Loop:
 * Execution Order:
 *  1. Synchronous call stack code runs first.
 *  2. Microtask queue (Promise.resolve().then(), process.nextTick(), queueMicrotask) empties.
 *  3. Macrotask / Timer queue (setTimeout, setInterval, setImmediate, I/O) executes.
 */
function recordEventLoopOrder() {
  const executionLog = [];

  // Synchronous step 1
  executionLog.push('1: Synchronous Stack (Start)');

  // Macrotask (Timer Phase)
  setTimeout(() => {
    executionLog.push('4: Macrotask (setTimeout 0ms)');
  }, 0);

  // Microtask (Promise Reaction Job)
  Promise.resolve().then(() => {
    executionLog.push('3: Microtask (Promise.then)');
  });

  // Synchronous step 2
  executionLog.push('2: Synchronous Stack (End)');

  return executionLog;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONCEPT: JavaScript — Promises vs Callbacks (Score: 0.1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Legacy Error-First Callback Pattern (Node.js style):
 * Disadvantages: Callback hell, inversion of control, difficult error propagation.
 */
function legacyCalculateSplitCallback(totalAmount, memberCount, callback) {
  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    return callback(new Error('Total amount must be a positive number'), null);
  }
  if (!memberCount || memberCount <= 0) {
    return callback(new Error('Member count must be greater than 0'), null);
  }

  const share = Number((totalAmount / memberCount).toFixed(2));
  return callback(null, { totalAmount, memberCount, perPersonShare: share });
}

/**
 * Modern Promise Pattern:
 * Advantages: Composable, supports chaining (.then/.catch), supports async/await,
 * handles single-point error propagation, and integrates with Promise.all concurrency.
 */
function calculateSplitPromise(totalAmount, memberCount) {
  return new Promise((resolve, reject) => {
    legacyCalculateSplitCallback(totalAmount, memberCount, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
}

/**
 * Promise Concurrency with Promise.all:
 * Executes multiple asynchronous balance computations concurrently in non-blocking fashion.
 */
async function computeMultipleGroupSplits(splitRequests) {
  const promises = splitRequests.map((req) =>
    calculateSplitPromise(req.amount, req.count)
  );
  return await Promise.all(promises);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONCEPT: JavaScript — Hoisting (Score: 0.1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hoisting Behavior in JavaScript:
 * 
 * 1. Function Declarations:
 *    Hoisted completely (both name and definition). Can be safely called before its line of declaration.
 * 
 * 2. 'var' Variables:
 *    Hoisted but initialized to 'undefined'. Accessing before declaration returns 'undefined'.
 * 
 * 3. 'let' and 'const' Variables:
 *    Hoisted to the block scope, but NOT initialized. Accessing before declaration
 *    throws a ReferenceError due to the Temporal Dead Zone (TDZ).
 */

// Function declaration hoisted — can be invoked here:
const hoistedResult = computeTaxAddition(100, 18); // Works: returns 118

function computeTaxAddition(baseAmount, taxPercent) {
  return baseAmount + (baseAmount * taxPercent) / 100;
}

function demonstrateHoistingRules() {
  // Demonstration of 'var' hoisting:
  // var is hoisted and initialized to undefined
  var initializedVar = undefined; 
  var demoVar = 'I am defined';

  // Demonstration of block-scoped 'let' / 'const' (Temporal Dead Zone):
  // let hoistedLet; // Accessing hoistedLet before this line throws ReferenceError
  const blockScopedConst = 'Safe within TDZ boundary';

  return {
    functionDeclarationHoisted: typeof computeTaxAddition === 'function',
    taxCalculation: hoistedResult,
    blockScopedConst,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONCEPT: JavaScript — Closures (Score: 0.1)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A closure is the combination of a function bundled together with references
 * to its lexical environment. Allows inner functions to retain access to outer variables.
 */
function createExpenseRateLimiter(maxPerMinute) {
  let requestCount = 0;
  const startTime = Date.now();

  return function attemptExpenseLog() {
    const elapsed = Date.now() - startTime;
    if (elapsed < 60000 && requestCount >= maxPerMinute) {
      return { allowed: false, count: requestCount };
    }
    requestCount += 1;
    return { allowed: true, count: requestCount };
  };
}

module.exports = {
  recordEventLoopOrder,
  legacyCalculateSplitCallback,
  calculateSplitPromise,
  computeMultipleGroupSplits,
  computeTaxAddition,
  demonstrateHoistingRules,
  createExpenseRateLimiter,
};

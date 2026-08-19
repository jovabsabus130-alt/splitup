/**
 * @file sqlLedgerQueries.js
 * Demonstrates relational SQL JOIN operations (INNER JOIN, LEFT JOIN, Aggregations)
 * used in SplitUp for cross-table balance and expense ledger calculations.
 * 
 * Concept: SQL (Postgres) — SQL JOINs (Score: 0.2)
 */

const prisma = require('../lib/prisma');

/**
 * 1. INNER JOIN Example:
 * Fetches all expense splits joined with their parent expense and split recipient user details.
 * Equivalent Raw SQL:
 * SELECT 
 *   e.id AS expense_id,
 *   e.description,
 *   e.amount AS total_amount,
 *   es.share,
 *   u.name AS member_name,
 *   u.email AS member_email
 * FROM "Expense" e
 * INNER JOIN "ExpenseSplit" es ON e.id = es."expenseId"
 * INNER JOIN "User" u ON es."userId" = u.id
 * WHERE e."groupId" = $1;
 */
async function getDetailedExpenseSplitsSQL(groupId) {
  return await prisma.$queryRaw`
    SELECT 
      e.id AS "expenseId",
      e.description AS "description",
      e.category AS "category",
      e.amount AS "totalAmount",
      es.share AS "memberShare",
      u.id AS "userId",
      u.name AS "userName",
      u.email AS "userEmail"
    FROM "Expense" e
    INNER JOIN "ExpenseSplit" es ON e.id = es."expenseId"
    INNER JOIN "User" u ON es."userId" = u.id
    WHERE e."groupId" = ${groupId}
    ORDER BY e."createdAt" DESC;
  `;
}

/**
 * 2. LEFT JOIN Example with Aggregation:
 * Computes the total spending and split liability per group member.
 * Equivalent Raw SQL:
 * SELECT 
 *   gm."userId",
 *   u.name,
 *   COALESCE(SUM(es.share), 0) AS total_owed_share
 * FROM "GroupMember" gm
 * INNER JOIN "User" u ON gm."userId" = u.id
 * LEFT JOIN "ExpenseSplit" es ON gm."userId" = es."userId"
 * WHERE gm."groupId" = $1
 * GROUP BY gm."userId", u.name;
 */
async function getGroupMemberSpendingSummarySQL(groupId) {
  return await prisma.$queryRaw`
    SELECT 
      gm."userId",
      u.name AS "userName",
      u.email AS "userEmail",
      COALESCE(SUM(es.share), 0) AS "totalShareOwed"
    FROM "GroupMember" gm
    INNER JOIN "User" u ON gm."userId" = u.id
    LEFT JOIN "ExpenseSplit" es ON gm."userId" = es."userId"
    WHERE gm."groupId" = ${groupId}
    GROUP BY gm."userId", u.name, u.email;
  `;
}

module.exports = {
  getDetailedExpenseSplitsSQL,
  getGroupMemberSpendingSummarySQL,
};

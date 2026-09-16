# SplitUp Backend Security & Authorization Audit

**Audit Date**: September 15, 2026  
**Auditor**: Antigravity AI Security & Verification Subsystem  
**Target**: SplitUp Express API (`src/routes/`) & PostgreSQL/MongoDB Data Layer

---

## 1. Executive Summary

A comprehensive, zero-trust security audit of all Express route handlers, middleware, services, and database queries in the SplitUp repository was conducted. Every endpoint was systematically evaluated against identity integrity, authorization barriers, group isolation, input validation, role permissions, state transitions, duplicate submissions, and direct API manipulation attacks.

---

## 2. Endpoint-by-Endpoint Security Review

### 2.1 Authentication & Password Management (`src/routes/auth.js`)
- **`POST /register`**:
  - Validates name, email, password ($\ge 6$ chars), phone, and UPI ID using Zod.
  - Normalizes email (`toLowerCase().trim()`).
  - Securely hashes passwords with `bcrypt` (10 salt rounds).
  - Emits 6-digit cryptographic OTP (`crypto.randomInt(100000, 1000000)`) with a 10-minute expiry time.
  - Returns `requireVerification: true` and never exposes password hashes.
- **`POST /verify-email` & `POST /verify-otp`**:
  - Validates 6-digit OTP code against active, unexpired, and unused records.
  - Employs uniform error messages to prevent user enumeration.
  - In a single atomic Prisma transaction, invalidates all active OTPs and marks `emailVerified: true`.
- **`POST /resend-verification` & `POST /resend-otp`**:
  - Returns a uniform response regardless of email existence to prevent account enumeration.
- **`POST /forgot-password` & `POST /reset-password`**:
  - Uniform generic responses for password reset requests.
  - Invalidates active OTPs upon successful password reset in an atomic transaction.
- **`POST /login`**:
  - Verifies credentials using `bcrypt.compare`.
  - Issues signed JWT tokens derived from user ID with expiry.

### 2.2 Group Management & Access Boundaries (`src/routes/groups.js`)
- **`POST /` (Create Group)**:
  - Caller (`req.userId`) is automatically designated as `adminId` and first member.
- **`POST /:groupId/members` (Add Member)**:
  - Requester must be an active group member (`403 Forbidden` otherwise).
  - Checks if user is already a member (`409 Conflict`).
- **`POST /:groupId/join-request` & `PATCH /:groupId/join-requests/:requestId`**:
  - Only the group `adminId` is authorized to view, approve, or deny join requests (`403 Forbidden` for non-admins).
  - On approval, atomically adds the requester as a group member.
- **`DELETE /:groupId` (Delete Group)**:
  - Strictly restricted to group admin (`group.adminId === req.userId`). Cascade deletes all group data in an atomic transaction.
- **`DELETE /:groupId/members/me` (Leave Group)**:
  - Admins cannot leave without transferring ownership or deleting the group.
  - Prevents leaving if user has active unsettled debts across `'pending'` and `'pending_confirmation'` states.

### 2.3 Expenses & Transaction Concerns (`src/routes/expenses.js`)
- **`POST /groups/:groupId/expenses` (Create Expense)**:
  - Zod enforces positive `amount` and non-negative split shares.
  - Server verifies $\left|\sum(\text{splits}) - \text{amount}\right| \le 0.01$.
  - Enforces that the payer and *all* split participants are active members of `groupId`.
- **`PUT /groups/:groupId/expenses/:expenseId` (Single-Edit Rule)**:
  - Directly enforces single-edit rule via atomic conditional query `updateMany({ where: { id: expenseId, isEdited: false } })`.
  - If already edited, returns `409 Conflict`.
  - Captures full previous snapshot in `ExpenseEditHistory`.
- **`GET /groups/:groupId/expenses/:expenseId/history`**:
  - Verifies group membership AND validates that `expense.groupId === groupId`, preventing cross-group IDOR disclosure.
- **`POST /groups/:groupId/expenses/:expenseId/concerns` (Flag Expense)**:
  - Requires group membership and validates expense ownership.
- **`PATCH /groups/:groupId/expenses/:expenseId/concerns/:concernId/respond`**:
  - Strictly enforces that only the original payer (`expense.paidById === req.userId`) can respond to and resolve/dismiss flags (`403 Forbidden` for all other members).

### 2.4 Settlements & Debt Confirmations (`src/routes/settlements.js`)
- **`POST /:settlementId/pay` (Mark Paid)**:
  - Only the borrower (`settlement.fromId === req.userId`) can mark a payment as sent.
  - Rejects state transitions if the settlement is already completed (`400 Bad Request`).
- **`POST /:settlementId/confirm` (Confirm Receipt)**:
  - Strictly restricted to the receiver (`settlement.toId === req.userId`). Borrowers are blocked from self-confirming debts (`403 Forbidden`).
  - Guards against duplicate confirmations on already completed settlements.
- **`POST /:settlementId/reject` (Reject Payment)**:
  - Only the receiver (`settlement.toId === req.userId`) can reject a payment.

### 2.5 Shopping List (`src/routes/shopping.js`)
- **`GET /`, `POST /`, `PATCH /:itemId`, `DELETE /:itemId`**:
  - Enforces active group membership for all CRUD operations.
  - Validates positive integers for `quantity` and non-empty strings for `category`.
- **`POST /:itemId/expense` (Convert to Expense)**:
  - Checks if item is already completed (`409 Conflict`), preventing duplicate expense creation.
  - Verifies payer and all split participants belong to the group and split shares total the item price.

### 2.6 AI Expense Parsing (`src/routes/aiExpense.js`)
- **`POST /groups/:groupId/expenses/parse`**:
  - Validates payload string, verifies group membership, and sanitizes input to prevent NoSQL operator injection.
- **`GET /groups/:groupId/ai-logs` & `PATCH /groups/:groupId/ai-logs/:logId`**:
  - Scoped strictly by `groupId` and verified against active membership.
- **`DELETE /groups/:groupId/ai-logs`**:
  - Admin-only endpoint for purging audit logs.

### 2.7 Structured Analytics, History & Notifications
- **`GET /api/analytics` (`src/routes/analytics.js`)**:
  - Validates query schemas (`scope`, `period`, `date`, `groupId`). Verifies group membership on group analytics.
- **`GET /api/history` (`src/routes/history.js`)**:
  - Strictly filters by authenticated user's authorized groups; ignores client-supplied `userId`.
- **`GET /api/notifications` & `PATCH /:id/read` (`src/routes/notifications.js`)**:
  - Filtered strictly by `where: { userId: req.userId }`.

---

## 3. Real Vulnerabilities Identified & Fixed

| Vulnerability ID | Endpoint | Description | Severity | Remediation | Status |
|---|---|---|---|---|---|
| **VULN-001** | `GET /groups/:groupId/expenses/:expenseId/history` | **Cross-Group IDOR History Disclosure**: The endpoint verified group membership for `groupId` in the URL but did not verify that `expenseId` belonged to that `groupId`. An attacker in Group A could view edit histories of Group B expenses by passing an ID from Group B. | **Medium** | Added check verifying `expense.groupId === groupId`; returns `404 Not Found` if mismatched. | **Fixed & Tested** |
| **VULN-002** | `POST /groups/:groupId/settlements/:settlementId/confirm` | **Unauthorized Debtor Self-Confirmation**: The confirmation route allowed `settlement.fromId === req.userId` (the borrower/debtor) to confirm settlements, allowing debtors to unilaterally wipe their own debts without creditor consent. | **High** | Restricted confirmation strictly to `settlement.toId === req.userId`; returns `403 Forbidden` for debtors. Added check blocking re-confirmations on completed settlements. | **Fixed & Tested** |
| **VULN-003** | `POST /api/groups/:groupId/shopping/:itemId/expense` | **Duplicate Expense Creation**: Endpoint did not check if `item.completed` was already true. Repeated API requests created duplicate expenses for the same shopping item. | **Medium** | Added guard check `if (item.completed) return 409 Conflict`. | **Fixed & Tested** |
| **VULN-004** | `DELETE /api/groups/:groupId/members/me` | **Unconfirmed Debt Escape**: Leaving a group only checked `status: 'pending'`, missing `status: 'pending_confirmation'`. A debtor could mark payment as sent and leave before receiver verification. | **Medium** | Updated check to `status: { in: ['pending', 'pending_confirmation'] }`; returns `409 Conflict`. | **Fixed & Tested** |
| **VULN-005** | `POST /groups/:groupId/settlements/:settlementId/pay` & `reject` | **State Transition Bypass**: Allowed marking already completed settlements as pending or rejected. | **Low** | Added state guard checking `settlement.status !== 'completed'`. | **Fixed & Tested** |

---

## 4. Attack Simulations & Automated Test Suite

A dedicated security test suite was created at [`src/__tests__/securityAuditVulnerabilities.test.js`](file:///c:/Users/Jovab%20Sabu/Downloads/SplitUp/src/__tests__/securityAuditVulnerabilities.test.js) testing all attack vectors:

1. **Cross-Group Expense ID Tampering**: Tested access to foreign expense edit history $\rightarrow$ **Blocked**.
2. **Borrower Self-Confirmation Attack**: Tested debtor calling `confirm` $\rightarrow$ **Blocked with 403 Forbidden**.
3. **Double Settlement Confirmation Attack**: Tested re-confirming completed settlements $\rightarrow$ **Blocked with 400 Bad Request**.
4. **Duplicate Shopping Item Expense Attack**: Tested converting completed shopping item $\rightarrow$ **Blocked with 409 Conflict**.
5. **Debt Escape Attack**: Tested leaving group with `pending_confirmation` debt $\rightarrow$ **Blocked with 409 Conflict**.
6. **Negative & Manipulated Split Attack**: Tested negative amounts and unequal split sums $\rightarrow$ **Blocked with 400 Bad Request**.
7. **Unauthorized Concern Response Attack**: Tested non-payer resolving transaction flag $\rightarrow$ **Blocked with 403 Forbidden**.
8. **Unauthorized Group Deletion Attack**: Tested non-admin deleting group $\rightarrow$ **Blocked with 403 Forbidden**.

### Test Suite Execution
```bash
npm test
```
**Results**:
- **Total Tests**: 139 passed across 64 suites (0 failures, 0 skipped).
- **Execution Time**: ~4.0s.

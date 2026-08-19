# Low-Level Design (LLD) — SplitUp

## 1. Database Schema & Data Models

### 1.1 PostgreSQL Relational Models (via Prisma ORM)

```prisma
model User {
  id               String        @id @default(cuid())
  name             String
  email            String        @unique
  passwordHash     String
  phone            String?
  upiId            String?
  emailVerified    Boolean       @default(false)
  createdAt        DateTime      @default(now())

  groupMemberships GroupMember[]
  adminOfGroups    Group[]       @relation("GroupAdmin")
  joinRequests     JoinRequest[]
  paidExpenses     Expense[]     @relation("ExpensePaidBy")
  expenseSplits    ExpenseSplit[]
  settlementsFrom  Settlement[]  @relation("SettlementFrom")
  settlementsTo    Settlement[]  @relation("SettlementTo")
  confirmedSettlements Settlement[] @relation("SettlementConfirmedBy")
  otpCodes         OtpCode[]
  shoppingItems    ShoppingItem[]
}

model Group {
  id            String         @id @default(cuid())
  name          String
  adminId       String
  createdAt     DateTime       @default(now())

  admin         User           @relation("GroupAdmin", fields: [adminId], references: [id], onDelete: Restrict)
  members       GroupMember[]
  expenses      Expense[]
  settlements   Settlement[]
  joinRequests  JoinRequest[]
  shoppingItems ShoppingItem[]
}

model GroupMember {
  userId  String
  groupId String

  user    User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([userId, groupId])
}

model Expense {
  id          String        @id @default(cuid())
  groupId     String
  paidById    String
  amount      Decimal       @db.Decimal(12, 2)
  category    String
  description String?
  createdAt   DateTime      @default(now())

  group       Group         @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidBy      User          @relation("ExpensePaidBy", fields: [paidById], references: [id], onDelete: Restrict)
  splits      ExpenseSplit[]
}

model ExpenseSplit {
  id         String   @id @default(cuid())
  expenseId  String
  userId     String
  share      Decimal  @db.Decimal(12, 2)

  expense    Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([expenseId, userId])
}

model Settlement {
  id            String    @id @default(cuid())
  groupId       String
  fromId        String
  toId          String
  amount        Decimal   @db.Decimal(12, 2)
  status        String    @default("pending") // "pending" | "completed"
  confirmedById String?
  confirmedAt   DateTime?
  createdAt     DateTime  @default(now())

  group         Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  from          User      @relation("SettlementFrom", fields: [fromId], references: [id], onDelete: Cascade)
  to            User      @relation("SettlementTo", fields: [toId], references: [id], onDelete: Cascade)
  confirmedBy   User?     @relation("SettlementConfirmedBy", fields: [confirmedById], references: [id], onDelete: SetNull)
}

model JoinRequest {
  id        String   @id @default(cuid())
  groupId   String
  userId    String
  status    String   @default("pending") // "pending" | "approved" | "denied"
  createdAt DateTime @default(now())

  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
}

model OtpCode {
  id        String   @id @default(cuid())
  userId    String
  code      String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 1.2 MongoDB Document Models (via Mongoose)

```javascript
// models/AiParseLog.js
const AiParseLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  inputText: { type: String, required: true },
  modelOutput: { type: Object, required: true },
  tokensUsed: { type: Number },
  latencyMs: { type: Number },
  createdAt: { type: Date, default: Date.now }
});
```

---

## 2. API Endpoint Specifications

### 2.1 Authentication Endpoints

#### `POST /api/auth/register`
- **Description:** Registers a new user and sends an email verification OTP code.
- **Request Body (Zod Validated):**
  ```json
  {
    "name": "Sarah Connor",
    "email": "sarah@example.com",
    "password": "SecurePassword123"
  }
  ```
- **Responses:**
  - `201 Created`: `{ "message": "Verification code sent to your email", "userId": "..." }`
  - `400 Bad Request`: `{ "message": "Invalid registration payload" }`
  - `409 Conflict`: `{ "message": "Email already registered" }`

#### `POST /api/auth/verify-email`
- **Request Body:** `{ "userId": "...", "code": "849201" }`
- **Responses:**
  - `200 OK`: `{ "token": "jwt_string", "user": { "id": "...", "name": "...", "email": "..." } }`
  - `400 Bad Request`: `{ "message": "Invalid or expired verification code" }`

#### `POST /api/auth/login`
- **Request Body:** `{ "email": "sarah@example.com", "password": "SecurePassword123" }`
- **Responses:**
  - `200 OK`: `{ "token": "jwt_string", "user": { "id": "...", "name": "...", "email": "..." } }`
  - `401 Unauthorized`: `{ "message": "Invalid email or password" }`

---

### 2.2 Group & Join Request Endpoints

#### `GET /api/groups`
- **Headers:** `Authorization: Bearer <jwt_token>`
- **Response `200 OK`:**
  ```json
  {
    "groups": [
      {
        "id": "clx...",
        "name": "Goa Trip 2026",
        "adminId": "clu...",
        "isAdmin": true,
        "pendingRequestsCount": 2,
        "pendingRequests": [
          {
            "id": "req_1",
            "userId": "usr_9",
            "status": "pending",
            "user": { "name": "Alex", "email": "alex@gmail.com" }
          }
        ]
      }
    ]
  }
  ```

#### `PATCH /api/groups/:groupId/join-requests/:requestId`
- **Request Body:** `{ "status": "approved" }` (or `"denied"`)
- **Responses:**
  - `200 OK`: `{ "message": "Member approved and added to group!" }`
  - `403 Forbidden`: `{ "message": "Only the group admin can moderate requests" }`

---

### 2.3 Expense & Split Endpoints

#### `POST /api/groups/:groupId/expenses`
- **Request Body (Zod Validated):**
  ```json
  {
    "amount": 1500.00,
    "category": "Dining",
    "description": "Seafood Dinner",
    "paidById": "usr_1",
    "splits": [
      { "userId": "usr_1", "share": 500.00 },
      { "userId": "usr_2", "share": 500.00 },
      { "userId": "usr_3", "share": 500.00 }
    ]
  }
  ```
- **Business Rule:** Total of split shares must equal the total expense amount within `EPSILON = 0.01`.
- **Database Operation:** Executed inside an atomic `prisma.$transaction`.
- **Response `201 Created`:** `{ "expense": { "id": "exp_...", "amount": "1500.00", ... } }`

---

### 2.4 Debt Simplification Algorithm Implementation

```javascript
// services/debtSimplification.js
function simplifyDebts(balances) {
  const EPSILON = 0.01;
  const creditors = [];
  const debtors = [];

  for (const b of balances) {
    const net = Number(b.netBalance) || 0;
    if (net > EPSILON) creditors.push({ userId: b.userId, amount: net });
    else if (net < -EPSILON) debtors.push({ userId: b.userId, amount: -net });
  }

  // Sort descending by magnitude
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const amount = Math.min(creditors[i].amount, debtors[j].amount);
    settlements.push({
      from: debtors[j].userId,
      to: creditors[i].userId,
      amount: Number(amount.toFixed(2))
    });

    creditors[i].amount -= amount;
    debtors[j].amount -= amount;

    if (creditors[i].amount <= EPSILON) i++;
    if (debtors[j].amount <= EPSILON) j++;
  }

  return settlements;
}
```

---

## 3. Frontend Architecture & Component Hierarchy

```
<App>
 ├── <ProtectedRoute>
 │    └── <AppLayout>
 │         ├── <AppSidebar> (Groups list, + New Group Modal, User Profile, Logout)
 │         └── <Routes>
 │              ├── <DashboardPage> (Groups Grid, Top-right Bell Notification Icon & Modal)
 │              ├── <GroupDetailPage> (Expense Ledger, Add Expense Modal, AI Natural Language Parser)
 │              └── <BalancesPage> (Net Balances, Simplified Settlements, UPI QR Generator, History)
 └── <PublicRoutes>
      ├── <LoginPage>
      ├── <RegisterPage>
      ├── <VerifyEmailPage>
      └── <JoinRequestPage> (Invite Link Preview, QR Scan landing page)
```

---

## 4. Automated Testing Strategy
Unit tests run using the native Node.js Test Runner (`node:test`):
- `src/__tests__/debtSimplification.test.js`: Validates 0-balance groups, 2-person settlements, 3-person multi-debtor graph reductions, and sub-cent precision bounds.
- Command to run: `npm test`.

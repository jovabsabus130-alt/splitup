# High-Level Design (HLD) — SplitUp

## 1. System Architecture

```mermaid
flowchart TD
  subgraph Client_Layer ["Client Layer (Frontend)"]
    UI["React 18 + Vite SPA"]
    Router["React Router (Client-Side Routing)"]
    State["React Hooks (useState, useMemo, useEffect)"]
    AxiosInstance["Axios API Client (JWT Interceptor)"]
    UI --> Router --> State --> AxiosInstance
  end

  subgraph Gateway_Layer ["Application & API Layer"]
    ExpressApp["Express.js Server (Node.js)"]
    AuthMW["Auth Middleware (JWT Verification)"]
    ZodVal["Zod Request Body Validation"]
    ErrorHandler["Centralized Error Handler"]
    
    ExpressApp --> AuthMW --> ZodVal --> ErrorHandler
  end

  subgraph Services_Layer ["Business Logic & Services"]
    BalanceSvc["Balance Service (Ledger Calculation)"]
    DebtAlg["Debt Simplification Engine (Greedy Min-Cash-Flow)"]
    AISvc["AI Natural Language Engine (Groq / Gemini)"]
    EmailSvc["Email OTP Service (Nodemailer)"]
  end

  subgraph Storage_Layer ["Polyglot Persistence Layer"]
    PG[("PostgreSQL\n(Prisma ORM - Relational Ledgers)")]
    Mongo[("MongoDB\n(Mongoose - AI Logs & Unstructured Lists)")]
  end

  AxiosInstance -->|REST / JSON with Bearer Token| ExpressApp
  ExpressApp --> BalanceSvc & DebtAlg & AISvc & EmailSvc
  BalanceSvc & DebtAlg --> PG
  AISvc --> Mongo
  ExpressApp --> PG
  ExpressApp --> Mongo
```

---

## 2. Polyglot Persistence Architecture

SplitUp employs a **Polyglot Persistence strategy** matching specific workload access patterns to the optimal database engine:

| Attribute | PostgreSQL (Prisma ORM) | MongoDB (Mongoose ODM) |
|---|---|---|
| **Data Scope** | Users, Groups, GroupMembers, Expenses, Splits, Settlements, OTPs | AI Free-Form Parse Logs, Shared Shopping Lists |
| **Data Model** | Relational, strict foreign keys, cascade deletes, composite indexes | Document / JSON collections, schema flexibility |
| **Consistency** | Strong ACID transactional guarantees (`prisma.$transaction`) | Eventual / Flexible write consistency |
| **Rationale** | Financial balance sheets and debts must never suffer from partial writes or orphan records. | AI prompt inputs, raw model token outputs, and ad-hoc shopping items have variable schemas. |

---

## 3. End-to-End Sequence Workflows

### 3.1 Authentication & Protected Route Access
```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as React Frontend
  participant API as Express API
  participant DB as PostgreSQL (Prisma)

  User->>UI: Enter Email & Password
  UI->>API: POST /api/auth/login
  API->>DB: prisma.user.findUnique({ email })
  DB-->>API: User Record with passwordHash
  API->>API: bcrypt.compare(password, passwordHash)
  API->>API: jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
  API-->>UI: { token, user: { id, name, email } }
  UI->>UI: localStorage.setItem('splitup_token', token)
  UI->>API: GET /api/groups (Header: Bearer <token>)
  API->>API: Auth Middleware verifies JWT
  API->>DB: Query user's memberships & groups
  DB-->>API: Groups dataset
  API-->>UI: 200 OK { groups }
```

### 3.2 AI Natural Language Expense Parsing
```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as React Frontend
  participant API as Express API
  participant AI as Groq / Gemini API
  participant Mongo as MongoDB

  User->>UI: Types "Cab 900 paid by John split with Alex"
  UI->>API: POST /api/groups/:groupId/expenses/parse
  API->>AI: Structured Prompt (JSON Schema Enforcement)
  AI-->>API: JSON: { amount: 900, category: "Transport", splitSuggestion: [...] }
  API->>API: Zod Schema Validation
  API->>Mongo: Log raw prompt, output & execution latency
  API-->>UI: 200 OK { parsed: { amount, category, splitSuggestion } }
  UI->>UI: Auto-fills Expense Form fields
```

---

## 4. Key Engineering & Algorithmic Decisions

### 4.1 Greedy Debt Simplification Algorithm
- **Problem:** In a group with $N$ members, pairwise expense tracking produces up to $\frac{N(N-1)}{2}$ debt relationships (a dense graph of $O(N^2)$ transactions).
- **Solution:** Reduce the transaction graph into net balances ($\text{Net}_i = \text{TotalPaid}_i - \text{TotalOwed}_i$).
- **Algorithm:**
  1. Separate users into `creditors` ($\text{Net} > 0$) and `debtors` ($\text{Net} < 0$).
  2. Sort creditors and debtors in descending order of absolute magnitude.
  3. Greedily match the largest creditor with the largest debtor, settling $\min(\text{credit}, \text{debt})$.
  4. Deduct the settled amount and advance pointers.
- **Complexity:**
  - Sorting: $O(N \log N)$
  - Two-pointer greedy sweep: $O(N)$
  - Max settlements generated: at most $N-1$ transactions.

---

## 5. Security & Failure Resilience
1. **Password Security:** Salted and hashed using `bcrypt` (10 salt rounds). Plaintext passwords are never stored or logged.
2. **Payload Protection:** Zod validators enforce strict types, bounds, positive numeric limits, and array structures before controller logic executes.
3. **Graceful Database Fallback:** If MongoDB is temporarily offline, Express gracefully logs a warning and continues serving core transactional ledger endpoints via PostgreSQL.
4. **Relational Cascade Safety:** Foreign key constraints guarantee that deleting a group cleanly purges dependent splits, expenses, and settlements in transactional sequence.

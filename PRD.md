# Product Requirements Document (PRD) — SplitUp

## 1. Executive Summary
**SplitUp** is an intelligent, high-trust group expense sharing and financial settlement web application. It enables friends, roommates, and travel groups to seamlessly track shared expenses, compute optimal minimum-cash-flow debt settlements, interact with an AI-driven natural language expense parser, and coordinate shared shopping lists in real time.

---

## 2. Problem Statement
When groups of people share living costs, travel bills, or group events:
1. **Inefficient Ledger Tracking:** Manually tracking who paid for what across multiple people leads to bookkeeping errors, confusion, and awkward money conversations.
2. **Circular & Redundant Debt:** Without algorithmic optimization, $N$ people end up making $O(N^2)$ cross-payments instead of simplified minimal transactions.
3. **Friction in Expense Entry:** Typing amounts, categories, and split ratios manually for every bill is tedious and discourages timely logging.
4. **Uncontrolled Group Access:** Open links without approval lead to unwanted members joining private financial ledgers.

---

## 3. Target Users & Personas
- **The Flatmate / Roommate:** Shares monthly rent, utilities, wifi, and grocery bills with 2–4 housemates.
- **The Group Traveler:** Goes on vacations with friends, incurring hotel, cab, restaurant, and sightseeing expenses.
- **The Event Organizer:** Coordinates group dinners, birthdays, and parties with uneven contributions.

---

## 4. User Journeys

### Journey 1: Onboarding & Authentication
1. User registers with name, email, and password.
2. An OTP is generated and sent via email for verification.
3. User logs in, receives a secure JWT, and accesses the responsive dashboard.

### Journey 2: Group Creation & Secure Member Invites
1. User creates a group (e.g., "Goa Vacation 2026") and becomes its **Admin**.
2. Admin shares an invite link or displays a live **QR Code**.
3. A new member scans/clicks the invite link to submit a join request.
4. Admin receives a real-time notification on the **Bell Icon** (with a pulsing blue indicator) and reviews the applicant's name and email to **Approve** or **Deny**.

### Journey 3: Logging Expenses & Custom Splits
1. User enters an expense manually or types natural language (e.g., *"Cab ₹900 paid by John, split with Sarah and Alex"*).
2. The built-in AI parser structures the amount, category, and split shares automatically.
3. User can toggle member checkboxes to exclude individuals, customize exact shares, and view the **Live Remaining Balance Indicator** to guarantee the sum equals the total.

### Journey 4: Debt Simplification & Direct Settlements
1. The app computes group ledger balances and runs the **Greedy Min-Cash-Flow algorithm** to minimize cross-payments.
2. Debtors see clear settlement cards with payment amounts and one-click UPI QR / payment links.
3. Once paid, the creditor or admin marks the settlement as confirmed, updating group balances.

---

## 5. Functional Requirements

| Module | Feature | Description | Priority |
|---|---|---|---|
| **Auth** | User Registration & Verification | Email/Password signup with OTP email verification & bcrypt hashing | P0 (Mandatory) |
| **Auth** | JWT Authentication | Stateless session management via HTTP Bearer tokens & protected routes | P0 (Mandatory) |
| **Groups** | Group Management | Create groups, list memberships, admin badges, transfer/leave rules | P0 (Mandatory) |
| **Groups** | Invite Links & QR Sharing | Unique group invite URLs with dynamic QR code canvas generation | P0 (Mandatory) |
| **Groups** | Join Request Moderation | Admin approval/rejection queue with top-right notification bell indicator | P0 (Mandatory) |
| **Expenses** | Multi-Member Split Ledger | Multi-user custom shares, member exclusion toggles, sum validation | P0 (Mandatory) |
| **Expenses** | Live Balance Indicator | Real-time visual feedback for remaining unassigned split amounts | P1 |
| **Balances** | Debt Simplification | Graph reduction reducing $O(N^2)$ bilateral debts into optimal $O(N)$ transfers | P0 (Mandatory) |
| **Settlements** | Direct UPI & Confirmation | Generated UPI intent links, settlement history, state machine transitions | P1 |
| **AI Parsing** | Natural Language Parser | LLM API (Groq/Gemini) parsing free-form expense sentences into structured JSON | P0 (Mandatory) |
| **AI Audit** | Unstructured Audit Log | MongoDB logging of raw AI prompt inputs, outputs, tokens, and latency | P1 |
| **Shopping** | Collaborative List | Real-time shared group shopping checklist with item prices | P2 |

---

## 6. Non-Functional Requirements
- **Financial Data Consistency:** Strict ACID compliance for expense transactions and settlement ledgers using PostgreSQL and Prisma transactions.
- **Security & Integrity:** All passwords hashed with bcrypt ($10$ rounds), JWT expiration, Zod request payload schema validation on all API endpoints.
- **Latency & Performance:** API response times $< 100\text{ ms}$ for core ledger queries; debt simplification computed in $O(N \log N)$ time.
- **UX & Responsiveness:** Clean modern typography, dark/light contrast adherence, responsive CSS grid/flexbox across mobile, tablet, and desktop viewports.

---

## 7. Out of Scope
- Direct banking API / card processing (handled via direct UPI intent links & test settlement flow).
- Multi-currency live forex exchange conversion.
- Native iOS/Android builds (fully supported via PWA & mobile-responsive web).

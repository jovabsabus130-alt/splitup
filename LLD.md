# SplitUp LLD

## Prisma Schema Breakdown
- User: identity and credential hash (`id`, `name`, `email`, `passwordHash`, `createdAt`).
- Group: shared container for expenses (`id`, `name`, `createdAt`).
- GroupMember: join relation (`userId`, `groupId`) with composite uniqueness.
- Expense: one payment event (`groupId`, `paidById`, `amount`, `category`, `description`, `createdAt`).
- ExpenseSplit: per-user share rows per expense, unique on (`expenseId`, `userId`).
- Settlement: payable edge (`groupId`, `fromId`, `toId`, `amount`, `status`, `createdAt`).

## Key API Specs

### POST /api/auth/register
Request:
```json
{ "name": "Ava", "email": "ava@example.com", "password": "secret123" }
```
Response 201:
```json
{ "user": { "id": "...", "name": "Ava", "email": "ava@example.com", "createdAt": "..." } }
```

### POST /api/auth/login
Request:
```json
{ "email": "ava@example.com", "password": "secret123" }
```
Response 200:
```json
{ "token": "jwt", "user": { "id": "...", "name": "Ava", "email": "ava@example.com", "createdAt": "..." } }
```

### POST /api/groups/:groupId/expenses
Request:
```json
{
  "amount": 1200,
  "category": "Food",
  "description": "Dinner",
  "splits": [
    { "userId": "u1", "share": 600 },
    { "userId": "u2", "share": 600 }
  ]
}
```
Response 201:
```json
{ "expense": { "id": "...", "groupId": "...", "paidById": "...", "amount": "1200", "category": "Food" } }
```

### GET /api/groups/:groupId/balances
Response 200:
```json
{
  "balances": [
    { "userId": "u1", "name": "Ava", "email": "ava@example.com", "netBalance": 300 }
  ],
  "settlements": [
    { "id": "s1", "from": "u2", "to": "u1", "amount": 300, "status": "pending" }
  ]
}
```

### POST /api/groups/:groupId/expenses/parse
Request:
```json
{ "text": "Cab 900 split among 3" }
```
Response 200:
```json
{
  "parsed": {
    "amount": 900,
    "category": "Transport",
    "splitSuggestion": [
      { "label": "person_1", "share": 300 },
      { "label": "person_2", "share": 300 },
      { "label": "person_3", "share": 300 }
    ]
  }
}
```

## Debt Simplification Walkthrough
Input balances:
- U1: +70
- U2: -40
- U3: -30

Process:
1. Largest creditor U1 (+70), largest debtor U2 (-40) => U2 pays U1: 40.
2. Remaining U1 (+30), next debtor U3 (-30) => U3 pays U1: 30.

Output settlements:
- `{ from: U2, to: U1, amount: 40 }`
- `{ from: U3, to: U1, amount: 30 }`

## AI Prompt + Validation Strategy
- Prompt asks model to return strict JSON only with shape:
  - `{ amount, category, splitSuggestion }`
- Groq call uses JSON response mode (`response_format: { type: "json_object" }`).
- Backend parses model output and validates via Zod:
  - `amount` positive number
  - `category` non-empty string
  - `splitSuggestion` non-empty array of `{ label, share }` with positive share
- On invalid JSON/shape, backend throws clear parse error and does not create expense rows.

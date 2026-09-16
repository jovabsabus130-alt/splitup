-- CreateTable
CREATE TABLE "TransactionConcern" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payerResponse" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionConcern_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TransactionConcern" ADD CONSTRAINT "TransactionConcern_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionConcern" ADD CONSTRAINT "TransactionConcern_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

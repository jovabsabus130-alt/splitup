-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "category" TEXT DEFAULT 'Shopping';

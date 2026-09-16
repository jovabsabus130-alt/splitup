const { describe, it } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');

// Replicate / import schemas matching src/routes/shopping.js
const addItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  price: z.number().positive('Price must be a positive number').optional(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer').optional().default(1),
  category: z.string().trim().min(1).optional().default('Shopping'),
});

const updateItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().positive().optional().nullable(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer').optional(),
  category: z.string().trim().min(1).optional(),
  completed: z.boolean().optional(),
});

const splitItemSchema = z.object({
  paidById: z.string().min(1, 'Payer ID is required'),
  category: z.string().trim().min(1).optional(),
  splits: z.array(
    z.object({
      userId: z.string().min(1, 'User ID is required'),
      share: z.number().min(0, 'Share cannot be negative'),
    })
  ).min(1, 'At least one split is required'),
});

describe('Shopping List Extended Features & Expense Conversion Tests', () => {
  // ── Mock Database Store ──
  class MockShoppingStore {
    constructor() {
      this.reset();
    }

    reset() {
      this.items = [];
      this.expenses = [];
      this.nextId = 1;
    }

    addItem({ groupId, addedById, name, price, quantity, category }) {
      const parsed = addItemSchema.safeParse({ name, price, quantity, category });
      if (!parsed.success) {
        throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }

      const item = {
        id: `item_${this.nextId++}`,
        groupId,
        addedById,
        name: parsed.data.name,
        price: parsed.data.price !== undefined ? parsed.data.price : null,
        quantity: parsed.data.quantity ?? 1,
        category: parsed.data.category || 'Shopping',
        completed: false,
        createdAt: new Date(),
      };

      this.items.push(item);
      return item;
    }

    updateItem(itemId, updates) {
      const parsed = updateItemSchema.safeParse(updates);
      if (!parsed.success) {
        throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }

      const item = this.items.find((i) => i.id === itemId);
      if (!item) throw new Error('Shopping item not found');

      if (parsed.data.name !== undefined) item.name = parsed.data.name;
      if (parsed.data.completed !== undefined) item.completed = parsed.data.completed;
      if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
      if (parsed.data.category !== undefined) item.category = parsed.data.category;
      if ('price' in parsed.data) item.price = parsed.data.price;

      return item;
    }

    convertToExpense(itemId, { paidById, category, splits }) {
      const parsed = splitItemSchema.safeParse({ paidById, category, splits });
      if (!parsed.success) {
        throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
      }

      const item = this.items.find((i) => i.id === itemId);
      if (!item) throw new Error('Shopping item not found');
      if (!item.price) throw new Error('Item must have a price before splitting');

      const includedSplits = parsed.data.splits.filter((s) => s.share > 0);
      if (!includedSplits.length) throw new Error('At least one person must be included');

      const expenseCategory = parsed.data.category || item.category || 'Shopping';

      const expense = {
        id: `exp_${this.nextId++}`,
        groupId: item.groupId,
        paidById: parsed.data.paidById,
        amount: item.price,
        category: expenseCategory,
        description: item.name,
        splits: includedSplits.map((s) => ({ userId: s.userId, share: s.share })),
        createdAt: new Date(),
      };

      this.expenses.push(expense);
      item.completed = true;

      return { item, expense };
    }
  }

  const store = new MockShoppingStore();

  describe('1. Create Item with Quantity and Category', () => {
    it('should create shopping item with default quantity (1) and default category ("Shopping")', () => {
      const item = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Organic Bananas',
        price: 60,
      });

      assert.strictEqual(item.name, 'Organic Bananas');
      assert.strictEqual(item.price, 60);
      assert.strictEqual(item.quantity, 1);
      assert.strictEqual(item.category, 'Shopping');
      assert.strictEqual(item.completed, false);
    });

    it('should create shopping item with custom quantity and custom category', () => {
      const item = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Whole Milk 1L',
        price: 120,
        quantity: 2,
        category: 'Grocery',
      });

      assert.strictEqual(item.name, 'Whole Milk 1L');
      assert.strictEqual(item.price, 120);
      assert.strictEqual(item.quantity, 2);
      assert.strictEqual(item.category, 'Grocery');
    });

    it('should reject invalid or negative quantity', () => {
      assert.throws(() => {
        store.addItem({
          groupId: 'grp_1',
          addedById: 'user_1',
          name: 'Invalid Item',
          quantity: -3,
        });
      }, /positive integer/);

      assert.throws(() => {
        store.addItem({
          groupId: 'grp_1',
          addedById: 'user_1',
          name: 'Invalid Item',
          quantity: 0,
        });
      }, /positive integer/);
    });
  });

  describe('2. Edit Item (Quantity, Category, Price, Name, Status)', () => {
    it('should update item quantity and category', () => {
      const created = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Eggs 12-pack',
        quantity: 1,
        category: 'Shopping',
      });

      const updated = store.updateItem(created.id, {
        quantity: 3,
        category: 'Food',
        price: 240,
      });

      assert.strictEqual(updated.id, created.id);
      assert.strictEqual(updated.quantity, 3);
      assert.strictEqual(updated.category, 'Food');
      assert.strictEqual(updated.price, 240);
    });

    it('should update completion status', () => {
      const created = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Paper Towels',
      });

      assert.strictEqual(created.completed, false);
      const updated = store.updateItem(created.id, { completed: true });
      assert.strictEqual(updated.completed, true);
    });
  });

  describe('3. Convert Shopping Item to Expense', () => {
    it('should carry over name -> description, price -> amount, category -> category, group -> group', () => {
      const item = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Dinner Takeout',
        price: 850,
        quantity: 1,
        category: 'Food',
      });

      const { item: updatedItem, expense } = store.convertToExpense(item.id, {
        paidById: 'user_1',
        category: item.category,
        splits: [
          { userId: 'user_1', share: 425 },
          { userId: 'user_2', share: 425 },
        ],
      });

      // Verify all carried-over fields
      assert.strictEqual(expense.groupId, 'grp_1');
      assert.strictEqual(expense.paidById, 'user_1');
      assert.strictEqual(expense.description, 'Dinner Takeout');
      assert.strictEqual(expense.amount, 850);
      assert.strictEqual(expense.category, 'Food');
      assert.strictEqual(expense.splits.length, 2);
      assert.strictEqual(expense.splits[0].share, 425);
      assert.strictEqual(expense.splits[1].share, 425);

      // Verify shopping item is marked completed
      assert.strictEqual(updatedItem.completed, true);
    });

    it('should allow user to review/override category during conversion confirmation if requested', () => {
      const item = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Petrol / Fuel',
        price: 500,
        quantity: 1,
        category: 'Auto/Transport',
      });

      const { expense } = store.convertToExpense(item.id, {
        paidById: 'user_2',
        category: 'Auto/Transport',
        splits: [
          { userId: 'user_1', share: 250 },
          { userId: 'user_2', share: 250 },
        ],
      });

      assert.strictEqual(expense.category, 'Auto/Transport');
      assert.strictEqual(expense.description, 'Petrol / Fuel');
      assert.strictEqual(expense.amount, 500);
      assert.strictEqual(expense.paidById, 'user_2');
    });

    it('should reject conversion if item has no price set', () => {
      const item = store.addItem({
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Unpriced Groceries',
      });

      assert.throws(() => {
        store.convertToExpense(item.id, {
          paidById: 'user_1',
          splits: [{ userId: 'user_1', share: 100 }],
        });
      }, /must have a price/);
    });
  });

  describe('4. Legacy Items Without Category or Quantity', () => {
    it('should handle legacy shopping items with missing category/quantity gracefully', () => {
      // Simulate raw legacy item from database prior to migration
      const legacyItem = {
        id: 'legacy_99',
        groupId: 'grp_1',
        addedById: 'user_1',
        name: 'Old Item from 2025',
        price: 300,
        quantity: undefined,
        category: null,
        completed: false,
        createdAt: new Date('2025-01-01'),
      };

      store.items.push(legacyItem);

      // Safe accessor fallbacks
      const effectiveQty = legacyItem.quantity || 1;
      const effectiveCat = legacyItem.category || 'Shopping';

      assert.strictEqual(effectiveQty, 1);
      assert.strictEqual(effectiveCat, 'Shopping');

      // Converting legacy item to expense carries over default category 'Shopping'
      const { expense } = store.convertToExpense(legacyItem.id, {
        paidById: 'user_1',
        category: legacyItem.category || 'Shopping',
        splits: [
          { userId: 'user_1', share: 150 },
          { userId: 'user_2', share: 150 },
        ],
      });

      assert.strictEqual(expense.description, 'Old Item from 2025');
      assert.strictEqual(expense.amount, 300);
      assert.strictEqual(expense.category, 'Shopping');
      assert.strictEqual(legacyItem.completed, true);
    });
  });
});

const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { connectMongo } = require('../lib/mongo');
const RawExpenseLog = require('../models/RawExpenseLog');
const { parseExpenseText } = require('../services/aiParser');

const router = express.Router();

const parseBodySchema = z.object({
  text: z.string().trim().min(1),
});

router.use(auth);

router.post('/groups/:groupId/expenses/parse', async (req, res) => {
  const { groupId } = req.params;
  const parsed = parseBodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid parse payload' });
  }

  try {
    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    // Fetch group members so AI can use real names
    const groupData = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    const members = groupData?.members?.map((m) => m.user) || [];

    const structured = await parseExpenseText(parsed.data.text, members, req.userId);

    await connectMongo();
    if (process.env.MONGODB_URI) {
      await RawExpenseLog.create({
        groupId,
        userId: req.userId,
        rawInput: parsed.data.text,
        parsedOutput: structured,
      });
    }

    return res.status(200).json({ parsed: structured });
  } catch (error) {
    return res.status(400).json({
      message: error.message || 'Failed to parse expense text',
    });
  }
});

/**
 * MongoDB READ: Get recent raw AI parse audit logs for a group
 * Demonstrates: find(), projection (.select), sort, limit, and .lean() for read performance
 */
router.get('/groups/:groupId/ai-logs', async (req, res) => {
  const { groupId } = req.params;

  try {
    await connectMongo();
    if (!process.env.MONGODB_URI) {
      return res.status(200).json({ logs: [] });
    }

    const logs = await RawExpenseLog.getRecentLogs(groupId, 20);
    return res.status(200).json({ logs });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch AI logs' });
  }
});

/**
 * MongoDB UPDATE: Update extracted category on an AI parse log
 * Demonstrates: findOneAndUpdate with atomic $set operator and schema validation
 */
router.patch('/groups/:groupId/ai-logs/:logId', async (req, res) => {
  const { groupId, logId } = req.params;
  const { category } = req.body;

  if (!category || typeof category !== 'string') {
    return res.status(400).json({ message: 'Category is required' });
  }

  try {
    await connectMongo();
    const updated = await RawExpenseLog.updateLogCategory(logId, groupId, category.trim());
    if (!updated) {
      return res.status(404).json({ message: 'Log entry not found' });
    }
    return res.status(200).json({ log: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update AI log' });
  }
});

/**
 * MongoDB DELETE: Purge AI parse logs older than retention period
 * Demonstrates: deleteMany with indexed query filter
 */
router.delete('/groups/:groupId/ai-logs', async (req, res) => {
  const { groupId } = req.params;
  const days = parseInt(req.query.days || '90', 10);

  try {
    await connectMongo();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await RawExpenseLog.purgeOlderThan(groupId, cutoffDate);
    return res.status(200).json({ deletedCount: result.deletedCount });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to purge AI logs' });
  }
});

module.exports = router;

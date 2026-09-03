const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { connectMongo } = require('../lib/mongo');
const RawExpenseLog = require('../models/RawExpenseLog');
const { parseExpenseText } = require('../services/aiParser');

const router = express.Router();

const parseBodySchema = z.object({
  text: z.string().trim().min(1, 'Text is required for AI parsing'),
});

router.use(auth);

// ── POST /groups/:groupId/expenses/parse ──────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.post('/groups/:groupId/expenses/parse', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const parsed = parseBodySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parse payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
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

    try {
      await connectMongo();
      if (process.env.MONGODB_URI) {
        await RawExpenseLog.create({
          groupId,
          userId: req.userId,
          rawInput: parsed.data.text,
          parsedOutput: structured,
        });
      }
    } catch (mongoErr) {
      console.warn('[AI Parse] Mongo audit logging skipped:', mongoErr.message);
    }

    return res.status(200).json({ success: true, parsed: structured });
  } catch (error) {
    console.error('AI Parse error:', error);
    next(error);
  }
});

/**
 * MongoDB READ: Get recent raw AI parse audit logs for a group
 * Demonstrates: find(), projection (.select), sort, limit, and .lean() for read performance
 */
router.get('/groups/:groupId/ai-logs', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    await connectMongo();
    if (!process.env.MONGODB_URI) {
      return res.status(200).json({ success: true, logs: [] });
    }

    const logs = await RawExpenseLog.getRecentLogs(groupId, 20);
    return res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error('Fetch AI logs error:', error);
    next(error);
  }
});

/**
 * MongoDB UPDATE: Update extracted category on an AI parse log
 * Demonstrates: findOneAndUpdate with atomic $set operator and schema validation
 */
router.patch('/groups/:groupId/ai-logs/:logId', async (req, res, next) => {
  try {
    const { groupId, logId } = req.params;
    const { category } = req.body;

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ success: false, message: 'Valid category string is required' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    await connectMongo();
    const updated = await RawExpenseLog.updateLogCategory(logId, groupId, category.trim());
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Log entry not found' });
    }
    return res.status(200).json({ success: true, log: updated });
  } catch (error) {
    console.error('Update AI log error:', error);
    next(error);
  }
});

/**
 * MongoDB DELETE: Purge AI parse logs older than retention period
 * Demonstrates: deleteMany with indexed query filter
 */
router.delete('/groups/:groupId/ai-logs', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const days = parseInt(req.query.days || '90', 10);

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    if (group.adminId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only the group admin can purge AI logs' });
    }

    await connectMongo();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await RawExpenseLog.purgeOlderThan(groupId, cutoffDate);
    return res.status(200).json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Purge AI logs error:', error);
    next(error);
  }
});

module.exports = router;

const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { connectMongo } = require('../lib/mongo');
const RawExpenseLog = require('../models/RawExpenseLog');
const { parseExpenseText } = require('../services/aiParser');
const {
  asyncHandler,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} = require('../middleware/errorHandler');

const router = express.Router();

const parseBodySchema = z.object({
  text: z.string().trim().min(1, 'Text is required for AI parsing'),
});

router.use(auth);

router.post('/groups/:groupId/expenses/parse', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const parsed = parseBodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid parse payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Verify membership
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: req.userId, groupId } },
  });

  if (!membership) {
    throw new ForbiddenError('You are not a member of this group');
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

  return res.status(200).json({ parsed: structured });
}));

/**
 * MongoDB READ: Get recent raw AI parse audit logs for a group
 * Demonstrates: find(), projection (.select), sort, limit, and .lean() for read performance
 */
router.get('/groups/:groupId/ai-logs', asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  // Verify membership before allowing audit log access
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: req.userId, groupId } },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this group');
  }

  await connectMongo();
  if (!process.env.MONGODB_URI) {
    return res.status(200).json({ logs: [] });
  }

  const logs = await RawExpenseLog.getRecentLogs(groupId, 20);
  return res.status(200).json({ logs });
}));

/**
 * MongoDB UPDATE: Update extracted category on an AI parse log
 * Demonstrates: findOneAndUpdate with atomic $set operator and schema validation
 */
router.patch('/groups/:groupId/ai-logs/:logId', asyncHandler(async (req, res) => {
  const { groupId, logId } = req.params;
  const { category } = req.body;

  if (!category || typeof category !== 'string' || !category.trim()) {
    throw new BadRequestError('Valid category string is required');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: req.userId, groupId } },
  });
  if (!membership) {
    throw new ForbiddenError('You are not a member of this group');
  }

  await connectMongo();
  const updated = await RawExpenseLog.updateLogCategory(logId, groupId, category.trim());
  if (!updated) {
    throw new NotFoundError('Log entry not found');
  }
  return res.status(200).json({ log: updated });
}));

/**
 * MongoDB DELETE: Purge AI parse logs older than retention period
 * Demonstrates: deleteMany with indexed query filter
 */
router.delete('/groups/:groupId/ai-logs', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const days = parseInt(req.query.days || '90', 10);

  // Only group admin can purge group AI audit logs
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { adminId: true },
  });
  if (!group) {
    throw new NotFoundError('Group not found');
  }
  if (group.adminId !== req.userId) {
    throw new ForbiddenError('Only the group admin can purge AI logs');
  }

  await connectMongo();
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await RawExpenseLog.purgeOlderThan(groupId, cutoffDate);
  return res.status(200).json({ deletedCount: result.deletedCount });
}));

module.exports = router;

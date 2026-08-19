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

module.exports = router;

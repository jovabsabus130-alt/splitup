const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const { getPersonalAnalytics, getGroupAnalytics } = require('../services/analyticsService');

const router = express.Router();
router.use(auth);

// ── Query Validation Schema ───────────────────────────────────────────────────

const analyticsQuerySchema = z.object({
  scope: z.enum(['personal', 'group']).default('personal'),
  period: z.enum(['day', 'week', 'month']).default('month'),
  date: z.string().optional(),
  groupId: z.string().optional(),
}).refine((data) => {
  if (data.scope === 'group' && (!data.groupId || !data.groupId.trim())) {
    return false;
  }
  return true;
}, {
  message: 'groupId is required when scope is group',
  path: ['groupId'],
});

// ── GET /api/analytics ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid analytics query parameters',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { scope, period, date, groupId } = parsed.data;
    const userId = req.userId;

    let result;
    if (scope === 'group') {
      result = await getGroupAnalytics({
        userId,
        groupId: groupId.trim(),
        period,
        date,
      });
    } else {
      result = await getPersonalAnalytics({
        userId,
        period,
        date,
      });
    }

    return res.status(200).json({
      success: true,
      analytics: result,
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error('Analytics API error:', error);
    next(error);
  }
});

module.exports = router;

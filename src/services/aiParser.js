const axios = require('axios');
const { z } = require('zod');

// Allow share: 0 for excluded members
const splitSuggestionItem = z.object({
  label: z.string().min(1),
  share: z.number().min(0),
  excluded: z.boolean().optional(),
});

const parsedExpenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  payerName: z.string().optional(),
  breakdownExplanation: z.string().optional(),
  splitSuggestion: z.array(splitSuggestionItem).min(1),
});

/**
 * Parse free-form expense text into structured data using the Gemini API.
 * @param {string} text - Raw user input
 * @param {Array<{id: string, name: string}>} members - Group members for context
 * @param {string|null} currentUserId - The user id making the request
 */
async function parseExpenseText(text, members = [], currentUserId = null) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  const configuredModel = process.env.GOOGLE_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY (or GOOGLE_API_KEY) is missing');
  }

  const trimmedText = String(text || '').trim();
  if (!trimmedText) throw new Error('Expense text is required');

  const memberDescriptions = members.map((m) => {
    const isCurrent = currentUserId && String(m.id) === String(currentUserId);
    return isCurrent ? `${m.name} (This is the logged-in User / "I" / "me" / "myself")` : m.name;
  }).join('\n- ');

  const memberContext = members.length > 0
    ? `Group members:\n- ${memberDescriptions}\n`
    : '';

  const prompt = [
    'You are an intelligent bill-splitting mathematical engine.',
    memberContext,
    'Analyze the expense description carefully. It may describe a single expense or multiple combined items with different payers and participants.',
    '',
    'Rules:',
    '1. Pronoun resolution:',
    '   - "I", "me", "my", "myself", "we" refers to the Current User (logged-in user).',
    '   - "they", "they two", "the other two" refers to the other mentioned group members excluding the speaker.',
    '2. Multi-item breakdown:',
    '   - Identify every distinct expense/item mentioned, its cost, who paid for it, and who participated in that item.',
    '   - For each item, divide its cost equally among its participants.',
    '   - Compute each group member\'s total consumed share by summing their shares across all items.',
    '3. Total amount:',
    '   - The total expense amount is the sum of all item costs.',
    '   - All member shares in splitSuggestion MUST sum to the total amount EXACTLY (round each share to 2 decimals; adjust rounding so sum equals total).',
    '4. Payer:',
    '   - Identify who paid (e.g. if multiple, specify the primary payer or speaker name).',
    '5. breakdownExplanation:',
    '   - Provide a clear, friendly summary showing each person\'s paid amount, consumed share, and resulting net impact (e.g. "You → ₹5,000 − ₹2,275 = ₹2,725 ✅\\nJovab Sabu → ₹2,275 + ₹375 = ₹2,650 ✅\\nMarkose → ₹750 − ₹375 = ₹375 ✅").',
    '',
    'Return ONLY valid JSON in this exact shape:',
    '{',
    '  "amount": number,',
    '  "category": string,',
    '  "description": string,',
    '  "payerName": string,',
    '  "breakdownExplanation": string,',
    '  "splitSuggestion": [',
    '    {',
    '      "label": string,',
    '      "share": number,',
    '      "excluded": boolean',
    '    }',
    '  ]',
    '}',
    '',
    `Input: "${trimmedText}"`,
  ].filter(Boolean).join('\n');

  const candidateModels = Array.from(new Set([
    configuredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest',
  ]));

  let lastError = null;

  for (const model of candidateModels) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
        }
      );

      let content = response.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || '')
        .join('')
        .trim();

      if (!content) continue;

      // Strip markdown code fences if present
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      }

      const parsedJson = JSON.parse(content);
      const validated = parsedExpenseSchema.safeParse(parsedJson);
      if (validated.success) {
        return validated.data;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    lastError?.response?.data?.error?.message ||
    lastError?.message ||
    'AI parser failed to process expense'
  );
}

module.exports = { parseExpenseText, parsedExpenseSchema };

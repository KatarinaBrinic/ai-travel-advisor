import { Router } from 'express';
import { prisma } from '../db.ts';
import { getEffectiveSystemPrompt } from '../llm/systemPrompt.ts';
import { assertNonEmptyString } from '../validation/basic.ts';

export const systemPromptRouter = Router();

systemPromptRouter.get('/', async (_req, res, next) => {
  try {
    const content = await getEffectiveSystemPrompt(prisma);
    res.json({ content });
  } catch (err) {
    next(err);
  }
});

systemPromptRouter.put('/', async (req, res, next) => {
  try {
    const content = assertNonEmptyString(req.body?.content, 'content');
    const row = await prisma.systemPrompt.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', content },
      update: { content },
    });
    res.json({ content: row.content });
  } catch (err) {
    next(err);
  }
});

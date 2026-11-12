import { Router } from 'express';
import { prisma } from '../db.ts';
import { runTurn } from '../llm/chatLoop.ts';
import { redactSecrets, type OpenAIResponsesClient } from '../llm/openaiClient.ts';
import { getEffectiveSystemPrompt } from '../llm/systemPrompt.ts';
import { createContextualExecuteTool } from '../llm/tools/index.ts';
import { listFacts, type TravelerFactDto } from '../services/travelerFactService.ts';
import { assertNonEmptyString, assertOptionalString } from '../validation/basic.ts';

export interface ConversationsRouterDeps {
  getClient: () => OpenAIResponsesClient;
  getModel: () => string;
}

// Facts are appended to the system prompt at call time only — never cached,
// never written back anywhere. Fetched fresh on every turn (see below), so
// this is pure string formatting, not a source of truth.
function buildInstructions(systemPrompt: string, facts: TravelerFactDto[]): string {
  if (facts.length === 0) {
    return systemPrompt;
  }
  const factLines = facts.map((f) => `- ${f.key}: ${f.value}`).join('\n');
  return `${systemPrompt}\n\nKnown about this traveler from earlier conversations:\n${factLines}`;
}

export function createConversationsRouter(llm: ConversationsRouterDeps) {
  const conversationsRouter = Router();

  conversationsRouter.post('/', async (req, res, next) => {
    try {
      const title = assertOptionalString(req.body?.title, 'title') ?? 'New conversation';
      const conversation = await prisma.conversation.create({
        data: { travelerId: req.travelerId, title },
      });
      res.status(201).json(conversation);
    } catch (err) {
      next(err);
    }
  });

  conversationsRouter.get('/', async (req, res, next) => {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { travelerId: req.travelerId },
        orderBy: { updatedAt: 'desc' },
      });
      res.json(conversations);
    } catch (err) {
      next(err);
    }
  });

  conversationsRouter.get('/:id', async (req, res, next) => {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, travelerId: req.travelerId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      res.json(conversation);
    } catch (err) {
      next(err);
    }
  });

  conversationsRouter.delete('/:id', async (req, res, next) => {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, travelerId: req.travelerId },
      });
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      await prisma.conversation.delete({ where: { id: conversation.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  conversationsRouter.post('/:id/messages', async (req, res, next) => {
    try {
      const content = assertNonEmptyString(req.body?.content, 'content');
      const conversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, travelerId: req.travelerId },
      });
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const userMessage = await prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      const history = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
      });

      let assistantText: string;
      let toolCallsSummary: string | null;
      try {
        const systemPrompt = await getEffectiveSystemPrompt(prisma);
        const facts = await listFacts(prisma, req.travelerId);
        const instructions = buildInstructions(systemPrompt, facts);
        const result = await runTurn({
          client: llm.getClient(),
          model: llm.getModel(),
          instructions,
          history: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          executeTool: createContextualExecuteTool({
            prisma,
            travelerId: req.travelerId,
            conversationId: conversation.id,
          }),
        });
        assistantText = result.text;
        toolCallsSummary = result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : null;
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : 'unknown error';
        console.error('OpenAI call failed:', redactSecrets(rawMessage));
        res.status(502).json({ error: 'The advisor is unavailable right now.', userMessage });
        return;
      }

      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantText,
          toolCalls: toolCallsSummary,
        },
      });

      res.status(201).json({ userMessage, assistantMessage });
    } catch (err) {
      next(err);
    }
  });

  return conversationsRouter;
}

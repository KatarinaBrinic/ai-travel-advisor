import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HealthResponse } from '../../shared/types.ts';
import { createOpenAIClient, getModel } from './llm/openaiClient.ts';
import { travelerCookie } from './middleware/travelerCookie.ts';
import { createConversationsRouter, type ConversationsRouterDeps } from './routes/conversations.ts';
import { systemPromptRouter } from './routes/systemPrompt.ts';
import { tripPlanRouter } from './routes/tripPlan.ts';
import { ValidationError } from './validation/basic.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(llm: ConversationsRouterDeps) {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
    res.json(body);
  });

  app.use('/api/conversations', travelerCookie, createConversationsRouter(llm));
  app.use('/api/system-prompt', systemPromptRouter);
  app.use('/api/trip-plan', travelerCookie, tripPlanRouter);

  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    // express.json() throws a SyntaxError with status 400 for malformed JSON bodies.
    if (err && typeof err === 'object' && 'status' in err && err.status === 400) {
      res.status(400).json({ error: 'Malformed JSON in request body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// getClient/getModel are passed as functions, not invoked here — the real
// client is only constructed lazily inside a request, so importing this
// module never requires OPENAI_API_KEY to be set (tests import it freely).
export const app = createApp({ getClient: createOpenAIClient, getModel });

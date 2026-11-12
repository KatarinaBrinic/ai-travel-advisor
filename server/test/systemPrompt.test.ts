import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db.ts';
import { DEFAULT_SYSTEM_PROMPT } from '../src/llm/systemPrompt.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

beforeEach(async () => {
  await prisma.systemPrompt.deleteMany();
});

describe('GET /api/system-prompt', () => {
  it('returns the default prompt when none has been saved', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const res = await request(app).get('/api/system-prompt');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: DEFAULT_SYSTEM_PROMPT });
  });

  it('returns the saved prompt after one has been written', async () => {
    await prisma.systemPrompt.create({ data: { id: 'singleton', content: 'Custom prompt text.' } });
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });

    const res = await request(app).get('/api/system-prompt');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: 'Custom prompt text.' });
  });
});

describe('PUT /api/system-prompt', () => {
  it('saves a new prompt and returns it', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });

    const putRes = await request(app).put('/api/system-prompt').send({ content: 'Be extra concise.' });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ content: 'Be extra concise.' });

    const getRes = await request(app).get('/api/system-prompt');
    expect(getRes.body).toEqual({ content: 'Be extra concise.' });
  });

  it('overwrites a previously saved prompt rather than creating a second row', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });

    await request(app).put('/api/system-prompt').send({ content: 'First version.' });
    await request(app).put('/api/system-prompt').send({ content: 'Second version.' });

    const rowCount = await prisma.systemPrompt.count();
    expect(rowCount).toBe(1);

    const getRes = await request(app).get('/api/system-prompt');
    expect(getRes.body).toEqual({ content: 'Second version.' });
  });

  it('rejects empty content with 400 rather than resetting to the default', async () => {
    await prisma.systemPrompt.create({ data: { id: 'singleton', content: 'Keep me.' } });
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });

    const res = await request(app).put('/api/system-prompt').send({ content: '' });
    expect(res.status).toBe(400);

    const getRes = await request(app).get('/api/system-prompt');
    expect(getRes.body).toEqual({ content: 'Keep me.' });
  });

  it('rejects whitespace-only content with 400', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const res = await request(app).put('/api/system-prompt').send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string content value with 400', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const res = await request(app).put('/api/system-prompt').send({ content: 42 });
    expect(res.status).toBe(400);
  });
});

describe('a saved prompt takes effect on the very next chat request', () => {
  it('passes the newly saved content as instructions with no caching', async () => {
    const receivedInstructions: string[] = [];
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          receivedInstructions.push(params.instructions);
          return { output_text: 'ok' };
        },
      },
    };
    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    // First chat turn, before any prompt has been saved — should see the default.
    const conversation = await agent.post('/api/conversations').send({});
    const firstSend = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: 'Hi' });
    expect(firstSend.status).toBe(201);
    expect(receivedInstructions[0]).toBe(DEFAULT_SYSTEM_PROMPT);

    // Save a new prompt, then send another message in the SAME conversation.
    const putRes = await agent
      .put('/api/system-prompt')
      .send({ content: 'You are now a pirate-themed travel advisor.' });
    expect(putRes.status).toBe(200);

    const secondSend = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: 'Hi again' });
    expect(secondSend.status).toBe(201);

    expect(receivedInstructions[1]).toBe('You are now a pirate-themed travel advisor.');
  });
});

function failingClient(): OpenAIResponsesClient {
  return {
    responses: {
      create: async () => {
        throw new Error('This test should never call the LLM.');
      },
    },
  };
}

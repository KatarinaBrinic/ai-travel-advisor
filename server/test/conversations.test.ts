import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

const FAKE_REPLY = 'This is a canned test reply from the advisor.';

const fakeClient: OpenAIResponsesClient = {
  responses: {
    create: async () => ({ output_text: FAKE_REPLY }),
  },
};

// Built once with a fake LLM client so these tests never call the real
// OpenAI API and never need OPENAI_API_KEY set.
const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.traveler.deleteMany();
});

describe('conversation CRUD', () => {
  it('creates a conversation scoped to the caller and lists it', async () => {
    const agent = request.agent(app);
    const createRes = await agent.post('/api/conversations').send({ title: 'Trip to Japan' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe('Trip to Japan');

    const listRes = await agent.get('/api/conversations');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(createRes.body.id);
  });

  it('defaults the title when none is given', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/conversations').send({});
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New conversation');
  });

  it('rejects a non-string title', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/conversations').send({ title: 42 });
    expect(res.status).toBe(400);
  });

  it('returns a conversation with the user message and the real assistant reply, oldest first', async () => {
    const agent = request.agent(app);
    const created = await agent.post('/api/conversations').send({});
    const sendRes = await agent
      .post(`/api/conversations/${created.body.id}/messages`)
      .send({ content: 'Hello' });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.userMessage.content).toBe('Hello');
    expect(sendRes.body.assistantMessage.content).toBe(FAKE_REPLY);

    const res = await agent.get(`/api/conversations/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].content).toBe('Hello');
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].content).toBe(FAKE_REPLY);
    expect(res.body.messages[1].role).toBe('assistant');
  });

  it('404s for a conversation that does not exist', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/conversations/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('rejects an empty message body', async () => {
    const agent = request.agent(app);
    const created = await agent.post('/api/conversations').send({});
    const res = await agent
      .post(`/api/conversations/${created.body.id}/messages`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('deletes a conversation and cascade-deletes its messages', async () => {
    const agent = request.agent(app);
    const created = await agent.post('/api/conversations').send({});
    await agent.post(`/api/conversations/${created.body.id}/messages`).send({ content: 'a' });
    await agent.post(`/api/conversations/${created.body.id}/messages`).send({ content: 'b' });

    const del = await agent.delete(`/api/conversations/${created.body.id}`);
    expect(del.status).toBe(204);

    const remainingMessages = await prisma.message.count({
      where: { conversationId: created.body.id },
    });
    expect(remainingMessages).toBe(0);

    const getRes = await agent.get(`/api/conversations/${created.body.id}`);
    expect(getRes.status).toBe(404);
  });
});

describe('traveler isolation', () => {
  it("does not let one traveler see, open, or delete another traveler's conversation", async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const convoA = await agentA.post('/api/conversations').send({ title: 'A trip' });
    const convoB = await agentB.post('/api/conversations').send({ title: 'B trip' });

    const listA = await agentA.get('/api/conversations');
    expect(listA.body.map((c: { id: string }) => c.id)).toEqual([convoA.body.id]);

    const getForbidden = await agentA.get(`/api/conversations/${convoB.body.id}`);
    expect(getForbidden.status).toBe(404);

    const deleteForbidden = await agentA.delete(`/api/conversations/${convoB.body.id}`);
    expect(deleteForbidden.status).toBe(404);

    const stillThere = await agentB.get(`/api/conversations/${convoB.body.id}`);
    expect(stillThere.status).toBe(200);
  });
});

describe('LLM failure handling', () => {
  it('persists the user message and returns 502 without a fake assistant reply when the LLM call fails', async () => {
    const failingApp = createApp({
      getClient: () => ({
        responses: {
          create: async () => {
            throw new Error('simulated upstream outage');
          },
        },
      }),
      getModel: () => 'test-model',
    });

    const agent = request.agent(failingApp);
    const created = await agent.post('/api/conversations').send({});
    const res = await agent
      .post(`/api/conversations/${created.body.id}/messages`)
      .send({ content: 'Hello' });

    expect(res.status).toBe(502);
    expect(res.body.userMessage.content).toBe('Hello');
    expect(res.body.assistantMessage).toBeUndefined();

    const messages = await prisma.message.findMany({ where: { conversationId: created.body.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });
});

describe('anonymous traveler cookie', () => {
  it('creates a traveler on first request and reuses it on later requests', async () => {
    const agent = request.agent(app);
    await agent.get('/api/conversations');
    await agent.get('/api/conversations');

    const travelerCount = await prisma.traveler.count();
    expect(travelerCount).toBe(1);
  });

  it('gives two different callers two different travelers', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA.get('/api/conversations');
    await agentB.get('/api/conversations');

    const travelerCount = await prisma.traveler.count();
    expect(travelerCount).toBe(2);
  });

  it('sets the traveler cookie as httpOnly with SameSite=Lax', async () => {
    const res = await request(app).get('/api/conversations');
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(cookieString).toMatch(/HttpOnly/i);
    expect(cookieString).toMatch(/SameSite=Lax/i);
  });
});

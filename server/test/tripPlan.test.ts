import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

function failingClient(): OpenAIResponsesClient {
  return {
    responses: {
      create: async () => {
        throw new Error('This test should never call the LLM.');
      },
    },
  };
}

beforeEach(async () => {
  await prisma.conversation.deleteMany();
  await prisma.tripPlan.deleteMany();
  await prisma.traveler.deleteMany();
});

describe('GET /api/trip-plan', () => {
  it('returns an empty default plan without creating a row', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });

    const res = await request(app).get('/api/trip-plan');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      destination: null,
      startDate: null,
      endDate: null,
      days: [],
      notes: null,
      updatedAt: null,
    });
    expect(await prisma.tripPlan.count()).toBe(0);
  });
});

describe('PATCH /api/trip-plan', () => {
  it('creates the plan on first patch and returns it', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const agent = request.agent(app);

    const patchRes = await agent.patch('/api/trip-plan').send({ destination: 'Italy' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.destination).toBe('Italy');

    const getRes = await agent.get('/api/trip-plan');
    expect(getRes.body.destination).toBe('Italy');
  });

  it('rejects an invalid patch with 400', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const res = await request(app).patch('/api/trip-plan').send({ startDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed days entry with 400', async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const res = await request(app)
      .patch('/api/trip-plan')
      .send({ days: [{ date: '2026-09-01' }] }); // missing activities
    expect(res.status).toBe(400);
  });
});

describe('trip plan traveler isolation', () => {
  it("does not let one traveler see or modify another traveler's plan", async () => {
    const app = createApp({ getClient: () => failingClient(), getModel: () => 'test-model' });
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    await agentA.patch('/api/trip-plan').send({ destination: "A's trip" });
    await agentB.patch('/api/trip-plan').send({ destination: "B's trip" });

    const getA = await agentA.get('/api/trip-plan');
    const getB = await agentB.get('/api/trip-plan');

    expect(getA.body.destination).toBe("A's trip");
    expect(getB.body.destination).toBe("B's trip");
    expect(await prisma.tripPlan.count()).toBe(2);
  });
});

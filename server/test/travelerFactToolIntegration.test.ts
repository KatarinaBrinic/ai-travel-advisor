import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.travelerFact.deleteMany();
  await prisma.traveler.deleteMany();
});

function hasToolOutput(input: unknown[]): boolean {
  return input.some(
    (item) => typeof item === 'object' && item !== null && (item as { type?: string }).type === 'function_call_output',
  );
}

describe('remember_fact tool, invoked through a real chat turn', () => {
  it('persists via the shared travelerFactService', async () => {
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          if (!hasToolOutput(params.input)) {
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'f1',
                  name: 'remember_fact',
                  arguments: JSON.stringify({
                    facts: [
                      { key: 'dietary_preference', value: 'vegetarian' },
                      { key: 'home_airport', value: 'TGD' },
                    ],
                  }),
                },
              ],
            };
          }
          return { output_text: "Got it, I'll remember that." };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    const conversation = await agent.post('/api/conversations').send({});
    const sendRes = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: "I'm vegetarian and my home airport is TGD." });

    expect(sendRes.status).toBe(201);
    const toolCalls = JSON.parse(sendRes.body.assistantMessage.toolCalls);
    expect(toolCalls[0].name).toBe('remember_fact');

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.body.id },
    });
    const facts = await prisma.travelerFact.findMany({ where: { travelerId: updatedConversation.travelerId } });
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.key).sort()).toEqual(['dietary_preference', 'home_airport']);
  });

  it('surfaces invalid tool arguments as a structured error without crashing the turn or saving anything', async () => {
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          if (!hasToolOutput(params.input)) {
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'f2',
                  name: 'remember_fact',
                  // missing "value" on the one entry — should fail validation
                  arguments: JSON.stringify({ facts: [{ key: 'dietary_preference' }] }),
                },
              ],
            };
          }
          return { output_text: 'Could not save that, could you repeat it?' };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    const conversation = await agent.post('/api/conversations').send({});
    const sendRes = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: "I'm something dietary." });

    expect(sendRes.status).toBe(201);
    const toolCalls = JSON.parse(sendRes.body.assistantMessage.toolCalls);
    expect(toolCalls[0].result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.travelerFact.count()).toBe(0);
  });

  it('rejects an empty facts array', async () => {
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          if (!hasToolOutput(params.input)) {
            return {
              output: [
                { type: 'function_call', call_id: 'f3', name: 'remember_fact', arguments: JSON.stringify({ facts: [] }) },
              ],
            };
          }
          return { output_text: 'ok' };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);
    const conversation = await agent.post('/api/conversations').send({});
    const sendRes = await agent.post(`/api/conversations/${conversation.body.id}/messages`).send({ content: 'hi' });

    const toolCalls = JSON.parse(sendRes.body.assistantMessage.toolCalls);
    expect(toolCalls[0].result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.travelerFact.count()).toBe(0);
  });
});

describe('cross-conversation continuity', () => {
  it('makes a fact saved in one conversation appear in the instructions for a separate conversation, same traveler', async () => {
    const receivedInstructions: string[] = [];
    let toolAlreadyFired = false;
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          receivedInstructions.push(params.instructions);
          if (!toolAlreadyFired && !hasToolOutput(params.input)) {
            toolAlreadyFired = true;
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'f4',
                  name: 'remember_fact',
                  arguments: JSON.stringify({ facts: [{ key: 'dietary_preference', value: 'vegetarian' }] }),
                },
              ],
            };
          }
          return { output_text: 'ok' };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    // Conversation A: reveal the fact, tool call saves it.
    const conversationA = await agent.post('/api/conversations').send({});
    await agent
      .post(`/api/conversations/${conversationA.body.id}/messages`)
      .send({ content: "I'm vegetarian, keep that in mind." });

    // Before the fact was saved, it must not have been in A's own first-call instructions.
    expect(receivedInstructions[0]).not.toContain('dietary_preference');

    // Conversation B: a brand new, separate conversation for the SAME traveler (same agent/cookie).
    const conversationB = await agent.post('/api/conversations').send({});
    await agent
      .post(`/api/conversations/${conversationB.body.id}/messages`)
      .send({ content: 'Any restaurant recommendations?' });

    // B's very first turn must already carry the fact recorded back in A.
    const bFirstTurnInstructions = receivedInstructions[receivedInstructions.length - 1];
    expect(bFirstTurnInstructions).toContain('dietary_preference: vegetarian');
  });
});

describe('traveler isolation for facts in instructions', () => {
  it("never includes traveler A's facts in traveler B's instructions", async () => {
    const receivedInstructions: string[] = [];
    let toolAlreadyFired = false;
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          receivedInstructions.push(params.instructions);
          if (!toolAlreadyFired && !hasToolOutput(params.input)) {
            toolAlreadyFired = true;
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'f5',
                  name: 'remember_fact',
                  arguments: JSON.stringify({ facts: [{ key: 'home_city', value: 'Podgorica' }] }),
                },
              ],
            };
          }
          return { output_text: 'ok' };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const conversationA = await agentA.post('/api/conversations').send({});
    await agentA
      .post(`/api/conversations/${conversationA.body.id}/messages`)
      .send({ content: 'My home city is Podgorica.' });

    const conversationB = await agentB.post('/api/conversations').send({});
    await agentB.post(`/api/conversations/${conversationB.body.id}/messages`).send({ content: 'Hello there.' });

    const bInstructions = receivedInstructions[receivedInstructions.length - 1];
    expect(bInstructions).not.toContain('Podgorica');
  });
});

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.tripPlan.deleteMany();
  await prisma.traveler.deleteMany();
});

describe('update_trip_plan tool, invoked through a real chat turn', () => {
  it('persists via the shared tripPlanService and is visible from GET /api/trip-plan', async () => {
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          const alreadyCalledTool = params.input.some(
            (item) => typeof item === 'object' && item !== null && (item as { type?: string }).type === 'function_call_output',
          );
          if (!alreadyCalledTool) {
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'tp1',
                  name: 'update_trip_plan',
                  arguments: JSON.stringify({
                    destination: 'Peru',
                    days: [{ date: '2026-09-01', title: 'Arrival', activities: ['Land in Lima'] }],
                  }),
                },
              ],
            };
          }
          return { output_text: "Got it — I've noted Peru as your destination." };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    const conversation = await agent.post('/api/conversations').send({});
    const sendRes = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: "I'm planning a trip to Peru, arriving September 1st." });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.assistantMessage.content).toBe("Got it — I've noted Peru as your destination.");

    const toolCalls = JSON.parse(sendRes.body.assistantMessage.toolCalls);
    expect(toolCalls[0].name).toBe('update_trip_plan');

    // Same traveler, independent endpoint — proves persistence went through
    // the shared service, not some tool-local side channel.
    const planRes = await agent.get('/api/trip-plan');
    expect(planRes.body.destination).toBe('Peru');
    expect(planRes.body.days).toEqual([{ date: '2026-09-01', title: 'Arrival', activities: ['Land in Lima'] }]);

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.body.id },
    });
    const plan = await prisma.tripPlan.findFirstOrThrow({ where: { travelerId: updatedConversation.travelerId } });
    expect(updatedConversation.tripPlanId).toBe(plan.id);
  });

  it('surfaces invalid tool arguments as a structured error without crashing the turn', async () => {
    const fakeClient: OpenAIResponsesClient = {
      responses: {
        create: async (params) => {
          const alreadyCalledTool = params.input.some(
            (item) => typeof item === 'object' && item !== null && (item as { type?: string }).type === 'function_call_output',
          );
          if (!alreadyCalledTool) {
            return {
              output: [
                {
                  type: 'function_call',
                  call_id: 'tp2',
                  name: 'update_trip_plan',
                  arguments: JSON.stringify({ startDate: 'not-a-real-date' }),
                },
              ],
            };
          }
          return { output_text: 'Could not save that date, could you clarify?' };
        },
      },
    };

    const app = createApp({ getClient: () => fakeClient, getModel: () => 'test-model' });
    const agent = request.agent(app);

    const conversation = await agent.post('/api/conversations').send({});
    const sendRes = await agent
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .send({ content: 'Starting sometime unclear.' });

    expect(sendRes.status).toBe(201);
    const toolCalls = JSON.parse(sendRes.body.assistantMessage.toolCalls);
    expect(toolCalls[0].result).toMatchObject({ error: expect.any(String) });
    expect(await prisma.tripPlan.count()).toBe(0);
  });
});

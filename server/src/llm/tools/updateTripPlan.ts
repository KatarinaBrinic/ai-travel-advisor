import type { PrismaClient } from '@prisma/client';
import { applyTripPlanPatch } from '../../services/tripPlanService.ts';

export const updateTripPlanDefinition = {
  type: 'function' as const,
  name: 'update_trip_plan',
  description:
    "Record or update the traveler's trip plan as concrete details emerge in conversation — " +
    'destination, dates, and the day-by-day shape. Call this whenever the traveler shares or ' +
    'changes a concrete trip detail, so the plan stays in sync with the conversation. Only ' +
    'include fields that actually changed; omit the rest.',
  parameters: {
    type: 'object',
    properties: {
      destination: { type: 'string', description: 'Where the trip is to' },
      startDate: { type: 'string', description: 'Trip start date, ISO format YYYY-MM-DD' },
      endDate: { type: 'string', description: 'Trip end date, ISO format YYYY-MM-DD' },
      days: {
        type: 'array',
        description: 'The full day-by-day shape of the trip — replaces the entire list when provided.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
            title: { type: 'string', description: 'Short label for the day' },
            activities: { type: 'array', items: { type: 'string' } },
          },
          required: ['date', 'activities'],
          additionalProperties: false,
        },
      },
      notes: { type: 'string', description: 'Freeform notes about the trip' },
    },
    additionalProperties: false,
  },
};

export interface UpdateTripPlanContext {
  prisma: PrismaClient;
  travelerId: string;
  conversationId: string;
}

export function createUpdateTripPlanTool(context: UpdateTripPlanContext) {
  return {
    definition: updateTripPlanDefinition,
    async execute(rawArgs: unknown): Promise<unknown> {
      return applyTripPlanPatch(context.prisma, context.travelerId, rawArgs, {
        conversationId: context.conversationId,
      });
    },
  };
}

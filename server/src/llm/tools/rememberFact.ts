import type { PrismaClient } from '@prisma/client';
import { upsertFact } from '../../services/travelerFactService.ts';
import { assertNonEmptyString, ValidationError } from '../../validation/basic.ts';

export const rememberFactDefinition = {
  type: 'function' as const,
  name: 'remember_fact',
  description:
    'Record stable, reusable facts about the TRAVELER that are useful across future conversations ' +
    "— not just this one. Use this for general, long-lived information such as: home_city='Podgorica', " +
    "home_airport='TGD', dietary_preference='vegetarian', travel_companions='usually travels with two " +
    "children', accessibility_need, travel_style='prefers luxury hotels', " +
    "travel_preference='prefers direct flights'.\n\n" +
    'Do NOT use this for anything specific to one particular trip — dates, destinations, flights, ' +
    'hotels, bookings, or itinerary details. Those belong to the trip plan (update_trip_plan) or just ' +
    'the conversation itself, not here. For example, "I\'m flying to Rome on August 17", "I\'m going to ' +
    'Paris next month", and "my hotel in Rome is X" must NOT be recorded here.\n\n' +
    'Do NOT record sensitive identifiers or highly sensitive personal data, even if the traveler shares ' +
    'them: passport numbers, ID numbers, exact birth dates, financial information, phone numbers, or ' +
    'similar identifying credentials.',
  parameters: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        description: 'One or more traveler facts to remember or update.',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: "Short snake_case identifier, e.g. 'home_airport', 'dietary_preference'",
            },
            value: { type: 'string', description: 'The fact itself, in plain language' },
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['facts'],
    additionalProperties: false,
  },
};

export interface RememberFactContext {
  prisma: PrismaClient;
  travelerId: string;
  conversationId: string;
}

export function createRememberFactTool(context: RememberFactContext) {
  return {
    definition: rememberFactDefinition,
    async execute(rawArgs: unknown): Promise<unknown> {
      if (typeof rawArgs !== 'object' || rawArgs === null) {
        throw new ValidationError('Arguments must be an object');
      }
      const { facts } = rawArgs as Record<string, unknown>;
      if (!Array.isArray(facts) || facts.length === 0) {
        throw new ValidationError('facts must be a non-empty array');
      }

      const saved = [];
      for (const entry of facts) {
        if (typeof entry !== 'object' || entry === null) {
          throw new ValidationError('Each fact must be an object with key and value');
        }
        const { key, value } = entry as Record<string, unknown>;
        const validKey = assertNonEmptyString(key, 'key');
        const validValue = assertNonEmptyString(value, 'value');
        saved.push(await upsertFact(context.prisma, context.travelerId, validKey, validValue, context.conversationId));
      }

      return { saved };
    },
  };
}

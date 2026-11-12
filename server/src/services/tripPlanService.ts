import type { PrismaClient, TripPlan } from '@prisma/client';
import { ValidationError } from '../validation/basic.ts';

export interface TripPlanDayDto {
  date: string;
  title?: string;
  activities: string[];
}

export interface TripPlanDto {
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  days: TripPlanDayDto[];
  notes: string | null;
  updatedAt: string | null;
}

interface ValidatedPatch {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  days?: string;
  notes?: string;
}

function validateDayEntry(entry: unknown, index: number): TripPlanDayDto {
  if (typeof entry !== 'object' || entry === null) {
    throw new ValidationError(`days[${index}] must be an object`);
  }
  const { date, title, activities } = entry as Record<string, unknown>;
  if (typeof date !== 'string' || date.trim().length === 0) {
    throw new ValidationError(`days[${index}].date must be a non-empty string`);
  }
  if (title !== undefined && typeof title !== 'string') {
    throw new ValidationError(`days[${index}].title must be a string`);
  }
  if (!Array.isArray(activities) || activities.some((a) => typeof a !== 'string')) {
    throw new ValidationError(`days[${index}].activities must be an array of strings`);
  }
  return { date: date.trim(), title, activities };
}

function validatePatch(patch: unknown): ValidatedPatch {
  if (typeof patch !== 'object' || patch === null) {
    throw new ValidationError('Request body must be an object');
  }
  const { destination, startDate, endDate, days, notes } = patch as Record<string, unknown>;
  const result: ValidatedPatch = {};

  if (destination !== undefined) {
    if (typeof destination !== 'string') {
      throw new ValidationError('destination must be a string');
    }
    result.destination = destination;
  }

  if (startDate !== undefined) {
    if (typeof startDate !== 'string' || Number.isNaN(Date.parse(startDate))) {
      throw new ValidationError('startDate must be a valid date string');
    }
    result.startDate = new Date(startDate);
  }

  if (endDate !== undefined) {
    if (typeof endDate !== 'string' || Number.isNaN(Date.parse(endDate))) {
      throw new ValidationError('endDate must be a valid date string');
    }
    result.endDate = new Date(endDate);
  }

  if (days !== undefined) {
    if (!Array.isArray(days)) {
      throw new ValidationError('days must be an array');
    }
    const validatedDays = days.map((d, i) => validateDayEntry(d, i));
    result.days = JSON.stringify(validatedDays);
  }

  if (notes !== undefined) {
    if (typeof notes !== 'string') {
      throw new ValidationError('notes must be a string');
    }
    result.notes = notes;
  }

  return result;
}

function toTripPlanDto(row: TripPlan): TripPlanDto {
  return {
    destination: row.destination,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    days: JSON.parse(row.days || '[]'),
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const EMPTY_TRIP_PLAN: TripPlanDto = {
  destination: null,
  startDate: null,
  endDate: null,
  days: [],
  notes: null,
  updatedAt: null,
};

/**
 * Read-only: never persists a row just because it was asked for. The first
 * actual patch (manual or tool-driven) is what creates the persisted plan.
 */
export async function getTripPlanOrDefault(prisma: PrismaClient, travelerId: string): Promise<TripPlanDto> {
  const row = await prisma.tripPlan.findFirst({ where: { travelerId } });
  return row ? toTripPlanDto(row) : EMPTY_TRIP_PLAN;
}

/**
 * The single write path for TripPlan, used by both the manual PATCH route
 * and the update_trip_plan tool executor — one set of rules, not two.
 * There's no DB-level uniqueness on travelerId (find-or-create is done here
 * in application code instead) so "exactly one plan per traveler" is an
 * application-level invariant, not a schema constraint.
 */
export async function applyTripPlanPatch(
  prisma: PrismaClient,
  travelerId: string,
  rawPatch: unknown,
  options: { conversationId?: string } = {},
): Promise<TripPlanDto> {
  const patch = validatePatch(rawPatch);
  const existing = await prisma.tripPlan.findFirst({ where: { travelerId } });

  const mergedStart = patch.startDate ?? existing?.startDate ?? null;
  const mergedEnd = patch.endDate ?? existing?.endDate ?? null;
  if (mergedStart && mergedEnd && mergedEnd < mergedStart) {
    throw new ValidationError('endDate must not be before startDate');
  }

  const row = existing
    ? await prisma.tripPlan.update({ where: { id: existing.id }, data: patch })
    : await prisma.tripPlan.create({ data: { travelerId, ...patch } });

  if (options.conversationId) {
    await prisma.conversation.update({
      where: { id: options.conversationId },
      data: { tripPlanId: row.id },
    });
  }

  return toTripPlanDto(row);
}

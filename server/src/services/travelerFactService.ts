import type { PrismaClient, TravelerFact } from '@prisma/client';

export interface TravelerFactDto {
  key: string;
  value: string;
}

function toDto(row: TravelerFact): TravelerFactDto {
  return { key: row.key, value: row.value };
}

/**
 * The single write path for TravelerFact. Relies on the existing
 * @@unique([travelerId, key]) constraint: first write creates, a later
 * write with the same (travelerId, key) overwrites — last-write-wins, no
 * history. A different traveler with the same key is a fully separate row.
 * Input validation is the caller's responsibility (see rememberFact.ts).
 */
export async function upsertFact(
  prisma: PrismaClient,
  travelerId: string,
  key: string,
  value: string,
  sourceConversationId?: string,
): Promise<TravelerFactDto> {
  const row = await prisma.travelerFact.upsert({
    where: { travelerId_key: { travelerId, key } },
    create: { travelerId, key, value, sourceConversationId },
    update: { value, sourceConversationId },
  });
  return toDto(row);
}

export async function listFacts(prisma: PrismaClient, travelerId: string): Promise<TravelerFactDto[]> {
  const rows = await prisma.travelerFact.findMany({ where: { travelerId }, orderBy: { key: 'asc' } });
  return rows.map(toDto);
}

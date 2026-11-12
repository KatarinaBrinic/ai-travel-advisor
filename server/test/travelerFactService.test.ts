import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.ts';
import { listFacts, upsertFact } from '../src/services/travelerFactService.ts';

beforeEach(async () => {
  await prisma.travelerFact.deleteMany();
  await prisma.traveler.deleteMany();
});

async function createTraveler() {
  const traveler = await prisma.traveler.create({ data: {} });
  return traveler.id;
}

describe('upsertFact', () => {
  it('creates a new fact on first write', async () => {
    const travelerId = await createTraveler();

    const fact = await upsertFact(prisma, travelerId, 'home_city', 'Podgorica');

    expect(fact).toEqual({ key: 'home_city', value: 'Podgorica' });
    expect(await prisma.travelerFact.count()).toBe(1);
  });

  it('overwrites the value for the same traveler + same key rather than adding a row', async () => {
    const travelerId = await createTraveler();

    await upsertFact(prisma, travelerId, 'dietary_preference', 'vegetarian');
    const updated = await upsertFact(prisma, travelerId, 'dietary_preference', 'vegan');

    expect(updated.value).toBe('vegan');
    expect(await prisma.travelerFact.count()).toBe(1);
    const row = await prisma.travelerFact.findUniqueOrThrow({
      where: { travelerId_key: { travelerId, key: 'dietary_preference' } },
    });
    expect(row.value).toBe('vegan');
  });

  it('keeps the same key completely separate across two different travelers', async () => {
    const travelerA = await createTraveler();
    const travelerB = await createTraveler();

    await upsertFact(prisma, travelerA, 'home_city', "A's city");
    await upsertFact(prisma, travelerB, 'home_city', "B's city");

    expect(await prisma.travelerFact.count()).toBe(2);
    const factA = await listFacts(prisma, travelerA);
    const factB = await listFacts(prisma, travelerB);
    expect(factA).toEqual([{ key: 'home_city', value: "A's city" }]);
    expect(factB).toEqual([{ key: 'home_city', value: "B's city" }]);
  });

  it('records which conversation a fact came from when provided', async () => {
    const travelerId = await createTraveler();
    const conversation = await prisma.conversation.create({ data: { travelerId, title: 'x' } });

    await upsertFact(prisma, travelerId, 'home_airport', 'TGD', conversation.id);

    const row = await prisma.travelerFact.findUniqueOrThrow({
      where: { travelerId_key: { travelerId, key: 'home_airport' } },
    });
    expect(row.sourceConversationId).toBe(conversation.id);
  });
});

describe('listFacts', () => {
  it('returns an empty array when the traveler has no facts', async () => {
    const travelerId = await createTraveler();
    expect(await listFacts(prisma, travelerId)).toEqual([]);
  });
});

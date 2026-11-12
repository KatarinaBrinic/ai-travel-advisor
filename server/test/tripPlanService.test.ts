import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.ts';
import { applyTripPlanPatch, getTripPlanOrDefault } from '../src/services/tripPlanService.ts';

beforeEach(async () => {
  await prisma.conversation.deleteMany();
  await prisma.tripPlan.deleteMany();
  await prisma.traveler.deleteMany();
});

async function createTraveler() {
  const traveler = await prisma.traveler.create({ data: {} });
  return traveler.id;
}

describe('getTripPlanOrDefault', () => {
  it('returns an empty default shape without persisting anything when no plan exists', async () => {
    const travelerId = await createTraveler();

    const plan = await getTripPlanOrDefault(prisma, travelerId);

    expect(plan).toEqual({
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

describe('applyTripPlanPatch', () => {
  it('creates the plan on the first patch', async () => {
    const travelerId = await createTraveler();

    const plan = await applyTripPlanPatch(prisma, travelerId, { destination: 'Japan' });

    expect(plan.destination).toBe('Japan');
    expect(await prisma.tripPlan.count()).toBe(1);
  });

  it('updates the existing plan rather than creating a second one', async () => {
    const travelerId = await createTraveler();

    await applyTripPlanPatch(prisma, travelerId, { destination: 'Japan' });
    const plan = await applyTripPlanPatch(prisma, travelerId, { notes: 'Bring a rail pass' });

    expect(plan.destination).toBe('Japan');
    expect(plan.notes).toBe('Bring a rail pass');
    expect(await prisma.tripPlan.count()).toBe(1);
  });

  it('round-trips a days array using the approved shape', async () => {
    const travelerId = await createTraveler();
    const days = [{ date: '2026-09-01', title: 'Arrival', activities: ['Check in', 'Explore nearby'] }];

    const plan = await applyTripPlanPatch(prisma, travelerId, { days });

    expect(plan.days).toEqual(days);
  });

  it('rejects endDate before startDate in the same patch', async () => {
    const travelerId = await createTraveler();

    await expect(
      applyTripPlanPatch(prisma, travelerId, { startDate: '2026-09-10', endDate: '2026-09-01' }),
    ).rejects.toThrow(/endDate/);
  });

  it('rejects a new endDate that precedes an already-stored startDate', async () => {
    const travelerId = await createTraveler();
    await applyTripPlanPatch(prisma, travelerId, { startDate: '2026-09-10' });

    await expect(applyTripPlanPatch(prisma, travelerId, { endDate: '2026-09-01' })).rejects.toThrow(/endDate/);
  });

  it('rejects a malformed day entry', async () => {
    const travelerId = await createTraveler();

    await expect(
      applyTripPlanPatch(prisma, travelerId, { days: [{ date: '2026-09-01', activities: 'not an array' }] }),
    ).rejects.toThrow(/activities/);
  });

  it('rejects a non-string destination', async () => {
    const travelerId = await createTraveler();
    await expect(applyTripPlanPatch(prisma, travelerId, { destination: 42 })).rejects.toThrow();
  });

  it('links the conversation to the plan when a conversationId is provided', async () => {
    const travelerId = await createTraveler();
    const conversation = await prisma.conversation.create({ data: { travelerId, title: 'Trip talk' } });

    await applyTripPlanPatch(prisma, travelerId, { destination: 'Peru' }, { conversationId: conversation.id });

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    const plan = await prisma.tripPlan.findFirstOrThrow({ where: { travelerId } });
    expect(updatedConversation.tripPlanId).toBe(plan.id);
  });

  it('does not touch any conversation when no conversationId is provided (manual edit path)', async () => {
    const travelerId = await createTraveler();
    const conversation = await prisma.conversation.create({ data: { travelerId, title: 'Trip talk' } });

    await applyTripPlanPatch(prisma, travelerId, { destination: 'Peru' });

    const unchangedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(unchangedConversation.tripPlanId).toBeNull();
  });
});

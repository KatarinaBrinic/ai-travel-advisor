import { Router } from 'express';
import { prisma } from '../db.ts';
import { applyTripPlanPatch, getTripPlanOrDefault } from '../services/tripPlanService.ts';

export const tripPlanRouter = Router();

tripPlanRouter.get('/', async (req, res, next) => {
  try {
    const plan = await getTripPlanOrDefault(prisma, req.travelerId);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

tripPlanRouter.patch('/', async (req, res, next) => {
  try {
    const plan = await applyTripPlanPatch(prisma, req.travelerId, req.body);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

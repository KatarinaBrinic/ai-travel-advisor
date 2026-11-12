import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.ts';

const COOKIE_NAME = 'travelerId';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      travelerId: string;
    }
  }
}

/**
 * Anonymous identity, not an account: creates a Traveler on first visit and
 * re-identifies it via an httpOnly cookie on every later request. There is
 * no login, password, or user-visible concept of this at all.
 */
export async function travelerCookie(req: Request, res: Response, next: NextFunction) {
  try {
    const existingId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (existingId) {
      const traveler = await prisma.traveler.findUnique({ where: { id: existingId } });
      if (traveler) {
        req.travelerId = traveler.id;
        next();
        return;
      }
    }

    const traveler = await prisma.traveler.create({ data: {} });
    res.cookie(COOKIE_NAME, traveler.id, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });
    req.travelerId = traveler.id;
    next();
  } catch (err) {
    next(err);
  }
}

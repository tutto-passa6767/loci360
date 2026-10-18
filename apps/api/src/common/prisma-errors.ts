import { Prisma } from '@loci/db';
import { AppError } from './errors';

/** Runs a write and turns Prisma constraint errors into API errors the CMS can show next to the field */
export async function guardWrite<T>(fn: () => Promise<T>, what = 'Record'): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const fields = (e.meta?.target as string[] | undefined) ?? [];
        throw new AppError(409, fields.includes('slug') ? 'SLUG_TAKEN' : 'ALREADY_EXISTS', `${what} with this value already exists`, { fields });
      }
      if (e.code === 'P2025') throw new AppError(404, 'NOT_FOUND', `${what} not found`);
      if (e.code === 'P2003') throw new AppError(400, 'BAD_REFERENCE', 'Linked record does not exist', { field: e.meta?.field_name });
    }
    throw e;
  }
}

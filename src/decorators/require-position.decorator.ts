import { SetMetadata } from '@nestjs/common';

export const POSITION_KEY = 'requiredPositions';

/**
 * Restrict a route to specific admin positions.
 * Usage: @RequirePosition('SUPER_ADMIN', 'ADMIN')
 */
export const RequirePosition = (...positions: string[]) =>
  SetMetadata(POSITION_KEY, positions);

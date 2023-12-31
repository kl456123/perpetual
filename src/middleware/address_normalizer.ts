// tslint:disable-next-line:no-implicit-dependencies
import { Context, Next } from 'koa';

import { objectETHAddressNormalizer } from '../utils';

/**
 * Searches for query param values that match the ETH address format, and transforms them to lowercase
 */
export async function addressNormalizer(ctx: Context, next: Next) {
  const normalizedQuery = objectETHAddressNormalizer(ctx.query);
  ctx.query = normalizedQuery;

  await next();
}

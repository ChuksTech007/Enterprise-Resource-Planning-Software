import { NextResponse } from 'next/server';
import { dbConnect } from './db.js';
import { getCurrentUser } from './auth.js';

// Defined in errors.js (framework-free) and re-exported so every route can
// keep importing them from one place.
import { ApiError } from './errors.js';
export { ApiError, bad, notFound, forbidden } from './errors.js';

export function ok(data, init) {
  return NextResponse.json(data ?? { ok: true }, init);
}

/**
 * Wraps a route handler with: db connection, session lookup, role check,
 * and uniform error shaping. Every API file in this app uses it.
 *
 *   export const POST = route(async ({ body, user }) => { ... }, { role: 'owner' });
 *
 * `role: 'owner'`  -> owners only
 * `role: 'any'`    -> any signed-in user (default)
 * `role: 'public'` -> no session required
 */
export function route(handler, { role = 'any' } = {}) {
  return async (req, ctx) => {
    try {
      await dbConnect();

      let user = null;
      if (role !== 'public') {
        user = await getCurrentUser();
        if (!user) throw new ApiError(401, 'Please sign in again');
        if (role === 'owner' && user.role !== 'owner') throw forbidden();
      }

      const params = ctx?.params ? await ctx.params : {};
      const url = new URL(req.url);

      // Parse a JSON body for methods that carry one. DELETE is included
      // because cancelling an invoice sends a reason with it.
      let body = {};
      if (req.method !== 'GET') {
        try {
          body = await req.json();
        } catch {
          body = {};
        }
      }

      const result = await handler({
        req,
        user,
        params,
        body,
        url,
        query: Object.fromEntries(url.searchParams),
      });

      // Handlers may return a Response directly (CSV downloads do this).
      if (result instanceof Response) return result;
      return ok(result);
    } catch (err) {
      const status = err?.status || 500;

      // Duplicate key -> a friendly message instead of a Mongo stack trace.
      if (err?.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || 'value';
        return NextResponse.json(
          { error: `That ${field} is already in use.`, field },
          { status: 409 }
        );
      }

      if (err?.name === 'ValidationError') {
        const first = Object.values(err.errors || {})[0];
        return NextResponse.json({ error: first?.message || 'Invalid data' }, { status: 400 });
      }

      if (status >= 500) console.error('[api]', req.method, req.url, err);

      return NextResponse.json(
        { error: status >= 500 ? 'Something went wrong on the server' : err.message },
        { status }
      );
    }
  };
}

// Re-exported so every route can keep importing it from one place.
export { scrubCosts } from './rbac.js';

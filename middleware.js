import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = 'pp_session';

async function isValid(token) {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const valid = await isValid(req.cookies.get(COOKIE)?.value);

  if (pathname === '/login') {
    // Already signed in? Skip the login screen.
    return valid ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }

  if (!valid) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // API routes are deliberately excluded — they answer with 401 JSON so the
  // offline queue can tell "signed out" apart from "no network", instead of
  // being handed an HTML redirect it cannot parse.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons).*)'],
};

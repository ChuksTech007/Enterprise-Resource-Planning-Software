import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { dbConnect } from './db.js';
import { User } from './models.js';

export const SESSION_COOKIE = 'pp_session';
const MAX_AGE = 60 * 60 * 12; // 12 hours — roughly one trading day

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short. Set it in .env.local (see .env.example).');
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function signSession(user) {
  return new SignJWT({
    uid: String(user._id),
    name: user.name,
    role: user.role,
    username: user.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

/** Verify a raw token. Used by both the API and the edge middleware. */
export async function readToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** The signed session payload, or null. Does not hit the database. */
export async function getSession() {
  const jar = await cookies();
  return readToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * The live user document. Hits the database so a deactivated account
 * stops working immediately rather than when its token expires.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.uid) return null;
  await dbConnect();
  const user = await User.findById(session.uid).lean();
  if (!user || !user.active) return null;
  return { ...user, _id: String(user._id) };
}

export function isOwner(user) {
  return user?.role === 'owner';
}

import mongoose from 'mongoose';

export class DbConnectionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DbConnectionError';
    this.cause = cause;
  }
}

// Next.js hot-reloads modules in dev, which would otherwise open a new
// connection pool on every save. Cache the connection on globalThis.
let cached = globalThis._mongooseCache;
if (!cached) cached = globalThis._mongooseCache = { conn: null, promise: null };

function createDbConnectionError(err) {
  const detail = err?.message || 'Unknown MongoDB connection error';
  return new DbConnectionError(
    `Could not connect to MongoDB Atlas. Check that your Atlas cluster allows connections from this IP address and that MONGODB_URI is correct. Original error: ${detail}`,
    err
  );
}

export async function dbConnect() {
  if (cached.conn) return cached.conn;

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local and paste your MongoDB Atlas connection string.'
    );
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', true);

    // On a serverless host (Vercel) each concurrent invocation is its own
    // process with its own pool. A generous pool per instance multiplied by
    // many instances will exhaust the Atlas free tier's 500-connection limit,
    // and the symptom is intermittent "connection closed" errors that are
    // miserable to diagnose. One long-running server is the opposite case and
    // wants a real pool.
    const serverless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
      maxPoolSize: serverless ? 5 : 10,
      minPoolSize: 0,
      // Free-tier clusters idle down; give a cold instance room to reach one.
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw createDbConnectionError(err);
  }
}

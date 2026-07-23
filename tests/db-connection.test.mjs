import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { dbConnect } from '../lib/db.js';

function resetCache() {
  globalThis._mongooseCache = { conn: null, promise: null };
}

test('dbConnect surfaces a friendly error when MongoDB is unreachable', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
  resetCache();

  const originalConnect = mongoose.connect;
  mongoose.connect = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      name: 'MongooseServerSelectionError',
    });
  };

  try {
    await assert.rejects(
      () => dbConnect(),
      (err) => {
        assert.equal(err.name, 'DbConnectionError');
        assert.match(err.message, /MongoDB Atlas/i);
        return true;
      }
    );
  } finally {
    mongoose.connect = originalConnect;
    resetCache();
  }
});

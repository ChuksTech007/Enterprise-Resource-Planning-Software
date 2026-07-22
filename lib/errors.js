/**
 * Error types shared by the API layer and the business logic.
 *
 * Kept free of any framework import so that the money rules in invoicing.js
 * can be exercised directly against a database in tests, without booting the
 * web server.
 */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new ApiError(400, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const forbidden = (msg = 'You do not have permission to do that') => new ApiError(403, msg);

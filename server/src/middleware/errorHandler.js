/** Throw this anywhere in a route/service to produce a specific status+code+message. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, code: err.code, details: err.details });
  }

  if (err?.name === 'ValidationError') {
    // Mongoose validation error
    return res.status(400).json({ message: err.message, code: 'VALIDATION_ERROR', details: err.errors });
  }

  if (err?.code === 11000) {
    return res.status(409).json({ message: 'Duplicate value', code: 'DUPLICATE', details: err.keyValue });
  }

  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({
    message: status === 500 ? 'Internal server error' : err.message || 'Error',
    code: err?.code || 'INTERNAL_ERROR',
  });
}

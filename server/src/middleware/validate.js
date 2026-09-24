import { ZodError } from 'zod';

/**
 * Usage: router.post('/', validate({ body: signupSchema }), handler)
 * Validates/parses `req.body`, `req.query`, `req.params` against the given zod schemas and
 * replaces each with the *parsed* value (so defaults/coercions from the schema take effect).
 */
export function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: err.flatten(),
        });
      }
      next(err);
    }
  };
}

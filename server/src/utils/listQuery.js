/**
 * Filters that take several values: `?memberId=a,b` (only these) and `?memberIdNot=c` (all but
 * these). A single value still works, so older links and clients keep working.
 */
import { z } from 'zod';

const MAX_VALUES = 100;

/** Zod: "a,b,c" -> ['a', 'b', 'c'] (blanks dropped), each value checked by `item`. */
export const listOf = (item) =>
  z
    .string()
    .max(5000)
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(item).max(MAX_VALUES));

/**
 * A Mongo condition for one field from its include / exclude lists, or null when both are
 * empty. `map` turns each value into what the field stores (e.g. an ObjectId).
 * @example inNin(['a'], ['b']) // { $in: ['a'], $nin: ['b'] }
 */
export function inNin(include, exclude, map = (v) => v) {
  const cond = {};
  if (include?.length) cond.$in = include.map(map);
  if (exclude?.length) cond.$nin = exclude.map(map);
  return Object.keys(cond).length ? cond : null;
}

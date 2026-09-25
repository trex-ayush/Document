/**
 * Member-first navigation helpers (docs/DECISIONS.md "Member-first home").
 * `/people/:memberId` shows one member's documents; `/people/shared` shows documents with no
 * member (`memberId: null`), fetched with the API's `memberId=none` filter.
 */
export const SHARED_SLUG = 'shared';

export function personPath(member) {
  return member ? `/people/${member.id}` : `/people/${SHARED_SLUG}`;
}

/** Route param -> `GET /documents?memberId=` value (`none` for the Shared page). */
export function toApiMemberId(slug) {
  return slug === SHARED_SLUG ? 'none' : slug;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
export function isValidPersonSlug(slug) {
  return slug === SHARED_SLUG || OBJECT_ID.test(slug || '');
}

/**
 * Members in home-screen order: the signed-in person first, then everyone else as the API
 * returns them. Everyone is included (invited/disabled too) — a disabled login doesn't mean the
 * person's documents stop mattering.
 */
export function orderPeople(members = [], myMembershipId) {
  const me = members.find((m) => m.id === myMembershipId);
  const others = members.filter((m) => m.id !== myMembershipId);
  return me ? [me, ...others] : others;
}

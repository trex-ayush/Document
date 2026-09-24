/**
 * Shared Activity -> docs/API.md `Activity` shape mapping. Used by both this module's GET
 * /activity list and the stats module's `recentActivity`. Deliberately drops fields that aren't
 * in the documented shape (familyId, actorMembershipId, ipHash, userAgent) — ipHash/userAgent are
 * only ever surfaced via GET /shares/:id/access-log, which builds its own shape.
 */
export function serializeActivity(a) {
  return {
    id: String(a._id),
    actorName: a.actorName,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    documentId: a.documentId,
    folderId: a.folderId,
    shareId: a.shareId,
    meta: a.meta,
    createdAt: a.createdAt,
  };
}

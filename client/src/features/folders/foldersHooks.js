import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { foldersApi } from '@/services/foldersApi.js';

/**
 * TanStack Query hooks wrapping `foldersApi` (docs/API.md "Folders").
 * Additive per this agent's ownership (`client/src/features/folders/**`).
 */

export const foldersKeys = {
  tree: ['folders', 'tree'],
  browse: (folderId) => ['folders', 'browse', folderId || 'root'],
};

export function useFolderTree(options = {}) {
  return useQuery({
    queryKey: foldersKeys.tree,
    queryFn: () => foldersApi.tree(),
    staleTime: 15_000,
    ...options,
  });
}

export function useBrowse(folderId, options = {}) {
  return useQuery({
    queryKey: foldersKeys.browse(folderId),
    queryFn: () => foldersApi.browse(folderId && folderId !== 'root' ? folderId : undefined),
    // A 404 (folder moved to the Bin, stale link) or 400 (malformed id) won't fix itself — show
    // the "not here any more" state straight away instead of retrying.
    retry: (failureCount, error) => ![400, 401, 404].includes(error?.response?.status) && failureCount < 2,
    ...options,
  });
}

// Other screens keep their own folder-shaped caches (`['folders-tree']` in Settings > Document
// types, `['browse']` refreshed by the Bin) — refresh them too so a rename shows up everywhere.
function useInvalidateFolders() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['folders'] });
    qc.invalidateQueries({ queryKey: ['folders-tree'] });
    qc.invalidateQueries({ queryKey: ['browse'] });
  };
}

// Deleting a folder also moves every document/item inside it to the Bin, so anything listing
// those (search, person pages, dashboard stats, the Bin itself) is stale too.
function useInvalidateAfterFolderDelete() {
  const qc = useQueryClient();
  const invalidateFolders = useInvalidateFolders();
  return () => {
    invalidateFolders();
    ['documents', 'items', 'bin', 'stats'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };
}

export function useCreateFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: (payload) => foldersApi.create(payload),
    onSuccess: invalidate,
  });
}

/** Covers both rename and move (parentId change) — same PATCH endpoint. */
export function useUpdateFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: ({ id, ...payload }) => foldersApi.update(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteFolder() {
  const invalidate = useInvalidateAfterFolderDelete();
  return useMutation({
    mutationFn: ({ id, confirm }) => foldersApi.remove(id, { confirm }),
    onSuccess: (data) => {
      if (!data?.requiresConfirm) invalidate();
    },
  });
}

export function useFolderZip() {
  return useMutation({ mutationFn: (id) => foldersApi.zipLink(id) });
}

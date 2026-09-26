import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/services/documentsApi.js';

/** TanStack Query hooks wrapping `documentsApi`. */

export const documentsKeys = {
  list: (params) => ['documents', 'list', params],
  detail: (id) => ['documents', 'detail', id],
};

export function useDocument(id, options = {}) {
  return useQuery({
    queryKey: documentsKeys.detail(id),
    queryFn: () => documentsApi.get(id),
    enabled: Boolean(id),
    retry: (failureCount, error) => ![400, 401, 403, 404].includes(error?.response?.status) && failureCount < 2,
    ...options,
  });
}

const CONTENT_KEYS = ['documents', 'items', 'folders', 'browse', 'stats', 'search', 'bin'];

/**
 * Refreshes everything that shows documents/items or counts: lists, folders/browse, home counts,
 * search, Bin. `skipKey` (e.g. a just-deleted thing's detail query) is left alone so the open
 * page doesn't refetch a 404 while it navigates away.
 */
export function useInvalidateContent() {
  const qc = useQueryClient();
  return (skipKey) => {
    const skip = skipKey ? JSON.stringify(skipKey) : null;
    CONTENT_KEYS.forEach((key) =>
      qc.invalidateQueries({ queryKey: [key], predicate: (q) => !skip || JSON.stringify(q.queryKey) !== skip }),
    );
  };
}

export function useCreateDocument() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (args) => documentsApi.create(args.payload, { onUploadProgress: args.onUploadProgress }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateDocument(id) {
  const qc = useQueryClient();
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (payload) => documentsApi.update(id, payload),
    onSuccess: (doc) => {
      if (doc?.id) qc.setQueryData(documentsKeys.detail(id), (prev) => ({ ...prev, ...doc }));
      invalidate();
    },
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (id) => documentsApi.remove(id),
    onSuccess: (_res, id) => invalidate(documentsKeys.detail(id)),
  });
}

export function useAddFiles(id) {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (args) => documentsApi.addFiles(id, args.payload, { onUploadProgress: args.onUploadProgress }),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveFile(id) {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (fileId) => documentsApi.removeFile(id, fileId),
    onSuccess: () => invalidate(),
  });
}

export function useDocumentZip() {
  return useMutation({ mutationFn: ({ id, fileIds }) => documentsApi.zipLink(id, fileIds) });
}

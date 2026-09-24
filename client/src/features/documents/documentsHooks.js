import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/services/documentsApi.js';
import { documentTypesApi } from '@/services/documentTypesApi.js';
import { membersApi } from '@/services/membersApi.js';

/**
 * TanStack Query hooks wrapping `documentsApi`/`documentTypesApi`/`membersApi`
 * for this agent's pages (Browse, Document detail, Search, Upload).
 * Additive per ownership (`client/src/features/documents/**`).
 */

export const documentsKeys = {
  list: (params) => ['documents', 'list', params],
  detail: (id) => ['documents', 'detail', id],
  activity: (id) => ['documents', 'activity', id],
};

export function useDocumentsList(params, options = {}) {
  return useQuery({
    queryKey: documentsKeys.list(params),
    queryFn: () => documentsApi.list(params),
    ...options,
  });
}

export function useDocument(id, options = {}) {
  return useQuery({
    queryKey: documentsKeys.detail(id),
    queryFn: () => documentsApi.get(id),
    enabled: Boolean(id),
    ...options,
  });
}

export function useDocumentActivity(id, options = {}) {
  return useQuery({
    queryKey: documentsKeys.activity(id),
    queryFn: () => documentsApi.activity(id),
    enabled: Boolean(id),
    ...options,
  });
}

export function useDocumentTypes(options = {}) {
  return useQuery({
    queryKey: ['document-types'],
    queryFn: () => documentTypesApi.list(),
    staleTime: 60_000,
    ...options,
  });
}

export function useMembers(options = {}) {
  return useQuery({
    queryKey: ['members'],
    queryFn: () => membersApi.list(),
    staleTime: 60_000,
    ...options,
  });
}

function useInvalidateDocuments(id) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['folders'] });
    if (id) qc.invalidateQueries({ queryKey: documentsKeys.detail(id) });
  };
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (args) => documentsApi.create(args.payload, { onUploadProgress: args.onUploadProgress }),
    onSuccess: invalidate,
  });
}

export function useUpdateDocument(id) {
  const invalidate = useInvalidateDocuments(id);
  return useMutation({
    mutationFn: (payload) => documentsApi.update(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (id) => documentsApi.remove(id),
    onSuccess: invalidate,
  });
}

export function useAddFiles(id) {
  const invalidate = useInvalidateDocuments(id);
  return useMutation({
    mutationFn: (args) => documentsApi.addFiles(id, args.payload, { onUploadProgress: args.onUploadProgress }),
    onSuccess: invalidate,
  });
}

export function useReplaceFile(id) {
  const invalidate = useInvalidateDocuments(id);
  return useMutation({
    mutationFn: ({ fileId, file, onUploadProgress }) => documentsApi.replaceFile(id, fileId, file, { onUploadProgress }),
    onSuccess: invalidate,
  });
}

export function useUpdateFileMeta(id) {
  const invalidate = useInvalidateDocuments(id);
  return useMutation({
    mutationFn: ({ fileId, payload }) => documentsApi.updateFileMeta(id, fileId, payload),
    onSuccess: invalidate,
  });
}

export function useRemoveFile(id) {
  const invalidate = useInvalidateDocuments(id);
  return useMutation({
    mutationFn: (fileId) => documentsApi.removeFile(id, fileId),
    onSuccess: invalidate,
  });
}

export function useDocumentZip() {
  return useMutation({ mutationFn: ({ id, fileIds }) => documentsApi.zipLink(id, fileIds) });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { itemsApi } from '@/services/itemsApi.js';
import { useInvalidateContent } from '@/features/documents/documentsHooks.js';

/** TanStack Query hooks for passwords and notes (`itemsApi`). */

export const itemsKeys = {
  detail: (id) => ['items', 'detail', id],
};

export function useItem(id, options = {}) {
  return useQuery({
    queryKey: itemsKeys.detail(id),
    queryFn: () => itemsApi.get(id),
    enabled: Boolean(id),
    retry: (failureCount, error) => ![400, 401, 403, 404].includes(error?.response?.status) && failureCount < 2,
    ...options,
  });
}

export function useCreateItem() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (payload) => itemsApi.create(payload),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateItem(id) {
  const qc = useQueryClient();
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (payload) => itemsApi.update(id, payload),
    onSuccess: (item) => {
      if (item?.id) qc.setQueryData(itemsKeys.detail(id), (prev) => ({ ...prev, ...item }));
      invalidate(itemsKeys.detail(id));
    },
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateContent();
  return useMutation({
    mutationFn: (id) => itemsApi.remove(id),
    onSuccess: (_res, id) => invalidate(itemsKeys.detail(id)),
  });
}

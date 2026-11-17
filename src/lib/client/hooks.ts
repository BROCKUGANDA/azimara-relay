'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export function useApi<T>(key: unknown[], path: string, options?: { refetchInterval?: number; enabled?: boolean }) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path),
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
    retry: 1,
  })
}

export { api }

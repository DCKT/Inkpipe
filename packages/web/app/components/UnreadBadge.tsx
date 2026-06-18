import { useQuery } from "@tanstack/react-query"
import { api } from "../hooks/useApiClient"

export function UnreadBadge() {
  const unreadQuery = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get("watches/unread-count").json<{ count: number }>(),
    refetchInterval: 30_000,
  })

  if (!unreadQuery.data || unreadQuery.data.count === 0) return null

  return (
    <span className="inline-flex items-center justify-center rounded-full bg-[var(--lagoon)] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 leading-none">
      {unreadQuery.data.count > 99 ? "99+" : unreadQuery.data.count}
    </span>
  )
}

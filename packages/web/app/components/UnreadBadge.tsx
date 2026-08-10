import { useQuery } from "@tanstack/react-query"
import { runApi } from "../lib/apiClient"

export function UnreadBadge() {
  const unreadQuery = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => runApi((client) => client.watches.unreadCount({})),
    refetchInterval: 30_000,
  })

  if (!unreadQuery.data || unreadQuery.data.count === 0) return null

  return (
    <span className="inline-flex items-center justify-center rounded-[2px] bg-accent font-mono text-on-accent text-[10px] font-bold min-w-[18px] h-[18px] px-1 leading-none rotate-3 shadow-sm">
      {unreadQuery.data.count > 99 ? "99+" : unreadQuery.data.count}
    </span>
  )
}

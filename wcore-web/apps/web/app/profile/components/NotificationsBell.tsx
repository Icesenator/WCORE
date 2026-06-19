"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getApiUrl, apiFetch } from "@/lib/api";
import { useWallet } from "@/components/ConnectButton";

const API_URL = getApiUrl();

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: unknown;
  createdAt: string;
}

export function NotificationsBell() {
  const { authStep } = useWallet();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActionAt = useRef(0);

  const isAuthenticated = authStep === "authenticated";
  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // Reset state when user signs out or auth drops
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [notifRes, countRes] = await Promise.all([
        apiFetch("/api/notifications"),
        apiFetch("/api/notifications/unread-count"),
      ]);
      const notifData = await notifRes.json() as { notifications?: NotificationItem[] };
      const countData = await countRes.json() as { count?: number };
      if (notifData.notifications && Date.now() - lastActionAt.current > 5000 && isAuthenticatedRef.current) setNotifications(notifData.notifications);
      if (typeof countData.count === "number" && Date.now() - lastActionAt.current > 5000 && isAuthenticatedRef.current) setUnreadCount(countData.count);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
    let interval: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        fetchNotifications();
      }, 60_000);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => { if (interval) clearInterval(interval); };
    }

    let stream: EventSource | undefined;
    let cancelled = false;
    const connectStream = async () => {
      try {
        const res = await apiFetch("/api/notifications/stream-token", {
          method: "POST",
        });
        const data = await res.json() as { token?: string };
        if (cancelled || !data.token) {
          startPolling();
          return;
        }
        stream = new EventSource(`${API_URL}/api/notifications/stream?token=${encodeURIComponent(data.token)}`);
        stream.addEventListener("snapshot", (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as { notifications?: NotificationItem[]; unreadCount?: number };
            if (payload.notifications && Date.now() - lastActionAt.current > 5000 && isAuthenticatedRef.current) setNotifications(payload.notifications);
            if (typeof payload.unreadCount === "number" && Date.now() - lastActionAt.current > 5000 && isAuthenticatedRef.current) setUnreadCount(payload.unreadCount);
          } catch { /* ignore malformed SSE */ }
        });
        stream.onerror = () => {
          stream?.close();
          startPolling();
        };
      } catch {
        startPolling();
      }
    };
    void connectStream();

    return () => {
      cancelled = true;
      stream?.close();
      if (interval) clearInterval(interval);
    };
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || !isAuthenticated) return;
      fetchNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const markAllRead = useCallback(async () => {
    if (!isAuthenticatedRef.current) return;
    lastActionAt.current = Date.now();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await apiFetch("/api/notifications/read-all", { method: "PUT" });
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      lastActionAt.current = 0;
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    if (!isAuthenticatedRef.current) return;
    lastActionAt.current = Date.now();
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch (err) {
      console.error("Failed to mark as read:", err);
      lastActionAt.current = 0;
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-lg border border-border bg-card p-2 text-fg hover:border-accent/50 transition"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Notifications</p>
            {unreadCount > 0 ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); markAllRead(); }} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 transition cursor-pointer" title="Mark all as read">
                {unreadCount} unread
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted">No notifications</div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-bg/50 ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-medium ${n.read ? "text-muted" : "text-fg"}`}>{n.title}</p>
                      {!n.read ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted leading-relaxed">{n.body}</p>
                    <p className="mt-1 text-[10px] text-muted/60">{new Date(n.createdAt).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

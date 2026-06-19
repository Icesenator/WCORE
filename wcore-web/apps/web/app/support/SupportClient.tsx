"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import { useWallet, ConnectButton } from "@/components/ConnectButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { PageSkeleton } from "@/components/PageSkeleton";

const PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

interface Ticket {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  response: string | null;
  createdAt: string;
  user: { address: string };
}

export function SupportClient() {
  const { address } = useWallet();
  const { t } = usePreferences();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("bug");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = address?.toLowerCase() === PLATFORM_OWNER;

  const loadTickets = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await apiFetch(`/api/tickets${params}`);
      const data = await res.json() as { tickets?: Ticket[] };
      if (data.tickets) setTickets(data.tickets);
    } catch (_e) { console.error("Failed to load tickets:", _e); /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: description.trim(), type }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTitle(""); setDescription("");
        loadTickets();
      }
    } catch (_e) { console.error("Failed to submit ticket:", _e); /* ignore */ }
    setSubmitting(false);
  };

  const handleUpdate = async (id: string) => {
    setUpdatingId(id);
    try {
      const res = await apiFetch(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: response ? "in_progress" : undefined, response: response || undefined }),
      });
      if (res.ok) {
        setResponse("");
        setExpanded(null);
        loadTickets();
      }
    } catch (_e) { console.error("Failed to update ticket:", _e); /* ignore */ }
    setUpdatingId(null);
  };

  if (!address) {
    return (
      <div className="py-12">
        <h1 className="text-2xl font-bold mb-4">Support</h1>
        <p className="text-muted mb-4">{t("connectProfile")}</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {!submitted ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">Create a ticket</h2>
            <div className="space-y-4">
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="bug">Bug report</option>
                <option value="feature">Feature request</option>
              </select>
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <textarea
                placeholder="Describe the issue or request..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent resize-y"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !description.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent/80 disabled:opacity-50 transition"
              >
                {submitting ? "Submitting..." : "Submit ticket"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-5 text-center">
            <p className="text-accent font-medium">Ticket submitted successfully!</p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-2 text-sm text-muted hover:text-fg"
            >
              Create another
            </button>
          </div>
        )}

        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-accent">{isAdmin ? "Admin — Tickets" : "My tickets"} ({tickets.length})</h2>
            {isAdmin ? (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none"
              >
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            ) : null}
          </div>
          {loading ? (
            <PageSkeleton lines={2} />
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted">No tickets.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map(ticket => (
                <div key={ticket.id} className="rounded border border-border/60 bg-bg/30 p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${ticket.type === "bug" ? "bg-red-900/30 text-red-300" : "bg-blue-900/30 text-blue-300"}`}>
                        {ticket.type}
                      </span>
                      <span className={`ml-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        ticket.status === "open" ? "bg-yellow-900/30 text-yellow-300" :
                        ticket.status === "in_progress" ? "bg-purple-900/30 text-purple-300" :
                        ticket.status === "resolved" ? "bg-green-900/30 text-green-300" :
                        "bg-border text-muted"
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                      className="text-xs text-accent hover:text-fg"
                    >
                      {expanded === ticket.id ? "Collapse" : "View"}
                    </button>
                  </div>
                  <p className="mt-1 text-sm font-medium">{ticket.title}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    {isAdmin ? `${ticket.user.address.slice(0, 10)}...` : new Date(ticket.createdAt).toLocaleString()}
                  </p>

                  {expanded === ticket.id ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-fg bg-bg/50 p-2 rounded">{ticket.description}</p>
                      {ticket.response ? (
                        <div className="border-l-2 border-accent pl-3">
                          <p className="text-xs text-muted mb-1">Response:</p>
                          <p className="text-sm">{ticket.response}</p>
                        </div>
                      ) : null}
                      {isAdmin ? <div className="flex gap-2">
                        <textarea
                          value={response}
                          onChange={e => setResponse(e.target.value)}
                          placeholder="Add a response..."
                          rows={2}
                          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none focus:border-accent resize-y"
                        />
                        <div className="flex flex-col gap-1">
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                apiFetch(`/api/tickets/${ticket.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: e.target.value }),
                                }).then(() => loadTickets());
                              }
                            }}
                            className="rounded border border-border bg-bg px-1 py-0.5 text-[10px] text-fg outline-none"
                          >
                            <option value="">Status...</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleUpdate(ticket.id)}
                            disabled={!response.trim() || updatingId === ticket.id}
                            className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/30 disabled:opacity-30 transition"
                          >
                            {updatingId === ticket.id ? "..." : "Reply"}
                          </button>
                        </div>
                      </div> : ticket.response ? null : (
                        <p className="text-xs text-muted">No platform response yet.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

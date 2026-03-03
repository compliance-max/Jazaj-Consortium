"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { getPusherClient } from "@/lib/realtime/pusher-client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type ConversationRow = {
  id: string;
  status: "OPEN" | "CLOSED";
  source: "GUEST" | "MEMBER";
  employerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  unreadForAdmin: number;
  employer: { id: string; legalName: string } | null;
  user: { id: string; email: string; fullName: string } | null;
};

type ChatMessage = {
  id: string;
  senderType: "GUEST" | "MEMBER" | "ADMIN";
  messageText: string;
  createdAt: string;
};

export default function AdminChatPage() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "OPEN" | "CLOSED">("OPEN");
  const [sourceFilter, setSourceFilter] = useState<"" | "GUEST" | "MEMBER">("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setStatusFilter((params.get("status") as "" | "OPEN" | "CLOSED") || "OPEN");
    setSourceFilter((params.get("source") as "" | "GUEST" | "MEMBER") || "");
  }, []);

  const activeConversation = useMemo(() => rows.find((row) => row.id === activeId) || null, [rows, activeId]);

  const loadList = useCallback(async ({ reset = true, cursor = null }: { reset?: boolean; cursor?: string | null } = {}) => {
    const cursorParam = !reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const statusParam = statusFilter ? `&status=${statusFilter}` : "";
    const sourceParam = sourceFilter ? `&source=${sourceFilter}` : "";
    const res = await fetch(`/api/admin/chat/list?limit=25${cursorParam}${statusParam}${sourceParam}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load conversations");
      return;
    }
    setRows((prev) => (reset ? payload.items || [] : [...prev, ...(payload.items || [])]));
    setNextCursor(payload.nextCursor || null);
  }, [statusFilter, sourceFilter]);

  const loadConversation = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/admin/chat/conversation/${conversationId}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load conversation");
      return;
    }
    setActiveId(conversationId);
    setMessages(payload.messages || []);
  }, []);

  useEffect(() => {
    void loadList({ reset: true });
  }, [loadList]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadList({ reset: true });
      if (activeId) void loadConversation(activeId);
    }, 12000);
    return () => clearInterval(timer);
  }, [activeId, loadConversation, loadList]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const adminChannel = pusher.subscribe("chat:admin");
    adminChannel.bind("conversation:update", () => {
      void loadList({ reset: true });
      if (activeId) void loadConversation(activeId);
    });

    let conversationChannelName: string | null = null;
    if (activeId) {
      conversationChannelName = `chat:conversation:${activeId}`;
      const conversationChannel = pusher.subscribe(conversationChannelName);
      conversationChannel.bind("message:new", (payload: { message?: ChatMessage }) => {
        const incoming = payload.message;
        if (incoming) {
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
        void loadList({ reset: true });
      });
    }

    return () => {
      adminChannel.unbind_all();
      pusher.unsubscribe("chat:admin");
      if (conversationChannelName) {
        const conversationChannel = pusher.channel(conversationChannelName);
        conversationChannel?.unbind_all();
        pusher.unsubscribe(conversationChannelName);
      }
    };
  }, [activeId, loadConversation, loadList]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeId || !messageText.trim()) return;
    const text = messageText.trim();
    setMessageText("");
    const res = await fetch("/api/chat/message", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        conversationId: activeId,
        messageText: text
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to send");
      setMessageText(text);
      return;
    }
    if (payload.message) {
      setMessages((prev) => [...prev, payload.message]);
    }
    await loadList({ reset: true });
  }

  async function closeConversation() {
    if (!activeId) return;
    const res = await fetch("/api/admin/chat/close", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        conversationId: activeId,
        status: "CLOSED"
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to close conversation");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === activeId ? { ...row, status: "CLOSED" } : row)));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Support Chat" subtitle="Real-time conversation handling for guests and member accounts." />

      {error ? (
        <Alert className="border-destructive/40">
          <AlertTitle>Chat error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "OPEN" | "CLOSED")}>
                <option value="">All statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </Select>
              <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as "" | "GUEST" | "MEMBER")}>
                <option value="">All sources</option>
                <option value="GUEST">GUEST</option>
                <option value="MEMBER">MEMBER</option>
              </Select>
            </div>

            {rows.length === 0 ? (
              <EmptyState title="No conversations" description="New chat threads will appear here." />
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void loadConversation(row.id)}
                    className={`w-full rounded-md border p-3 text-left ${activeId === row.id ? "border-primary" : "border-border"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge variant={row.source === "MEMBER" ? "default" : "secondary"}>{row.source}</Badge>
                      <StatusBadge value={row.status} />
                    </div>
                    <p className="text-sm font-medium">{row.employer?.legalName || row.guestName || "Guest"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(row.lastMessageAt).toLocaleString()}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.lastMessageText || "-"}</p>
                    <p className="mt-1 text-xs">Unread: {row.unreadForAdmin || 0}</p>
                  </button>
                ))}
              </div>
            )}

            {nextCursor ? (
              <Button variant="outline" onClick={() => void loadList({ reset: false, cursor: nextCursor })}>
                Load more
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeConversation ? (
              <EmptyState title="Select a conversation" description="Choose a thread from the left panel to start replying." />
            ) : (
              <>
                <div className="rounded-md border border-border p-3 text-sm">
                  <p><span className="text-muted-foreground">ID:</span> {activeConversation.id}</p>
                  <p><span className="text-muted-foreground">Source:</span> {activeConversation.source}</p>
                  <p><span className="text-muted-foreground">Employer:</span> {activeConversation.employer?.legalName || "-"}</p>
                  <p><span className="text-muted-foreground">Member:</span> {activeConversation.user?.email || "-"}</p>
                  <p><span className="text-muted-foreground">Guest:</span> {activeConversation.guestName || "-"}</p>
                  {activeConversation.status === "OPEN" ? (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void closeConversation()}>
                      Close Conversation
                    </Button>
                  ) : null}
                </div>

                <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
                  {messages.map((message) => (
                    <div key={message.id} className="rounded-md border border-border bg-card p-2 text-sm">
                      <p className="text-xs text-muted-foreground">{message.senderType} • {new Date(message.createdAt).toLocaleString()}</p>
                      <p>{message.messageText}</p>
                    </div>
                  ))}
                </div>

                <form className="flex gap-2" onSubmit={sendMessage}>
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    maxLength={2000}
                    placeholder="Reply to conversation"
                    disabled={activeConversation.status !== "OPEN"}
                  />
                  <Button type="submit" disabled={activeConversation.status !== "OPEN" || !messageText.trim()}>
                    Send
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getPusherClient } from "@/lib/realtime/pusher-client";
import { withCsrfHeaders } from "@/lib/client/csrf";

type Conversation = {
  id: string;
  status: "OPEN" | "CLOSED";
  source: "GUEST" | "MEMBER";
  updatedAt: string;
};

type Message = {
  id: string;
  senderType: "GUEST" | "MEMBER" | "ADMIN";
  messageText: string;
  createdAt: string;
};

type SessionUser = {
  user?: {
    id: string;
    role: string;
    employerId: string | null;
  };
} | null;

type ConversationPayload = {
  conversation: Conversation | null;
  hasGuestConversation?: boolean;
};

function groupLabel(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString();
}

export default function SupportChatWidget() {
  const pathname = usePathname();
  const hidden = useMemo(() => pathname.startsWith("/admin"), [pathname]);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [showMergePrompt, setShowMergePrompt] = useState(false);

  const isMember = Boolean(session?.user?.id && session?.user?.role === "EMPLOYER_DER" && session?.user?.employerId);

  useEffect(() => {
    async function loadSession() {
      const res = await fetch("/api/auth/session");
      const payload = await res.json().catch(() => null);
      setSession(payload);
    }
    void loadSession();
  }, []);

  const refreshConversation = useCallback(async () => {
    const res = await fetch("/api/chat/conversation");
    const payload = (await res.json().catch(() => ({}))) as ConversationPayload;
    if (!res.ok) return null;
    setConversation(payload.conversation || null);
    return payload;
  }, []);

  useEffect(() => {
    if (hidden) return;
    void refreshConversation();
  }, [hidden, isMember, refreshConversation]);

  useEffect(() => {
    if (hidden) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("support") !== "1") return;
    if (open) return;
    setOpen(true);
  }, [hidden, open, pathname]);

  const loadMessages = useCallback(async (conversationId: string, markRead = false) => {
    const res = await fetch(
      `/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}${markRead ? "&mark_read=1" : ""}`
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.error || "Failed to load messages");
      return;
    }
    setMessages(payload.messages || []);
    if (markRead) setUnread(0);
  }, []);

  const startMemberConversation = useCallback(async (mergeGuest: boolean) => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/chat/start", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        asGuest: false,
        mergeGuest
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Unable to start chat");
      return null;
    }
    setShowMergePrompt(false);
    const nextConversation = payload.conversation || null;
    setConversation(nextConversation);
    if (nextConversation) {
      await loadMessages(nextConversation.id, true);
    }
    return nextConversation;
  }, [loadMessages]);

  async function startGuestConversation(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/chat/start", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        asGuest: true,
        guestName: guestName || null,
        guestEmail: guestEmail || null
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload.error || "Unable to start chat");
      return;
    }
    const nextConversation = payload.conversation || null;
    setConversation(nextConversation);
    if (nextConversation) {
      await loadMessages(nextConversation.id, true);
    }
  }

  const conversationId = conversation?.id || null;

  useEffect(() => {
    if (!open || !conversationId) return;
    void loadMessages(conversationId, true);
    const timer = setInterval(() => {
      void loadMessages(conversationId, false);
    }, 12000);
    return () => clearInterval(timer);
  }, [open, conversationId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`chat:conversation:${conversationId}`);
    channel.bind("message:new", (payload: { message?: Message }) => {
      const incoming = payload.message;
      if (!incoming) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
      if (!open && incoming.senderType === "ADMIN") {
        setUnread((prev) => prev + 1);
      }
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`chat:conversation:${conversationId}`);
    };
  }, [conversationId, open]);

  useEffect(() => {
    if (!open) return;
    async function prepareOpenState() {
      const payload = await refreshConversation();
      if (!payload?.conversation && isMember) {
        if (payload?.hasGuestConversation) {
          setShowMergePrompt(true);
          return;
        }
        await startMemberConversation(false);
        return;
      }
      if (payload?.conversation) {
        await loadMessages(payload.conversation.id, true);
      }
    }
    void prepareOpenState();
  }, [open, isMember, loadMessages, refreshConversation, startMemberConversation]);

  async function onOpenToggle() {
    const next = !open;
    setOpen(next);
    if (!next) {
      setShowMergePrompt(false);
      setError("");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!conversation || !messageText.trim() || sending) return;
    const text = messageText.trim();
    setMessageText("");
    setSending(true);
    const res = await fetch("/api/chat/message", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        conversationId: conversation.id,
        messageText: text
      })
    });
    const payload = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(payload.error || "Failed to send message");
      setMessageText(text);
      return;
    }
    if (payload.message) {
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
    }
  }

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void onOpenToggle()}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center rounded-full border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
      >
        Support
        {unread > 0 ? <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs">{unread}</span> : null}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-[60] grid h-[72vh] w-[360px] grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border p-3">
            <strong>Support</strong>
            <div className="text-xs text-muted-foreground">
              {conversation ? `Conversation ${conversation.id.slice(0, 8)} (${conversation.status})` : "Start a conversation"}
            </div>
          </div>

          <div className="space-y-3 overflow-y-auto p-3">
            {error ? <p className="error">{error}</p> : null}

            {showMergePrompt && isMember ? (
              <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                <p>Continue your existing guest conversation as your account?</p>
                <button type="button" className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40" onClick={() => void startMemberConversation(true)} disabled={loading}>
                  Continue as account
                </button>
                <button type="button" className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40" onClick={() => void startMemberConversation(false)} disabled={loading}>
                  Start new conversation
                </button>
              </div>
            ) : null}

            {!conversation && !isMember ? (
              <form className="space-y-2" onSubmit={startGuestConversation}>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Name (optional)"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  type="email"
                  placeholder="Email (optional)"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
                <button type="submit" className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" disabled={loading}>
                  {loading ? "Starting..." : "Start Chat"}
                </button>
              </form>
            ) : null}

            {conversation && messages.length === 0 ? <p>No messages yet.</p> : null}
            {conversation && messages.length > 0 ? (
              <div className="space-y-2">
                {messages.map((message, idx) => {
                  const previous = messages[idx - 1];
                  const showDay = !previous || groupLabel(previous.createdAt) !== groupLabel(message.createdAt);
                  return (
                    <div key={message.id}>
                      {showDay ? <p className="text-[11px] text-muted-foreground">{groupLabel(message.createdAt)}</p> : null}
                      <div
                        className={`inline-block rounded-md px-2 py-2 text-sm ${
                          message.senderType === "ADMIN" ? "bg-primary/15" : "bg-muted"
                        }`}
                      >
                        <div className="text-[11px] text-muted-foreground">{message.senderType}</div>
                        <div>{message.messageText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <form onSubmit={sendMessage} className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={2000}
                placeholder="Type your message"
                disabled={!conversation || conversation.status !== "OPEN" || sending}
              />
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                disabled={!conversation || conversation.status !== "OPEN" || !messageText.trim() || sending}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

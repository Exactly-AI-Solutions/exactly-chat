"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasScheduleToken,
  stripScheduleToken,
  stripScheduleTokenForDisplay,
} from "@/lib/scheduler";

type Msg = { role: "user" | "assistant"; content: string };

export default function DemoPage() {
  const [apiKey, setApiKey] = useState("");
  const [clientName, setClientName] = useState("Exactly Chat");
  const [openingBubbles, setOpeningBubbles] = useState<string[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem("ec_demo_key") ?? "");
    setConversationId(localStorage.getItem("ec_demo_conversation"));
  }, []);
  useEffect(() => {
    localStorage.setItem("ec_demo_key", apiKey);
  }, [apiKey]);
  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  // Fetch the client's opening (bubbles + chips) once a full key is present.
  useEffect(() => {
    if (!apiKey.startsWith("eck_") || apiKey.length < 20) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/config", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return;
        const cfg = await res.json();
        if (cancelled) return;
        setClientName(cfg.name ?? "Exactly Chat");
        setOpeningBubbles(Array.isArray(cfg.openingBubbles) ? cfg.openingBubbles : []);
        setChips(Array.isArray(cfg.chips) ? cfg.chips : []);
      } catch {
        /* ignore — opening is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const send = useCallback(
    async (textArg?: string) => {
      const text = (textArg ?? input).trim();
      if (!text || busy) return;
      setError(null);
      setInput("");
      setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
      setBusy(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ message: text, conversationId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(`${res.status}: ${body.error ?? "request failed"}`);
        }
        const convId = res.headers.get("x-conversation-id");
        if (convId) {
          setConversationId(convId);
          localStorage.setItem("ec_demo_conversation", convId);
        }
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: copy[copy.length - 1].content + chunk,
              };
              return copy;
            });
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setMessages((m) => m.slice(0, -1));
      } finally {
        setBusy(false);
      }
    },
    [apiKey, busy, conversationId, input],
  );

  function resetConversation() {
    setConversationId(null);
    setMessages([]);
    localStorage.removeItem("ec_demo_conversation");
  }

  const fresh = messages.length === 0;

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.3rem" }}>{clientName}</h1>

      <div style={{ display: "flex", gap: 8, margin: "1rem 0" }}>
        <input
          type="password"
          placeholder="API key (eck_...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button onClick={resetConversation} style={btnStyle}>
          New conversation
        </button>
      </div>

      <div
        ref={listRef}
        style={{
          border: "1px solid #e2e2e2",
          borderRadius: 8,
          height: 460,
          overflowY: "auto",
          padding: 12,
          background: "#fafafa",
        }}
      >
        {/* Opening bubbles + chips shown only at the start of a conversation */}
        {fresh &&
          openingBubbles.map((b, i) => (
            <div key={`o${i}`} style={{ margin: "8px 0", textAlign: "left" }}>
              <span style={bubbleStyle(false)}>{b}</span>
            </div>
          ))}
        {fresh && openingBubbles.length === 0 && (
          <p style={{ color: "#888" }}>Enter your API key, then ask a question.</p>
        )}
        {fresh && chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {chips.map((c, i) => (
              <button
                key={`c${i}`}
                onClick={() => send(c)}
                disabled={busy || !apiKey}
                style={{
                  ...chipStyle,
                  // "Questions about HFA"-style outlier: visually separated last chip
                  marginLeft: i === chips.length - 1 && chips.length > 2 ? "auto" : 0,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} style={{ margin: "8px 0", textAlign: "right" }}>
                <span style={bubbleStyle(true)}>{m.content || "…"}</span>
              </div>
            );
          }
          // Assistant: strip the booking cue from the shown text. The last
          // message may still be streaming, so buffer a partial token too.
          const streaming = busy && i === messages.length - 1;
          const shown = streaming
            ? stripScheduleTokenForDisplay(m.content)
            : stripScheduleToken(m.content);
          const scheduling = hasScheduleToken(m.content);
          return (
            <div key={i} style={{ margin: "8px 0", textAlign: "left" }}>
              <span style={bubbleStyle(false)}>{shown || "…"}</span>
              {scheduling && (
                <div style={schedulerCueStyle}>
                  📅 Booking intent — the scheduler embed renders here on the client site.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "#c00", marginTop: 8 }}>Error — {error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
          style={{ flex: 1, padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button onClick={() => send()} disabled={busy || !apiKey} style={btnStyle}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}

function bubbleStyle(user: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 12,
    background: user ? "#2563eb" : "#fff",
    color: user ? "#fff" : "#111",
    border: user ? "none" : "1px solid #e2e2e2",
    whiteSpace: "pre-wrap",
    maxWidth: "85%",
  };
}

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

const schedulerCueStyle: React.CSSProperties = {
  display: "block",
  marginTop: 8,
  maxWidth: "85%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px dashed #2563eb",
  background: "#eff4ff",
  color: "#2563eb",
  fontSize: "0.85rem",
};

const chipStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #2563eb",
  borderRadius: 999,
  background: "#fff",
  color: "#2563eb",
  cursor: "pointer",
  fontSize: "0.9rem",
};

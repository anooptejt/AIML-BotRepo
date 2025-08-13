"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import { useSession, signIn, signOut } from "next-auth/react";

type IngestItem = { name: string; summary: string };

type Match = { id?: string; score?: number; metadata?: { filename?: string; chunk?: number } };

function Mermaid({ code }: { code: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let mounted = true;
    mermaid.initialize({ startOnLoad: false });
    const id = "mmd-" + Math.random().toString(36).slice(2);
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (mounted) setHtml(svg);
      })
      .catch(() => setHtml("<em>Failed to render diagram</em>"));
    return () => {
      mounted = false;
    };
  }, [code]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [tokens, setTokens] = useState<{ input: number; output: number; total: number } | null>(null);
  const [ingestResult, setIngestResult] = useState<string>("");
  const [sources, setSources] = useState<Match[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  async function doLogin() {
    setLoginError(null);
    const res = await signIn("credentials", { username, password, redirect: false });
    if (res?.error) setLoginError("Invalid credentials");
  }

  function wantsDiagram(text: string): boolean {
    const t = text.toLowerCase();
    return ["diagram", "mermaid", "flowchart", "sequence diagram"].some((k) => t.includes(k));
  }

  async function send() {
    if (!message.trim()) return;
    setAnswer("");
    setSources([]);

    // If the user asks for a diagram, call the diagram endpoint.
    if (wantsDiagram(message)) {
      const res = await fetch("/api/diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: message }) });
      const data = await res.json();
      setAnswer(data.output || "");
      setTokens(null);
      return;
    }

    // Default path: vector search with Gemini answer and citations
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: message, topK: 5, answer: true }) });
      const data = await res.json();
      if (data?.answer) {
        setAnswer(data.answer);
        setSources((data.matches || []) as Match[]);
        setTokens(null);
        return;
      }
    } catch {}

    // Fallback to plain chat endpoint
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await res.json();
    setAnswer(data.output || "");
    setTokens(data.tokens || null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/ingest", { method: "POST", body: fd });
    const data = await res.json();
    const items: IngestItem[] = (data.results || []) as IngestItem[];
    const summaries = items.map((r) => `- ${r.name}\n\n${r.summary}`).join("\n\n");
    setIngestResult(summaries);
    // Reset file input so the same files can be re-uploaded later if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const { md, mermaidBlocks } = useMemo(() => {
    const blocks: string[] = [];
    const transformed = (answer || "").replace(/```mermaid([\s\S]*?)```/g, (_m, g1) => {
      blocks.push(g1.trim());
      return "\n[Mermaid Diagram]\n";
    });
    return { md: transformed, mermaidBlocks: blocks };
  }, [answer]);

  if (status === "loading") return <main className="p-6">Loading...</main>;
  if (!session) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="mb-4 text-gray-600">Use the configured demo credentials.</p>
        <form className="flex flex-col gap-2 w-full" onSubmit={(e) => { e.preventDefault(); doLogin(); }}>
          <input className="border rounded px-3 py-2" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {loginError && <div className="text-red-600 text-sm">{loginError}</div>}
          <button type="submit" className="bg-black text-white px-4 py-2 rounded">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">ShipSense</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>{session.user?.email || session.user?.name}</span>
          <button className="underline" onClick={() => signOut({ callbackUrl: "/chat" })}>Sign out</button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <input ref={fileInputRef} type="file" multiple accept=".sh,.tf,.yaml,.yml,.groovy" onChange={onUpload} className="hidden" />
        <button
          className="border rounded px-3 py-2"
          type="button"
          aria-label="Attach files"
          title="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          📎 Attach
        </button>
      </div>

      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder={"Ask a DevOps question or request a diagram (e.g., 'Create a Jenkins pipeline diagram')"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          Send
        </button>
      </form>

      {tokens && (
        <div className="text-sm text-gray-600 mb-2">Tokens: in {tokens.input} / out {tokens.output} / total {tokens.total}</div>
      )}

      <article className="prose">
        <ReactMarkdown>{md}</ReactMarkdown>
      </article>
      {mermaidBlocks.map((code, i) => (
        <div key={i} className="my-4 border rounded p-3 overflow-x-auto">
          <Mermaid code={code} />
        </div>
      ))}

      {sources.length > 0 && (
        <section className="my-6">
          <h2 className="text-lg font-semibold mb-2">Sources</h2>
          <ul className="text-sm list-disc pl-5">
            {sources.map((m, i) => (
              <li key={i}>{m.metadata?.filename} (chunk {m.metadata?.chunk}) — score {m.score?.toFixed(3)}</li>
            ))}
          </ul>
        </section>
      )}

      {ingestResult && (
        <section className="my-6">
          <h2 className="text-lg font-semibold mb-2">Ingest summaries</h2>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">{ingestResult}</pre>
        </section>
      )}
    </main>
  );
}

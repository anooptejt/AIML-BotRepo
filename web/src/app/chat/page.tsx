"use client";
import { useEffect, useMemo, useState } from "react";
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
  const [diagramMode, setDiagramMode] = useState(false);
  const [useVector, setUseVector] = useState(false);
  const [ingestResult, setIngestResult] = useState<string>("");
  const [sources, setSources] = useState<Match[]>([]);

  // Local login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  async function doLogin() {
    setLoginError(null);
    const res = await signIn("credentials", { username, password, redirect: false });
    if (res?.error) setLoginError("Invalid credentials");
  }

  async function send() {
    if (!message.trim()) return;
    setAnswer("");
    setSources([]);
    if (diagramMode) {
      const res = await fetch("/api/diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: message }) });
      const data = await res.json();
      setAnswer(data.output || "");
      setTokens(null);
      return;
    }
    if (useVector) {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: message, topK: 5, answer: true }) });
      const data = await res.json();
      setAnswer(data.answer || "");
      setSources((data.matches || []) as Match[]);
      setTokens(null);
      return;
    }
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
        <h1 className="text-2xl font-semibold">DevOps Chat</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>{session.user?.email || session.user?.name}</span>
          <button className="underline" onClick={() => signOut({ callbackUrl: "/chat" })}>Sign out</button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={diagramMode} onChange={(e) => setDiagramMode(e.target.checked)} />
          Diagram mode (Mermaid)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useVector} onChange={(e) => setUseVector(e.target.checked)} />
          Use Vector DB
        </label>
        <input type="file" multiple accept=".sh,.tf,.yaml,.yml,.groovy" onChange={onUpload} />
      </div>

      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder={diagramMode ? "Describe a DevOps diagram (e.g., Jenkins pipeline)" : useVector ? "Search your ingested code..." : "Ask about Jenkins/Terraform/Argo..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          {diagramMode ? "Generate Diagram" : useVector ? "Search" : "Send"}
        </button>
      </form>

      {tokens && !diagramMode && !useVector && (
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

      {useVector && sources.length > 0 && (
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

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { useSession, signIn, signOut } from "next-auth/react";
import type { HTMLAttributes } from "react";

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

function getLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  const m = className.match(/language-([^\s]+)/);
  return m?.[1];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function preprocessAnswer(raw: string): string {
  let text = raw;
  // Wrap YAML blocks starting with apiVersion:
  text = text.replace(/(^|\n)(apiVersion:[\s\S]*?)(?:\n\s*\n|$)/g, (_m, p1, block) => {
    return p1 + "\n\n" + "```yaml\n" + block.trim() + "\n```\n\n";
  });
  // Wrap JSON blocks that look like pretty JSON objects
  text = text.replace(/(^|\n)\{[\s\S]*?\}\s*(?=\n|$)/g, (m) => {
    return "\n\n" + "```json\n" + m.trim() + "\n```\n\n";
  });
  // Auto-wrap raw Mermaid diagrams if not fenced
  if (!/```mermaid/.test(text)) {
    const mermaidMatch = text.match(/(^|\n)(?:%%\{[\s\S]*?\}%%\s*)?(graph\b|flowchart\b|sequenceDiagram\b|classDiagram\b|stateDiagram\b|gantt\b)[\s\S]*/);
    if (mermaidMatch) {
      const startIdx = mermaidMatch.index ?? 0;
      const tail = text.slice(startIdx);
      const endBreak = tail.search(/\n\s*\n/);
      const diagram = (endBreak === -1 ? tail : tail.slice(0, endBreak)).trim();
      const fenced = "\n\n" + "```mermaid\n" + diagram + "\n```\n\n";
      text = text.slice(0, startIdx) + fenced + (endBreak === -1 ? "" : tail.slice(endBreak));
    }
  }
  // Wrap consecutive CLI lines (kubectl, argocd, helm, docker, git, terraform, ansible)
  const lines = text.split(/\n/);
  const out: string[] = [];
  let buffer: string[] = [];
  const isCli = (s: string) => /^(kubectl|argocd|helm|docker|git|terraform|ansible(?:-playbook)?|kustomize)\b/.test(s.trim());
  const flush = () => {
    if (buffer.length) {
      out.push("\n```bash\n" + buffer.join("\n") + "\n```\n");
      buffer = [];
    }
  };
  for (const l of lines) {
    if (isCli(l)) buffer.push(l);
    else {
      flush();
      out.push(l);
    }
  }
  flush();
  return out.join("\n");
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [tokens, setTokens] = useState<{ input: number; output: number; total: number } | null>(null);
  const [ingestResult, setIngestResult] = useState<string>("");
  const [sources, setSources] = useState<Match[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // One-time silent bootstrap of built-in sources per browser
  useEffect(() => {
    const key = "shipsense_bootstrapped_v1";
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      fetch("/api/bootstrap", { method: "POST" }).finally(() => {
        try { localStorage.setItem(key, "1"); } catch {}
      });
    }
  }, []);

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
    const formatted = preprocessAnswer(answer || "");
    const transformed = formatted.replace(/```mermaid([\s\S]*?)```/g, (_m, g1) => {
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
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
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

      {answer && <h2 className="text-lg font-semibold mb-2">Answer</h2>}
      <article className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode } & HTMLAttributes<HTMLElement>) {
              const text = String(children ?? "");
              const isShort = text.trim().split("\n").length === 1 && text.trim().length <= 50;
              if (inline || isShort) {
                return <code className="bg-gray-100 rounded px-1 py-0.5" {...props}>{text}</code>;
              }
              const lang = getLanguage(className) || "text";
              return (
                <div className="rounded border border-gray-200 overflow-hidden mb-4">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 border-b border-gray-200 text-xs text-gray-600">
                    <span>{lang}</span>
                    <CopyButton text={text} />
                  </div>
                  <pre className="bg-white text-gray-900 text-sm p-3 overflow-x-auto"><code className={className} {...props}>{text}</code></pre>
                </div>
              );
            },
          }}
        >
          {md}
        </ReactMarkdown>
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

      <section className="my-8">
        <h2 className="text-lg font-semibold mb-2">Crawl URLs (docs)</h2>
        <UrlCrawler />
      </section>

      <section className="my-8">
        <h2 className="text-lg font-semibold mb-2">Ingest GitHub Repo</h2>
        <GitHubIngest />
      </section>
    </main>
  );
}

function UrlCrawler() {
  const [urls, setUrls] = useState("");
  const [status, setStatus] = useState<string>("");

  async function submit() {
    const list = urls
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setStatus("Crawling...");
    const res = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list }),
    });
    const data = await res.json();
    setStatus(`Crawled: ${data.totalChunks || 0} chunks`);
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <textarea
        className="w-full border rounded p-2 text-sm"
        rows={3}
        placeholder="Paste documentation URLs (comma or newline separated)"
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button className="bg-black text-white px-3 py-1 rounded" type="button" onClick={submit}>
          Crawl & Index
        </button>
        <span className="text-sm text-gray-600">{status}</span>
      </div>
    </div>
  );
}

function GitHubIngest() {
  const [repo, setRepo] = useState("argoproj/argo-rollouts");
  const [ref, setRef] = useState("HEAD");
  const [status, setStatus] = useState<string>("");

  async function submit() {
    setStatus("Ingesting repo...");
    const res = await fetch("/api/github-ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, ref, maxFiles: 400 }),
    });
    const data = await res.json();
    setStatus(`Processed ${data.filesProcessed || 0} / ${data.totalFiles || 0} files`);
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <p className="text-sm text-gray-600">
        Note: Core repos (Jenkins, Argo*, Terraform, Ansible) are included in Index Built-ins. Ingesting a
        repo here will index its source files (md/yaml/tf/sh/code, &lt;1MB) to power code-aware troubleshooting
        and recommendations.
      </p>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 flex-1" placeholder="owner/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        <input className="border rounded px-2 py-1 w-40" placeholder="ref (e.g., v1.0, HEAD)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <button className="bg-black text-white px-3 py-1 rounded" type="button" onClick={submit}>Ingest</button>
      </div>
      <span className="text-sm text-gray-600">{status}</span>
    </div>
  );
}

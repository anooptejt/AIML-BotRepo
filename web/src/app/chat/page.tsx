"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { useSession, signIn, signOut } from "next-auth/react";
import type { HTMLAttributes } from "react";

type IngestItem = { name: string; summary: string };

type Match = { id?: string; score?: number; metadata?: { filename?: string; chunk?: number } };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; pending?: boolean };
type Conversation = { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[] };

function Mermaid({ code }: { code: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let mounted = true;
    mermaid.initialize({ startOnLoad: false });
    const id = "mmd-" + Math.random().toString(36).slice(2);
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (mounted) {
          setHtml(svg);
          try { setTimeout(() => window.dispatchEvent(new Event("shipsense-mmd-rendered")), 0); } catch {}
        }
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
  // Removed unused state: tokens, ingestResult, sources, validationStatus
  const [activeTab, setActiveTab] = useState<"chat" | "ingest">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // No-op setters to preserve call sites without changing behavior
  type Tokens = { input: number; output: number; total: number } | null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setTokens = (_: Tokens) => { /* no-op */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setSources = (_: Match[]) => { /* no-op */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setValidationStatus = (_: string) => { /* no-op */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setIngestResult = (_: string) => { /* no-op */ };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
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

  // Conversation helpers
  function generateId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function saveConversations(next: Conversation[] | ((prev: Conversation[]) => Conversation[])) {
    setConversations((prev) => {
      const computed = typeof next === "function" ? (next as (p: Conversation[]) => Conversation[])(prev) : next;
      try { localStorage.setItem("shipsense_conversations_v1", JSON.stringify(computed)); } catch {}
      return computed;
    });
  }

  // Load conversations from storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipsense_conversations_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (Array.isArray(parsed) && parsed.length) {
          setConversations(parsed);
          setActiveConversationId(parsed[0].id);
          setMessages(parsed[0].messages || []);
          return;
        }
      }
    } catch {}
    // bootstrap empty conversation
    const id = generateId();
    const empty: Conversation = { id, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    saveConversations([empty]);
    setActiveConversationId(id);
    setMessages([]);
  }, []);

  function updateActiveConversationMessages(mutator: (prev: ChatMessage[]) => ChatMessage[]) {
    const id = activeConversationId;
    if (!id) return;
    saveConversations((prevConvs) => prevConvs.map((c) => {
      if (c.id !== id) return c;
      const msgs = mutator(c.messages || []);
      return { ...c, messages: msgs, updatedAt: Date.now() };
    }));
  }

  function startNewConversation() {
    const id = generateId();
    const conv: Conversation = { id, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    const next = [conv, ...conversations];
    saveConversations(next);
    setActiveConversationId(id);
    setMessages([]);
    setAnswer("");
    setSources([]);
    setValidationStatus("");
  }

  function switchConversation(id: string) {
    const found = conversations.find((c) => c.id === id);
    if (!found) return;
    setActiveConversationId(id);
    setMessages(found.messages || []);
    setAnswer("");
    setSources([]);
    setValidationStatus("");
    // allow state to apply, then scroll
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), 0);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const onRendered = () => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.addEventListener("shipsense-mmd-rendered", onRendered);
    return () => window.removeEventListener("shipsense-mmd-rendered", onRendered);
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

  function wantsSpinnakerPipeline(text: string): boolean {
    const t = text.toLowerCase();
    const hasSpin = t.includes('spinnaker');
    const pipelineHints = ['pipeline', 'json', 'deploy', 'deployment', 'manual judgment', 'manual judgement'];
    return hasSpin && pipelineHints.some((k) => t.includes(k));
  }

  async function send() {
    if (!message.trim()) return;
    const pendingId = "pending-" + Date.now().toString(36);
    // Optimistic render: show user message immediately and a pending assistant indicator
    setMessages((prev) => [
      ...prev,
      { id: pendingId + "-user", role: "user", content: message },
      { id: pendingId, role: "assistant", content: "Generating...", pending: true },
    ]);
    // persist to conversation
    updateActiveConversationMessages((prev) => [
      ...prev,
      { id: pendingId + "-user", role: "user", content: message },
      { id: pendingId, role: "assistant", content: "Generating...", pending: true },
    ]);
    // auto-title
    if (activeConversationId) {
      const title = message.slice(0, 60);
      saveConversations((prevConvs) => prevConvs.map((c) => (
        c.id === activeConversationId && (c.title === "New chat" || !c.title)
          ? { ...c, title }
          : c
      )));
    }
    setAnswer("");
    setSources([]);
    const userMessage = message;
    setMessage("");

    // If the user asks for a diagram, call the diagram endpoint.
    if (wantsDiagram(userMessage)) {
      const res = await fetch("/api/diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: userMessage }) });
      const data = await res.json();
      const output = data.output || "";
      setAnswer(output);
      setTokens(null);
      setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: output, pending: false } : m));
      updateActiveConversationMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: output, pending: false } : m));
      return;
    }

    // Spinnaker pipeline generation
    if (wantsSpinnakerPipeline(userMessage)) {
      try {
        const res = await fetch('/api/spinnaker-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userMessage })
        });
        const data = await res.json();
        if (data?.output) {
          setAnswer(data.output);
          setSources([]);
          setTokens(null);
          setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.output, pending: false } : m));
          return;
        }
      } catch (e) {
        // fall through to search/chat
      }
    }

    // Check for Ansible playbook generation requests
    if (userMessage.toLowerCase().includes('ansible') && (userMessage.toLowerCase().includes('create') || userMessage.toLowerCase().includes('generate') || userMessage.toLowerCase().includes('playbook'))) {
      try {
        const res = await fetch("/api/ansible-generate", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ prompt: userMessage }) 
        });
        const data = await res.json();
        if (data?.output) {
          setAnswer(data.output);
          setValidationStatus(data.yaml_validation || "");
          setSources([]);
          setTokens(null);
          setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.output, pending: false } : m));
          updateActiveConversationMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.output, pending: false } : m));
          return;
        }
      } catch (error) {
        console.error("Ansible generation failed:", error);
      }
    }

    // Check for Terraform configuration generation requests
    if (userMessage.toLowerCase().includes('terraform') && (userMessage.toLowerCase().includes('create') || userMessage.toLowerCase().includes('generate') || userMessage.toLowerCase().includes('config'))) {
      try {
        const res = await fetch("/api/terraform-generate", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ prompt: userMessage }) 
        });
        const data = await res.json();
        if (data?.output) {
          setAnswer(data.output);
          setValidationStatus(data.hcl_validation || "");
          setSources([]);
          setTokens(null);
          setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.output, pending: false } : m));
          updateActiveConversationMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.output, pending: false } : m));
          return;
        }
      } catch (error) {
        console.error("Terraform generation failed:", error);
      }
    }

    // Default path: vector search with Gemini answer and citations
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: userMessage, topK: 5, answer: true }) });
      const data = await res.json();
      if (data?.answer) {
        setAnswer(data.answer);
        setSources((data.matches || []) as Match[]);
        setTokens(null);
        setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.answer, pending: false } : m));
        updateActiveConversationMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: data.answer, pending: false } : m));
        return;
      }
    } catch {}

    // Fallback to plain chat endpoint
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: userMessage }) });
    const data = await res.json();
    const output = data.output || "";
    setAnswer(output);
    setTokens(data.tokens || null);
    setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: output, pending: false } : m));
    updateActiveConversationMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: output, pending: false } : m));
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

  function renderAssistant(text: string) {
    const formatted = preprocessAnswer(text || "");
    const blocks: string[] = [];
    const transformed = formatted.replace(/```mermaid([\s\S]*?)```/g, (_m, g1) => {
      blocks.push(g1.trim());
      return "\n[Mermaid Diagram]\n";
    });
    return (
      <div>
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
          {transformed}
        </ReactMarkdown>
        {blocks.map((code, i) => (
          <div key={i} className="my-4 border rounded p-3 overflow-x-auto">
            <Mermaid code={code} />
          </div>
        ))}
      </div>
    );
  }

  // Keep preprocessing side-effects for mermaid scroll events but do not store unused values
  useMemo(() => {
    const formatted = preprocessAnswer(answer || "");
    formatted.replace(/```mermaid([\s\S]*?)```/g, (_m, g1) => {
      // emit event for auto-scroll after diagram render
      try { window.dispatchEvent(new Event("shipsense-mmd-rendered")); } catch {}
      return g1;
    });
    return null;
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
    <main className="min-h-screen flex">
      {/* Sidebar: conversations */}
      <aside className="hidden md:flex w-64 border-r flex-col sticky top-0 h-screen">
        <div className="p-4 border-b">
          <div className="text-sm font-semibold mb-2">ShipSense</div>
          <div className="text-xs text-gray-500 mb-3">Chats</div>
          <div className="flex flex-col gap-2">
            <button className="text-sm border rounded px-3 py-1" onClick={startNewConversation} type="button">New chat</button>
            <button className="text-sm border rounded px-3 py-1" onClick={() => setActiveTab('ingest')} type="button">Ingest</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <ul className="p-2 space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <div className={`group flex items-start gap-2 w-full px-3 py-2 rounded hover:bg-gray-50 ${c.id === activeConversationId ? 'bg-gray-100' : ''}`}>
                  <button
                    type="button"
                    onClick={() => switchConversation(c.id)}
                    className="flex-1 text-left"
                    title={c.title}
                  >
                    <div className="text-sm truncate">{c.title || 'Untitled'}</div>
                    <div className="text-xs text-gray-500">{new Date(c.updatedAt).toLocaleString()}</div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete chat"
                    title="Delete chat"
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                    onClick={() => saveConversations((prev) => prev.filter((x) => x.id !== c.id))}
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b">
          <div className="p-6 max-w-3xl mx-auto w-full flex items-center justify-between">
            <h1 className="text-2xl font-semibold">ShipSense</h1>
            <div className="text-sm text-gray-600 flex items-center gap-3">
              <span>{session.user?.email || session.user?.name}</span>
              <button className="underline" onClick={() => signOut({ callbackUrl: "/chat" })}>Sign out</button>
            </div>
          </div>
          <div className="px-6 max-w-3xl mx-auto w-full border-b">
            <nav className="flex gap-4 justify-center">
              <button
                className={`px-3 py-2 -mb-px border-b-2 ${activeTab === 'chat' ? 'border-black font-medium' : 'border-transparent text-gray-600'}`}
                onClick={() => setActiveTab('chat')}
                type="button"
              >
                Chat
              </button>
            </nav>
          </div>

        </div>

        <div ref={messagesContainerRef} className="flex-1 overflow-auto scroll-smooth">
          <div className="p-6 max-w-3xl mx-auto w-full pb-48 pt-4">
            {activeTab === 'chat' ? (
              <>
                {messages.length > 0 && (
                  <section className="mb-4 space-y-4">
                    {[...messages].map((m) => {
                      const isUser = m.role === 'user';
                      return (
                        <div
                          key={m.id}
                          className="flex justify-center"
                        >
                          <div
                            className={`${isUser ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-black'} w-full max-w-2xl rounded-xl px-4 py-3 text-sm border ${m.pending ? 'opacity-70 italic' : ''}`}
                          >
                            <div className="text-xs font-medium text-gray-500 mb-2">
                              {isUser ? 'You' : 'ShipSense Response'}
                            </div>
                            {isUser ? <div>{m.content}</div> : (
                              <div>
                                {renderAssistant(m.content)}
                                <div className="flex items-center gap-3 mt-2">
                                  <button
                                    type="button"
                                    className="text-green-700 hover:text-green-800 text-sm"
                                    title="Helpful"
                                    onClick={() => { /* future: send feedback */ }}
                                  >
                                    👍
                                  </button>
                                  <button
                                    type="button"
                                    className="text-red-600 hover:text-red-700 text-sm"
                                    title="Not helpful"
                                    onClick={async () => {
                                      try {
                                        const wantJira = confirm('Create a Jira ticket? Click Cancel to create a Freshdesk ticket.');
                                        const title = `ShipSense feedback: ${new Date().toLocaleString()}`;
                                        const description = m.content || 'No answer content';
                                        const endpoint = wantJira ? '/api/tickets/jira' : '/api/tickets/freshdesk';
                                        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description }) });
                                        if (!res.ok) throw new Error(await res.text());
                                        const data = await res.json();
                                        alert(`Ticket created: ${data.key || data.id} \n${data.url}`);
                                      } catch (e) {
                                        alert(`Ticket creation failed: ${e instanceof Error ? e.message : String(e)}`);
                                      }
                                    }}
                                  >
                                    👎
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}
              </>
            ) : (
              <>
                <section className="my-2">
                  <h2 className="text-lg font-semibold mb-2 text-center">Crawl URLs (docs)</h2>
                  <UrlCrawler />
                </section>
                <section className="my-8">
                  <h2 className="text-lg font-semibold mb-2 text-center">Ingest GitHub Repo</h2>
                  <GitHubIngest />
                </section>
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
        {/* Sticky bottom input bar inside content column */}
        <div className="sticky bottom-0 left-0 right-0 border-t bg-white">
          <div className="p-3 max-w-3xl mx-auto w-full">
            <input ref={fileInputRef} type="file" multiple accept=".sh,.tf,.yaml,.yml,.groovy" onChange={onUpload} className="hidden" />
            <form className="flex gap-2 justify-center" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <button
                className="border rounded px-3 py-2"
                type="button"
                aria-label="Attach files"
                title="Attach files"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach
              </button>
              <input
                className="flex-1 border rounded px-3 py-2 max-w-2xl"
                placeholder={"Ask a DevOps question, request a diagram, or ask to create Ansible playbooks/Terraform configs (e.g., 'Create a Jenkins pipeline diagram' or 'Help me create an Ansible playbook for web server setup')"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button type="submit" className="bg-black text-white px-4 py-2 rounded">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
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

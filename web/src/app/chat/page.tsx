"use client";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import { useSession, signIn, signOut } from "next-auth/react";

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
    setAnswer("");
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await res.json();
    setAnswer(data.output || "");
    setTokens(data.tokens || null);
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
        <div className="flex flex-col gap-2 w-full">
          <input className="border rounded px-3 py-2" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {loginError && <div className="text-red-600 text-sm">{loginError}</div>}
          <button className="bg-black text-white px-4 py-2 rounded" onClick={doLogin}>Sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">DevOps Chat</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>{session.user?.email || session.user?.name}</span>
          <button className="underline" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Ask about Jenkins/Terraform/Argo..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="bg-black text-white px-4 py-2 rounded" onClick={send}>
          Send
        </button>
      </div>
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
    </main>
  );
}

import { NextRequest } from "next/server";
import { getGemini } from "@/lib/gemini";
import { isAllowedTopic, OUT_OF_SCOPE_MESSAGE, SYSTEM_POLICY } from "@/lib/guardrails";

function looksGarbled(text: string): boolean {
  return /hadBadFinishReason|GoogleGenerativeAIResponseError|getText\(response\)/.test(text);
}

function maybeArgoFallback(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (p.includes("argocd") && p.includes("application")) {
    return `# Argo CD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: sample-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/your-repo.git
    targetRevision: main
    path: k8s/manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: sample
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
# kubectl apply -n argocd -f app.yaml`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { message, model = "gemini-2.5-pro" } = await req.json();

    if (!isAllowedTopic(message)) {
      return Response.json({ output: OUT_OF_SCOPE_MESSAGE, tokens: { input: 0, output: 0, total: 0 }, blocked: false });
    }

    const gm = getGemini(model);

    let inputTokens = 0;
    try {
      const count = await gm.countTokens({ contents: [{ role: "user", parts: [{ text: message }] }] });
      inputTokens = (count.totalTokens as number) ?? 0;
    } catch {}

    const result = await gm.generateContent({
      contents: [{ role: "user", parts: [{ text: message }] }],
      systemInstruction: SYSTEM_POLICY,
      generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 2048 },
    });

    type ResponseObj = { text?: string | (() => string) };
    const resp = result.response as unknown as ResponseObj;
    const text: string = typeof resp?.text === "function" ? resp.text() : (resp?.text as string) ?? "";

    let outputTokens = 0;
    try {
      const count2 = await gm.countTokens({ contents: [{ role: "model", parts: [{ text }] }] });
      outputTokens = (count2.totalTokens as number) ?? 0;
    } catch {}

    let output = text?.trim() || "";

    if (!output || looksGarbled(output)) {
      const argo = maybeArgoFallback(message);
      output = argo || "I couldn’t generate a response. Please rephrase or provide more details.";
    }

    return Response.json({
      output,
      blocked: false,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      {
        output: "I couldn’t generate a response. Please rephrase or provide more details.",
        error: "GENERATION_ERROR",
        message,
      },
      { status: 200 }
    );
  }
}

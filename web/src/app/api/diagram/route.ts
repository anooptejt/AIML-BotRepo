import { NextRequest } from "next/server";
import { getGemini } from "@/lib/gemini";
import { isAllowedTopic } from "@/lib/guardrails";

const DIAGRAM_POLICY = [
  "You generate only Mermaid diagrams in fenced code blocks.",
  "Rules:",
  "- Output must be a single fenced code block labeled mermaid.",
  "- No prose before or after the code fence.",
  "- Prefer flowchart or sequence diagrams.",
  "- Scope: DevOps/CI/CD topics only.",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const { prompt, model = "gemini-2.5-pro" } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "MISSING_PROMPT" }, { status: 400 });
    }
    if (!isAllowedTopic(prompt)) {
      return Response.json({ output: "```mermaid\nflowchart TD; A[Out of scope]-->B[Ask DevOps/CI/CD]\n```" });
    }

    const gm = getGemini(model);
    const result = await gm.generateContent({
      systemInstruction: DIAGRAM_POLICY,
      contents: [{ role: "user", parts: [{ text: `Return ONLY a mermaid code fence that diagrams: ${prompt}` }]}],
      generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 1024 },
    });
    const resp = result.response as unknown as { text?: string | (() => string) };
    const text: string = typeof resp?.text === "function" ? resp.text() : (resp?.text as string) ?? "";

    const match = text.match(/```mermaid[\s\S]*?```/i);
    const fallback = `\n\n\`\`\`mermaid\nflowchart TD; A[${prompt.slice(0, 40)}]-->B[Details]\n\`\`\`\n\n`.replace(/`/g, "`");
    const output = match ? match[0] : fallback;
    return Response.json({ output });
  } catch {
    return Response.json({ output: "```mermaid\nflowchart LR; E[Error]-->C[Try again];\n```" });
  }
}

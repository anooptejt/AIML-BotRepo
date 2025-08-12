import { NextRequest } from "next/server";
import { getGemini } from "@/lib/gemini";
import { isAllowedTopic, OUT_OF_SCOPE_MESSAGE, SYSTEM_POLICY } from "@/lib/guardrails";

function looksGarbled(text: string): boolean {
  // Heuristic: Gemini SDK function source accidentally serialized
  return /hadBadFinishReason|GoogleGenerativeAIResponseError|getText\(response\)/.test(text);
}

export async function POST(req: NextRequest) {
  try {
    const { message, model = "gemini-2.5-pro" } = await req.json();

    if (!isAllowedTopic(message)) {
      return Response.json({ output: OUT_OF_SCOPE_MESSAGE, tokens: { input: 0, output: 0, total: 0 }, blocked: false });
    }

    const gm = getGemini(model);

    // Count input tokens (best-effort)
    let inputTokens = 0;
    try {
      const count = await gm.countTokens({ contents: [{ role: "user", parts: [{ text: message }] }] });
      inputTokens = (count.totalTokens as number) ?? 0;
    } catch {}

    // Simpler non-streaming generation for stability
    const result = await gm.generateContent({
      contents: [{ role: "user", parts: [{ text: message }] }],
      systemInstruction: SYSTEM_POLICY,
      generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 2048 },
    });

    const resp = result.response as unknown as { text?: string | (() => string); candidates?: unknown[]; promptFeedback?: unknown };
    const text: string = typeof resp?.text === "function" ? resp.text() : (resp?.text as string) ?? "";

    const candidates = Array.isArray(resp?.candidates) ? resp.candidates : [];
    const promptFeedback = resp?.promptFeedback ?? null;

    let finishReason: string | undefined = undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const c0 = candidates[0] as { finishReason?: string };
      finishReason = c0?.finishReason;
    }
    const blocked = !!(finishReason && finishReason !== "STOP");

    // Count output tokens (best-effort)
    let outputTokens = 0;
    try {
      const count2 = await gm.countTokens({ contents: [{ role: "model", parts: [{ text }] }] });
      outputTokens = (count2.totalTokens as number) ?? 0;
    } catch {}

    // Fallbacks for empty/garbled/blocked
    let output = text?.trim() || "";
    if (!output || looksGarbled(output) || blocked) {
      output = "I don't know. I can assist with DevOps/CI/CD topics like Terraform, Ansible, Jenkins, Spinnaker, Argo, and DecSecOps. Try asking more specifically.";
    }

    return Response.json({
      output,
      blocked,
      finishReason,
      promptFeedback: promptFeedback || undefined,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      candidatesCount: Array.isArray(candidates) ? candidates.length : 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      {
        output: "I don't know. Please try rephrasing your DevOps/CI/CD question.",
        error: "GENERATION_ERROR",
        message,
      },
      { status: 200 }
    );
  }
}

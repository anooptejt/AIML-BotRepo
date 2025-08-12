import os
from typing import Optional
from fastapi import FastAPI
from pydantic import BaseModel
import google.generativeai as genai

ALLOWED = {
    "ci","cd","cicd","devops","terraform","ansible","jenkins","spinnaker",
    "argo","argocd","workflows","rollouts","decsecops","shell","bash","kubernetes","helm"
}

SYSTEM_POLICY = (
    "You are a Responsible DevOps assistant. Only answer questions about CI/CD, DevOps, Terraform, Ansible, "
    "Jenkins, Spinnaker, Argo (CD/Workflows/Rollouts), DecSecOps, and Shell scripting. "
    "If the user asks anything outside these topics, politely refuse and suggest DevOps topics."
)

class ChatIn(BaseModel):
    message: str
    model: Optional[str] = "gemini-2.5-pro"
    temperature: Optional[float] = 0.4
    top_p: Optional[float] = 0.9
    max_output_tokens: Optional[int] = 2048

app = FastAPI()


def is_allowed(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ALLOWED)


@app.on_event("startup")
def _setup_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    genai.configure(api_key=api_key)


@app.post("/chat")
def chat(inp: ChatIn):
    if not is_allowed(inp.message):
        return {
            "output": "Sorry, I can only assist with DevOps/CI/CD topics (Terraform, Ansible, Jenkins, Spinnaker, Argo, DecSecOps, Shell).",
            "tokens": {"input": 0, "output": 0, "total": 0},
        }

    model = genai.GenerativeModel(inp.model, system_instruction=SYSTEM_POLICY)

    # Token counting is best-effort; not all SDK versions expose it consistently.
    input_tokens = 0
    try:
        ct = model.count_tokens(inp.message)
        input_tokens = getattr(ct, "total_tokens", 0) or (ct.get("total_tokens") if isinstance(ct, dict) else 0)
    except Exception:
        pass

    resp = model.generate_content(
        inp.message,
        generation_config={
            "temperature": inp.temperature,
            "top_p": inp.top_p,
            "max_output_tokens": inp.max_output_tokens,
        },
        safety_settings=[
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ],
    )

    output_text = resp.text if hasattr(resp, "text") else str(resp)

    output_tokens = 0
    try:
        ct2 = model.count_tokens(output_text)
        output_tokens = getattr(ct2, "total_tokens", 0) or (ct2.get("total_tokens") if isinstance(ct2, dict) else 0)
    except Exception:
        pass

    return {
        "output": output_text,
        "tokens": {"input": input_tokens, "output": output_tokens, "total": (input_tokens + output_tokens)},
    }


@app.get("/")
def root():
    return {"status": "ok", "service": "gemini-devops-bot"}

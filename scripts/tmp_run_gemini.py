import os
import sys
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

def is_allowed(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ALLOWED)


def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY env var not set", file=sys.stderr)
        sys.exit(1)

    prompt = "Give a Jenkins pipeline for building a Node app"
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])

    if not is_allowed(prompt):
        print("REFUSED: Out-of-scope. Allowed topics: DevOps/CI/CD (Terraform, Ansible, Jenkins, Spinnaker, Argo, DecSecOps, Shell)")
        return

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-pro", system_instruction=SYSTEM_POLICY)

    input_tokens = 0
    try:
        ct = model.count_tokens(prompt)
        input_tokens = getattr(ct, "total_tokens", 0) or (ct.get("total_tokens") if isinstance(ct, dict) else 0)
    except Exception:
        pass

    resp = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.4,
            "top_p": 0.9,
            "max_output_tokens": 2048,
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

    print("OUTPUT:\n" + output_text)
    print("\nTOKENS:", {"input": input_tokens, "output": output_tokens, "total": input_tokens + output_tokens})

if __name__ == "__main__":
    main()

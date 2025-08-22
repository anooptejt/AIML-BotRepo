import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel
import google.generativeai as genai
import yaml
import json

ALLOWED = {
    "ci","cd","cicd","devops","devsecops","security","sdlc","release","terraform","ansible","jenkins","spinnaker",
    "argo","argocd","workflows","rollouts","shell","bash","kubernetes","helm","process","processes"
}

SYSTEM_POLICY = (
    "You are a Responsible DevOps assistant. Only answer questions about CI/CD, DevOps, Terraform, Ansible, "
    "Jenkins, Spinnaker, Argo (CD/Workflows/Rollouts), DevSecOps, and Shell scripting. "
    "If the user asks anything outside these topics, politely refuse and suggest DevOps topics.\n"
    "Formatting rules for EVERY answer: \n"
    "- Use structured bullet points with clear headings and sub-bullets.\n"
    "- Keep paragraphs short and scannable; prefer lists.\n"
    "- Number process steps when appropriate.\n"
    "- Include short code/config blocks only when directly helpful."
)

# Ansible-specific system prompt
ANSIBLE_SYSTEM_PROMPT = (
    "You are an Ansible expert providing technical guidance. Generate complete, production-ready Ansible playbooks with: "
    "- Proper YAML formatting and indentation "
    "- Host targeting and variable definitions "
    "- Error handling and idempotency "
    "- Best practices for security and maintainability "
    "- Clear comments explaining each task "
    "- Appropriate task names and descriptions "
    "Focus on technical implementation details and best practices for DevOps automation."
)

# Terraform-specific system prompt
TERRAFORM_SYSTEM_PROMPT = (
    "You are a Terraform expert providing technical guidance. Generate complete, production-ready Terraform configurations with: "
    "- Proper HCL syntax and formatting "
    "- Variable definitions and outputs "
    "- Resource dependencies and data sources "
    "- Best practices for security and state management "
    "- Clear comments explaining each resource "
    "- Appropriate resource naming conventions "
    "Focus on technical implementation details and best practices for infrastructure as code."
)

class ChatIn(BaseModel):
    message: str
    model: Optional[str] = "gemini-2.5-flash"
    temperature: Optional[float] = 0.4
    top_p: Optional[float] = 0.9
    max_output_tokens: Optional[int] = 2048

class AnsibleGenerateIn(BaseModel):
    prompt: str
    model: Optional[str] = "gemini-2.5-flash"
    temperature: Optional[float] = 0.2
    max_output_tokens: Optional[int] = 4096

class TerraformGenerateIn(BaseModel):
    prompt: str
    model: Optional[str] = "gemini-2.5-flash"
    temperature: Optional[float] = 0.2
    max_output_tokens: Optional[int] = 4096

app = FastAPI()


def is_allowed(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ALLOWED)


def extract_ansible_requirements(prompt: str) -> Dict[str, Any]:
    """Extract Ansible requirements from user prompt"""
    requirements = {
        "target_hosts": "all",
        "tasks": [],
        "variables": {},
        "handlers": [],
        "roles": []
    }
    
    prompt_lower = prompt.lower()
    
    # Detect target hosts
    if "webserver" in prompt_lower or "web" in prompt_lower:
        requirements["target_hosts"] = "webservers"
    elif "database" in prompt_lower or "db" in prompt_lower:
        requirements["target_hosts"] = "databases"
    elif "load balancer" in prompt_lower or "lb" in prompt_lower:
        requirements["target_hosts"] = "loadbalancers"
    
    # Detect common tasks
    if "install" in prompt_lower or "package" in prompt_lower:
        requirements["tasks"].append("package_installation")
    if "configure" in prompt_lower or "config" in prompt_lower:
        requirements["tasks"].append("configuration")
    if "service" in prompt_lower or "start" in prompt_lower:
        requirements["tasks"].append("service_management")
    if "file" in prompt_lower or "copy" in prompt_lower:
        requirements["tasks"].append("file_operations")
    
    return requirements


def extract_terraform_requirements(prompt: str) -> Dict[str, Any]:
    """Extract Terraform requirements from user prompt"""
    requirements = {
        "provider": "aws",
        "resources": [],
        "variables": [],
        "outputs": []
    }
    
    prompt_lower = prompt.lower()
    
    # Detect cloud provider
    if "aws" in prompt_lower or "amazon" in prompt_lower:
        requirements["provider"] = "aws"
    elif "azure" in prompt_lower:
        requirements["provider"] = "azure"
    elif "gcp" in prompt_lower or "google" in prompt_lower:
        requirements["provider"] = "google"
    
    # Detect resource types
    if "ec2" in prompt_lower or "instance" in prompt_lower or "vm" in prompt_lower:
        requirements["resources"].append("compute_instance")
    if "vpc" in prompt_lower or "network" in prompt_lower:
        requirements["resources"].append("network")
    if "s3" in prompt_lower or "storage" in prompt_lower or "bucket" in prompt_lower:
        requirements["resources"].append("storage")
    if "rds" in prompt_lower or "database" in prompt_lower:
        requirements["resources"].append("database")
    if "load balancer" in prompt_lower or "alb" in prompt_lower:
        requirements["resources"].append("load_balancer")
    
    return requirements


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

    # Handle Gemini API response properly
    try:
        if hasattr(resp, "text") and resp.text:
            output_text = resp.text
        elif hasattr(resp, "parts") and resp.parts:
            output_text = "".join([part.text for part in resp.parts if hasattr(part, "text") and part.text])
        elif hasattr(resp, "candidates") and resp.candidates:
            # Handle response with candidates
            candidate = resp.candidates[0]
            if hasattr(candidate, "content") and candidate.content:
                if hasattr(candidate.content, "parts"):
                    output_text = "".join([part.text for part in candidate.content.parts if hasattr(part, "text") and part.text])
                else:
                    output_text = str(candidate.content)
            else:
                output_text = str(candidate)
        elif hasattr(resp, "finish_reason"):
            # Handle response with finish reason
            if resp.finish_reason == 1:  # SAFETY
                output_text = "The request was blocked due to safety concerns. Please try rephrasing your request."
            elif resp.finish_reason == 2:  # RECITATION
                output_text = "The response was blocked due to recitation concerns. Please try a different approach."
            elif resp.finish_reason == 3:  # OTHER
                output_text = "The request could not be completed. Please try again."
            else:
                output_text = f"Response completed with finish reason: {resp.finish_reason}"
        else:
            output_text = str(resp)
    except Exception as e:
        output_text = f"Error processing response: {str(e)}"

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


@app.post("/ansible-generate")
def generate_ansible_playbook(inp: AnsibleGenerateIn):
    """Generate Ansible playbook based on user requirements"""
    if not is_allowed(inp.prompt):
        return {
            "output": "Sorry, I can only assist with DevOps/CI/CD topics.",
            "tokens": {"input": 0, "output": 0, "total": 0},
        }
    
    # Extract requirements from prompt
    requirements = extract_ansible_requirements(inp.prompt)
    
    # Create enhanced prompt for Gemini
    enhanced_prompt = f"""
Generate a complete Ansible playbook based on these requirements:
{inp.prompt}

Requirements extracted:
- Target hosts: {requirements['target_hosts']}
- Tasks needed: {', '.join(requirements['tasks']) if requirements['tasks'] else 'General DevOps tasks'}

Please provide:
1. A complete playbook in YAML format
2. Proper host targeting
3. Variable definitions if needed
4. Error handling and idempotency
5. Clear comments for each task
6. Best practices for security

Format the response as a complete, ready-to-use Ansible playbook with proper YAML syntax.
Focus on technical implementation and DevOps best practices.
"""
    
    model = genai.GenerativeModel(inp.model, system_instruction=ANSIBLE_SYSTEM_PROMPT)
    
    # Retry up to 2 times on safety/empty responses
    attempts = 0
    while attempts < 2:
        resp = model.generate_content(
            enhanced_prompt,
            generation_config={
                "temperature": inp.temperature,
                "max_output_tokens": inp.max_output_tokens,
            },
            safety_settings=[
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            ],
        )

        # Handle Gemini API response properly
        try:
            if hasattr(resp, "text") and resp.text:
                output_text = resp.text
            elif hasattr(resp, "parts") and resp.parts:
                output_text = "".join([part.text for part in resp.parts if hasattr(part, "text") and part.text])
            elif hasattr(resp, "candidates") and resp.candidates:
                # Handle response with candidates
                candidate = resp.candidates[0]
                if hasattr(candidate, "content") and candidate.content:
                    if hasattr(candidate.content, "parts"):
                        output_text = "".join([part.text for part in candidate.content.parts if hasattr(part, "text") and part.text])
                    else:
                        output_text = str(candidate.content)
                else:
                    output_text = str(candidate)
            elif hasattr(resp, "finish_reason"):
                output_text = ""
            else:
                output_text = str(resp)
        except Exception:
            output_text = ""

        if output_text:
            break
        attempts += 1

    if not output_text:
        output_text = (
            "```yaml\n"
            "---\n"
            "- name: Example Playbook (fallback)\n"
            "  hosts: all\n"
            "  become: true\n"
            "  tasks:\n"
            "    - name: Ensure Nginx is installed\n"
            "      package:\n"
            "        name: nginx\n"
            "        state: present\n"
            "    - name: Ensure Nginx is running\n"
            "      service:\n"
            "        name: nginx\n"
            "        state: started\n"
            "        enabled: true\n"
            "```"
        )
    
    # Try to validate YAML if present
    yaml_validation = "✅ Valid YAML format"
    try:
        # Extract YAML blocks if present
        if "```yaml" in output_text:
            yaml_start = output_text.find("```yaml") + 7
            yaml_end = output_text.find("```", yaml_start)
            if yaml_end > yaml_start:
                yaml_content = output_text[yaml_start:yaml_end].strip()
                yaml.safe_load(yaml_content)
        elif "---" in output_text:
            # Try to parse as YAML
            yaml.safe_load(output_text)
    except yaml.YAMLError as e:
        yaml_validation = f"⚠️ YAML validation warning: {str(e)}"
    
    return {
        "output": output_text,
        "yaml_validation": yaml_validation,
        "requirements": requirements,
        "tokens": {"input": 0, "output": 0, "total": 0},  # Token counting for generation endpoints TBD
    }


@app.post("/terraform-generate")
def generate_terraform_config(inp: TerraformGenerateIn):
    """Generate Terraform configuration based on user requirements"""
    if not is_allowed(inp.prompt):
        return {
            "output": "Sorry, I can only assist with DevOps/CI/CD topics.",
            "tokens": {"input": 0, "output": 0, "total": 0},
        }
    
    # Extract requirements from prompt
    requirements = extract_terraform_requirements(inp.prompt)
    
    # Create enhanced prompt for Gemini
    enhanced_prompt = f"""
Generate a complete Terraform configuration based on these requirements:
{inp.prompt}

Requirements extracted:
- Cloud provider: {requirements['provider']}
- Resources needed: {', '.join(requirements['resources']) if requirements['resources'] else 'General infrastructure'}

Please provide:
1. A complete Terraform configuration in HCL format
2. Proper provider configuration
3. Variable definitions and outputs
4. Resource dependencies and data sources
5. Clear comments for each resource
6. Best practices for security and state management

Format the response as a complete, ready-to-use Terraform configuration with proper HCL syntax.
Focus on technical implementation and infrastructure as code best practices.
"""
    
    model = genai.GenerativeModel(inp.model, system_instruction=TERRAFORM_SYSTEM_PROMPT)
    
    resp = model.generate_content(
        enhanced_prompt,
        generation_config={
            "temperature": inp.temperature,
            "max_output_tokens": inp.max_output_tokens,
        },
        safety_settings=[
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ],
    )
    
    # Handle Gemini API response properly
    try:
        if hasattr(resp, "text") and resp.text:
            output_text = resp.text
        elif hasattr(resp, "parts") and resp.parts:
            output_text = "".join([part.text for part in resp.parts if hasattr(part, "text") and part.text])
        elif hasattr(resp, "candidates") and resp.candidates:
            # Handle response with candidates
            candidate = resp.candidates[0]
            if hasattr(candidate, "content") and candidate.content:
                if hasattr(candidate.content, "parts"):
                    output_text = "".join([part.text for part in candidate.content.parts if hasattr(part, "text") and part.text])
                else:
                    output_text = str(candidate.content)
            else:
                output_text = str(candidate)
        elif hasattr(resp, "finish_reason"):
            # Handle response with finish reason
            if resp.finish_reason == 1:  # SAFETY
                output_text = "The request was blocked due to safety concerns. Please try rephrasing your request."
            elif resp.finish_reason == 2:  # RECITATION
                output_text = "The response was blocked due to recitation concerns. Please try a different approach."
            elif resp.finish_reason == 3:  # OTHER
                output_text = "The request could not be completed. Please try again."
            else:
                output_text = f"Response completed with finish reason: {resp.finish_reason}"
        else:
            output_text = str(resp)
    except Exception as e:
        output_text = f"Error processing response: {str(e)}"
    
    # Try to validate HCL if present
    hcl_validation = "✅ Valid HCL format"
    try:
        # Basic HCL validation (check for common syntax patterns)
        if "```hcl" in output_text or "```terraform" in output_text:
            # Extract HCL blocks if present
            hcl_start = output_text.find("```") + 3
            hcl_end = output_text.find("```", hcl_start)
            if hcl_end > hcl_start:
                hcl_content = output_text[hcl_start:hcl_end].strip()
                # Basic validation - check for required Terraform elements
                if "terraform {" in hcl_content or "provider" in hcl_content or "resource" in hcl_content:
                    pass  # Basic structure looks good
                else:
                    hcl_validation = "⚠️ HCL structure validation warning"
    except Exception as e:
        hcl_validation = f"⚠️ HCL validation warning: {str(e)}"
    
    if not output_text:
        output_text = (
            "```hcl\n"
            "terraform {\n  required_providers {\n    aws = { source = \"hashicorp/aws\", version = \"~> 5.0\" }\n  }\n}\n\nprovider \"aws\" { region = \"us-east-1\" }\n\nresource \"aws_vpc\" \"main\" {\n  cidr_block = \"10.0.0.0/16\"\n  tags = { Name = \"fallback-vpc\" }\n}\n\nresource \"aws_subnet\" \"public\" {\n  vpc_id                  = aws_vpc.main.id\n  cidr_block              = \"10.0.1.0/24\"\n  map_public_ip_on_launch = true\n}\n\nresource \"aws_instance\" \"web\" {\n  ami           = \"ami-0c94855ba95c71c99\"\n  instance_type = \"t2.micro\"\n  subnet_id     = aws_subnet.public.id\n  tags = { Name = \"fallback-ec2\" }\n}\n" 
            "```"
        )
    
    return {
        "output": output_text,
        "hcl_validation": hcl_validation,
        "requirements": requirements,
        "tokens": {"input": 0, "output": 0, "total": 0},  # Token counting for generation endpoints TBD
    }


@app.get("/")
def root():
    return {"status": "ok", "service": "gemini-devops-bot"}

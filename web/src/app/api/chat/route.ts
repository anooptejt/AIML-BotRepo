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

function maybeDevOpsPrimer(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (
    p.includes("devops") ||
    p.includes("dev sec ops") ||
    p.includes("devsecops") ||
    p.includes("process") ||
    p.includes("cicd")
  ) {
    return `### DevOps → DevSecOps: A Delivery Story

You have an idea. The goal is to turn it into secure, reliable software in production. Here’s how that journey flows and what decisions you make along the way.

#### The Big Picture

flowchart LR
  A[Idea] --> B[Code]
  B --> C[Build\nSBOM]
  C --> D[Test]
  D --> E[Security\nSAST/DAST/SCA]
  E --> F[Package & Sign]
  F --> G[Deploy\nBlue/Green/Canary]
  G --> H[Observe & Improve]

#### 1) Plan & Code
Small, reviewable changes. Trunk/PR workflows with branch protections; IaC alongside app code.
- Artifacts: design notes, user stories, pull request
- Tools: GitHub/GitLab, Jira, Terraform/Helm/Ansible in repo

#### 2) Build (Create a Provenance)
Repeatable builds produce artifacts plus a Software Bill of Materials (SBOM).
- Artifacts: container image, SBOM (CycloneDX/SPDX)
- Tools: Jenkins/GitHub Actions, buildpacks/Docker, Syft/Trivy

#### 3) Test (Fail Fast)
Automated unit → integration → e2e tests with parallelization.
- Gates: quality thresholds, flaky test quarantine
- Tools: Jest/Pytest, Playwright/Cypress

#### 4) Security (Shift Left)
Security runs as code in the pipeline: SAST, DAST, SCA, secret and IaC scans.
- Policy: break-the-glass vs mandatory gates
- Tools: Trivy/Snyk, Semgrep, Checkov/Tfsec, OWASP ZAP

#### 5) Package & Sign
Artifacts are signed; attestations bind build → source → scan results.
- Artifacts: signed image, provenance (SLSA/Sigstore)
- Tools: Cosign, GitHub OIDC, in-toto

#### 6) Deploy (Progressive Delivery)
Safe rollouts, quick rollback, environment drift detection.
- Strategies: canary, blue/green, feature flags
- Tools: Argo CD/Rollouts, Helm, Kubernetes

#### 7) Observe & Improve
Close the loop with SLOs, error budgets, and post-incident learning.
- Signals: metrics, logs, traces; release health
- Tools: Prometheus/Grafana, ELK/Opensearch, Jaeger/Tempo

Want something concrete next?
- Say: "Generate a CI/CD pipeline diagram for my app"
- Or: "Create an Ansible playbook to install NGINX"
- Or: "Terraform VPC + EKS module with best practices"`;
  }
  return null;
}

function maybeTopicPrimer(prompt: string): string | null {
  const p = prompt.toLowerCase();
  const bullets = (lines: string[]) => lines.join("\n");

  if (p.includes("terraform")) {
    return bullets([
      "### Terraform — What, Why, How",
      "",
      "- What: Infrastructure-as-Code (IaC) tool to declaratively provision cloud and on‑prem resources.",
      "- Why: Repeatable environments, version control, reviews, automated changes, drift detection.",
      "- How:",
      "  - Write HCL in modules: providers, resources, variables, outputs.",
      "  - Plan → Apply → Track state (remote backend) → Validate & format.",
      "- Core concepts:",
      "  - Provider (e.g., aws, azurerm, google)",
      "  - Resource & Data source",
      "  - Module (reusable composition)",
      "  - State backend & locking",
      "- Example:",
      "  ```hcl",
      "  provider \"aws\" { region = \"us-east-1\" }",
      "  resource \"aws_s3_bucket\" \"logs\" { bucket = \"my-logs-bucket\" }",
      "  ```",
      "- When: New envs, repeatable infra changes, multi-account/multi-region management.",
      "- Who: Platform/SRE/DevOps teams; app teams consume modules.",
    ]);
  }
  if (p.includes("ansible")) {
    return bullets([
      "### Ansible — What, Why, How",
      "- What: Agentless configuration management & orchestration via YAML playbooks.",
      "- Why: Idempotent, readable automation for servers, apps, and networks.",
      "- How: Inventory → Playbooks → Roles → Tasks → Handlers → Variables.",
      "- Core: modules (package, template, service), become, check mode, tags.",
      "- When: OS/package config, app deploys, day‑2 ops, patching.",
      "- Who: Infra/DevOps teams; app teams for simple ops tasks.",
    ]);
  }
  if (p.includes("jenkins")) {
    return bullets([
      "### Jenkins — What, Why, How",
      "- What: CI server orchestrating builds/tests/deploys via pipelines.",
      "- Why: Mature ecosystem, plugins, on‑prem control.",
      "- How: Jenkinsfile (declarative), agents, shared libraries, credentials.",
      "- When: Complex pipelines, self‑hosted CI needs.",
      "- Who: DevOps/Build teams; developers author stages.",
    ]);
  }
  if (p.includes("argocd") || p.includes("argo cd") || p.includes("argo rollouts") || p.includes("argo")) {
    return bullets([
      "### Argo (CD/Rollouts) — What, Why, How",
      "- What: GitOps CD for Kubernetes; Rollouts adds canary/blue‑green.",
      "- Why: Declarative deployments, audits, easy rollback.",
      "- How: Git as source of truth → sync to clusters; progressive delivery with metrics gates.",
      "- When: K8s app delivery, multi‑env sync, controlled rollouts.",
      "- Who: Platform teams manage Argo; app teams own manifests/Helm.",
    ]);
  }
  if (p.includes("kubernetes") || p.includes("k8s")) {
    return bullets([
      "### Kubernetes — What, Why, How",
      "- What: Orchestrator for containerized workloads.",
      "- Why: Scaling, self‑healing, declarative ops, ecosystem.",
      "- How: Deployments, Services, Ingress, ConfigMap/Secret, HPA; Helm/Kustomize for packaging.",
      "- When: Microservices, high availability, scaling needs.",
      "- Who: Platform/SRE; developers define Deployments/Helm charts.",
    ]);
  }
  if (p.includes("helm")) {
    return bullets([
      "### Helm — What, Why, How",
      "- What: Package manager for Kubernetes (charts).",
      "- Why: Reusable, configurable app templates.",
      "- How: Chart values → render → install/upgrade; chart repos; dependencies.",
      "- When: Standardize app deployment patterns.",
      "- Who: Platform/App teams publishing and consuming charts.",
    ]);
  }
  if (p.includes("ci/cd") || p.includes("cicd") || p.includes("ci cd")) {
    return bullets([
      "### CI/CD — What, Why, How",
      "- What: Continuous Integration/Delivery for fast, safe releases.",
      "- Why: Shorter lead time, higher quality, consistent deploys.",
      "- How: Build → Test → Scan → Package → Deploy → Observe.",
      "- When: Any team shipping frequently.",
      "- Who: Dev/QA/DevOps; platform provides runners and templates.",
    ]);
  }
  return null;
}

function isCanIQuestion(prompt: string): boolean {
  return /^\s*can\s+i\b/i.test(prompt || "");
}

function maybeCanIPrimer(prompt: string): string | null {
  const p = (prompt || "").toLowerCase();
  const bullets = (lines: string[]) => lines.join("\n");

  // Can I deploy AWS EC2 using ArgoCD?
  if ((p.includes("argocd") || p.includes("argo cd")) && (p.includes("ec2") || p.includes("aws ec2"))) {
    return bullets([
      "### Can I deploy AWS EC2 using Argo CD? — No (natively)",
      "",
      "- Why no: Argo CD is a GitOps CD tool for Kubernetes resources; it doesn't provision cloud infra like EC2 by itself.",
      "- How to achieve it anyway (two options):",
      "  1) Kubernetes-native IaC with Crossplane or ACK:",
      "     - Install Crossplane (or AWS Controllers for Kubernetes).",
      "     - Define EC2 (VPC/Subnet/Instance) as CRDs in Git.",
      "     - Argo CD syncs those CRDs → controllers create EC2 in AWS.",
      "  2) Run Terraform via pipeline and let Argo CD deploy apps:",
      "     - Use Jenkins/GitHub Actions/Argo Workflows to terraform apply EC2 infra.",
      "     - Commit K8s manifests/Helm charts → Argo CD deploys to the created cluster/hosts.",
      "- Prerequisites: AWS creds (IRSA/OIDC), remote state (Terraform), Git repo with CRDs or TF code, Argo CD app(s).",
      "- Risks: drift between desired and actual infra; protect with Git as source of truth and policy checks.",
      "- Alternative: Use Terraform Cloud or AWS CDK for provisioning, Argo CD only for K8s apps.",
    ]);
  }

  // Can I use Terraform to manage Kubernetes namespaces?
  if (p.includes("terraform") && (p.includes("kubernetes") || p.includes("k8s")) && p.includes("namespace")) {
    return bullets([
      "Yes ✅ — you can absolutely use Terraform to manage Kubernetes namespaces.",
      "",
      "Terraform has a Kubernetes provider that allows you to declaratively define and manage Kubernetes resources, including Namespace objects.",
      "",
      "#### Example (Kubernetes provider + Namespace)",
      "```hcl",
      "provider \"kubernetes\" {",
      "  config_path = \"~/.kube/config\"  # or use inline authentication",
      "}",
      "",
      "resource \"kubernetes_namespace\" \"example\" {",
      "  metadata {",
      "    name = \"my-namespace\"",
      "    labels = {",
      "      env = \"dev\"",
      "    }",
      "  }",
      "}",
      "```",
      "",
      "When you run:",
      "```bash",
      "terraform init",
      "terraform apply",
      "```",
      "Terraform will create (or reconcile) the namespace `my-namespace` in your cluster.",
      "",
      "Optional: manage other namespaced objects (e.g., ConfigMap) in that namespace:",
      "```hcl",
      "resource \"kubernetes_config_map\" \"example\" {",
      "  metadata {",
      "    name      = \"app-config\"",
      "    namespace = kubernetes_namespace.example.metadata[0].name",
      "  }",
      "  data = {",
      "    foo = \"bar\"",
      "  }",
      "}",
      "```",
      "",
      "- Alternatives: Some teams prefer Helm or Argo CD to manage namespaces alongside workloads. Terraform works well if you're already using it for infrastructure provisioning.",
    ]);
  }

  return null;
}

// Parse comparison prompts like "X vs Y", "difference between X and Y", "compare X and Y"
function parseComparison(prompt: string): { a: string; b: string } | null {
  const p = prompt.trim();
  const patterns = [
    /(.*?)\s+vs\.?\s+(.*)/i,
    /diff(?:erence|erences)?\s+(?:between|b\/w)\s+(.*?)\s+(?:and|&)\s+(.*)/i,
    /compare\s+(.*?)\s+(?:and|&)\s+(.*)/i,
  ];
  for (const rgx of patterns) {
    const m = p.match(rgx);
    if (m && m[1] && m[2]) {
      const clean = (s: string) => s.replace(/[?.!,:;`'"]+$/g, "").trim();
      return { a: clean(m[1]), b: clean(m[2]) };
    }
  }
  return null;
}

function maybeComparisonPrimer(a: string, b: string): string | null {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  const pair = (p1: string, p2: string) => (x.includes(p1) && y.includes(p2)) || (x.includes(p2) && y.includes(p1));

  if (pair("terraform", "ansible")) {
    return [
      "### Terraform vs Ansible — When to Use Which",
      "",
      "- Purpose:",
      "  - Terraform: Provision infra (cloud/network/db) declaratively (IaC).",
      "  - Ansible: Configure OS/apps and orchestrate changes (agentless).",
      "- Model:",
      "  - Terraform: Desired state with plan/apply; tracks state, handles drift.",
      "  - Ansible: Task-based execution; idempotent modules; no persistent state.",
      "- Best for:",
      "  - Terraform: VPCs, subnets, clusters, managed services.",
      "  - Ansible: Packages, config files, services, app deploy steps.",
      "- Together:",
      "  - Use Terraform to create servers/clusters, then Ansible to configure them.",
      "- Choose:",
      "  - Infra lifecycle → Terraform | Day‑2 config → Ansible",
    ].join("\n");
  }

  if (pair("jenkins", "github actions")) {
    return [
      "### Jenkins vs GitHub Actions",
      "",
      "- Hosting/Control:",
      "  - Jenkins: Self‑hosted; full control; plugin ecosystem.",
      "  - GitHub Actions: Managed in GitHub; tight repo integration.",
      "- Pipelines:",
      "  - Jenkinsfile (declarative), agents, shared libraries.",
      "  - YAML workflows, marketplace actions, runners.",
      "- When to choose:",
      "  - Complex/on‑prem/custom agents → Jenkins.",
      "  - GitHub‑native, rapid setup, SaaS → Actions.",
    ].join("\n");
  }

  if (pair("argo cd", "jenkins") || pair("argocd", "jenkins")) {
    return [
      "### Argo CD vs Jenkins",
      "",
      "- Purpose:",
      "  - Argo CD: GitOps continuous delivery for Kubernetes.",
      "  - Jenkins: General CI/automation server.",
      "- Model:",
      "  - Argo CD: Pull‑based sync from Git; desired state in cluster.",
      "  - Jenkins: Push‑based; executes pipelines on events.",
      "- Use together:",
      "  - Build/test in Jenkins → push manifests/Helm to Git → Argo CD deploys.",
    ].join("\n");
  }

  if (pair("argo rollouts", "kubernetes deployments") || pair("argo rollouts", "k8s")) {
    return [
      "### Argo Rollouts vs Native Kubernetes Deployments",
      "",
      "- Strategy support:",
      "  - Rollouts: Canary, blue/green, experiment, traffic shaping.",
      "  - Native: RollingUpdate/Recreate (basic).",
      "- Observability/gates:",
      "  - Rollouts: Metrics analysis (Prometheus/New Relic), pause/resume, undo.",
      "  - Native: Basic status; no metric‑gated steps.",
      "- Choose:",
      "  - Progressive delivery needs → Rollouts; simple updates → native.",
    ].join("\n");
  }

  if (pair("helm", "kustomize")) {
    return [
      "### Helm vs Kustomize",
      "",
      "- Templating:",
      "  - Helm: Go templates + values; packages as charts.",
      "  - Kustomize: Patch/overlay manifests; no templates.",
      "- Distribution:",
      "  - Helm: Chart repos, dependencies, lifecycle commands.",
      "  - Kustomize: Git‑native overlays; often paired with GitOps tools.",
      "- Choose:",
      "  - App packaging/sharing → Helm; env overlays without templating → Kustomize.",
    ].join("\n");
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { message, model = "gemini-2.5-pro" } = await req.json();

    if (!isAllowedTopic(message)) {
      return Response.json({ output: OUT_OF_SCOPE_MESSAGE, tokens: { input: 0, output: 0, total: 0 }, blocked: false });
    }

    // Comparison primers for "X vs Y" type queries
    const comp = parseComparison(message);
    if (comp) {
      const direct = maybeComparisonPrimer(comp.a, comp.b);
      if (direct) {
        return Response.json({ output: direct, blocked: false, tokens: { input: 0, output: 0, total: 0 } });
      }
    }

    // Immediate primers for Can I / conceptual / topic-specific questions
    const canI = isCanIQuestion(message) ? maybeCanIPrimer(message) : null;
    const primer = canI || maybeDevOpsPrimer(message) || maybeTopicPrimer(message);
    if (primer) {
      return Response.json({ output: primer, blocked: false, tokens: { input: 0, output: 0, total: 0 } });
    }

    const gm = getGemini(model);

    // If it's a comparison but not a known pair, or a Can I question, augment the prompt
    const augmentedMessage = comp
      ? `Compare ${comp.a} vs ${comp.b} in structured bullet points: purpose, model, strengths, limitations, when to choose each, how they work together. Keep it concise and actionable.`
      : isCanIQuestion(message)
        ? `Answer with an explicit Yes/No first line. Then structured bullet points: Why, How (steps/commands), prerequisites, risks, alternatives.\n\nQuestion: ${message}`
        : message;

    let inputTokens = 0;
    try {
      const count = await gm.countTokens({ contents: [{ role: "user", parts: [{ text: augmentedMessage }] }] });
      inputTokens = (count.totalTokens as number) ?? 0;
    } catch {}

    const result = await gm.generateContent({
      contents: [{ role: "user", parts: [{ text: augmentedMessage }] }],
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
      const primer2 = (comp && maybeComparisonPrimer(comp.a, comp.b)) || maybeDevOpsPrimer(message) || maybeTopicPrimer(message);
      output = argo || primer2 || "I couldn’t generate a response. Please rephrase or provide more details.";
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

export const ALLOWED_TOPICS = [
  "ci",
  "cd",
  "cicd",
  "devops",
  "terraform",
  "ansible",
  "jenkins",
  "spinnaker",
  "argo",
  "argocd",
  "workflows",
  "rollouts",
  "decsecops",
  "shell",
  "bash",
  "kubernetes",
  "helm",
];

export function isAllowedTopic(input: string): boolean {
  const text = (input || "").toLowerCase();
  return ALLOWED_TOPICS.some((t) => text.includes(t));
}

export const SYSTEM_POLICY = `You are a Responsible DevOps assistant. Only answer questions about CI/CD, DevOps, Terraform, Ansible,
Jenkins, Spinnaker, Argo (CD/Workflows/Rollouts), DecSecOps, and Shell scripting. If the user asks anything outside these topics,
politely refuse and suggest DevOps topics.`;

export const OUT_OF_SCOPE_MESSAGE =
  "Sorry, I can only assist with DevOps/CI/CD topics (Terraform, Ansible, Jenkins, Spinnaker, Argo, DecSecOps, Shell).";

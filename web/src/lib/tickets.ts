export type CreateTicketInput = {
  title: string;
  description: string;
};

export async function createJiraTicket(input: CreateTicketInput): Promise<{ key: string; url: string }> {
  const baseUrl = process.env.JIRA_BASE_URL || ""; // e.g., https://your.atlassian.net
  const email = process.env.JIRA_EMAIL || "";
  const token = process.env.JIRA_API_TOKEN || "";
  const projectKey = process.env.JIRA_PROJECT_KEY || "";
  const issueType = process.env.JIRA_ISSUE_TYPE || "Task";
  if (!baseUrl || !email || !token || !projectKey) {
    throw new Error("Missing Jira configuration (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY)");
  }
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: input.title,
        issuetype: { name: issueType },
        description: input.description,
      },
    }),
  });
  const data: { key?: string; self?: string } = await res.json();
  if (!res.ok || !data.key) {
    const msg = (data as unknown as { errorMessages?: string[] })?.errorMessages?.join(", ") || res.statusText;
    throw new Error(`Jira create failed: ${msg}`);
  }
  return { key: data.key, url: `${baseUrl}/browse/${data.key}` };
}

export async function createFreshdeskTicket(input: CreateTicketInput): Promise<{ id: number; url: string }> {
  const domain = process.env.FRESHDESK_DOMAIN || ""; // yourcompany.freshdesk.com
  const apiKey = process.env.FRESHDESK_API_KEY || "";
  if (!domain || !apiKey) {
    throw new Error("Missing Freshdesk configuration (FRESHDESK_DOMAIN, FRESHDESK_API_KEY)");
  }
  const url = `https://${domain}/api/v2/tickets`;
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      subject: input.title,
      description: input.description,
      status: 2,
      priority: 2,
    }),
  });
  const data: { id?: number } = await res.json();
  if (!res.ok || !data.id) {
    const msg = res.statusText;
    throw new Error(`Freshdesk create failed: ${msg}`);
  }
  return { id: data.id, url: `https://${domain}/a/tickets/${data.id}` };
}



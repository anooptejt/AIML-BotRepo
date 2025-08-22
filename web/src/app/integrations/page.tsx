"use client";
import { useState } from "react";

export default function IntegrationsPage() {
  const [slackToken, setSlackToken] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [freshdeskDomain, setFreshdeskDomain] = useState("");
  const [freshdeskKey, setFreshdeskKey] = useState("");

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Integrations</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Slack</h2>
        <p className="text-sm text-gray-600 mb-3">OAuth or Bot Token based integration to post messages from chat.</p>
        <div className="border rounded p-3 space-y-2">
          <label className="block text-sm">Bot Token (xoxb-...)
            <input className="border rounded w-full px-2 py-1" value={slackToken} onChange={(e)=>setSlackToken(e.target.value)} placeholder="xoxb-..." />
          </label>
          <label className="block text-sm">Default Channel (name or ID)
            <input className="border rounded w-full px-2 py-1" value={slackChannel} onChange={(e)=>setSlackChannel(e.target.value)} placeholder="#general or C123..." />
          </label>
          <div className="text-sm text-gray-600">
            <div className="font-medium mb-1">Mandatory:</div>
            <ul className="list-disc pl-5">
              <li>Slack App with chat:write, channels:read (or related) scopes</li>
              <li>Bot Token (xoxb-)</li>
              <li>Default channel to post (ID or name)</li>
              <li>Redirect URL and OAuth configured if using OAuth</li>
            </ul>
          </div>
          <button className="bg-black text-white px-3 py-1 rounded" type="button">Save Slack</button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Jira</h2>
        <p className="text-sm text-gray-600 mb-3">Create tickets from a thumbs-down response or from chat.</p>
        <div className="border rounded p-3 space-y-2">
          <label className="block text-sm">Jira Cloud URL
            <input className="border rounded w-full px-2 py-1" value={jiraUrl} onChange={(e)=>setJiraUrl(e.target.value)} placeholder="https://your-domain.atlassian.net" />
          </label>
          <label className="block text-sm">Email
            <input className="border rounded w-full px-2 py-1" value={jiraEmail} onChange={(e)=>setJiraEmail(e.target.value)} placeholder="name@company.com" />
          </label>
          <label className="block text-sm">API Token
            <input className="border rounded w-full px-2 py-1" value={jiraToken} onChange={(e)=>setJiraToken(e.target.value)} placeholder="jira api token" />
          </label>
          <div className="text-sm text-gray-600">
            <div className="font-medium mb-1">Mandatory:</div>
            <ul className="list-disc pl-5">
              <li>Cloud URL, user email, API token</li>
              <li>Project key and default issue type configured in backend</li>
            </ul>
          </div>
          <button className="bg-black text-white px-3 py-1 rounded" type="button">Save Jira</button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Freshdesk</h2>
        <p className="text-sm text-gray-600 mb-3">Create support tickets from chat.</p>
        <div className="border rounded p-3 space-y-2">
          <label className="block text-sm">Freshdesk Domain
            <input className="border rounded w-full px-2 py-1" value={freshdeskDomain} onChange={(e)=>setFreshdeskDomain(e.target.value)} placeholder="yourcompany.freshdesk.com" />
          </label>
          <label className="block text-sm">API Key
            <input className="border rounded w-full px-2 py-1" value={freshdeskKey} onChange={(e)=>setFreshdeskKey(e.target.value)} placeholder="freshdesk api key" />
          </label>
          <div className="text-sm text-gray-600">
            <div className="font-medium mb-1">Mandatory:</div>
            <ul className="list-disc pl-5">
              <li>Freshdesk domain and API key</li>
              <li>Default group/priority configured in backend</li>
            </ul>
          </div>
          <button className="bg-black text-white px-3 py-1 rounded" type="button">Save Freshdesk</button>
        </div>
      </section>

      <section className="text-sm text-gray-600">
        <h3 className="text-base font-semibold mb-1">From chat</h3>
        <ul className="list-disc pl-5">
          <li>Use thumbs-down to open a prompt suggesting a Jira or Freshdesk ticket with the last response and context.</li>
          <li>Slack posting uses saved default channel unless you specify a channel in the prompt.</li>
        </ul>
      </section>
    </main>
  );
}



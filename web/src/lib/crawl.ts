import { JSDOM } from "jsdom";

export async function fetchAndExtract(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const title = doc.title || url;
  // crude extraction: drop script/style, get visible text
  doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
  const text = doc.body?.textContent?.replace(/\s+/g, " ").trim() || "";
  return { title, text };
}

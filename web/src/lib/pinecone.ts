import { Pinecone } from "@pinecone-database/pinecone";

let pc: Pinecone | null = null;

export function getPinecone() {
  if (!pc) {
    if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY not set");
    pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return pc;
}

export function getIndex() {
  const indexName = process.env.PINECONE_INDEX || "devops-chat";
  return getPinecone().Index(indexName, process.env.PINECONE_HOST);
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Forward to Python backend
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8080";
    const response = await fetch(`${backendUrl}/ansible-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Ansible generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate Ansible playbook" },
      { status: 500 }
    );
  }
}

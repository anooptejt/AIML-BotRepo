import { NextResponse, type NextRequest } from "next/server";

// Very simple in-memory limiter (per instance). Replace with Redis in prod.
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQS = 30; // per IP per window
const hits = new Map<string, { count: number; reset: number }>();

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_REQS) return false;
  rec.count += 1;
  return true;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limit API and chat page
  if (pathname.startsWith("/api/") || pathname.startsWith("/chat")) {
    const ip = getIp(req);
    if (!rateLimit(String(ip))) {
      return new NextResponse(JSON.stringify({ error: "RATE_LIMITED" }), { status: 429 });
    }
  }

  // Security headers baseline
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/chat"],
};

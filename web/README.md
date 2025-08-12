# DevOps Chat (Next.js)

A Responsible AI assistant limited to DevOps/CI/CD topics (Terraform, Ansible, Jenkins, Spinnaker, Argo, DecSecOps, Shell). Uses Google Gemini via AI Studio.

## Setup
1) Env file `web/.env.local`:
```
GEMINI_API_KEY=YOUR_KEY
NEXTAUTH_SECRET=some-random-string
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
NEXTAUTH_URL=http://localhost:3000
```

2) Install & run (dev):
```
npm install
npm run dev
```
Visit http://localhost:3000/chat

## Production
```
npm run build
npm run start
```

Keep it running with pm2:
```
npm install -g pm2
pm2 start "npm run start" --name devops-chat --cwd "$(pwd)"
pm2 save
pm2 startup   # follow printed instructions
```

## Security & Guardrails
- Topic allowlist enforced in API
- Safety settings enabled; blocked/empty responses return a safe fallback
- Session required (GitHub sign-in) to access /chat
- Basic rate limiting and security headers via middleware
- Do not commit `.env.local` or secrets

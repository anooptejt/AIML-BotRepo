# AIML-BotRepo
AIML-BotRepo

## ToDo List for Tomorrow
- [x] Create Simple UI
- [x] Create Simple Backend
- [ ] Github Authentication
- [x] With Gemini Chat Model

## Sprint Planning (August 18th - September 30th)

### Sprint 1: Foundation (August 18th - August 25th)
**Goal:** Set up basic project structure and core functionality
- [x] Set up project structure (frontend and backend directories)
- [x] Implement basic chat UI for user interaction
- [ ] Add GitHub authentication (OAuth) for user login
- [x] Integrate Gemini or LLM for basic code generation (e.g., shell scripts)
- [x] Implement token tracking system for input/output tokens display in UI

### Sprint 2: Core Features (August 26th - September 2nd)
**Goal:** Implement essential features for code analysis and visualization
- [ ] Implement code parsing for open-source projects (basic file upload and analysis)
- [ ] Add diagram/visual workflow generation using Mermaid.js or similar
- [ ] Integrate Pinecone Vector DB (free tier) for storing and retrieving relevant information

### Sprint 3: DevOps Tools Integration (September 3rd - September 10th)
**Goal:** Add support for major DevOps tools and platforms
- [ ] Add support for Jenkins pipeline generation and management
- [ ] Add support for Terraform job generation and analysis
- [ ] Add support for Ansible playbook generation and analysis

### Sprint 4: Advanced DevOps & Argo (September 11th - September 18th)
**Goal:** Implement advanced DevOps features and Argo ecosystem
- [ ] Add support for ArgoCD, Argo Workflows, and Argo Rollouts
- [ ] Integrate a pre-trained model (e.g., Google Gemini) that provides accurate results for user input
- [ ] Implement DevOps/DevSecOps process guidance and best practices

### Sprint 5: Testing & Polish (September 19th - September 30th)
**Goal:** Final testing, optimization, and documentation
- [ ] Test with real-world open-source projects for feedback and improvement
- [ ] Polish UI/UX and add user documentation
- [ ] Performance optimization and bug fixes
- [ ] Final integration testing and deployment preparation

## Detailed ToDo List (Prioritized)

### Immediate/Easier Tasks
- [x] Set up project structure (frontend and backend directories)
- [x] Implement basic chat UI for user interaction
- [ ] Add GitHub authentication (OAuth) for user login
- [x] Integrate Gemini or LLM for basic code generation (e.g., shell scripts)
- [ ] Implement code parsing for open-source projects (basic file upload and analysis)
- [ ] Add diagram/visual workflow generation using Mermaid.js or similar
- [x] Implement token tracking system for input/output tokens display in UI

### Intermediate Tasks
- [ ] Add support for Jenkins pipeline generation and management
- [ ] Add support for ArgoCD, Argo Workflows, and Argo Rollouts
- [ ] Add support for Terraform job generation and analysis
- [ ] Add support for Ansible playbook generation and analysis
- [ ] Integrate a pre-trained model (e.g., Google Gemini) that provides accurate results for user input
- [ ] Integrate Pinecone Vector DB (free tier) for storing and retrieving relevant information

### Advanced/Complex Tasks
- [ ] Implement DevOps/DecSecOps process guidance and best practices
- [ ] Test with real-world open-source projects for feedback and improvement
- [ ] Polish UI/UX and add user documentation

---

## Web App (Next.js) — Quick Start

Prereqs: Node 18+.

1. Set env vars in `web/.env.local`:
```
GEMINI_API_KEY=YOUR_KEY
NEXTAUTH_SECRET=some-random-string
NEXTAUTH_URL=http://localhost:3000
LOCAL_USERNAME=anoop@opsmx.io
# Use either LOCAL_PASSWORD_HASH (bcrypt) or LOCAL_PASSWORD (dev only)
LOCAL_PASSWORD_HASH=<bcrypt-hash>
# LOCAL_PASSWORD=<plaintext-dev-only>
# Optional: Google OAuth
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
```

2. Install & run:
```
cd web
npm install
npm run dev
```
Visit `http://localhost:3000/chat`.

### Production build
```
cd web
npm run build
npm run start
```

### Keep it running with pm2
```
npm install -g pm2
cd web
npm run build
pm2 start "npm run start" --name devops-chat --cwd "$(pwd)"
pm2 save
pm2 startup   # follow instructions printed
```

### Container build (Docker)
```
cd web
docker build -t devops-chat:latest .
# run locally
docker run --rm -p 3000:3000 \
  -e GEMINI_API_KEY=$GEMINI_API_KEY \
  -e NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
  -e NEXTAUTH_URL=http://localhost:3000 \
  -e LOCAL_USERNAME=anoop@opsmx.io \
  -e LOCAL_PASSWORD_HASH=$LOCAL_PASSWORD_HASH \
  -e GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  -e GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
  devops-chat:latest
```

### Kubernetes
```
# Edit k8s/config.yaml to set NEXTAUTH_URL, LOCAL_USERNAME
# Put secrets in k8s/config.yaml (stringData) or create a separate Secret
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/deployment.yaml

# Port-forward to test
kubectl port-forward svc/devops-chat 3000:80
# open http://localhost:3000
```

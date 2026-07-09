# ModelDesk AI

ModelDesk AI is a starter SaaS for a multi-model AI assistant service. It includes a landing page, signup/login, authenticated chat, OpenAI/Gemini/Claude provider routing, user API settings, plans, PayPal checkout wiring, admin controls, plugins, and themes.

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

The first account that signs up becomes the admin.

## Environment Variables

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.1
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-5
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
DATA_DIR=data
PORT=3000
```

Users can also add their own OpenAI, Gemini, and Claude API keys from the workspace API Settings panel.

## Deploy

Deploy as a Node web service using:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
```

## Production Notes

This is an MVP starter. For production, add encrypted secret storage, a hosted database, email verification, password reset, PayPal webhooks, audit logs, rate limiting, and legal pages.

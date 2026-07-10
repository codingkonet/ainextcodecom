# AInextcode

AInextcode is a starter SaaS for a multi-model assistant service. It includes a landing page, signup/login, authenticated chat, OpenAI/Gemini/Claude/OpenRouter provider routing, user API keys, plans, PayPal settings, plugins, themes, and free model presets.

## Setup

Set the keys you want to use. You can start with only one AI provider and add the rest later.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

The first account that signs up becomes the admin.

## Included

- Landing page for the service.
- Signup, login, logout, and secure password hashing.
- Cookie-based sessions.
- Authenticated chat workspace.
- OpenAI, Gemini, Claude, and OpenRouter API connectors.
- User API settings panel for changing personal provider keys and model names.
- User plans with message limits and provider access.
- PayPal order creation and capture endpoints.
- Admin panel for users, plans, plugins, themes, payments, PayPal email, and free model presets.
- JSON file storage in `data/db.json`.
- Render and Docker deployment files.

## Environment Variables

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.1
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-5
OPENROUTER_API_KEY=
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_RECEIVER_EMAIL=
DATA_DIR=data
PORT=3000
```

Users can also add their own OpenAI, Gemini, Claude, and OpenRouter API keys from the workspace API Settings panel.

## Deploy

Deploy as a Node web service using:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
```

## Notes

Copyright (c) 2026 AInextcode. All rights reserved.

This is a deployable MVP, not a complete production billing system. For production, add encrypted secret storage, a hosted database, email verification, password reset, PayPal webhooks, audit logs, rate limiting, and legal pages.

See `DEPLOYMENT.md` for deployment steps.

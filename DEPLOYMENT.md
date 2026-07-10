# AInextcode Deployment

This app deploys as a Node.js web service. Keep all API keys in your hosting provider's environment variables.

## Required Environment Variables

```text
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-5.1
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash
ANTHROPIC_API_KEY=your_anthropic_key_here
CLAUDE_MODEL=claude-sonnet-4-5
OPENROUTER_API_KEY=your_openrouter_key_here
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
PAYPAL_RECEIVER_EMAIL=you@example.com
DATA_DIR=data
```

Most hosts set `PORT` automatically.

## Render

1. Push this folder to GitHub.
2. In Render, choose **New Web Service**.
3. Connect the repository.
4. Use:

   ```text
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Health Check Path: /healthz
   ```

5. Add the environment variables.
6. Deploy.

The included `render.yaml` can also be used as a Render blueprint.

## Railway

1. Push this folder to GitHub.
2. Create a Railway project from the repository.
3. Add the environment variables.
4. Railway should detect the Node app and run `npm start`.

## Docker

Build:

```bash
docker build -t ainextcode .
```

Run:

```bash
docker run -p 3000:3000 --env-file .env ainextcode
```

Open:

```text
http://localhost:3000
```

## PayPal

The app creates PayPal Orders and captures them after approval. For production subscriptions, add PayPal webhooks and store recurring billing agreement data.

The admin panel can store a PayPal receiver email for display/manual billing workflows.

## Health Check

```text
/healthz
```

The health check reports provider configuration and PayPal configuration status.

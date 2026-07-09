# Deployment

Deploy this app as a Node.js web service. Keep API keys in environment variables, not in code.

## Render

1. Push or connect this GitHub repo in Render.
2. Create a **Web Service**.
3. Use:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
```

4. Add environment variables from `.env.example`.
5. Deploy.

## Railway

1. Create a Railway project from this repository.
2. Add the environment variables.
3. Railway should run `npm start`.

## Docker

```bash
docker build -t modeldesk-ai .
docker run -p 3000:3000 --env-file .env modeldesk-ai
```

## Important

The starter uses JSON file storage by default. On production hosting, use a persistent disk or replace it with a hosted database before taking real users.

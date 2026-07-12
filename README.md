# AInextcode

AInextcode is a free multi-model assistant service. It includes a landing page, signup/login, authenticated chat, OpenAI/Gemini/Claude/OpenRouter/AInextcode API provider routing, user API keys, plugins, themes, terminal clients, an Android app project, and free model presets.

## Setup

Set the keys you want to use. You can start with only one AI provider and add the rest later.

```powershell
$env:OPENAI_API_KEY="your_openai_key_here"
$env:GEMINI_API_KEY="your_gemini_key_here"
$env:ANTHROPIC_API_KEY="your_anthropic_key_here"
$env:OPENROUTER_API_KEY="your_openrouter_key_here"
$env:AINEXTCODE_API_KEY="your_ainextcode_api_key_here"
npm start
```

Open:

```text
http://localhost:3000
```

The first account that signs up becomes the admin.

## Terminal Version

Run the assistant directly in a terminal. By default it connects to the deployed AInextcode service at `https://ainextcodecom.onrender.com` and asks you to log in.

```powershell
npm run terminal
```

If PowerShell blocks `npm`, use:

```powershell
npm.cmd run terminal
```

You can also run it directly:

```powershell
node terminal.js
```

Connect explicitly to the deployed site:

```powershell
node terminal.js --server https://ainextcodecom.onrender.com
```

Create an account from the terminal:

```powershell
node terminal.js --signup
```

Use local API keys instead of the hosted server:

```powershell
node terminal.js --local
```

Optional examples:

```powershell
npm.cmd run terminal -- --provider openrouter
npm.cmd run terminal -- --provider ainextcode --model ainextcode-agent
npm.cmd run terminal -- --provider openai --model gpt-5.1
```

Inside the terminal chat, use `/help` to see commands like `/provider`, `/model`, `/specialization`, `/clear`, and `/exit`.

## Android App

The `android-app` folder contains a native Android terminal-style app linked to:

```text
https://ainextcodecom.onrender.com
```

Open `android-app` in Android Studio and build the APK. The Android app supports login, signup, provider/model selection, and chat through the deployed Render backend.

There is also a GitHub Actions workflow at `.github/workflows/android-build.yml` that can build a debug APK from the repository.

## Included

- Landing page for the service.
- Signup, login, logout, and secure password hashing.
- Cookie-based sessions.
- Authenticated chat workspace.
- Terminal chat workspace.
- Android terminal app project.
- OpenAI, Gemini, Claude, and AInextcode API connectors.
- OpenRouter connector for free model presets.
- AInextcode API provider for bot and agent models based on `https://ai.ainextcode.com`.
- User API settings panel for changing personal provider keys and model names.
- Free access for all users.
- Admin panel for users, plugins, themes, and free model presets.
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
AINEXTCODE_API_KEY=
AINEXTCODE_MODEL=ainextcode-agent
AINEXTCODE_API_BASE_URL=https://ai.ainextcode.com/v1
DATA_DIR=data
PORT=3000
```

## Notes

Copyright (c) 2026 AInextcode. All rights reserved.

This is a deployable MVP. User-saved API keys are stored in the app database for this starter version. For production, add encrypted secret storage, database hosting, email verification, password reset, audit logs, rate limiting, and legal pages.

See `DEPLOYMENT.md` for deployment steps.

# AInextcode Android Terminal

This is a native Android terminal-style client for the deployed AInextcode backend:

```text
https://ainextcodecom.onrender.com
```

## Build

Open the `android-app` folder in Android Studio, let Gradle sync, then choose:

```text
Build > Build Bundle(s) / APK(s) > Build APK(s)
```

The app talks to:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/me`
- `POST /api/chat`

## Use

1. Install the APK on Android.
2. Log in with your AInextcode account, or sign up from the app.
3. Pick a provider and model.
4. Send messages from the terminal area.

Supported slash commands:

```text
/help
/status
/provider openai
/provider gemini
/provider claude
/provider openrouter
/provider ainextcode
/model model-name
/clear
```

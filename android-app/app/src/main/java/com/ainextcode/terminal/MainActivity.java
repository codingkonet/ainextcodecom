package com.ainextcode.terminal;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String DEFAULT_SERVER = "https://ainextcodecom.onrender.com";
    private static final String[] PROVIDERS = {"openai", "gemini", "claude", "openrouter", "ainextcode"};

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<JSONObject> messages = new ArrayList<>();

    private EditText serverInput;
    private EditText emailInput;
    private EditText passwordInput;
    private Spinner providerSpinner;
    private EditText modelInput;
    private EditText specializationInput;
    private TextView terminal;
    private EditText messageInput;
    private ScrollView terminalScroll;

    private String cookie = "";
    private JSONObject user;
    private JSONObject plan;
    private JSONObject config;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());
        append("AInextcode Terminal Android");
        append("Linked to " + DEFAULT_SERVER);
        append("Log in or sign up, then send a message. Type /help for commands.");
    }

    private View buildUi() {
        int bg = Color.rgb(17, 23, 21);
        int panel = Color.rgb(24, 32, 30);
        int ink = Color.rgb(242, 247, 244);
        int muted = Color.rgb(164, 180, 173);
        int accent = Color.rgb(45, 212, 191);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(bg);

        TextView title = text("AInextcode", 24, ink, true);
        root.addView(title);

        serverInput = input(DEFAULT_SERVER, "Server URL", panel, ink, muted);
        root.addView(serverInput);

        LinearLayout authRow = row();
        emailInput = input("", "Email", panel, ink, muted);
        passwordInput = input("", "Password", panel, ink, muted);
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        authRow.addView(emailInput, weightParams(1));
        authRow.addView(passwordInput, weightParams(1));
        root.addView(authRow);

        LinearLayout authButtons = row();
        authButtons.addView(button("Log in", accent, () -> login(false)), weightParams(1));
        authButtons.addView(button("Sign up", accent, () -> login(true)), weightParams(1));
        authButtons.addView(button("Status", accent, this::loadStatus), weightParams(1));
        root.addView(authButtons);

        LinearLayout controls = row();
        providerSpinner = new Spinner(this);
        providerSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, PROVIDERS));
        modelInput = input("gpt-5.1", "Model", panel, ink, muted);
        controls.addView(providerSpinner, weightParams(1));
        controls.addView(modelInput, weightParams(1));
        root.addView(controls);

        specializationInput = input("general help", "Specialization", panel, ink, muted);
        root.addView(specializationInput);

        terminal = text("", 15, ink, false);
        terminal.setTextIsSelectable(true);
        terminal.setPadding(dp(12), dp(12), dp(12), dp(12));
        terminal.setBackgroundColor(Color.rgb(16, 28, 26));
        terminalScroll = new ScrollView(this);
        terminalScroll.addView(terminal);
        root.addView(terminalScroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout sendRow = row();
        messageInput = input("", "Ask AInextcode...", panel, ink, muted);
        sendRow.addView(messageInput, weightParams(1));
        sendRow.addView(button("Send", accent, this::sendMessage), new LinearLayout.LayoutParams(dp(96), dp(48)));
        root.addView(sendRow);

        return root;
    }

    private void login(boolean signup) {
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        String name = email.contains("@") ? email.split("@")[0] : email;

        runRemote(() -> {
            JSONObject body = new JSONObject();
            body.put("email", email);
            body.put("password", password);
            if (signup) body.put("name", name);
            JSONObject response = request(signup ? "/api/auth/signup" : "/api/auth/login", "POST", body);
            user = response.optJSONObject("user");
            loadStatusSync();
            append("Connected as " + (user != null ? user.optString("email") : "user") + ".");
        });
    }

    private void loadStatus() {
        runRemote(() -> {
            loadStatusSync();
            appendStatus();
        });
    }

    private void loadStatusSync() throws Exception {
        JSONObject response = request("/api/me", "GET", null);
        user = response.optJSONObject("user");
        plan = response.optJSONObject("plan");
        config = response.optJSONObject("config");
        setDefaultModelFromConfig();
    }

    private void setDefaultModelFromConfig() {
        if (config == null) return;
        JSONArray providers = config.optJSONArray("providers");
        if (providers == null) return;
        String selected = selectedProvider();
        for (int i = 0; i < providers.length(); i++) {
            JSONObject provider = providers.optJSONObject(i);
            if (provider != null && selected.equals(provider.optString("id"))) {
                String model = provider.optString("defaultModel", "");
                if (!model.isEmpty()) main.post(() -> modelInput.setText(model));
                return;
            }
        }
    }

    private void sendMessage() {
        String text = messageInput.getText().toString().trim();
        if (text.isEmpty()) return;

        if (text.startsWith("/")) {
            handleCommand(text);
            messageInput.setText("");
            return;
        }

        messageInput.setText("");
        append("You> " + text);
        String provider = selectedProvider();
        String model = modelInput.getText().toString().trim();
        String specialization = specializationInput.getText().toString().trim();

        runRemote(() -> {
            messages.add(new JSONObject().put("role", "user").put("content", text));
            trimMessages();

            JSONObject body = new JSONObject();
            body.put("messages", new JSONArray(messages));
            body.put("provider", provider);
            body.put("model", model);
            body.put("specialization", specialization);
            body.put("plugins", new JSONArray());

            JSONObject response = request("/api/chat", "POST", body);
            String answer = response.optString("message", "No response returned.");
            messages.add(new JSONObject().put("role", "assistant").put("content", answer));
            trimMessages();
            append("AInextcode> " + answer);
        });
    }

    private void handleCommand(String raw) {
        String[] parts = raw.substring(1).split(" ", 2);
        String command = parts[0].toLowerCase();
        String value = parts.length > 1 ? parts[1].trim() : "";

        if ("help".equals(command)) {
            append("Commands: /help, /status, /provider openai|gemini|claude|openrouter|ainextcode, /model name, /clear");
        } else if ("status".equals(command)) {
            appendStatus();
        } else if ("provider".equals(command)) {
            for (int i = 0; i < PROVIDERS.length; i++) {
                if (PROVIDERS[i].equals(value)) {
                    providerSpinner.setSelection(i);
                    setDefaultModelFromConfig();
                    append("Provider changed to " + value + ".");
                    return;
                }
            }
            append("Unknown provider.");
        } else if ("model".equals(command)) {
            modelInput.setText(value);
            append("Model changed to " + value + ".");
        } else if ("clear".equals(command)) {
            messages.clear();
            terminal.setText("");
            append("Conversation cleared.");
        } else {
            append("Unknown command. Type /help.");
        }
    }

    private JSONObject request(String path, String method, JSONObject body) throws Exception {
        URL url = new URL(serverInput.getText().toString().replaceAll("/+$", "") + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setRequestProperty("Content-Type", "application/json");
        if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(60000);

        if (body != null) {
            connection.setDoOutput(true);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
        }

        String setCookie = connection.getHeaderField("Set-Cookie");
        if (setCookie != null) cookie = setCookie.split(";", 2)[0];

        int code = connection.getResponseCode();
        InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String text = readAll(stream);
        JSONObject json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
        if (code >= 400) throw new Exception(json.optString("error", "Request failed: " + code));
        return json;
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private void runRemote(RemoteWork work) {
        executor.execute(() -> {
            try {
                work.run();
            } catch (Exception error) {
                append("Error: " + error.getMessage());
            }
        });
    }

    private void appendStatus() {
        String account = user != null ? user.optString("email", "logged in") : "not logged in";
        String planName = plan != null ? plan.optString("name", "unknown") : "unknown";
        append("Server: " + serverInput.getText());
        append("Account: " + account);
        append("Plan: " + planName);
        append("Provider: " + selectedProvider());
        append("Model: " + modelInput.getText());
    }

    private String selectedProvider() {
        return String.valueOf(providerSpinner.getSelectedItem());
    }

    private void trimMessages() {
        while (messages.size() > 20) messages.remove(0);
    }

    private void append(String text) {
        main.post(() -> {
            terminal.append(text + "\n\n");
            terminalScroll.post(() -> terminalScroll.fullScroll(View.FOCUS_DOWN));
        });
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        view.setPadding(0, dp(5), 0, dp(5));
        return view;
    }

    private EditText input(String value, String hint, int bg, int color, int hintColor) {
        EditText view = new EditText(this);
        view.setText(value);
        view.setHint(hint);
        view.setTextColor(color);
        view.setHintTextColor(hintColor);
        view.setSingleLine(true);
        view.setPadding(dp(10), 0, dp(10), 0);
        view.setBackgroundColor(bg);
        return view;
    }

    private Button button(String label, int bg, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.rgb(7, 19, 17));
        button.setBackgroundColor(bg);
        button.setGravity(Gravity.CENTER);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        return row;
    }

    private LinearLayout.LayoutParams weightParams(int weight) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), weight);
        params.setMargins(dp(3), 0, dp(3), 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private interface RemoteWork {
        void run() throws Exception;
    }
}

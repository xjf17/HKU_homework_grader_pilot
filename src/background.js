"use strict";

const DEFAULT_TIMEOUT_MS = 60000;

function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out.")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function fetchBinary(url) {
  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    })
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch binary: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const buffer = await response.arrayBuffer();
  return { buffer, contentType };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchDataUrl(url) {
  const start = Date.now();
  const { buffer, contentType } = await fetchBinary(url);
  const fetchedAt = Date.now();
  const mimeType = contentType || "application/octet-stream";
  const base64 = arrayBufferToBase64(buffer);
  const encodedAt = Date.now();
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    contentType: mimeType,
    bytes: buffer.byteLength || 0,
    fetchMs: fetchedAt - start,
    encodeMs: encodedAt - fetchedAt,
    totalMs: encodedAt - start
  };
}

function resolveProviderConfig(providerRaw) {
  const provider = String(providerRaw || "openrouter").toLowerCase();
  if (provider === "openai") {
    return {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions"
    };
  }
  if (provider === "openrouter" || provider === "penrouter") {
    return {
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions"
    };
  }
  throw new Error(`Unsupported provider: ${providerRaw}`);
}

async function callChatCompletion({
  apiKey,
  provider,
  model,
  messages,
  temperature,
  responseFormat,
  referer,
  appTitle
}) {
  if (!apiKey) {
    throw new Error("Missing API key.");
  }
  const resolved = resolveProviderConfig(provider);
  const body = {
    model,
    messages,
    temperature: typeof temperature === "number" ? temperature : 0.2
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  if (resolved.provider === "openrouter") {
    body.reasoning = { effort: "low" };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (resolved.provider === "openrouter") {
    if (referer) headers["HTTP-Referer"] = referer;
    headers["X-Title"] = appTitle || "Homework Grading Copilot";
  }

  const response = await withTimeout(
    fetch(resolved.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }),
    90000
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${resolved.provider} error ${response.status}: ${errText}`);
  }
  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") {
      throw new Error("Invalid message.");
    }
    if (message.type === "HG_FETCH_BINARY") {
      const data = await fetchBinary(message.url);
      sendResponse({ ok: true, data });
      return;
    }
    if (message.type === "HG_FETCH_DATA_URL") {
      const data = await fetchDataUrl(message.url);
      sendResponse({ ok: true, data });
      return;
    }
    if (message.type === "HG_CHAT_COMPLETION" || message.type === "HG_OPENAI_CHAT") {
      const payload = message.payload || {};
      const data = await callChatCompletion({
        ...payload,
        provider: payload.provider || (message.type === "HG_OPENAI_CHAT" ? "openai" : "openrouter")
      });
      sendResponse({ ok: true, data });
      return;
    }
    throw new Error(`Unknown message type: ${message.type}`);
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  });
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "HG_TOGGLE_OVERLAY" });
  } catch (_error) {
    // Ignore pages where content script is unavailable.
  }
});

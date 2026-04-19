"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function registerLlmClient(ns) {
  const STORAGE_KEY = "HG_SETTINGS_V1";
  const DEFAULT_SETTINGS = {
    provider: "openrouter",
    apiKey: "",
    model: "google/gemini-3-flash-preview",
    maxScore: 100,
    referenceAnswer: "",
    maxImagePages: 5,
    temperature: 0.2,
    sendConfirmation: true
  };

  const PROVIDER_DEFAULT_MODEL = {
    openrouter: "google/gemini-3-flash-preview",
    penrouter: "google/gemini-3-flash-preview",
    openai: "gpt-4.1-mini"
  };

  function emitProgress(onProgress, stage, message, extra = {}) {
    if (typeof onProgress !== "function") return;
    onProgress({ stage, message, ...extra });
  }

  function safeJsonParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
      if (!fenced) return null;
      try {
        return JSON.parse(fenced[1]);
      } catch (_err2) {
        return null;
      }
    }
  }

  function extractAssistantContent(data) {
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part.text === "string") return part.text;
          return "";
        })
        .join("\n");
    }
    return "";
  }

  function clampScore(score, maxScore) {
    const value = Number(score);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(maxScore, Math.round(value)));
  }

  function normalizeResult(data, maxScore) {
    const score = clampScore(data && data.score, maxScore);
    const comment = (data && data.comment ? String(data.comment) : "").trim();
    const deductions = Array.isArray(data && data.deductions)
      ? data.deductions
          .map((d) => ({
            point: (d && d.point ? String(d.point) : "").trim(),
            lost: Number.isFinite(Number(d && d.lost)) ? Number(d.lost) : 0,
            reason: (d && d.reason ? String(d.reason) : "").trim()
          }))
          .filter((d) => d.point || d.reason)
      : [];
    const evidence = Array.isArray(data && data.evidence)
      ? data.evidence.map((e) => String(e)).filter(Boolean).slice(0, 4)
      : [];
    const confidenceRaw = Number(data && data.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.5;

    if (!comment) {
      throw new Error("Model output missing comment.");
    }

    return { score, comment, deductions, evidence, confidence };
  }

  async function getSettings() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const merged = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
    const normalizedProvider = String(merged.provider || "openrouter").toLowerCase();
    if (!merged.model) {
      merged.model = PROVIDER_DEFAULT_MODEL[normalizedProvider] || DEFAULT_SETTINGS.model;
    }
    merged.provider = normalizedProvider;
    return merged;
  }

  async function saveSettings(nextSettings) {
    const merged = { ...(await getSettings()), ...(nextSettings || {}) };
    merged.provider = String(merged.provider || "openrouter").toLowerCase();
    if (!merged.model) {
      merged.model = PROVIDER_DEFAULT_MODEL[merged.provider] || DEFAULT_SETTINGS.model;
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    return merged;
  }

  async function callModel(settings, submissionText, onProgress) {
    const timings = {};
    emitProgress(onProgress, "prepare_prompt", "Preparing text prompt...");
    const promptStart = Date.now();
    const system = ns.buildSystemPrompt(settings.maxScore);
    const user = ns.buildUserPrompt({
      referenceAnswer: settings.referenceAnswer,
      submissionText,
      maxScore: settings.maxScore
    });
    timings.promptBuildMs = Date.now() - promptStart;

    emitProgress(onProgress, "call_model", "Calling model API...");
    const requestStart = Date.now();
    const response = await chrome.runtime.sendMessage({
      type: "HG_CHAT_COMPLETION",
      payload: {
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        referer: location.origin,
        appTitle: "Homework Grading Copilot",
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }
    });
    timings.modelRequestMs = Date.now() - requestStart;
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Model request failed.");
    }

    emitProgress(onProgress, "parse_result", "Parsing model response...");
    const parseStart = Date.now();
    const rawText = extractAssistantContent(response.data);
    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      throw new Error("Model returned invalid JSON.");
    }
    const normalized = normalizeResult(parsed, settings.maxScore);
    timings.parseMs = Date.now() - parseStart;
    return { normalized, timings };
  }

  async function fetchImageDataUrl(url) {
    const response = await chrome.runtime.sendMessage({
      type: "HG_FETCH_DATA_URL",
      url
    });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Failed to fetch image.");
    }
    return response.data || {};
  }

  async function callModelWithImages(settings, imageUrls, pageCountHint, onProgress) {
    const timings = {};
    const maxPages = Math.max(1, Number(settings.maxImagePages || 5));
    const uniqueUrls = Array.from(new Set(imageUrls || []));
    const boundedByPageCount =
      Number.isInteger(pageCountHint) && pageCountHint > 0
        ? uniqueUrls.slice(0, pageCountHint)
        : uniqueUrls;
    const selectedUrls = boundedByPageCount.slice(0, maxPages);
    if (!selectedUrls.length) {
      throw new Error("No image pages found for vision grading.");
    }

    emitProgress(onProgress, "fetch_images", `Fetching images 0/${selectedUrls.length}...`);
    const imageStart = Date.now();
    let finishedCount = 0;
    const imageResults = await Promise.all(
      selectedUrls.map(async (url) => {
        const result = await fetchImageDataUrl(url);
        finishedCount += 1;
        emitProgress(onProgress, "fetch_images", `Fetching images ${finishedCount}/${selectedUrls.length}...`);
        return result;
      })
    );
    timings.imagePrepMs = Date.now() - imageStart;
    timings.imageFetchMs = imageResults.reduce((sum, item) => sum + Number(item.fetchMs || 0), 0);
    timings.imageEncodeMs = imageResults.reduce((sum, item) => sum + Number(item.encodeMs || 0), 0);
    timings.imageBytes = imageResults.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
    const dataUrls = imageResults.map((item) => item.dataUrl).filter(Boolean);

    emitProgress(onProgress, "prepare_prompt", "Preparing vision prompt...");
    const promptStart = Date.now();
    const promptText = ns.buildImagePrompt({
      referenceAnswer: settings.referenceAnswer,
      maxScore: settings.maxScore,
      imageCount: dataUrls.length
    });
    timings.promptBuildMs = Date.now() - promptStart;

    const content = [{ type: "text", text: promptText }];
    dataUrls.forEach((dataUrl) => {
      content.push({
        type: "image_url",
        image_url: { url: dataUrl }
      });
    });

    emitProgress(onProgress, "call_model", "Calling model API...");
    const requestStart = Date.now();
    const response = await chrome.runtime.sendMessage({
      type: "HG_CHAT_COMPLETION",
      payload: {
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        referer: location.origin,
        appTitle: "Homework Grading Copilot",
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: ns.buildSystemPrompt(settings.maxScore) },
          { role: "user", content }
        ]
      }
    });
    timings.modelRequestMs = Date.now() - requestStart;
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Model request failed.");
    }

    emitProgress(onProgress, "parse_result", "Parsing model response...");
    const parseStart = Date.now();
    const rawText = extractAssistantContent(response.data);
    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      throw new Error("Model returned invalid JSON.");
    }
    const normalized = normalizeResult(parsed, settings.maxScore);
    timings.parseMs = Date.now() - parseStart;
    return { normalized, timings };
  }

  async function gradeSubmission(submissionPayload, retry = 1, onProgress) {
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error("Please set API key in Copilot settings.");
    }
    let lastError;
    for (let attempt = 0; attempt <= retry; attempt += 1) {
      try {
        const start = Date.now();
        const isImageMode =
          submissionPayload &&
          submissionPayload.source === "images" &&
          Array.isArray(submissionPayload.imageUrls) &&
          submissionPayload.imageUrls.length > 0;
        emitProgress(onProgress, "start", isImageMode ? "Starting vision grading..." : "Starting text grading...");
        const resultPayload = isImageMode
          ? await callModelWithImages(
              settings,
              submissionPayload.imageUrls,
              submissionPayload.pageCount,
              onProgress
            )
          : await callModel(settings, submissionPayload && submissionPayload.text ? submissionPayload.text : "", onProgress);
        const result = resultPayload.normalized;
        const timings = resultPayload.timings || {};
        return {
          ...result,
          latencyMs: Date.now() - start,
          model: settings.model,
          mode: isImageMode ? "vision" : "text",
          timings
        };
      } catch (error) {
        lastError = error;
        if (attempt < retry) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error("Unknown grading error.");
  }

  ns.getSettings = getSettings;
  ns.saveSettings = saveSettings;
  ns.gradeSubmission = gradeSubmission;
})(window.HomeworkGrader);

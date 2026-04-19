"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function bootstrap(ns) {
  if (window.__HG_COPILOT_BOOTSTRAPPED__) return;
  window.__HG_COPILOT_BOOTSTRAPPED__ = true;

  const HISTORY_KEY = "HG_RESULT_HISTORY_V1";
  const LOG_KEY = "HG_LOCAL_LOG_V1";
  const MAX_LOG_ENTRIES = 200;
  const LOW_CONFIDENCE_THRESHOLD = 0.55;

  let overlay = null;
  let latestAnalysis = null;
  let currentSignature = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function isContextInvalidatedError(error) {
    const message = error && error.message ? String(error.message) : String(error || "");
    return (
      message.includes("Extension context invalidated") ||
      message.includes("Receiving end does not exist") ||
      message.includes("The message port closed before a response was received")
    );
  }

  async function safeStorageGet(key) {
    try {
      const value = await chrome.storage.local.get([key]);
      return value || {};
    } catch (error) {
      if (!isContextInvalidatedError(error)) {
        console.warn("[HomeworkGrader] storage get failed:", error);
      }
      return {};
    }
  }

  async function safeStorageSet(payload) {
    try {
      await chrome.storage.local.set(payload);
    } catch (error) {
      if (!isContextInvalidatedError(error)) {
        console.warn("[HomeworkGrader] storage set failed:", error);
      }
    }
  }

  async function appendLog(level, message, extra = {}) {
    try {
      const records = (await safeStorageGet(LOG_KEY))[LOG_KEY] || [];
      records.push({
        ts: nowIso(),
        level,
        message,
        url: location.href,
        extra
      });
      while (records.length > MAX_LOG_ENTRIES) records.shift();
      await safeStorageSet({ [LOG_KEY]: records });
    } catch (error) {
      if (!isContextInvalidatedError(error)) {
        console.warn("[HomeworkGrader] appendLog failed:", error);
      }
    }
  }

  async function saveResult(signature, result, extraction) {
    try {
      const data = (await safeStorageGet(HISTORY_KEY))[HISTORY_KEY] || {};
      data[signature] = {
        ts: nowIso(),
        source: extraction.source,
        warnings: extraction.warnings || [],
        model: result.model,
        score: result.score,
        comment: result.comment,
        deductions: result.deductions || [],
        evidence: result.evidence || [],
        confidence: result.confidence
      };
      await safeStorageSet({ [HISTORY_KEY]: data });
    } catch (error) {
      if (!isContextInvalidatedError(error)) {
        console.warn("[HomeworkGrader] saveResult failed:", error);
      }
    }
  }

  async function analyzeCurrentSubmission({ isRetry = false } = {}) {
    try {
      overlay.setStatus("Extracting submission...");
      const extraction = await ns.extractSubmissionContent();
      currentSignature = extraction.signature;
      overlay.setWarnings(extraction.warnings || []);
      if (!extraction.ok) {
        overlay.setStatus("Unable to extract assignment text.", true);
        await appendLog("warn", "Extraction failed", { warnings: extraction.warnings });
        return;
      }

      const settings = await ns.getSettings();
      if (
        extraction.source === "images" &&
        Number.isInteger(extraction.pageCount) &&
        extraction.pageCount > Number(settings.maxImagePages || 5)
      ) {
        overlay.setWarnings([
          ...(extraction.warnings || []),
          `Only first ${settings.maxImagePages} page(s) will be sent (out of ${extraction.pageCount}).`
        ]);
      }
      if (settings.sendConfirmation) {
        const proceed = window.confirm(
          "Send current submission content to cloud model for grading suggestion?"
        );
        if (!proceed) {
          overlay.setStatus("Canceled by user.");
          return;
        }
      }

      overlay.setStatus(isRetry ? "Retrying model request..." : "Starting analysis...");
      const result = await ns.gradeSubmission(extraction, 2, (progress) => {
        if (progress && progress.message) {
          overlay.setStatus(progress.message);
        }
      });
      latestAnalysis = {
        extraction,
        result
      };
      overlay.setResult(result);

      const warnings = [...(extraction.warnings || [])];
      if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
        warnings.push("Low confidence result. Please verify manually.");
      }
      overlay.setWarnings(warnings);
      const sourceHint =
        extraction.source === "images"
          ? `IMAGES(${(extraction.imageUrls || []).length})`
          : extraction.source.toUpperCase();
      overlay.setStatus(`Done (${result.model}, ${result.latencyMs} ms). Source: ${sourceHint}`);
      if (result.timings) {
        const timingHintParts = [];
        if (Number.isFinite(result.timings.imagePrepMs)) {
          timingHintParts.push(`imagePrep=${result.timings.imagePrepMs}ms`);
        }
        if (Number.isFinite(result.timings.modelRequestMs)) {
          timingHintParts.push(`model=${result.timings.modelRequestMs}ms`);
        }
        if (Number.isFinite(result.timings.parseMs)) {
          timingHintParts.push(`parse=${result.timings.parseMs}ms`);
        }
        if (timingHintParts.length) {
          warnings.push(`Timing: ${timingHintParts.join(", ")}`);
          overlay.setWarnings(warnings);
        }
      }

      await saveResult(extraction.signature, result, extraction);
      await appendLog("info", "Analysis completed", {
        source: extraction.source,
        confidence: result.confidence
      });
    } catch (error) {
      overlay.setStatus(error.message || "Analysis failed.", true);
      await appendLog("error", "Analysis error", { error: error.message || String(error) });
    }
  }

  async function hydrateSettings() {
    const settings = await ns.getSettings();
    overlay.setSettings(settings);
  }

  async function saveSettingsFromOverlay() {
    const next = overlay.getSettingsFromForm();
    await ns.saveSettings(next);
    overlay.setStatus("Settings saved.");
    await appendLog("info", "Settings updated", {
      model: next.model,
      maxScore: next.maxScore
    });
  }

  function setupSubmissionChangeWatcher() {
    let lastHref = location.href;
    let lastSignature = ns.getSubmissionSignature(document.body ? document.body.innerText : "");

    setInterval(async () => {
      const hrefChanged = location.href !== lastHref;
      const sig = ns.getSubmissionSignature(document.body ? document.body.innerText : "");
      const signatureChanged = sig !== lastSignature;
      if (!hrefChanged && !signatureChanged) return;

      lastHref = location.href;
      lastSignature = sig;
      latestAnalysis = null;
      currentSignature = sig;
      overlay.setStatus("Detected new submission. Click Analyze.");
      overlay.setWarnings([]);
      await appendLog("info", "Submission changed");
    }, 1500);
  }

  function setupRuntimeMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "HG_TOGGLE_OVERLAY") {
        overlay.toggle();
        sendResponse({ ok: true, visible: overlay.isVisible() });
        return true;
      }
      if (message.type === "HG_SHOW_OVERLAY") {
        overlay.show();
        sendResponse({ ok: true, visible: true });
        return true;
      }
      if (message.type === "HG_HIDE_OVERLAY") {
        overlay.hide();
        sendResponse({ ok: true, visible: false });
        return true;
      }
    });
  }

  async function init() {
    overlay = ns.createOverlay();
    overlay.onAnalyze(() => analyzeCurrentSubmission({ isRetry: false }));
    overlay.onRetry(() => analyzeCurrentSubmission({ isRetry: true }));
    overlay.onSaveSettings(saveSettingsFromOverlay);
    await hydrateSettings();
    setupSubmissionChangeWatcher();
    setupRuntimeMessageHandlers();
    overlay.setStatus("Copilot ready. Click extension icon to open.");
    await appendLog("info", "Copilot initialized");
  }

  init().catch((error) => {
    console.error("[HomeworkGrader]", error);
  });
})(window.HomeworkGrader);

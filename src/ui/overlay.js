"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function registerOverlay(ns) {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function createOverlay() {
    if (document.getElementById("hg-copilot-root")) {
      return document.getElementById("hg-copilot-root").__api;
    }

    const root = el("div", "hg-root");
    root.id = "hg-copilot-root";
    const card = el("div", "hg-card");
    const dragHandle = el("div", "hg-drag-handle", "•••");

    const header = el("div", "hg-header");
    header.appendChild(el("div", "hg-title", "Grading Copilot"));
    const settingsBtn = el("button", "hg-small-btn", "Settings");
    header.appendChild(settingsBtn);

    const status = el("div", "hg-status", "Ready.");

    const actions = el("div", "hg-actions");
    const analyzeBtn = el("button", "hg-btn", "Analyze");
    const retryBtn = el("button", "hg-btn hg-btn-secondary", "Retry");
    actions.append(analyzeBtn, retryBtn);

    const scoreRow = el("div", "hg-row");
    scoreRow.appendChild(el("span", "hg-label", "Suggested score"));
    const scoreValue = el("input", "hg-input");
    scoreValue.type = "number";
    scoreRow.appendChild(scoreValue);

    const confidenceRow = el("div", "hg-row");
    confidenceRow.appendChild(el("span", "hg-label", "Confidence"));
    const confidenceValue = el("span", "hg-pill", "-");
    confidenceRow.appendChild(confidenceValue);

    const commentLabel = el("div", "hg-label", "Comment");
    const commentBox = el("textarea", "hg-textarea");
    commentBox.rows = 5;

    const deductionsLabel = el("div", "hg-label", "Deductions");
    const deductionsBox = el("ul", "hg-list");

    const evidenceLabel = el("div", "hg-label", "Evidence");
    const evidenceBox = el("ul", "hg-list");

    const warningsBox = el("div", "hg-warnings");

    const settings = el("div", "hg-settings hg-hidden");
    settings.innerHTML = [
      '<label class="hg-setting-label">Provider</label>',
      '<select id="hg-provider" class="hg-input">',
      '  <option value="openrouter">OpenRouter</option>',
      '  <option value="openai">OpenAI</option>',
      '  <option value="penrouter">PenRouter (OpenRouter Compatible)</option>',
      "</select>",
      '<label class="hg-setting-label">API Key</label>',
      '<input id="hg-api-key" class="hg-input" type="password" placeholder="sk-..."/>',
      '<label class="hg-setting-label">Model</label>',
      '<input id="hg-model" class="hg-input" type="text" placeholder="google/gemini-3-flash-preview"/>',
      '<label class="hg-setting-label">Max Score</label>',
      '<input id="hg-max-score" class="hg-input" type="number" min="1" max="1000" value="100"/>',
      '<label class="hg-setting-label">Max Image Pages (vision mode)</label>',
      '<input id="hg-max-image-pages" class="hg-input" type="number" min="1" max="20" value="5"/>',
      '<label class="hg-setting-label">Reference Answer</label>',
      '<textarea id="hg-reference" class="hg-textarea" rows="4"></textarea>',
      '<label class="hg-setting-inline"><input id="hg-send-confirm" type="checkbox" checked /> Confirm before sending content</label>',
      '<button id="hg-save-settings" class="hg-btn">Save Settings</button>'
    ].join("");

    card.append(
      dragHandle,
      header,
      status,
      actions,
      scoreRow,
      confidenceRow,
      commentLabel,
      commentBox,
      deductionsLabel,
      deductionsBox,
      evidenceLabel,
      evidenceBox,
      warningsBox,
      settings
    );
    root.appendChild(card);
    document.documentElement.appendChild(root);
    root.style.display = "none";

    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function onPointerMove(event) {
      if (!isDragging) return;
      const cardRect = root.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - cardRect.width);
      const maxTop = Math.max(0, window.innerHeight - cardRect.height);
      const nextLeft = clamp(event.clientX - dragOffsetX, 0, maxLeft);
      const nextTop = clamp(event.clientY - dragOffsetY, 0, maxTop);
      root.style.left = `${nextLeft}px`;
      root.style.top = `${nextTop}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    }

    function stopDragging() {
      isDragging = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDragging);
    }

    dragHandle.addEventListener("pointerdown", (event) => {
      const rect = root.getBoundingClientRect();
      isDragging = true;
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      root.style.left = `${rect.left}px`;
      root.style.top = `${rect.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      dragHandle.setPointerCapture(event.pointerId);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopDragging);
    });

    settingsBtn.addEventListener("click", () => {
      settings.classList.toggle("hg-hidden");
    });

    const api = {
      root,
      isVisible() {
        return root.style.display !== "none";
      },
      show() {
        root.style.display = "block";
      },
      hide() {
        root.style.display = "none";
      },
      toggle() {
        if (api.isVisible()) api.hide();
        else api.show();
      },
      setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("hg-error", Boolean(isError));
      },
      setResult(result) {
        scoreValue.value = Number.isFinite(Number(result.score)) ? Number(result.score) : "";
        commentBox.value = result.comment || "";
        confidenceValue.textContent =
          typeof result.confidence === "number" ? `${Math.round(result.confidence * 100)}%` : "-";

        deductionsBox.innerHTML = "";
        (result.deductions || []).forEach((item) => {
          const li = el("li", "", `${item.point || "Point"} (-${item.lost || 0}): ${item.reason || ""}`);
          deductionsBox.appendChild(li);
        });

        evidenceBox.innerHTML = "";
        (result.evidence || []).forEach((item) => {
          evidenceBox.appendChild(el("li", "", item));
        });
      },
      setWarnings(warnings) {
        const list = (warnings || []).filter(Boolean);
        warningsBox.innerHTML = "";
        if (!list.length) return;
        warningsBox.textContent = list.join(" | ");
      },
      getEditedResult() {
        return {
          score: Number(scoreValue.value || 0),
          comment: commentBox.value || ""
        };
      },
      setSettings(settingsData) {
        root.querySelector("#hg-provider").value = settingsData.provider || "openrouter";
        root.querySelector("#hg-api-key").value = settingsData.apiKey || "";
        root.querySelector("#hg-model").value = settingsData.model || "";
        root.querySelector("#hg-max-score").value = String(settingsData.maxScore || 100);
        root.querySelector("#hg-max-image-pages").value = String(settingsData.maxImagePages || 5);
        root.querySelector("#hg-reference").value = settingsData.referenceAnswer || "";
        root.querySelector("#hg-send-confirm").checked = Boolean(settingsData.sendConfirmation);
      },
      getSettingsFromForm() {
        return {
          provider: root.querySelector("#hg-provider").value,
          apiKey: root.querySelector("#hg-api-key").value.trim(),
          model: root.querySelector("#hg-model").value.trim(),
          maxScore: Number(root.querySelector("#hg-max-score").value || 100),
          maxImagePages: Number(root.querySelector("#hg-max-image-pages").value || 5),
          referenceAnswer: root.querySelector("#hg-reference").value.trim(),
          sendConfirmation: Boolean(root.querySelector("#hg-send-confirm").checked)
        };
      },
      onAnalyze(handler) {
        analyzeBtn.addEventListener("click", handler);
      },
      onRetry(handler) {
        retryBtn.addEventListener("click", handler);
      },
      onSaveSettings(handler) {
        root.querySelector("#hg-save-settings").addEventListener("click", handler);
      }
    };

    root.__api = api;
    return api;
  }

  ns.createOverlay = createOverlay;
})(window.HomeworkGrader);

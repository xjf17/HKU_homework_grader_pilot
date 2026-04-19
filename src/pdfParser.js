"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function registerPdfParser(ns) {
  async function fetchPdfBuffer(url) {
    const response = await chrome.runtime.sendMessage({
      type: "HG_FETCH_BINARY",
      url
    });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Failed to fetch PDF.");
    }
    return response.data;
  }

  async function parseWithPdfJs(arrayBuffer) {
    if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== "function") {
      throw new Error("pdfjsLib is not available on this page.");
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const doc = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const tokens = content.items.map((item) => (item && item.str ? item.str : ""));
      pages.push(tokens.join(" ").replace(/\s+/g, " ").trim());
    }
    return pages.join("\n\n");
  }

  async function parsePdfFromUrl(url) {
    const payload = await fetchPdfBuffer(url);
    const contentType = payload && payload.contentType ? payload.contentType : "";
    const buffer = payload && payload.buffer ? payload.buffer : null;
    if (!buffer) {
      throw new Error("Empty PDF payload.");
    }
    if (!contentType.toLowerCase().includes("pdf")) {
      throw new Error(`Target is not a PDF file: ${contentType || "unknown"}`);
    }
    const text = await parseWithPdfJs(buffer);
    return text;
  }

  ns.parsePdfFromUrl = parsePdfFromUrl;
})(window.HomeworkGrader);

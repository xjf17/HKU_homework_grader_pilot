"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function registerExtractor(ns) {
  const MAX_TEXT_LENGTH = 35000;

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function clipText(text, maxLen = MAX_TEXT_LENGTH) {
    if (!text) return "";
    return text.length > maxLen ? `${text.slice(0, maxLen)}\n[TRUNCATED]` : text;
  }

  function normalizeUrlMaybePdf(rawUrl) {
    if (!rawUrl) return null;
    const resolved = new URL(rawUrl, location.href).toString();
    if (resolved.toLowerCase().includes(".pdf")) return resolved;

    try {
      const parsed = new URL(resolved);
      const params = parsed.searchParams;
      const embedded =
        params.get("file") ||
        params.get("pdf") ||
        params.get("url") ||
        params.get("download") ||
        "";
      if (embedded && embedded.toLowerCase().includes(".pdf")) {
        return new URL(embedded, location.href).toString();
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function findPdfUrlFromDom() {
    const selectors = [
      "iframe[src*='.pdf']",
      "embed[src*='.pdf']",
      "object[data*='.pdf']",
      "a[href*='.pdf']"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const url = node.getAttribute("src") || node.getAttribute("data") || node.getAttribute("href");
      const normalized = normalizeUrlMaybePdf(url);
      if (normalized) return normalized;
    }
    return null;
  }

  function findPdfUrlFromNetworkHints() {
    if (!window.performance || typeof performance.getEntriesByType !== "function") {
      return null;
    }
    const entries = performance.getEntriesByType("resource") || [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const normalized = normalizeUrlMaybePdf(entry && entry.name ? entry.name : "");
      if (normalized) return normalized;
    }
    return null;
  }

  function extractUrlFromCssBackground(value) {
    if (!value) return null;
    const match = value.match(/url\((['"]?)(.*?)\1\)/i);
    if (!match || !match[2]) return null;
    return new URL(match[2], location.href).toString();
  }

  function scoreImagePageUrl(url) {
    const matched = String(url).match(/image_page(\d+)\.png/i);
    return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER;
  }

  function buildImageUrlsFromSeed(seedUrl, pageCount) {
    if (!seedUrl) return [];
    if (!Number.isInteger(pageCount) || pageCount <= 0) return [seedUrl];
    if (!/image_page\d+\.png/i.test(seedUrl)) return [seedUrl];
    const urls = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      urls.push(seedUrl.replace(/image_page\d+\.png/i, `image_page${pageIndex}.png`));
    }
    return urls;
  }

  function parseImageUrlMeta(url) {
    const matched = String(url).match(/^(.*\/image_page)(\d+)(\.png(?:\?.*)?)$/i);
    if (!matched) return null;
    return {
      prefix: matched[1],
      index: Number(matched[2]),
      suffix: matched[3]
    };
  }

  function getCanvasImageUrl() {
    const primaryCanvas = document.querySelector(".drawingcanvas");
    if (!primaryCanvas) return "";
    const inline = primaryCanvas.style && primaryCanvas.style.backgroundImage
      ? primaryCanvas.style.backgroundImage
      : "";
    return extractUrlFromCssBackground(inline) || "";
  }

  function findSubmissionImageUrls() {
    const collected = new Set();
    const canvasUrl = getCanvasImageUrl();
    if (canvasUrl) collected.add(canvasUrl);

    const allWithStyle = document.querySelectorAll("[style*='image_page']");
    allWithStyle.forEach((node) => {
      const styleAttr = node.getAttribute("style") || "";
      const styleUrl = extractUrlFromCssBackground(styleAttr);
      if (styleUrl && /image_page\d+\.png/i.test(styleUrl)) {
        collected.add(styleUrl);
      }
    });

    // Performance entries may include old students' resources.
    // Only use them as fallback when no current-page image URL is found.
    if (!collected.size && window.performance && typeof performance.getEntriesByType === "function") {
      const entries = performance.getEntriesByType("resource") || [];
      entries.forEach((entry) => {
        const name = entry && entry.name ? String(entry.name) : "";
        if (/image_page\d+\.png/i.test(name)) {
          collected.add(new URL(name, location.href).toString());
        }
      });
    }

    return Array.from(collected).sort((a, b) => scoreImagePageUrl(a) - scoreImagePageUrl(b));
  }

  function getPageCountFromNavigator() {
    const select = document.querySelector(".navigate-page-select");
    if (!select) return 0;
    const options = Array.from(select.querySelectorAll("option"));
    if (!options.length) return 0;

    const numericValues = options
      .map((opt) => Number(opt.value))
      .filter((value) => Number.isInteger(value) && value >= 0);
    if (numericValues.length) {
      return Math.max(...numericValues) + 1;
    }
    return options.length;
  }

  function normalizeImageUrlsForCurrentSubmission(imageUrls, pageCount) {
    if (!Array.isArray(imageUrls) || !imageUrls.length) return [];

    const metas = imageUrls
      .map((url) => ({ url, meta: parseImageUrlMeta(url) }))
      .filter((item) => item.meta && Number.isInteger(item.meta.index));
    if (!metas.length) return imageUrls;

    const canvasMeta = parseImageUrlMeta(getCanvasImageUrl());
    const preferredPrefix = canvasMeta ? canvasMeta.prefix : metas[0].meta.prefix;
    const preferredSuffix = canvasMeta ? canvasMeta.suffix : metas[0].meta.suffix;

    let filtered = metas.filter(
      (item) => item.meta.prefix === preferredPrefix && item.meta.suffix === preferredSuffix
    );
    if (!filtered.length) filtered = metas;

    if (pageCount > 0) {
      const seedFromCanvas = getCanvasImageUrl();
      if (seedFromCanvas && /image_page\d+\.png/i.test(seedFromCanvas)) {
        return buildImageUrlsFromSeed(seedFromCanvas, pageCount);
      }
      const seedFromPrefix = `${preferredPrefix}0${preferredSuffix}`;
      if (/image_page\d+\.png/i.test(seedFromPrefix)) {
        return buildImageUrlsFromSeed(seedFromPrefix, pageCount);
      }
      return filtered
        .slice(0, pageCount)
        .map((item) => item.url)
        .sort((a, b) => scoreImagePageUrl(a) - scoreImagePageUrl(b));
    }

    return filtered
      .map((item) => item.url)
      .sort((a, b) => scoreImagePageUrl(a) - scoreImagePageUrl(b));
  }

  function extractDomText() {
    const candidates = [
      "[data-region='submission']",
      ".submission",
      ".assignsubmission",
      ".pdfViewer .textLayer",
      "main",
      "body"
    ];

    for (const selector of candidates) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text.length > 200) {
        return clipText(text);
      }
    }
    return "";
  }

  function getSubmissionSignature(sampleText) {
    const urlPart = location.href.split("#")[0];
    const titlePart = document.title || "";
    const textPart = (sampleText || "").slice(0, 180);
    return `${urlPart}::${titlePart}::${textPart}`;
  }

  async function extractSubmissionContent() {
    const warnings = [];
    const pdfUrl = findPdfUrlFromDom() || findPdfUrlFromNetworkHints();

    if (pdfUrl) {
      try {
        const pdfText = await ns.parsePdfFromUrl(pdfUrl);
        const text = clipText(normalizeText(pdfText));
        if (text.length > 150) {
          return {
            ok: true,
            source: "pdf",
            pdfUrl,
            text,
            signature: getSubmissionSignature(text),
            warnings
          };
        }
        warnings.push("PDF parsed but text content is too short.");
      } catch (error) {
        warnings.push(`PDF parse failed: ${error.message}`);
      }
    } else {
      warnings.push("No PDF URL found in current page.");
    }

    const rawImageUrls = findSubmissionImageUrls();
    const pageCount = getPageCountFromNavigator();
    const imageUrls = normalizeImageUrlsForCurrentSubmission(rawImageUrls, pageCount);
    if (imageUrls.length) {
      const pageHint = pageCount > 0 ? `Detected ${pageCount} page(s).` : "Page count not detected.";
      const coverageHint =
        pageCount > 0
          ? `Prepared ${imageUrls.length} image URL(s) for full-page analysis.`
          : `Prepared ${imageUrls.length} image URL(s).`;
      return {
        ok: true,
        source: "images",
        pdfUrl: pdfUrl || "",
        imageUrls,
        pageCount,
        text: "",
        signature: getSubmissionSignature(imageUrls.join("|").slice(0, 280)),
        warnings: [...warnings, pageHint, coverageHint]
      };
    }

    const domText = extractDomText();
    if (domText.length > 150) {
      return {
        ok: true,
        source: "dom",
        pdfUrl: pdfUrl || "",
        text: domText,
        signature: getSubmissionSignature(domText),
        warnings
      };
    }

    return {
      ok: false,
      source: "none",
      pdfUrl: pdfUrl || "",
      text: "",
      signature: getSubmissionSignature(""),
      warnings: [...warnings, "DOM text extraction returned too little content."]
    };
  }

  ns.extractSubmissionContent = extractSubmissionContent;
  ns.getSubmissionSignature = getSubmissionSignature;
})(window.HomeworkGrader);

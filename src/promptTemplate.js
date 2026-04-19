"use strict";

window.HomeworkGrader = window.HomeworkGrader || {};

(function registerPromptTemplate(ns) {
  function buildSystemPrompt(maxScore) {
    return [
      "You are a grading copilot for teachers.",
      "Return only strict JSON.",
      `Total score must be an integer between 0 and ${maxScore}.`,
      "Be concise and instructional, not authoritative.",
      "If evidence is weak, reduce confidence and explain uncertainty."
    ].join(" ");
  }

  function buildUserPrompt({ referenceAnswer, submissionText, maxScore }) {
    return [
      "Grade this student assignment using the reference answer.",
      "Return this JSON schema:",
      "{",
      '  "score": number,',
      '  "comment": string,',
      '  "deductions": [{"point": string, "lost": number, "reason": string}],',
      '  "evidence": string[],',
      '  "confidence": number',
      "}",
      `Rules: score range 0-${maxScore}; confidence range 0-1; evidence <= 4 quotes.`,
      "--- REFERENCE ANSWER ---",
      referenceAnswer || "(No reference answer provided)",
      "--- STUDENT SUBMISSION ---",
      submissionText || "(No submission text)"
    ].join("\n");
  }

  function buildImagePrompt({ referenceAnswer, maxScore, imageCount }) {
    return [
      "Grade this student assignment from page images.",
      "Return this JSON schema:",
      "{",
      '  "score": number,',
      '  "comment": string,',
      '  "deductions": [{"point": string, "lost": number, "reason": string}],',
      '  "evidence": string[],',
      '  "confidence": number',
      "}",
      `Rules: score range 0-${maxScore}; confidence range 0-1; evidence <= 4 quotes.`,
      `Input contains ${imageCount} assignment page image(s).`,
      "If handwriting or image quality causes uncertainty, state it in comment and lower confidence.",
      "--- REFERENCE ANSWER ---",
      referenceAnswer || "(No reference answer provided)"
    ].join("\n");
  }

  ns.buildSystemPrompt = buildSystemPrompt;
  ns.buildUserPrompt = buildUserPrompt;
  ns.buildImagePrompt = buildImagePrompt;
})(window.HomeworkGrader);

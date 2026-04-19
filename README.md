# Homework Grading Copilot (Chrome Extension)

This extension injects a grading copilot panel into your existing school grading page.

## Features

- Floating copilot panel at bottom-right (toggle by extension icon).
- Extract assignment text from current page:
  - Prefer PDF URL parsing when available.
  - If submission is rendered as `image_page*.png`, automatically use vision mode.
  - Fallback to DOM text extraction.
- Call cloud model for guidance:
  - Suggested score
  - Overall comment
  - Deductions and evidence snippets
  - Confidence score
- OpenRouter / PenRouter requests include `reasoning: { effort: "low" }` to reduce long internal reasoning when the model supports it.
- Local guardrails:
  - Retry on model failure
  - Low-confidence warning
  - Submission-change detection
  - Local audit logs in `chrome.storage.local`

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select folder: `python/homework_grader_extension`.

## First-time Setup

1. Open your school grading page.
2. Click the extension icon to open Copilot panel.
3. In the Copilot panel, click `Settings`.
4. Set:
   - provider (`OpenRouter` / `OpenAI` / `PenRouter(OpenRouter-compatible)`)
   - API key
   - model name (OpenRouter default `google/gemini-3-flash-preview`)
   - max score
   - max image pages (vision mode)
   - reference answer text
5. Click `Save Settings`.

## Usage

1. Navigate to a student submission page.
2. Click extension icon to open panel.
3. Click `Analyze`.
4. Review suggested score and comment.
5. Edit suggestion if needed.
6. Submit in school system as usual.

## Notes

- Extension uses current logged-in browser session. No separate cookie management is required in normal same-site flow.
- For PDF parsing, the extension uses `window.pdfjsLib` if available on page. If unavailable, extraction will fallback to DOM text.
- This is an assistive tool. Final grading decision should remain with the instructor.

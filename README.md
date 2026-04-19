# Homework Grading Copilot for HKU Moodle (Chrome Extension)

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

---

## 作业批改助手

### 简介

本扩展会在你现有的学校批改页面中注入一个「批改助手」浮层面板。

### 功能

- 右下角浮层面板（点击扩展图标显示/隐藏）。
- 从当前页面提取作业内容：
  - 若页面提供 PDF 链接，优先解析 PDF 文本。
  - 若提交以 `image_page*.png` 等形式展示，会自动使用视觉（多图）模式。
  - 否则回退为从 DOM 提取文本。
- 调用云端大模型给出辅助信息：
  - 建议分数
  - 总评
  - 扣分项与依据片段
  - 置信度
- 对 OpenRouter / PenRouter 的请求会附带 `reasoning: { effort: "low" }`（在模型支持时），以减少冗长内部推理。
- 本地防护与记录：
  - 模型失败时重试
  - 低置信度提示
  - 检测提交内容变化
  - 在 `chrome.storage.local` 中保存本地审计日志

### 安装（开发者模式）

1. 打开 Chrome，进入 `chrome://extensions`。
2. 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择本扩展所在文件夹（例如仓库中的 `python/homework_grader_extension`，以你本地实际路径为准）。

### 首次设置

1. 打开学校批改页面。
2. 点击扩展图标打开助手面板。
3. 在面板中点击 **Settings（设置）**。
4. 配置：
   - 服务商（`OpenRouter` / `OpenAI` / `PenRouter`（兼容 OpenRouter））
   - API Key
   - 模型名称（OpenRouter 默认 `google/gemini-3-flash-preview`）
   - 满分
   - 视觉模式下最多发送的图片页数
   - 参考答案文本
5. 点击 **Save Settings（保存设置）**。

### 使用流程

1. 进入学生提交详情页。
2. 点击扩展图标打开面板。
3. 点击 **Analyze（分析）**。
4. 查看建议分数与评语。
5. 如需可在面板中编辑后再采用。
6. 仍在学校系统中完成正式提交/录入。

### 说明与注意

- 扩展使用当前浏览器已登录的会话；在常规同站流程下无需单独管理 Cookie。
- PDF 解析依赖页面是否提供 `window.pdfjsLib`；若不可用会回退到 DOM 文本提取。
- 本工具仅为辅助，**最终成绩与评语仍应由教师本人负责**。

# VideoDeck

VideoDeck is a local markdown-to-video presentation studio.

It lets you:
- write slides in markdown
- add `Speaker Note:` lines for narration
- preview the deck in the browser
- listen to per-slide Kokoro narration previews
- render the full presentation into an MP4 with Remotion

## How It Works

The project combines three parts:

- React UI:
  The editor, slide preview, timeline, render pipeline status, and video player live in the frontend.

- Kokoro narration:
  Narration is generated locally with `kokoro-js`. A slide can include a `Speaker Note:` line, which is used as the voiceover text.

- Remotion rendering:
  The final video is rendered with Remotion. The backend parses the markdown, generates narration audio, builds slide props, and renders an MP4.

## Markdown Support

The app supports these markdown-like features in both preview and final render:

- slide separator: `---` on its own line
- speaker note: `Speaker Note: ...` on its own line
- headings: `#`, `##`, `###`
- bold: `**text**`
- italic: `*text*`
- inline code: `` `code` ``
- bullet lists: `- item`
- numbered lists: `1. item`
- blockquotes: `> quote`
- fenced code blocks: ````` ```ts ... ``` `````
- images: `![Alt](url)`

Notes:
- `---` is ignored when it appears inline or inside fenced code blocks.
- `Speaker Note:` is only treated as metadata when it appears at the start of its own line.

## Project Structure

- [src/App.tsx](./src/App.tsx)
  Main editor and preview UI.

- [shared/videodeck-core.mjs](./shared/videodeck-core.mjs)
  Shared markdown parsing, theme definitions, timing estimates, and validation helpers used by the UI and render server.

- [render/Root.tsx](./render/Root.tsx)
  Remotion composition used for final video rendering.

- [render/server.mjs](./render/server.mjs)
  Render API routes, markdown parsing, Kokoro generation, and Remotion render pipeline.

- [server.mjs](./server.mjs)
  Single Node entrypoint for local development and production-style serving.

## Requirements

- Node.js 18+ recommended
- macOS/Linux environment capable of running Remotion and local model inference

The first narration generation can take longer because Kokoro needs to load model assets.

## Install

```bash
npm install
```

## Run In Development

Start the app with a single process:

```bash
npm run dev
```

Open:

```text
http://localhost:3210
```

This starts:
- the React app through Vite middleware
- the render API
- narration preview and final video endpoints

## Build

```bash
npm run build
```

This runs TypeScript checks and builds the frontend into `dist/`.

## Run In Production Mode

Build first:

```bash
npm run build
```

Then start the production server:

```bash
npm run start
```

Open:

```text
http://localhost:3210
```

## Main Commands

```bash
npm run dev
```
Starts the single local app server.

```bash
npm run build
```
Typechecks and builds the frontend.

```bash
npm test
```
Runs the shared parser and validation regression tests.

```bash
npm run start
```
Serves the built app plus render API in production mode.

```bash
npm run vite-dev
```
Starts raw Vite only. Mostly useful for debugging.

```bash
npm run render-server
```
Starts only the render backend. Mostly useful for debugging the render pipeline separately.

## Rendering Pipeline

When you click `Render Final Video`, the backend runs these stages:

1. Parse slides from markdown
2. Generate Kokoro voice audio for slides with speaker notes
3. Prepare Remotion composition props
4. Render the final MP4

The UI polls render job state and displays progress for each stage.

## Output

Rendered videos and temporary slide audio files are written under:

```text
renders/
```

This folder is ignored by git.

## Known Limitations

- The markdown renderer is intentionally narrow and presentation-focused, not full CommonMark.
- Narration preview and final video narration depend on local Kokoro model loading.
- Remotion rendering can be slower on the first run.

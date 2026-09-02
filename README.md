# Scribbly

Scribbly is a tablet-friendly notebook prototype for handwritten notes that can be compiled into new, fully editable sheets.

## What works today

- A pen and highlighter that work with mouse, touch, or stylus
- Undo and clear-ink controls
- Notebook and page navigation
- New pages
- Automatic device-local saving
- An editable formula-sheet compilation demo
- Responsive desktop and tablet layouts

The compilation button creates a normal page inside the notebook. Its formulas and explanations can be edited or removed, and the user can draw over the page just like any other sheet.

## Run Scribbly locally

You will need Node.js 22 or later and pnpm.

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Create a production build

```bash
pnpm build
```

## Current scope

This repository is the first interaction prototype. Notes are stored in the current browser. Accounts, cloud synchronization, image-to-editable-note conversion, and live AI extraction are planned for later milestones.

The formula compiler currently uses representative sample material so the end-to-end editing experience can be tested before introducing API cost and recognition uncertainty.

## Planned AI architecture

1. Index each page into text, formula, example, and source-position objects.
2. Ask a vision-capable model for structured results.
3. Convert the selected results into Scribbly's native editable objects.
4. Preserve source-page references so compiled material remains traceable.

API credentials must stay in server-side environment variables and must never be committed.

## License

This prototype is available under the MIT License.

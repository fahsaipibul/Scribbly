# Scribbly

Ever take notes in class and end up with formulas, examples, definitions, and key points all jumbled together? Scribbly lets you write naturally first, then categorize selected handwriting and compile it into formula sheets, problem sets, and any custom collection you need.

## Try Scribbly

**[Open the live Scribbly demo](https://scribbly-notes.fpibul.chatgpt.site)**

## What works today

- Pen and highlighter tools for mouse, touch, or stylus
- Stroke erasing and lasso selection
- Notebooks, folders, pages, and continuous vertical page scrolling
- Editable page titles and typed text
- Automatic device-local saving
- Color-coded Formula, Example, Definition, and custom categories
- Exact-handwriting category compilation with source-page links
- Responsive desktop and tablet layouts

Lasso any ink, add it to a category, and compile that category into a normal Scribbly page. The compiled result keeps the user's original pen strokes and remains erasable and selectable.

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

Notes are stored in the current browser. Accounts and cloud synchronization remain future work.

## Photo to editable notes

In the local preview, choose **Image**, upload a JPG/PNG/WebP (or paste an image into the dialog), and select **Add handwriting to notebook**. The transcription becomes connected native pen paths automatically, with no keyboard or text-box step. Use Eraser to remove part of a letter, Lasso to move or categorize ink, and the pen to write over it. Undo restores an eraser gesture. Long results continue across new pages. The resized source photo is retained on a separate page with a source link. Existing note text also migrates to ink on reload for uniform partial erasing. The Text tool is temporary entry only: leaving a text box commits it as ink. Page titles remain separate from the ink surface.

Copy `.env.example` to `.env.local` and privately set `OPENAI_API_KEY`. Recognition sends the selected image to OpenAI and uses separately billed API credits. The server uses `store: false`. Recognition may misread handwriting or equations; diagrams are not converted into drawing objects. Output uses Scribbly's font-derived handwriting, not the source writer's exact strokes. The connected paths are obtained by thinning the rendered glyph mask and tracing its centerlines. Run `node scripts/test-ink.mjs` with Node 24 to check tracing and partial-erasure geometry without an API call.

Hosted recognition fails closed unless `OCR_OWNER_EMAIL` matches the trusted Sites authenticated-user email. Set that value and `OPENAI_API_KEY` as hosted runtime settings (the API key must be a secret), then deploy. Anonymous visitors cannot convert photos. The development-only bypass is compiled out of production. A GitHub checkout does not contain these credentials.

Images and notes use device-local storage. If storage fills, Scribbly shows an explicit warning; remove unneeded source-photo pages before closing. The public deployment may lag behind this branch while owner access is being configured.

## License

This prototype is available under the MIT License.

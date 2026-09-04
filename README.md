# Scribbly

### Turn Disorganized Scribbles into productive notes

For the formulas hiding between doodles, the examples scattered across lectures, and the board you photographed before it disappeared.

Scribbly is a tablet-first notebook that lets you write freely, collect the good bits, and turn photos into ink you can actually work with.

## 🪄 Compile — your notes, remixed

Your next formula sheet is already somewhere in your notebook.

1. **Lasso** the handwriting you want to keep.
2. **Categorize** it: formulas, examples, definitions, or something entirely your own.
3. **Compile** your category into a fresh sheet.

Same handwriting. Same pen strokes. Just gathered in one place. Move it, erase it, write around it, or use **Go to original** to jump back to its source.

You choose what belongs together—no AI guessing required.

## 📸 Photo → Handwriting

Snap the board. Grab a scan. Drop in a screenshot.

Choose **Image**, upload or paste a JPG, PNG, or WebP, then tap **Add handwriting to notebook**. Scribbly recognizes the writing and turns it into handwriting-style pen paths right on your pages.

- Erase part of a letter, not just a whole text box.
- Lasso, move, and categorize the ink.
- Write over it and make it yours.
- Keep the source photo on a separate page for reference.

Long transcriptions continue across new pages. This creates **Scribbly-style handwriting**, not an exact copy of the handwriting in the photo. Recognition can misread words or equations, and diagrams aren't recreated—give the result a quick check!

## 📓 Still a notebook at heart

Pen and highlighter. Blank, lined, and grid paper. Notebooks and folders. Pages that scroll together. Undo for ink edits. A welcome page that introduces the two key features, followed by blank pages ready for you.

Made for writing with a stylus, with mouse and touch support too. Page titles stay editable; the optional Text tool turns its input into ink when you leave the text box.

## Try it out

**[Open the latest Scribbly app →](https://scribbly-notes.fpibul.chatgpt.site/)**

This is the current public version, including the welcome guide and Photo → Handwriting. Photo conversion is restricted to the signed-in owner to protect the project's API credits; everyone can use the notebook and compilation tools.

### Run the latest version locally

You'll need Node.js 22 or later and pnpm. Download or clone this repository, then run these commands in its folder:

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and start scribbling.

Drawing and category compilation don't need an API key. To enable photo recognition, copy `.env.example` to `.env.local` and privately fill in `OPENAI_API_KEY`. Never commit or share that file.

### Build and check

```bash
pnpm build
pnpm exec tsc --noEmit
```

With Node.js 24, test ink tracing and partial erasing without making an API call:

```bash
node scripts/test-ink.mjs
```

## A few things to know

- **Your browser holds your notes.** Saving is device-local, not cloud sync. Clearing browser data can remove your notebooks. Accounts and cross-device syncing aren't available yet.
- **Photos use AI; compilation doesn't.** Photo recognition sends the selected image to OpenAI and uses separately billed API credits. Requests use `store: false`.
- **Photo recognition stays owner-only when hosted.** Set `OCR_OWNER_EMAIL` to match the trusted Sites sign-in email and configure `OPENAI_API_KEY` as a server-side secret. Without owner configuration, hosted recognition is blocked; anonymous visitors cannot convert photos. The localhost bypass is development-only.
- **Storage has limits.** If Scribbly warns that storage is full, remove unneeded source-photo pages before closing.
- **No keys ship with this repository.** Local credentials and hosted runtime secrets must be configured separately.

## Under the pen

Photo handwriting uses the bundled Caveat font. Scribbly thins rendered letters and traces their centerlines into connected native pen paths, so generated writing and hand-drawn ink can share the eraser and lasso. The font includes its own open-source license.

## License

Scribbly is an MIT-licensed prototype. Make something lovely with it. ✨

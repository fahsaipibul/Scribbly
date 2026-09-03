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

Notes are stored in the current browser. Accounts, cloud synchronization, and image-to-editable-note conversion are planned for later milestones.

## License

This prototype is available under the MIT License.

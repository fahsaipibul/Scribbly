'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, CircleUserRound, Eraser, Folder, Grid2X2, Highlighter,
  ImagePlus, LassoSelect, Menu, MoreHorizontal, MousePointer2, PenLine,
  Plus, Redo2, Search, Sparkles, Type, Undo2,
} from 'lucide-react';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

type NotePage = { id: number; label: string; tone: string; compiled?: boolean };

const starterPages: NotePage[] = [
  { id: 1, label: 'Limits & continuity', tone: 'peach' },
  { id: 2, label: 'Derivative rules', tone: 'blue' },
  { id: 3, label: 'Practice examples', tone: 'mint' },
];

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pages, setPages] = useState<NotePage[]>(starterPages);
  const [activeId, setActiveId] = useState(1);
  const [tool, setTool] = useState('pen');
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [notice, setNotice] = useState('');
  const activePage = pages.find((page) => page.id === activeId) ?? pages[0];
  const strokes = strokesByPage[activeId] ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem('scribbly-notebook');
      if (!saved) return;
      const notebook = JSON.parse(saved) as { pages: NotePage[]; strokes: Record<number, Stroke[]> };
      if (notebook.pages?.length) setPages(notebook.pages);
      if (notebook.strokes) setStrokesByPage(notebook.strokes);
    } catch { /* keep the friendly starter notebook */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('scribbly-notebook', JSON.stringify({ pages, strokes: strokesByPage }));
  }, [pages, strokesByPage]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'compile_formula_sheet',
      title: 'Compile formula sheet',
      description: 'Create or open an editable formula sheet inside the current Scribbly notebook.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => {
        compileFormulaSheet();
        return { status: 'created', notebook: 'Calculus I', page: 'Formula sheet' };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, [pages]);

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (tool !== 'pen' && tool !== 'highlighter') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      points: [point(event)],
      color: tool === 'highlighter' ? '#f7cb55' : '#24322f',
      width: tool === 'highlighter' ? 16 : 3,
    });
  }

  function moveStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    setDraft({ ...draft, points: [...draft.points, point(event)] });
  }

  function endStroke() {
    if (!draft) return;
    setStrokesByPage((current) => ({ ...current, [activeId]: [...(current[activeId] ?? []), draft] }));
    setDraft(null);
  }

  function undo() {
    setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).slice(0, -1) }));
  }

  function clearInk() {
    setStrokesByPage((current) => ({ ...current, [activeId]: [] }));
    setNotice('Ink cleared');
    window.setTimeout(() => setNotice(''), 1400);
  }

  function addPage() {
    const id = Math.max(...pages.map((page) => page.id), 0) + 1;
    setPages((current) => [...current, { id, label: `Untitled page ${id}`, tone: 'mint' }]);
    setActiveId(id);
  }

  function compileFormulaSheet() {
    setTool('select');
    const existing = pages.find((page) => page.compiled);
    if (existing) {
      setActiveId(existing.id);
      setNotice('Opened your formula sheet');
    } else {
      const id = Math.max(...pages.map((page) => page.id), 0) + 1;
      setPages((current) => [...current, { id, label: 'Formula sheet', tone: 'formula', compiled: true }]);
      setActiveId(id);
      setNotice('New editable formula sheet created');
    }
    window.setTimeout(() => setNotice(''), 1800);
  }

  const allStrokes = draft ? [...strokes, draft] : strokes;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button mobile-menu" aria-label="Open menu"><Menu /></button>
          <div className="brand-mark"><PenLine /></div>
          <span className="brand-name">scribbly</span>
        </div>
        <button className="notebook-title">Calculus I <ChevronDown /></button>
        <div className="top-actions">
          <button className="search-button"><Search /><span>Search notes</span><kbd>⌘ K</kbd></button>
          <button className="icon-button" aria-label="Profile"><CircleUserRound /></button>
        </div>
      </header>

      <div className="workspace">
        <aside className="library-sidebar">
          <div className="sidebar-label">Library</div>
          <nav>
            <button className="nav-row"><Grid2X2 />All notes <span>12</span></button>
            <button className="nav-row"><Folder />Folders <span>3</span></button>
          </nav>
          <div className="sidebar-heading"><span>Notebooks</span><button aria-label="New notebook"><Plus /></button></div>
          <button className="notebook-row active"><span className="notebook-dot coral" />Calculus I</button>
          <button className="notebook-row"><span className="notebook-dot lavender" />Physics</button>
          <button className="notebook-row"><span className="notebook-dot yellow" />Ideas</button>
          <div className="storage-note"><Sparkles /><div><strong>Everything is saved</strong><span>On this device</span></div></div>
        </aside>

        <aside className="page-sidebar">
          <div className="page-heading"><div><span>Pages</span><strong>{pages.length} pages</strong></div><button aria-label="Add page" onClick={addPage}><Plus /></button></div>
          <div className="page-list">
            {pages.map((page, index) => (
              <button className={`page-card ${page.id === activeId ? 'selected' : ''}`} key={page.id} onClick={() => setActiveId(page.id)}>
                <span className={`page-preview ${page.tone}`}>
                  <span className="preview-line wide" /><span className="preview-line" /><span className="preview-equation">f(x) → L</span>
                </span>
                <span className="page-copy"><strong>{page.label}</strong><small>Page {page.id}</small></span>
                <MoreHorizontal />
              </button>
            ))}
          </div>
          <button className="add-page" onClick={addPage}><Plus />Add new page</button>
        </aside>

        <section className="editor-area">
          <div className="editor-header">
            <div><span className="crumb">Calculus I / Chapter 2</span><h1>{activePage?.label}</h1></div>
            <div className="save-state"><span />Saved just now</div>
          </div>

          <div className="toolbar" role="toolbar" aria-label="Note tools">
            <ToolButton label="Select" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 /></ToolButton>
            <ToolButton label="Lasso" active={tool === 'lasso'} onClick={() => setTool('lasso')}><LassoSelect /></ToolButton>
            <span className="tool-divider" />
            <ToolButton label="Pen" active={tool === 'pen'} onClick={() => setTool('pen')}><PenLine /></ToolButton>
            <ToolButton label="Highlight" active={tool === 'highlighter'} onClick={() => setTool('highlighter')}><Highlighter /></ToolButton>
            <ToolButton label="Eraser" active={false} onClick={clearInk}><Eraser /></ToolButton>
            <ToolButton label="Text" active={tool === 'text'} onClick={() => setTool('text')}><Type /></ToolButton>
            <ToolButton label="Image" active={false} onClick={() => {}}><ImagePlus /></ToolButton>
            <span className="tool-divider" />
            <button className="color-dot" aria-label="Ink color" />
            <button className="weight-button" aria-label="Pen size"><span /></button>
            <span className="toolbar-spacer" />
            <button className="icon-button compact" aria-label="Undo" onClick={undo}><Undo2 /></button>
            <button className="icon-button compact" aria-label="Redo" disabled><Redo2 /></button>
            <button className="compile-button" onClick={compileFormulaSheet}><Sparkles />Compile formulas</button>
          </div>

          <div className="desk">
            <article className="paper squared-paper">
              {activePage?.compiled ? <CompiledSheet /> : (
                <div className="paper-content">
                  <p className="hand date">September 2</p>
                  <h2 className="hand">{activePage?.label}</h2>
                  <div className="hand underline" />
                  {activeId === 1 ? <>
                    <p className="hand note">A limit describes the value a function approaches<br />as the input gets closer to some value.</p>
                    <div className="formula-card hand"><span className="formula-label">Definition</span><strong>lim&nbsp; f(x) = L</strong><small>x → a</small></div>
                    <p className="hand ex"><b>EX</b>&nbsp;&nbsp; Find the limit:</p>
                    <p className="hand equation">lim&nbsp; (x² − 4) / (x − 2) = 4</p>
                  </> : <p className="hand empty-hint">Pick up the pen and make this page yours.</p>}
                </div>
              )}
              <svg
                ref={svgRef}
                className={`ink-layer tool-${tool}`}
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
              >
                {allStrokes.map((stroke, index) => (
                  <polyline key={index} points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.width > 10 ? .45 : 1} />
                ))}
              </svg>
            </article>
          </div>
        </section>
      </div>
      {notice && <div className="toast-notice" role="status">{notice}</div>}
    </main>
  );
}

function CompiledSheet() {
  const [items, setItems] = useState([
    { id: 1, label: 'Limit definition', formula: 'limₓ→ₐ f(x) = L', note: 'The value f(x) approaches as x approaches a.' },
    { id: 2, label: 'Difference of squares', formula: 'x² − a² = (x − a)(x + a)', note: 'Useful for simplifying limits before substitution.' },
    { id: 3, label: 'Power rule', formula: 'd/dx [xⁿ] = nxⁿ⁻¹', note: 'Multiply by the exponent, then subtract one.' },
  ]);
  return <div className="compiled-sheet">
    <div className="compiled-kicker"><Sparkles />Compiled from Calculus I</div>
    <h2 contentEditable suppressContentEditableWarning>My formula sheet</h2>
    <p className="compiled-help">Everything here is editable. Click into any text, or remove a card and rewrite it with the pen.</p>
    <div className="formula-grid">
      {items.map((item) => <section className="compiled-card" draggable key={item.id}>
        <button className="remove-card" onClick={() => setItems((all) => all.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.label}`}>×</button>
        <small contentEditable suppressContentEditableWarning>{item.label}</small>
        <strong contentEditable suppressContentEditableWarning>{item.formula}</strong>
        <p contentEditable suppressContentEditableWarning>{item.note}</p>
        <span className="source-link">↗ Page {item.id}</span>
      </section>)}
    </div>
    <button className="add-formula" onClick={() => setItems((all) => [...all, { id: Date.now(), label: 'New formula', formula: 'Tap to edit', note: 'Add your note here.' }])}><Plus />Add formula</button>
  </div>;
}

function ToolButton({ children, label, active, onClick }: { children: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={`tool-button ${active ? 'active' : ''}`} onClick={onClick} title={label} aria-label={label}>{children}<span>{label}</span></button>;
}

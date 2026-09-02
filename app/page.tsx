'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, CircleUserRound, Eraser, Folder, FolderOpen, Grid2X2,
  Highlighter, ImagePlus, LassoSelect, Menu, MousePointer2, PenLine,
  Plus, Redo2, Search, Sparkles, Trash2, Type, Undo2,
} from 'lucide-react';
import { createCompiledInk, writeInk, type CompilationSection } from '@/lib/handwriting';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };
type TextBox = { id: number; x: number; y: number; text: string };
type NotePage = { id: number; label: string; tone: string; compiled?: boolean };
type Notebook = { id: number; name: string; color: string; folder: string; pages: NotePage[] };
type Bounds = { x: number; y: number; width: number; height: number };

const starterNotebooks: Notebook[] = [
  { id: 1, name: 'Calculus I', color: 'coral', folder: 'School', pages: [
    { id: 1, label: 'Limits & continuity', tone: 'peach' },
    { id: 2, label: 'Derivative rules', tone: 'blue' },
    { id: 3, label: 'Practice examples', tone: 'mint' },
  ] },
  { id: 2, name: 'Physics', color: 'lavender', folder: 'School', pages: [
    { id: 101, label: 'Motion & forces', tone: 'blue' },
    { id: 102, label: 'Energy', tone: 'mint' },
  ] },
  { id: 3, name: 'Ideas', color: 'yellow', folder: 'Personal', pages: [
    { id: 201, label: 'Loose thoughts', tone: 'peach' },
  ] },
];

export default function Home() {
  const svgRef = useRef<SVGSVGElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>(starterNotebooks);
  const [activeNotebookId, setActiveNotebookId] = useState(1);
  const [activeId, setActiveId] = useState(1);
  const [view, setView] = useState<'notebook' | 'all' | 'folders'>('notebook');
  const [tool, setTool] = useState('pen');
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [textByPage, setTextByPage] = useState<Record<number, TextBox[]>>({});
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<Point[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Point | null>(null);
  const [notice, setNotice] = useState('');
  const [compileOpen, setCompileOpen] = useState(false);
  const [compileKind, setCompileKind] = useState('formulas');
  const [compileRequest, setCompileRequest] = useState('');
  const [compileBusy, setCompileBusy] = useState(false);
  const [compileError, setCompileError] = useState('');
  const [compiledSources, setCompiledSources] = useState<Record<number, Array<{ pageId:number; label:string }>>>({});

  const activeNotebook = notebooks.find((book) => book.id === activeNotebookId) ?? notebooks[0];
  const pages = activeNotebook?.pages ?? [];
  const activePage = pages.find((page) => page.id === activeId) ?? pages[0];
  const strokes = strokesByPage[activeId] ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem('scribbly-workspace-v3');
      if (!saved) return;
      const data = JSON.parse(saved) as { notebooks?: Notebook[]; strokes?: Record<number, Stroke[]>; text?: Record<number, TextBox[]>; sources?: Record<number, Array<{ pageId:number; label:string }>>; handwritingVersion?: number };
      if (data.notebooks?.length) setNotebooks(data.notebooks);
      if (data.strokes) {
        const migrated = { ...data.strokes };
        if (data.handwritingVersion !== 2) data.notebooks?.flatMap((book)=>book.pages).filter((page)=>page.compiled).forEach((page)=>{ migrated[page.id]=createCompiledInk('formulas'); });
        setStrokesByPage(migrated);
      }
      if (data.text) setTextByPage(data.text);
      if (data.sources) setCompiledSources(data.sources);
    } catch { /* keep starter workspace */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('scribbly-workspace-v3', JSON.stringify({ notebooks, strokes: strokesByPage, text: textByPage, sources: compiledSources, handwritingVersion:2 }));
  }, [notebooks, strokesByPage, textByPage, compiledSources]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'compile_formula_sheet', title: 'Compile formula sheet',
      description: 'Create or open an editable demo formula sheet inside the current Scribbly notebook.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => { await runCompilation('Compile all formulas in this notebook'); return { status: 'created', notebook: activeNotebook.name, page: 'Formula sheet' }; },
    }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, [notebooks, activeNotebookId]);

  function updatePages(updater: (current: NotePage[]) => NotePage[]) {
    setNotebooks((current) => current.map((book) => book.id === activeNotebookId ? { ...book, pages: updater(book.pages) } : book));
  }

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function inBounds(p: Point, bounds: Bounds) {
    return p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height;
  }

  function boundsFor(points: Point[]): Bounds {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    const cursor = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'eraser') { eraseAt(cursor); return; }
    if (tool === 'lasso') {
      if (selectionBounds && inBounds(cursor, selectionBounds)) { setDragOrigin(cursor); return; }
      setSelection([]); setSelectionBounds(null); setLasso([cursor]); return;
    }
    if (tool !== 'pen' && tool !== 'highlighter') return;
    setDraft({ points: [cursor], color: tool === 'highlighter' ? '#f7cb55' : '#24322f', width: tool === 'highlighter' ? 16 : 3 });
  }

  function moveStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (event.buttons === 0) {
      setDragOrigin(null);
      setLasso([]);
      return;
    }
    const cursor = point(event);
    if (tool === 'eraser') { eraseAt(cursor); return; }
    if (tool === 'lasso' && dragOrigin && selection.length) {
      const dx = cursor.x - dragOrigin.x, dy = cursor.y - dragOrigin.y;
      setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).map((stroke, index) => selection.includes(index) ? { ...stroke, points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : stroke) }));
      setSelectionBounds((bounds) => bounds ? { ...bounds, x: bounds.x + dx, y: bounds.y + dy } : null);
      setDragOrigin(cursor); return;
    }
    if (tool === 'lasso' && lasso.length) { setLasso((current) => [...current, cursor]); return; }
    if (draft) setDraft({ ...draft, points: [...draft.points, cursor] });
  }

  function endStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (draft) {
      setStrokesByPage((current) => ({ ...current, [activeId]: [...(current[activeId] ?? []), draft] }));
      setDraft(null);
    }
    if (lasso.length > 2) {
      const bounds = boundsFor(lasso);
      const selected = strokes.map((stroke, index) => stroke.points.some((sample) => inBounds(sample, bounds)) ? index : -1).filter((index) => index >= 0);
      setSelection(selected); setSelectionBounds(selected.length ? bounds : null);
      if (!selected.length) showNotice('No ink inside the lasso');
    }
    setLasso([]);
    setDragOrigin(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function eraseAt(cursor: Point) {
    setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).filter((stroke) => !stroke.points.some((sample) => Math.hypot(sample.x - cursor.x, sample.y - cursor.y) < stroke.width / 2 + 11)) }));
  }

  function deleteSelection() {
    setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).filter((_, index) => !selection.includes(index)) }));
    setSelection([]); setSelectionBounds(null); showNotice('Selected ink deleted');
  }

  function undo() {
    setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).slice(0, -1) }));
    setSelection([]); setSelectionBounds(null);
  }

  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 1600); }
  function renameActive(label: string) { updatePages((current) => current.map((page) => page.id === activeId ? { ...page, label } : page)); }
  function finishRename(label: string) { renameActive(label.trim() || 'Untitled page'); }

  function addText(event: React.MouseEvent<HTMLElement>) {
    if (tool !== 'text' || !paperRef.current) return;
    const rect = paperRef.current.getBoundingClientRect();
    const item = { id: Date.now(), x: event.clientX - rect.left, y: event.clientY - rect.top, text: 'Type here' };
    setTextByPage((current) => ({ ...current, [activeId]: [...(current[activeId] ?? []), item] })); setTool('select');
  }
  function editText(id: number, text: string) { setTextByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).map((item) => item.id === id ? { ...item, text } : item) })); }

  function openNotebook(id: number, pageId?: number) {
    const book = notebooks.find((item) => item.id === id); if (!book) return;
    setActiveNotebookId(id); setActiveId(pageId ?? book.pages[0]?.id); setView('notebook'); setSelection([]); setSelectionBounds(null);
  }

  function addNotebook() {
    const name = window.prompt('Name your new notebook', 'New notebook')?.trim(); if (!name) return;
    const id = Date.now(), pageId = id + 1;
    setNotebooks((current) => [...current, { id, name, color: 'mint', folder: 'Unfiled', pages: [{ id: pageId, label: 'Untitled page', tone: 'mint' }] }]);
    setActiveNotebookId(id); setActiveId(pageId); setView('notebook'); showNotice(`${name} created`);
  }

  function deleteNotebook(id: number) {
    const book = notebooks.find((item) => item.id === id); if (!book || notebooks.length === 1 || !window.confirm(`Delete “${book.name}” and its pages?`)) return;
    const remaining = notebooks.filter((item) => item.id !== id); setNotebooks(remaining);
    if (id === activeNotebookId) { setActiveNotebookId(remaining[0].id); setActiveId(remaining[0].pages[0]?.id); }
    showNotice(`${book.name} deleted`);
  }

  function addPage() {
    const id = Date.now(); updatePages((current) => [...current, { id, label: 'Untitled page', tone: 'mint' }]); setActiveId(id); setView('notebook');
  }

  function deletePage(id: number) {
    if (pages.length === 1) { showNotice('A notebook needs at least one page'); return; }
    const page = pages.find((item) => item.id === id); if (!page || !window.confirm(`Delete “${page.label}”?`)) return;
    const next = pages.filter((item) => item.id !== id); updatePages(() => next); if (activeId === id) setActiveId(next[0].id); showNotice('Page deleted');
  }

  function pageSnapshot(pageId: number, label: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 1050;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fffefb'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#24322f'; context.font = 'bold 28px sans-serif'; context.fillText(label, 48, 52);
    for (const item of textByPage[pageId] ?? []) {
      context.font = '22px sans-serif'; context.fillText(item.text, item.x, item.y);
    }
    context.lineCap = 'round'; context.lineJoin = 'round';
    for (const stroke of strokesByPage[pageId] ?? []) {
      if (!stroke.points.length) continue;
      context.beginPath(); context.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((sample) => context.lineTo(sample.x, sample.y));
      context.strokeStyle = stroke.color; context.lineWidth = stroke.width; context.globalAlpha = stroke.width > 10 ? .45 : 1; context.stroke();
    }
    context.globalAlpha = 1;
    return canvas.toDataURL('image/png');
  }

  async function runCompilation(request: string) {
    if (compileBusy) return;
    setCompileBusy(true); setCompileError('');
    const sourcePages = pages.filter((page) => (strokesByPage[page.id] ?? []).length > 0 || (textByPage[page.id] ?? []).length > 0);
    if (!sourcePages.length) {
      setCompileError('Write or type something in this notebook first.'); setCompileBusy(false); return;
    }
    try {
      const response = await fetch('/api/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, notebook: activeNotebook.name, pages: sourcePages.slice(0, 8).map((page) => ({ id: page.id, label: page.label, image: pageSnapshot(page.id, page.label) })) }),
      });
      const result = await response.json() as { title?: string; sections?: CompilationSection[]; error?: string };
      if (!response.ok || !result.title || !result.sections) throw new Error(result.error || 'Scribbly could not compile these notes.');
      if (!result.sections.length) throw new Error('I could not find anything matching that request. Try adding an “EX”, “Definition”, or formula label beside your notes.');
      finishCompilation(result.title, result.sections, sourcePages);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : 'Scribbly could not compile these notes.');
    } finally { setCompileBusy(false); }
  }

  function finishCompilation(title: string, sections: CompilationSection[], sourcePages: NotePage[]) {
    const id = Date.now();
    const label = title.slice(0, 60) || 'Compiled study sheet';
    const generated: Stroke[] = [...writeInk(title, 62, 64, 3.8, '#24322f', 2.7, 620)];
    const copied: Stroke[] = [];
    let cursorY = 140;
    const usedStrokes = new Set<string>();

    for (const section of sections.slice(0, 8)) {
      generated.push(...writeInk(section.heading, 64, cursorY, 3, '#d76552', 2.3, 590));
      cursorY += 48;
      let copiedOriginal = false;

      for (const region of section.sourceRegions.slice(0, 4)) {
        const source = strokesByPage[region.pageId] ?? [];
        const regionBounds = {
          x: region.x * .9 - 16, y: region.y * 1.05 - 16,
          width: region.width * .9 + 32, height: region.height * 1.05 + 32,
        };
        const selected = source.map((stroke, index) => ({ stroke, index })).filter(({ stroke, index }) => {
          if (usedStrokes.has(`${region.pageId}-${index}`) || !stroke.points.length) return false;
          const bounds = boundsFor(stroke.points);
          return bounds.x <= regionBounds.x + regionBounds.width && bounds.x + bounds.width >= regionBounds.x && bounds.y <= regionBounds.y + regionBounds.height && bounds.y + bounds.height >= regionBounds.y;
        });
        const points = selected.flatMap(({ stroke }) => stroke.points);
        if (!points.length) continue;
        const sourceBounds = boundsFor(points);
        const scale = Math.min(.9, 680 / Math.max(sourceBounds.width, 1), 190 / Math.max(sourceBounds.height, 1));
        selected.forEach(({ stroke, index }) => {
          usedStrokes.add(`${region.pageId}-${index}`);
          copied.push({ ...stroke, width: Math.max(1, stroke.width * scale), points: stroke.points.map((sample) => ({ x: 76 + (sample.x - sourceBounds.x) * scale, y: cursorY + (sample.y - sourceBounds.y) * scale })) });
        });
        cursorY += Math.max(44, sourceBounds.height * scale) + 28;
        copiedOriginal = true;
        if (cursorY > 990) break;
      }

      if (!copiedOriginal) {
        for (const line of section.lines.slice(0, 4)) {
          generated.push(...writeInk(line, 78, cursorY, 2.45, '#24322f', 2, 570));
          cursorY += 34 * Math.max(1, Math.ceil(line.length / 38));
        }
        cursorY += 20;
      }
      if (cursorY > 990) break;
    }

    const referencedIds = new Set(sections.flatMap((section) => [...section.sourcePageIds, ...section.sourceRegions.map((region) => region.pageId)]));
    const referencedPages = sourcePages.filter((page) => referencedIds.has(page.id));
    updatePages((current) => [...current, { id, label, tone:'formula', compiled:true }]);
    setStrokesByPage((current) => ({ ...current, [id]:[...generated,...copied] }));
    setCompiledSources((current) => ({ ...current, [id]:(referencedPages.length?referencedPages:sourcePages).map((page)=>({pageId:page.id,label:page.label})) }));
    setActiveId(id); setTool('pen'); setView('notebook'); setCompileOpen(false); showNotice('Handwritten compilation created');
  }

  const allStrokes = draft ? [...strokes, draft] : strokes;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-group"><button className="icon-button mobile-menu" aria-label="Open menu"><Menu /></button><div className="brand-mark"><PenLine /></div><span className="brand-name">scribbly</span></div>
      <button className="notebook-title" onClick={() => setView('notebook')}>{activeNotebook?.name} <ChevronDown /></button>
      <div className="top-actions"><button className="search-button"><Search /><span>Search notes</span><kbd>⌘ K</kbd></button><button className="icon-button" aria-label="Profile"><CircleUserRound /></button></div>
    </header>

    <div className="workspace">
      <aside className="library-sidebar">
        <div className="sidebar-label">Library</div>
        <nav>
          <button className={`nav-row ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}><Grid2X2 />All notes <span>{notebooks.length}</span></button>
          <button className={`nav-row ${view === 'folders' ? 'active' : ''}`} onClick={() => setView('folders')}><Folder />Folders <span>{new Set(notebooks.map((book) => book.folder)).size}</span></button>
        </nav>
        <div className="sidebar-heading"><span>Notebooks</span><button aria-label="New notebook" onClick={addNotebook}><Plus /></button></div>
        {notebooks.map((book) => <div className={`notebook-row-wrap ${book.id === activeNotebookId && view === 'notebook' ? 'active' : ''}`} key={book.id}>
          <button className="notebook-row" onClick={() => openNotebook(book.id)}><span className={`notebook-dot ${book.color}`} />{book.name}</button>
          <button className="row-delete" aria-label={`Delete ${book.name}`} onClick={() => deleteNotebook(book.id)}><Trash2 /></button>
        </div>)}
        <div className="storage-note"><Sparkles /><div><strong>Everything is saved</strong><span>On this device</span></div></div>
      </aside>

      <aside className="page-sidebar">
        <div className="page-heading"><div><span>{view === 'all' ? 'All notes' : view === 'folders' ? 'Folders' : 'Pages'}</span><strong>{view === 'all' ? `${notebooks.length} notebooks` : view === 'folders' ? 'Organized spaces' : `${pages.length} pages`}</strong></div>{view === 'notebook' && <button aria-label="Add page" onClick={addPage}><Plus /></button>}</div>
        {view === 'folders' ? <FolderList notebooks={notebooks} onOpen={openNotebook} /> : <div className="page-list">
          {view === 'all' ? notebooks.map((book) => <div className="page-card" key={book.id}><button className="page-card-main" onClick={() => openNotebook(book.id)}><span className={`page-preview ${book.pages[0]?.tone ?? 'mint'} notebook-cover`}><span className={`notebook-spine ${book.color}`} /><span className="preview-line wide" /><span className="preview-line" /></span><span className="page-copy"><strong>{book.name}</strong><small>{book.pages.length} pages · {book.folder}</small></span></button></div>) : pages.map((page) => <div className={`page-card ${page.id === activeId ? 'selected' : ''}`} key={page.id}><button className="page-card-main" onClick={() => openNotebook(activeNotebookId, page.id)}><span className={`page-preview ${page.tone}`}><span className="preview-line wide" /><span className="preview-line" /><span className="preview-equation">f(x) → L</span></span><span className="page-copy"><strong>{page.label}</strong><small>Page {pages.findIndex((p) => p.id === page.id) + 1}</small></span></button><button className="row-delete page-delete" aria-label={`Delete ${page.label}`} onClick={() => deletePage(page.id)}><Trash2 /></button></div>)}
        </div>}
        {view === 'notebook' && <button className="add-page" onClick={addPage}><Plus />Add new page</button>}
      </aside>

      {view !== 'notebook' ? <CollectionView view={view} notebooks={notebooks} onOpen={openNotebook} onCreate={addNotebook} /> : <section className="editor-area">
        <div className="editor-header"><div><span className="crumb">{activeNotebook?.name} / Notes</span><input className="editable-page-title" value={activePage?.label ?? ''} onChange={(event) => renameActive(event.target.value)} onBlur={(event) => finishRename(event.target.value)} aria-label="Page title" /></div><div className="save-state"><span />Saved just now</div></div>
        <div className="toolbar" role="toolbar" aria-label="Note tools">
          <ToolButton label="Select" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 /></ToolButton>
          <ToolButton label="Lasso" active={tool === 'lasso'} onClick={() => { setTool('lasso'); setSelection([]); setSelectionBounds(null); }}><LassoSelect /></ToolButton>
          {selection.length > 0 && <button className="delete-selection" onClick={deleteSelection}><Trash2 />Delete selection</button>}
          <span className="tool-divider" />
          <ToolButton label="Pen" active={tool === 'pen'} onClick={() => setTool('pen')}><PenLine /></ToolButton><ToolButton label="Highlight" active={tool === 'highlighter'} onClick={() => setTool('highlighter')}><Highlighter /></ToolButton><ToolButton label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser /></ToolButton><ToolButton label="Text" active={tool === 'text'} onClick={() => setTool('text')}><Type /></ToolButton><ToolButton label="Image" active={false} onClick={() => {}}><ImagePlus /></ToolButton>
          <span className="tool-divider" /><button className="color-dot" aria-label="Ink color" /><button className="weight-button" aria-label="Pen size"><span /></button><span className="toolbar-spacer" />
          <button className="icon-button compact" aria-label="Undo" onClick={undo}><Undo2 /></button><button className="icon-button compact" aria-label="Redo" disabled><Redo2 /></button><button className="compile-button" onClick={() => { setCompileError(''); setCompileOpen(true); }}><Sparkles />Compile <span>AI</span></button>
        </div>
        <div className="desk"><article ref={paperRef} className={`paper squared-paper paper-tool-${tool}`} onClick={addText}>
          {!activePage?.compiled && <div className="paper-content"><p className="hand date">September 2</p><h2 className="hand editable-paper-title" contentEditable suppressContentEditableWarning onBlur={(event) => finishRename(event.currentTarget.textContent ?? '')}>{activePage?.label}</h2><div className="hand underline" />{activeId === 1 ? <><p className="hand note">A limit describes the value a function approaches<br />as the input gets closer to some value.</p><div className="formula-card hand"><span className="formula-label">Definition</span><strong>lim&nbsp; f(x) = L</strong><small>x → a</small></div><p className="hand ex"><b>EX</b>&nbsp;&nbsp; Find the limit:</p><p className="hand equation">lim&nbsp; (x² − 4) / (x − 2) = 4</p></> : <p className="hand empty-hint">Pick up the pen and make this page yours.</p>}</div>}
          {activePage?.compiled && compiledSources[activeId]?.length > 0 && <button className="source-chip" onClick={() => openNotebook(activeNotebookId, compiledSources[activeId][0].pageId)}>↗ Go to original: {compiledSources[activeId][0].label}</button>}
          {(textByPage[activeId] ?? []).map((item) => <div key={item.id} className="canvas-text" style={{ left:item.x, top:item.y }} contentEditable suppressContentEditableWarning onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onBlur={(event) => editText(item.id, event.currentTarget.textContent ?? '')}>{item.text}</div>)}
          <svg ref={svgRef} className={`ink-layer tool-${tool}`} onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke} onPointerCancel={endStroke}>
            {allStrokes.map((stroke,index) => <polyline key={index} className={selection.includes(index) ? 'selected-stroke' : ''} points={stroke.points.map((p)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.width>10?.45:1} />)}
            {lasso.length > 1 && <polyline className="lasso-path" points={lasso.map((p)=>`${p.x},${p.y}`).join(' ')} fill="rgba(92,126,112,.06)" />}
            {selectionBounds && <rect className="selection-box" x={selectionBounds.x} y={selectionBounds.y} width={selectionBounds.width} height={selectionBounds.height} rx="8" />}
          </svg>
        </article></div>
      </section>}
    </div>{compileOpen && <div className="compile-overlay" role="dialog" aria-modal="true" aria-label="Compile notebook"><div className="compile-dialog"><div className="compile-dialog-icon"><Sparkles /></div><h2>What would you like to compile?</h2><p>Scribbly will read your notes and create a new page using native, erasable pen strokes.</p><div className="compile-options">{['formulas','examples','definitions','custom'].map((kind)=><button disabled={compileBusy} key={kind} className={compileKind===kind?'active':''} onClick={()=>setCompileKind(kind)}>{kind}</button>)}</div>{compileKind==='custom'&&<textarea disabled={compileBusy} value={compileRequest} onChange={(event)=>setCompileRequest(event.target.value)} placeholder="e.g. Formulas with one example beneath each" autoFocus />}{compileError&&<p className="compile-error" role="alert">{compileError}</p>}<div className="compile-actions"><button disabled={compileBusy} onClick={()=>setCompileOpen(false)}>Cancel</button><button disabled={compileBusy || (compileKind==='custom'&&!compileRequest.trim())} className="create-compilation" onClick={()=>runCompilation(compileKind==='custom'?compileRequest:`Compile all ${compileKind} in this notebook`)}><Sparkles />{compileBusy?'Reading your notes…':'Create handwritten sheet'}</button></div></div></div>}{notice && <div className="toast-notice" role="status">{notice}</div>}
  </main>;
}

function FolderList({ notebooks, onOpen }: { notebooks: Notebook[]; onOpen: (id:number)=>void }) {
  const folders = [...new Set(notebooks.map((book)=>book.folder))];
  return <div className="folder-list">{folders.map((folder)=><section key={folder}><div className="folder-title"><FolderOpen />{folder}</div>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length}</span></button>)}</section>)}</div>;
}

function CollectionView({ view, notebooks, onOpen, onCreate }: { view:'all'|'folders'; notebooks:Notebook[]; onOpen:(id:number,pageId?:number)=>void; onCreate:()=>void }) {
  return <section className="collection-view"><div className="collection-header"><div><span className="crumb">Your library</span><h1>{view==='all'?'All notes':'Folders'}</h1></div><button onClick={onCreate}><Plus />New notebook</button></div>{view==='all'?<div className="note-grid">{notebooks.map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}><span className={`large-page-preview ${book.pages[0]?.tone ?? 'mint'} notebook-large-cover`}><span className={`large-spine ${book.color}`} /><span className="cover-title">{book.name}</span></span><strong>{book.name}</strong><small>{book.pages.length} pages · {book.folder}</small></button>)}</div>:<div className="folder-grid">{[...new Set(notebooks.map((book)=>book.folder))].map((folder)=><section key={folder}><FolderOpen /><h2>{folder}</h2><p>{notebooks.filter((book)=>book.folder===folder).length} notebooks</p>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length} pages</span></button>)}</section>)}</div>}</section>;
}

function ToolButton({children,label,active,onClick}:{children:React.ReactNode;label:string;active:boolean;onClick:()=>void}) { return <button className={`tool-button ${active?'active':''}`} onClick={onClick} title={label} aria-label={label}>{children}<span>{label}</span></button>; }

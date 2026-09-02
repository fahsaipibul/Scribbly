'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, CircleUserRound, Eraser, Folder, FolderOpen, Grid2X2,
  Highlighter, ImagePlus, LassoSelect, Menu, MousePointer2, PenLine,
  Plus, Redo2, Search, Sparkles, Trash2, Type, Undo2,
} from 'lucide-react';

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

  const activeNotebook = notebooks.find((book) => book.id === activeNotebookId) ?? notebooks[0];
  const pages = activeNotebook?.pages ?? [];
  const activePage = pages.find((page) => page.id === activeId) ?? pages[0];
  const strokes = strokesByPage[activeId] ?? [];
  const allPages = notebooks.flatMap((book) => book.pages.map((page) => ({ ...page, notebookId: book.id, notebookName: book.name })));

  useEffect(() => {
    try {
      const saved = localStorage.getItem('scribbly-workspace-v3');
      if (!saved) return;
      const data = JSON.parse(saved) as { notebooks?: Notebook[]; strokes?: Record<number, Stroke[]>; text?: Record<number, TextBox[]> };
      if (data.notebooks?.length) setNotebooks(data.notebooks);
      if (data.strokes) setStrokesByPage(data.strokes);
      if (data.text) setTextByPage(data.text);
    } catch { /* keep starter workspace */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('scribbly-workspace-v3', JSON.stringify({ notebooks, strokes: strokesByPage, text: textByPage }));
  }, [notebooks, strokesByPage, textByPage]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'compile_formula_sheet', title: 'Compile formula sheet',
      description: 'Create or open an editable demo formula sheet inside the current Scribbly notebook.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => { compileFormulaSheet(); return { status: 'created', notebook: activeNotebook.name, page: 'Formula sheet' }; },
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

  function endStroke() {
    if (draft) {
      setStrokesByPage((current) => ({ ...current, [activeId]: [...(current[activeId] ?? []), draft] }));
      setDraft(null);
    }
    if (lasso.length > 2) {
      const bounds = boundsFor(lasso);
      const selected = strokes.map((stroke, index) => stroke.points.some((sample) => inBounds(sample, bounds)) ? index : -1).filter((index) => index >= 0);
      setSelection(selected); setSelectionBounds(selected.length ? bounds : null); setLasso([]);
      if (!selected.length) showNotice('No ink inside the lasso');
    }
    setDragOrigin(null);
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

  function compileFormulaSheet() {
    setTool('select'); setView('notebook'); const existing = pages.find((page) => page.compiled);
    if (existing) { setActiveId(existing.id); showNotice('Opened your formula sheet'); }
    else { const id = Date.now(); updatePages((current) => [...current, { id, label: 'Formula sheet', tone: 'formula', compiled: true }]); setActiveId(id); showNotice('Editable demo formula sheet created'); }
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
          <button className={`nav-row ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}><Grid2X2 />All notes <span>{allPages.length}</span></button>
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
        <div className="page-heading"><div><span>{view === 'all' ? 'All notes' : view === 'folders' ? 'Folders' : 'Pages'}</span><strong>{view === 'all' ? `${allPages.length} pages` : view === 'folders' ? 'Organized spaces' : `${pages.length} pages`}</strong></div>{view === 'notebook' && <button aria-label="Add page" onClick={addPage}><Plus /></button>}</div>
        {view === 'folders' ? <FolderList notebooks={notebooks} onOpen={openNotebook} /> : <div className="page-list">
          {(view === 'all' ? allPages : pages).map((page) => {
            const notebookId = 'notebookId' in page ? page.notebookId : activeNotebookId;
            return <div className={`page-card ${page.id === activeId && view === 'notebook' ? 'selected' : ''}`} key={page.id}>
              <button className="page-card-main" onClick={() => openNotebook(notebookId, page.id)}><span className={`page-preview ${page.tone}`}><span className="preview-line wide" /><span className="preview-line" /><span className="preview-equation">f(x) → L</span></span><span className="page-copy"><strong>{page.label}</strong><small>{view === 'all' && 'notebookName' in page ? page.notebookName : `Page ${pages.findIndex((p) => p.id === page.id) + 1}`}</small></span></button>
              {view === 'notebook' && <button className="row-delete page-delete" aria-label={`Delete ${page.label}`} onClick={() => deletePage(page.id)}><Trash2 /></button>}
            </div>;
          })}
        </div>}
        {view === 'notebook' && <button className="add-page" onClick={addPage}><Plus />Add new page</button>}
      </aside>

      {view !== 'notebook' ? <CollectionView view={view} notebooks={notebooks} allPages={allPages} onOpen={openNotebook} onCreate={addNotebook} /> : <section className="editor-area">
        <div className="editor-header"><div><span className="crumb">{activeNotebook?.name} / Notes</span><input className="editable-page-title" value={activePage?.label ?? ''} onChange={(event) => renameActive(event.target.value)} onBlur={(event) => finishRename(event.target.value)} aria-label="Page title" /></div><div className="save-state"><span />Saved just now</div></div>
        <div className="toolbar" role="toolbar" aria-label="Note tools">
          <ToolButton label="Select" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 /></ToolButton>
          <ToolButton label="Lasso" active={tool === 'lasso'} onClick={() => { setTool('lasso'); setSelection([]); setSelectionBounds(null); }}><LassoSelect /></ToolButton>
          {selection.length > 0 && <button className="delete-selection" onClick={deleteSelection}><Trash2 />Delete selection</button>}
          <span className="tool-divider" />
          <ToolButton label="Pen" active={tool === 'pen'} onClick={() => setTool('pen')}><PenLine /></ToolButton><ToolButton label="Highlight" active={tool === 'highlighter'} onClick={() => setTool('highlighter')}><Highlighter /></ToolButton><ToolButton label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser /></ToolButton><ToolButton label="Text" active={tool === 'text'} onClick={() => setTool('text')}><Type /></ToolButton><ToolButton label="Image" active={false} onClick={() => {}}><ImagePlus /></ToolButton>
          <span className="tool-divider" /><button className="color-dot" aria-label="Ink color" /><button className="weight-button" aria-label="Pen size"><span /></button><span className="toolbar-spacer" />
          <button className="icon-button compact" aria-label="Undo" onClick={undo}><Undo2 /></button><button className="icon-button compact" aria-label="Redo" disabled><Redo2 /></button><button className="compile-button" onClick={compileFormulaSheet}><Sparkles />Compile formulas <span>Demo</span></button>
        </div>
        <div className="desk"><article ref={paperRef} className={`paper squared-paper paper-tool-${tool}`} onClick={addText}>
          {activePage?.compiled ? <CompiledSheet notebookName={activeNotebook.name} /> : <div className="paper-content"><p className="hand date">September 2</p><h2 className="hand editable-paper-title" contentEditable suppressContentEditableWarning onBlur={(event) => finishRename(event.currentTarget.textContent ?? '')}>{activePage?.label}</h2><div className="hand underline" />{activeId === 1 ? <><p className="hand note">A limit describes the value a function approaches<br />as the input gets closer to some value.</p><div className="formula-card hand"><span className="formula-label">Definition</span><strong>lim&nbsp; f(x) = L</strong><small>x → a</small></div><p className="hand ex"><b>EX</b>&nbsp;&nbsp; Find the limit:</p><p className="hand equation">lim&nbsp; (x² − 4) / (x − 2) = 4</p></> : <p className="hand empty-hint">Pick up the pen and make this page yours.</p>}</div>}
          {(textByPage[activeId] ?? []).map((item) => <div key={item.id} className="canvas-text" style={{ left:item.x, top:item.y }} contentEditable suppressContentEditableWarning onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onBlur={(event) => editText(item.id, event.currentTarget.textContent ?? '')}>{item.text}</div>)}
          <svg ref={svgRef} className={`ink-layer tool-${tool}`} onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke} onPointerCancel={endStroke}>
            {allStrokes.map((stroke,index) => <polyline key={index} className={selection.includes(index) ? 'selected-stroke' : ''} points={stroke.points.map((p)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.width>10?.45:1} />)}
            {lasso.length > 1 && <polyline className="lasso-path" points={lasso.map((p)=>`${p.x},${p.y}`).join(' ')} fill="rgba(92,126,112,.06)" />}
            {selectionBounds && <rect className="selection-box" x={selectionBounds.x} y={selectionBounds.y} width={selectionBounds.width} height={selectionBounds.height} rx="8" />}
          </svg>
        </article></div>
      </section>}
    </div>{notice && <div className="toast-notice" role="status">{notice}</div>}
  </main>;
}

function FolderList({ notebooks, onOpen }: { notebooks: Notebook[]; onOpen: (id:number)=>void }) {
  const folders = [...new Set(notebooks.map((book)=>book.folder))];
  return <div className="folder-list">{folders.map((folder)=><section key={folder}><div className="folder-title"><FolderOpen />{folder}</div>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length}</span></button>)}</section>)}</div>;
}

function CollectionView({ view, notebooks, allPages, onOpen, onCreate }: { view:'all'|'folders'; notebooks:Notebook[]; allPages:Array<NotePage & {notebookId:number;notebookName:string}>; onOpen:(id:number,pageId?:number)=>void; onCreate:()=>void }) {
  return <section className="collection-view"><div className="collection-header"><div><span className="crumb">Your library</span><h1>{view==='all'?'All notes':'Folders'}</h1></div><button onClick={onCreate}><Plus />New notebook</button></div>{view==='all'?<div className="note-grid">{allPages.map((page)=><button key={page.id} onClick={()=>onOpen(page.notebookId,page.id)}><span className={`large-page-preview ${page.tone}`}><span>f(x) → L</span></span><strong>{page.label}</strong><small>{page.notebookName}</small></button>)}</div>:<div className="folder-grid">{[...new Set(notebooks.map((book)=>book.folder))].map((folder)=><section key={folder}><FolderOpen /><h2>{folder}</h2><p>{notebooks.filter((book)=>book.folder===folder).length} notebooks</p>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length} pages</span></button>)}</section>)}</div>}</section>;
}

function CompiledSheet({ notebookName }: { notebookName:string }) {
  const starterItems=[{id:1,label:'Limit definition',formula:'limₓ→ₐ f(x) = L',note:'The value f(x) approaches as x approaches a.'},{id:2,label:'Difference of squares',formula:'x² − a² = (x − a)(x + a)',note:'Useful for simplifying limits before substitution.'},{id:3,label:'Power rule',formula:'d/dx [xⁿ] = nxⁿ⁻¹',note:'Multiply by the exponent, then subtract one.'}];
  const [items,setItems]=useState(starterItems); const [sheetTitle,setSheetTitle]=useState('My formula sheet');
  useEffect(()=>{try{const saved=localStorage.getItem('scribbly-compiled-sheet');if(saved){const parsed=JSON.parse(saved);if(parsed.title)setSheetTitle(parsed.title);if(parsed.items)setItems(parsed.items);}}catch{}},[]);
  useEffect(()=>{localStorage.setItem('scribbly-compiled-sheet',JSON.stringify({title:sheetTitle,items}));},[items,sheetTitle]);
  function editItem(id:number,field:'label'|'formula'|'note',value:string){setItems((all)=>all.map((item)=>item.id===id?{...item,[field]:value}:item));}
  return <div className="compiled-sheet"><div className="compiled-kicker"><Sparkles />Demo compilation · {notebookName}</div><h2 contentEditable suppressContentEditableWarning onBlur={(event)=>setSheetTitle(event.currentTarget.textContent||'Formula sheet')}>{sheetTitle}</h2><p className="compiled-help">Everything here is editable. Click any text, remove a card, or write over it.</p><div className="formula-grid">{items.map((item)=><section className="compiled-card" key={item.id}><button className="remove-card" onClick={()=>setItems((all)=>all.filter((entry)=>entry.id!==item.id))}>×</button><small contentEditable suppressContentEditableWarning onBlur={(e)=>editItem(item.id,'label',e.currentTarget.textContent??'')}>{item.label}</small><strong contentEditable suppressContentEditableWarning onBlur={(e)=>editItem(item.id,'formula',e.currentTarget.textContent??'')}>{item.formula}</strong><p contentEditable suppressContentEditableWarning onBlur={(e)=>editItem(item.id,'note',e.currentTarget.textContent??'')}>{item.note}</p><span className="source-link">↗ Page {item.id}</span></section>)}</div><button className="add-formula" onClick={()=>setItems((all)=>[...all,{id:Date.now(),label:'New formula',formula:'Tap to edit',note:'Add your note here.'}])}><Plus />Add formula</button></div>;
}

function ToolButton({children,label,active,onClick}:{children:React.ReactNode;label:string;active:boolean;onClick:()=>void}) { return <button className={`tool-button ${active?'active':''}`} onClick={onClick} title={label} aria-label={label}>{children}<span>{label}</span></button>; }

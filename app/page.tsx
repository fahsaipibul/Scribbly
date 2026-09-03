'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, CircleUserRound, Eraser, Folder, FolderOpen, Grid2X2,
  Highlighter, ImagePlus, LassoSelect, Menu, MousePointer2, PenLine,
  Plus, Redo2, Search, Sparkles, Tag, Trash2, Type, Undo2,
} from 'lucide-react';
import { eraseInk, handwritingInk } from '@/lib/photo-ink';
import { PhotoImport } from '@/components/photo-import';
import { createCompiledInk } from '@/lib/handwriting';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };
type TextBox = { id: number; x: number; y: number; text: string };
type NotePage = { id: number; label: string; tone: string; compiled?: boolean; sourceImage?: string; guide?: boolean };
type Notebook = { id: number; name: string; color: string; folder: string; pages: NotePage[] };
type Bounds = { x: number; y: number; width: number; height: number };
type Category = { id: string; name: string; color: string };
type TaggedBlock = { id: number; notebookId: number; pageId: number; pageLabel: string; categoryId: string; bounds: Bounds; strokes: Stroke[] };

const starterCategories: Category[] = [
  { id:'formula', name:'Formula', color:'#d76552' },
  { id:'example', name:'Example', color:'#5686b0' },
  { id:'definition', name:'Definition', color:'#5d9079' },
];

const starterNotebooks: Notebook[] = [
  { id: 1, name: 'Calculus I', color: 'coral', folder: 'School', pages: [
    { id: 1, label: 'Welcome to Scribbly', tone: 'peach', guide: true },
    { id: 2, label: 'Untitled page', tone: 'blue' },
    { id: 3, label: 'Untitled page', tone: 'mint' },
  ] },
  { id: 2, name: 'Physics', color: 'lavender', folder: 'School', pages: [
    { id: 101, label: 'Untitled page', tone: 'blue' },
    { id: 102, label: 'Untitled page', tone: 'mint' },
  ] },
  { id: 3, name: 'Ideas', color: 'yellow', folder: 'Personal', pages: [
    { id: 201, label: 'Untitled page', tone: 'peach' },
  ] },
];

export default function Home() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(starterNotebooks);
  const [activeNotebookId, setActiveNotebookId] = useState(1);
  const [activeId, setActiveId] = useState(1);
  const [view, setView] = useState<'notebook' | 'all' | 'folders'>('notebook');
  const [tool, setTool] = useState('pen');
  const [strokesByPage, setStrokesByPage] = useState<Record<number, Stroke[]>>({});
  const [textByPage, setTextByPage] = useState<Record<number, TextBox[]>>({});
  const [photoOpen, setPhotoOpen] = useState(false);
  const [textSelection, setTextSelection] = useState<number[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<Point[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Point | null>(null);
  const [notice, setNotice] = useState('');
  const [compileOpen, setCompileOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [compiledSources, setCompiledSources] = useState<Record<number, Array<{ pageId:number; label:string }>>>({});
  const [categories, setCategories] = useState<Category[]>(starterCategories);
  const [taggedBlocks, setTaggedBlocks] = useState<TaggedBlock[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const eraserPoint = useRef<Point | null>(null);
  const inkHistory = useRef<Record<number, Stroke[][]>>({});
  const [hydrated, setHydrated] = useState(false);

  const activeNotebook = notebooks.find((book) => book.id === activeNotebookId) ?? notebooks[0];
  const pages = activeNotebook?.pages ?? [];
  const activePage = pages.find((page) => page.id === activeId) ?? pages[0];
  const strokes = strokesByPage[activeId] ?? [];

  useEffect(() => {
    let cancelled=false;
    void (async()=>{try {
      const saved = localStorage.getItem('scribbly-workspace-v3');
      if (!saved) return;
      const data = JSON.parse(saved) as { notebooks?: Notebook[]; strokes?: Record<number, Stroke[]>; text?: Record<number, TextBox[]>; sources?: Record<number, Array<{ pageId:number; label:string }>>; categories?:Category[]; taggedBlocks?:TaggedBlock[]; handwritingVersion?: number; cleanCompiledTitles?:boolean; welcomeVersion?:number };
      if(data.notebooks?.length && data.welcomeVersion!==1) {
        const defaults: Record<number,string>={1:'Limits & continuity',2:'Derivative rules',3:'Practice examples',101:'Motion & forces',102:'Energy',201:'Loose thoughts'};
        const untouched=(page:NotePage)=>(data.strokes?.[page.id]?.length??0)===0&&(data.text?.[page.id]?.length??0)===0&&!page.compiled&&!page.sourceImage&&!(data.taggedBlocks??[]).some(block=>block.pageId===page.id);
        data.notebooks=data.notebooks.map(book=>({...book,pages:book.pages.map(page=>
          defaults[page.id]===page.label&&untouched(page)?{...page,label:page.id===1?'Welcome to Scribbly':'Untitled page',...(page.id===1?{guide:true}:{})}:page)}));
        if(!data.notebooks.some(book=>book.pages.some(page=>page.guide))) {
          const ids=data.notebooks.flatMap(book=>book.pages.map(page=>page.id));
          const id=ids.reduce((lowest,value)=>Math.min(lowest,value),0)-1;
          data.notebooks[0]={...data.notebooks[0],pages:[{id,label:'Welcome to Scribbly',tone:'peach',guide:true},...data.notebooks[0].pages]};
        }
      }
      const landingBook=data.notebooks?.find(book=>book.pages.some(page=>page.guide))??data.notebooks?.[0];
      if(landingBook){setActiveNotebookId(landingBook.id);setActiveId((landingBook.pages.find(page=>page.guide)??landingBook.pages[0]).id);}
      const allPages=data.notebooks?.flatMap(book=>book.pages)??[];
      const photoPages=allPages.filter(page=>(data.text?.[page.id]?.length??0)>0);
      if(photoPages.length) {
        try {
        await document.fonts.load('500 22px ScribblyHand');
        if(cancelled) return;
        data.strokes??={};
        for(const page of photoPages) {
          const ink=(data.text?.[page.id]??[]).flatMap(line=>handwritingInk(line.text,line.x,line.y));
          data.strokes[page.id]=[...(data.strokes[page.id]??[]),...ink];
          delete data.text![page.id];
        }
        } catch { setNotice('Handwriting could not load. Existing notes have been kept; refresh to retry.'); }
      }
      if (data.notebooks?.length) setNotebooks(data.notebooks);
      if (data.strokes) {
        const migrated = { ...data.strokes };
        if (data.handwritingVersion !== 2) data.notebooks?.flatMap((book)=>book.pages).filter((page)=>page.compiled).forEach((page)=>{ migrated[page.id]=createCompiledInk('formulas'); });
        if (!data.cleanCompiledTitles) data.notebooks?.flatMap((book)=>book.pages).filter((page)=>page.compiled).forEach((page)=>{ migrated[page.id]=(migrated[page.id]??[]).filter((stroke)=>!stroke.points.length||!stroke.points.every((sample)=>sample.y<132)); });
        setStrokesByPage(migrated);
      }
      if (data.text) setTextByPage(data.text);
      if (data.sources) setCompiledSources(data.sources);
      if (data.categories?.length) setCategories(data.categories);
      if (data.taggedBlocks) setTaggedBlocks(data.taggedBlocks);
    } catch { /* keep starter workspace */ }
    finally { if(!cancelled)setHydrated(true); }})();
    return ()=>{cancelled=true;};
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem('scribbly-workspace-v3', JSON.stringify({ notebooks, strokes: strokesByPage, text: textByPage, sources: compiledSources, categories, taggedBlocks, handwritingVersion:2, cleanCompiledTitles:true, welcomeVersion:1 })); setSaveError(false); } catch { setSaveError(true); }
  }, [hydrated, notebooks, strokesByPage, textByPage, compiledSources, categories, taggedBlocks]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'compile_formula_sheet', title: 'Compile formula sheet',
      description: 'Compile every ink block tagged Formula into an editable sheet.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => { compileTaggedCategory('formula'); return { status: 'created', notebook: activeNotebook.name, page: 'Formula sheet' }; },
    }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, [notebooks, activeNotebookId]);

  useEffect(() => {
    setSelection([]); setTextSelection([]); setSelectionBounds(null); setLasso([]); setDragOrigin(null); setDraft(null);
  }, [tool, activeId]);

  function textBounds(item: TextBox): Bounds {
    const element = document.getElementById(`note-text-${activeId}-${item.id}`);
    return { x: item.x, y: item.y, width: element?.offsetWidth ?? 100, height: element?.offsetHeight ?? 30 };
  }

  function insidePolygon(p: Point, polygon: Point[]) {
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i], b=polygon[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }

  async function insertPhotoNotes(text: string, image: string) {
    await document.fonts.load('500 22px ScribblyHand');
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) ctx.font = "500 22px ScribblyHand";
    const maxWidth = Math.max(100, (document.getElementById(`paper-${activeId}`)?.clientWidth ?? 720)-150);
    const lines: string[] = [];
    for (const original of text.split(/\r?\n/).filter(line=>line.trim())) {
      let line = '';
      for (const char of original) {
        if (line && (ctx?.measureText(line+char).width ?? (line.length+1)*12)>maxWidth) { lines.push(line); line=''; }
        line+=char;
      }
      if (line) lines.push(line);
    }
    const id=Date.now(), newPages: NotePage[]=[], newInk: Record<number,Stroke[]>={};
    for(let i=0;i<lines.length;i+=29) {
      const pageId=id+i+1;
      newPages.push({id:pageId,label:i ? 'Photo notes (continued)' : 'Photo notes',tone:'mint',compiled:true});
      newInk[pageId]=lines.slice(i,i+29).flatMap((text,index)=>handwritingInk(text,70,120+index*30));
    }
    if(!newPages.length) return;
    newPages.push({id,label:'Source photo',tone:'blue',sourceImage:image});
    updatePages(current=>[...current,...newPages]);
    setStrokesByPage(current=>({...current,...newInk}));
    setCompiledSources(current=>({...current,...Object.fromEntries(newPages.filter(p=>p.id!==id).map(p=>[p.id,[{pageId:id,label:'Source photo'}]]))}));
    setActiveId(newPages[0].id); setTool('pen');
    window.setTimeout(()=>document.getElementById(`paper-${newPages[0].id}`)?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    showNotice('Handwriting added. Erase part of a letter, lasso, or write over it.');
  }

  function updatePages(updater: (current: NotePage[]) => NotePage[]) {
    setNotebooks((current) => current.map((book) => book.id === activeNotebookId ? { ...book, pages: updater(book.pages) } : book));
  }

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function inBounds(p: Point, bounds: Bounds) {
    return p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height;
  }

  function boundsFor(points: Point[]): Bounds {
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
    for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
    return { x, y, width:right-x, height:bottom-y };
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    const cursor = point(event);
    if(!hydrated)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if(tool==='pen'||tool==='highlighter'||tool==='eraser') {
      inkHistory.current[activeId]=[...(inkHistory.current[activeId]??[]).slice(-19),strokes];
    }
    eraserPoint.current=null;
    if (tool === 'eraser') { eraseAt(cursor); return; }
    if (tool === 'lasso') {
      if (selectionBounds && inBounds(cursor, selectionBounds)) { setDragOrigin(cursor); return; }
      setSelection([]); setTextSelection([]); setSelectionBounds(null); setLasso([cursor]); return;
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
    if (tool === 'lasso' && dragOrigin && (selection.length || textSelection.length)) {
      const b = selectionBounds;
      const dx = b ? Math.max(-b.x, Math.min(event.currentTarget.clientWidth-b.x-b.width,cursor.x-dragOrigin.x)) : 0;
      const dy = b ? Math.max(-b.y, Math.min(event.currentTarget.clientHeight-b.y-b.height,cursor.y-dragOrigin.y)) : 0;
      setTextByPage(current=>({...current,[activeId]:(current[activeId]??[]).map(item=>textSelection.includes(item.id)?{...item,x:item.x+dx,y:item.y+dy}:item)}));
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
      const selected = strokes.map((stroke, index) => stroke.points.some((sample) => insidePolygon(sample, lasso)) ? index : -1).filter((index) => index >= 0);
      const selectedText = (textByPage[activeId]??[]).filter(item=>{
        const b=textBounds(item);
        return insidePolygon({x:b.x+b.width/2,y:b.y+b.height/2},lasso) ||
          [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height}].some(p=>insidePolygon(p,lasso)) ||
          lasso.some(p=>inBounds(p,b));
      });
      const points = [...strokes.filter((_,i)=>selected.includes(i)).flatMap(stroke=>stroke.points),...selectedText.flatMap(item=>{const b=textBounds(item);return [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}];})];
      setSelection(selected); setTextSelection(selectedText.map(item=>item.id));
      setSelectionBounds(points.length ? boundsFor(points) : null);
      if (!points.length) showNotice('No notes inside the lasso');
    }
    setLasso([]);
    setDragOrigin(null);
    eraserPoint.current=null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function eraseAt(cursor: Point) {
    const previous=eraserPoint.current??cursor;
    eraserPoint.current=cursor;
    const steps=Math.max(1,Math.ceil(Math.hypot(cursor.x-previous.x,cursor.y-previous.y)/2));
    setStrokesByPage(current=>{
      let ink=current[activeId]??[];
      for(let i=1;i<=steps;i++)ink=eraseInk(ink,{x:previous.x+(cursor.x-previous.x)*i/steps,y:previous.y+(cursor.y-previous.y)*i/steps});
      return {...current,[activeId]:ink};
    });
  }

  function deleteSelection() {
    setTextByPage(current=>({...current,[activeId]:(current[activeId]??[]).filter(item=>!textSelection.includes(item.id))}));
    setTextSelection([]);
    setStrokesByPage((current) => ({ ...current, [activeId]: (current[activeId] ?? []).filter((_, index) => !selection.includes(index)) }));
    setSelection([]); setSelectionBounds(null); showNotice('Selected notes deleted');
  }

  function undo() {
    const previous=inkHistory.current[activeId]?.pop();
    if(previous)setStrokesByPage(current=>({...current,[activeId]:previous}));
    setSelection([]); setSelectionBounds(null);
  }

  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 1600); }
  function renameActive(label: string) { updatePages((current) => current.map((page) => page.id === activeId ? { ...page, label } : page)); }
  function finishRename(label: string) { renameActive(label.trim() || 'Untitled page'); }

  function addText(event: React.MouseEvent<HTMLElement>, pageId: number) {
    if (pageId !== activeId) { setActiveId(pageId); return; }
    if (tool !== 'text') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const item = { id: Date.now(), x: event.clientX - rect.left, y: event.clientY - rect.top, text: 'Type here' };
    setTextByPage((current) => ({ ...current, [activeId]: [...(current[activeId] ?? []), item] })); setTool('select');
  }
  async function editText(id: number, text: string) {
    const item=(textByPage[activeId]??[]).find(item=>item.id===id);
    if(!item)return;
    // Text entry is only a temporary input; finished note content is always ink.
    try {
      await document.fonts.load('500 22px ScribblyHand');
      const ink=handwritingInk(text,item.x,item.y);
      setStrokesByPage(current=>({...current,[activeId]:[...(current[activeId]??[]),...ink]}));
      setTextByPage(current=>({...current,[activeId]:(current[activeId]??[]).filter(item=>item.id!==id)}));
    } catch { showNotice('Could not make ink yet. Please try again.'); }
  }

  function openNotebook(id: number, pageId?: number) {
    const book = notebooks.find((item) => item.id === id); if (!book) return;
    const nextPageId=pageId??book.pages[0]?.id;
    setActiveNotebookId(id); setActiveId(nextPageId); setView('notebook'); setSelection([]); setSelectionBounds(null);
    window.setTimeout(()=>document.getElementById(`paper-${nextPageId}`)?.scrollIntoView({behavior:'smooth',block:'start'}),50);
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

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const palette = ['#9b6fb0','#d59a45','#4f9aa0','#bf6d91','#7774b8'];
    const category = { id:`custom-${Date.now()}`, name, color:palette[(categories.length-3)%palette.length] };
    setCategories((current)=>[...current,category]); setNewCategoryName('');
    if (selection.length) tagSelection(category.id);
  }

  function tagSelection(categoryId: string) {
    if (!selection.length || !selectionBounds || !activePage) return;
    const selectedStrokes = strokes.filter((_,index)=>selection.includes(index)).map((stroke)=>({ ...stroke, points:stroke.points.map((sample)=>({...sample})) }));
    setTaggedBlocks((current)=>[...current,{ id:Date.now(), notebookId:activeNotebookId, pageId:activeId, pageLabel:activePage.label, categoryId, bounds:selectionBounds, strokes:selectedStrokes }]);
    const category = categories.find((item)=>item.id===categoryId);
    setTagOpen(false); setSelection([]); setSelectionBounds(null); setTool('pen'); showNotice(`Added to ${category?.name ?? 'category'}`);
  }

  function compileTaggedCategory(categoryId: string) {
    const category = categories.find((item)=>item.id===categoryId);
    const blocks = taggedBlocks.filter((block)=>block.notebookId===activeNotebookId && block.categoryId===categoryId);
    if (!category || !blocks.length) { showNotice(`No ${category?.name ?? 'category'} selections yet`); return; }
    const id = Date.now();
    const output: Stroke[] = [];
    let cursorY = 145;
    for (const block of blocks) {
      const points = block.strokes.flatMap((stroke)=>stroke.points);
      if (!points.length) continue;
      const sourceBounds = boundsFor(points);
      const scale = Math.min(.92,680/Math.max(sourceBounds.width,1),190/Math.max(sourceBounds.height,1));
      output.push({ points:[{x:55,y:cursorY+7},{x:56,y:cursorY+7}], color:category.color, width:10 });
      block.strokes.forEach((stroke)=>output.push({ ...stroke, width:Math.max(1,stroke.width*scale), points:stroke.points.map((sample)=>({ x:76+(sample.x-sourceBounds.x)*scale, y:cursorY+(sample.y-sourceBounds.y)*scale })) }));
      cursorY += Math.max(52,sourceBounds.height*scale)+34;
      if (cursorY>990) break;
    }
    updatePages((current)=>[...current,{id,label:`${category.name} sheet`,tone:'formula',compiled:true}]);
    setStrokesByPage((current)=>({...current,[id]:output}));
    const uniqueSources = blocks.filter((block,index,list)=>list.findIndex((item)=>item.pageId===block.pageId)===index).map((block)=>({pageId:block.pageId,label:block.pageLabel}));
    setCompiledSources((current)=>({...current,[id]:uniqueSources}));
    setActiveId(id); setTool('pen'); setView('notebook'); setCompileOpen(false); showNotice(`${category.name} sheet created`);
  }

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
          {view === 'all' ? notebooks.map((book) => <div className="page-card" key={book.id}><button className="page-card-main" onClick={() => openNotebook(book.id)}><span className={`page-preview ${book.pages[0]?.tone ?? 'mint'} notebook-cover`}><span className={`notebook-spine ${book.color}`} /><span className="preview-line wide" /><span className="preview-line" /></span><span className="page-copy"><strong>{book.name}</strong><small>{book.pages.length} pages · {book.folder}</small></span></button></div>) : pages.map((page) => <div className={`page-card ${page.id === activeId ? 'selected' : ''}`} key={page.id}><button className="page-card-main" onClick={() => openNotebook(activeNotebookId, page.id)}><span className={`page-preview ${page.tone}`}><span className="preview-line wide" /><span className="preview-line" />{page.guide&&<span className="preview-equation">Guide</span>}</span><span className="page-copy"><strong>{page.label}</strong><small>Page {pages.findIndex((p) => p.id === page.id) + 1}</small></span></button><button className="row-delete page-delete" aria-label={`Delete ${page.label}`} onClick={() => deletePage(page.id)}><Trash2 /></button></div>)}
        </div>}
        {view === 'notebook' && <button className="add-page" onClick={addPage}><Plus />Add new page</button>}
      </aside>

      {view !== 'notebook' ? <CollectionView view={view} notebooks={notebooks} onOpen={openNotebook} onCreate={addNotebook} /> : <section className="editor-area">
        <div className="editor-header"><div><span className="crumb">{activeNotebook?.name} / Notes</span><input className="editable-page-title" value={activePage?.label ?? ''} onChange={(event) => renameActive(event.target.value)} onBlur={(event) => finishRename(event.target.value)} aria-label="Page title" /></div><div className="save-state"><span />{saveError ? "Storage full — changes not saved" : "Saved on this device"}</div></div>
        <div className="toolbar" role="toolbar" aria-label="Note tools">
          <ToolButton label="Select" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 /></ToolButton>
          <ToolButton label="Lasso" active={tool === 'lasso'} onClick={() => { setTool('lasso'); setSelection([]); setSelectionBounds(null); }}><LassoSelect /></ToolButton>
          {selection.length > 0 && <button className="tag-selection" onClick={()=>setTagOpen(true)}><Tag />Add to category</button>}
          {(selection.length > 0 || textSelection.length > 0) && <button className="delete-selection" onClick={deleteSelection}><Trash2 />Delete selection</button>}
          <span className="tool-divider" />
          <ToolButton label="Pen" active={tool === 'pen'} onClick={() => setTool('pen')}><PenLine /></ToolButton><ToolButton label="Highlight" active={tool === 'highlighter'} onClick={() => setTool('highlighter')}><Highlighter /></ToolButton><ToolButton label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser /></ToolButton><ToolButton label="Text" active={tool === 'text'} onClick={() => setTool('text')}><Type /></ToolButton><ToolButton label="Image" active={false} onClick={() => setPhotoOpen(true)}><ImagePlus /></ToolButton>
          <span className="tool-divider" /><button className="color-dot" aria-label="Ink color" /><button className="weight-button" aria-label="Pen size"><span /></button><span className="toolbar-spacer" />
          <button className="icon-button compact" aria-label="Undo" onClick={undo}><Undo2 /></button><button className="icon-button compact" aria-label="Redo" disabled><Redo2 /></button><button className="compile-button" onClick={() => setCompileOpen(true)}><Sparkles />Compile <span>Categories</span></button>
        </div>
        <div className="desk page-stack">{pages.map((page)=>{ const isActive=page.id===activeId; const pageInk=strokesByPage[page.id]??[]; const renderedInk=isActive&&draft?[...pageInk,draft]:pageInk; return <article id={`paper-${page.id}`} key={page.id} className={`paper squared-paper paper-tool-${isActive?tool:'inactive'} ${isActive?'active-paper':''}`} onClick={(event)=>addText(event,page.id)}>
          <div className={`paper-content ${page.compiled?'compiled-paper-heading':''}`}><h2 className="editable-paper-title" contentEditable={isActive} suppressContentEditableWarning onBlur={(event)=>{if(isActive)finishRename(event.currentTarget.textContent??'');}}>{page.label}</h2><div className="underline" />{page.guide&&<WelcomeGuide />}</div>
          {page.compiled&&compiledSources[page.id]?.length>0&&<button className="source-chip" onClick={(event)=>{event.stopPropagation();openNotebook(activeNotebookId,compiledSources[page.id][0].pageId);}}>↗ Go to original: {compiledSources[page.id][0].label}</button>}
          {page.sourceImage && <img className="source-photo" src={page.sourceImage} alt="Original uploaded notes" />}
          {(textByPage[page.id]??[]).map((item)=><div id={`note-text-${page.id}-${item.id}`} key={item.id} className={`canvas-text ${isActive&&textSelection.includes(item.id)?'selected-text':''}`} style={{left:item.x,top:item.y,pointerEvents:isActive&&(tool==='select'||tool==='text')?'auto':'none'}} contentEditable={isActive&&(tool==='select'||tool==='text')} suppressContentEditableWarning onPointerDown={(event)=>event.stopPropagation()} onClick={(event)=>event.stopPropagation()} onBlur={(event)=>{if(isActive)editText(item.id,event.currentTarget.textContent??'');}}>{item.text}</div>)}
          <svg className={`ink-layer tool-${isActive?tool:'inactive'}`} onPointerDown={isActive?startStroke:undefined} onPointerMove={isActive?moveStroke:undefined} onPointerUp={isActive?endStroke:undefined} onPointerCancel={()=>{setDraft(null);setLasso([]);setDragOrigin(null);}} onLostPointerCapture={()=>{setDraft(null);setLasso([]);setDragOrigin(null);}}>
            {taggedBlocks.filter((block)=>block.pageId===page.id).map((block)=>{const category=categories.find((item)=>item.id===block.categoryId);return category?<g className="category-marker" key={block.id}><circle cx={Math.max(14,block.bounds.x-12)} cy={block.bounds.y+8} r="6" fill={category.color}/><text x={Math.max(25,block.bounds.x)} y={block.bounds.y+12} fill={category.color}>{category.name}</text></g>:null;})}
            {renderedInk.map((stroke,index)=><polyline key={index} className={isActive&&selection.includes(index)?'selected-stroke':''} points={stroke.points.map((sample)=>`${sample.x},${sample.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.width>10?.45:1}/>)}
            {isActive&&lasso.length>1&&<polyline className="lasso-path" points={lasso.map((sample)=>`${sample.x},${sample.y}`).join(' ')} fill="rgba(92,126,112,.06)"/>}
            {isActive&&selectionBounds&&<rect className="selection-box" x={selectionBounds.x} y={selectionBounds.y} width={selectionBounds.width} height={selectionBounds.height} rx="8"/>}
          </svg>
        </article>;})}</div>
      </section>}
    </div>
    {tagOpen && <div className="compile-overlay" role="dialog" aria-modal="true" aria-label="Add to category"><div className="compile-dialog category-dialog"><div className="compile-dialog-icon"><Tag /></div><h2>Add selection to a category</h2><p>The selected ink will keep its exact handwriting when compiled.</p><div className="category-grid">{categories.map((category)=><button key={category.id} onClick={()=>tagSelection(category.id)}><span style={{background:category.color}} />{category.name}</button>)}</div><div className="new-category"><input value={newCategoryName} onChange={(event)=>setNewCategoryName(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')addCategory();}} placeholder="Create your own category" autoFocus/><button onClick={addCategory} disabled={!newCategoryName.trim()}><Plus />Create</button></div><div className="compile-actions"><button onClick={()=>setTagOpen(false)}>Cancel</button></div></div></div>}
    {compileOpen && <div className="compile-overlay" role="dialog" aria-modal="true" aria-label="Compile category"><div className="compile-dialog category-dialog"><div className="compile-dialog-icon"><Sparkles /></div><h2>Compile a category</h2><p>Each sheet uses the exact pen strokes you added to that category.</p><div className="category-grid compile-category-grid">{categories.map((category)=>{const count=taggedBlocks.filter((block)=>block.notebookId===activeNotebookId&&block.categoryId===category.id).length;return <button key={category.id} disabled={!count} onClick={()=>compileTaggedCategory(category.id)}><span style={{background:category.color}} />{category.name}<small>{count} selection{count===1?'':'s'}</small></button>;})}</div><div className="compile-actions"><button onClick={()=>setCompileOpen(false)}>Cancel</button></div></div></div>}
    <PhotoImport open={photoOpen} onClose={()=>setPhotoOpen(false)} onInsert={insertPhotoNotes} />
    {saveError && <div className="storage-error" role="alert">Device storage is full. Keep this tab open and remove unneeded source-photo pages before closing.</div>}
    {notice && <div className="toast-notice" role="status">{notice}</div>}
  </main>;
}

function WelcomeGuide() {
  return <div className="welcome-guide">
    <p className="welcome-intro">Your notebook, your handwriting.<br />Two ways to do more with your notes.</p>
    <ol>
      <li><h3>Compile</h3><p>Turn scattered notes into a sheet of formulas, examples, definitions — or any category you create.</p><p>Lasso your writing → Add to category → Compile. Your original handwriting is copied onto a new sheet, with a link back to the source page.</p></li>
      <li><h3>Photo → handwriting</h3><p>Bring a board photo, scanned page or screenshot into your notebook as handwriting-style ink.</p><p>Tap Image → choose your photo → Add handwriting to notebook. Erase parts, lasso and move it, or write over it. Your source photo stays available for checking.</p></li>
    </ol>
  </div>;
}

function FolderList({ notebooks, onOpen }: { notebooks: Notebook[]; onOpen: (id:number)=>void }) {
  const folders = [...new Set(notebooks.map((book)=>book.folder))];
  return <div className="folder-list">{folders.map((folder)=><section key={folder}><div className="folder-title"><FolderOpen />{folder}</div>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length}</span></button>)}</section>)}</div>;
}

function CollectionView({ view, notebooks, onOpen, onCreate }: { view:'all'|'folders'; notebooks:Notebook[]; onOpen:(id:number,pageId?:number)=>void; onCreate:()=>void }) {
  return <section className="collection-view"><div className="collection-header"><div><span className="crumb">Your library</span><h1>{view==='all'?'All notes':'Folders'}</h1></div><button onClick={onCreate}><Plus />New notebook</button></div>{view==='all'?<div className="note-grid">{notebooks.map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}><span className={`large-page-preview ${book.pages[0]?.tone ?? 'mint'} notebook-large-cover`}><span className={`large-spine ${book.color}`} /><span className="cover-title">{book.name}</span></span><strong>{book.name}</strong><small>{book.pages.length} pages · {book.folder}</small></button>)}</div>:<div className="folder-grid">{[...new Set(notebooks.map((book)=>book.folder))].map((folder)=><section key={folder}><FolderOpen /><h2>{folder}</h2><p>{notebooks.filter((book)=>book.folder===folder).length} notebooks</p>{notebooks.filter((book)=>book.folder===folder).map((book)=><button key={book.id} onClick={()=>onOpen(book.id)}>{book.name}<span>{book.pages.length} pages</span></button>)}</section>)}</div>}</section>;
}

function ToolButton({children,label,active,onClick}:{children:React.ReactNode;label:string;active:boolean;onClick:()=>void}) { return <button className={`tool-button ${active?'active':''}`} onClick={onClick} title={label} aria-label={label}>{children}<span>{label}</span></button>; }

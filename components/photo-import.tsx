'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function PhotoImport({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (text: string, image: string) => Promise<void> }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => { if (!open) { generation.current++; request.current?.abort(); setBusy(false); } }, [open]);
  async function load(file?: File) {
    if (!file || busy) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose JPG, PNG or WebP. For PDF or HEIC, use a screenshot first.'); return; }
    if (file.size > 20_000_000) { setError('Please use an image smaller than 20 MB.'); return; }
    const version = ++generation.current;
    const url = URL.createObjectURL(file);
    try {
      const source = new Image(); source.src = url; await source.decode();
      const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error();
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (version === generation.current) { setImage(canvas.toDataURL('image/jpeg', .85)); }
    } catch { setError('That image could not be opened. Try a screenshot.'); }
    finally { URL.revokeObjectURL(url); }
  }
  async function recognize() {
    if (busy || !image) return;
    setBusy(true); setError(''); const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }), signal: controller.signal });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Recognition failed. Please retry.');
      if (!controller.signal.aborted && typeof result.text === 'string') {
        await onInsert(result.text, image); setImage(''); onClose();
      }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Please retry.'); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="photo-dialog" onPaste={event => {
    const file = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
    if (file) { event.preventDefault(); void load(file); }
  }}><DialogTitle>Photo to handwriting</DialogTitle><DialogDescription>Upload or paste a board photo, scan or screenshot. Your photo becomes handwriting-style ink. Erase part of a letter, lasso it, or write over it.</DialogDescription>
    <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a photo" disabled={busy} onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} />
    {image && <img className="photo-preview" src={image} alt="Source photo to transcribe" />}
    <p className="photo-privacy">Convert sends this image to OpenAI for transcription. Check the result for mistakes. A copy of the source photo stays in this notebook.</p>
    <Button onClick={recognize} disabled={!image || busy}>{busy ? 'Making handwriting…' : 'Add handwriting to notebook'}</Button>
    {error && <p role="alert" className="photo-error">{error}</p>}
  </DialogContent></Dialog>;
}

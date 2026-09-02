export type InkPoint = { x: number; y: number };
export type InkStroke = { points: InkPoint[]; color: string; width: number };

const glyphs: Record<string, string[]> = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'], H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'], J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
  '=':['00000','11111','00000','11111','00000','00000','00000'], '+':['00000','00100','00100','11111','00100','00100','00000'],
  '-':['00000','00000','00000','11111','00000','00000','00000'], '/':['00001','00010','00010','00100','01000','01000','10000'],
  '(':['00010','00100','01000','01000','01000','00100','00010'], ')':['01000','00100','00010','00010','00010','00100','01000'],
  ':':['00000','00100','00100','00000','00100','00100','00000'], '.':['00000','00000','00000','00000','00000','00100','00100'],
  '^':['00100','01010','10001','00000','00000','00000','00000'], ' ':['00000','00000','00000','00000','00000','00000','00000'],
};

function jitter(seed: number) { return Math.sin(seed * 91.37) * 0.55; }

export function writeInk(text: string, x: number, y: number, scale = 3.2, color = '#24322f', width = 2.2, maxWidth = 590): InkStroke[] {
  const strokes: InkStroke[] = [];
  let cursorX = x, cursorY = y, seed = 1;
  const advance = scale * 6, lineHeight = scale * 10;
  for (const raw of text.toUpperCase()) {
    if (raw === '\n' || cursorX + advance > x + maxWidth) { cursorX = x; cursorY += lineHeight; if (raw === '\n') continue; }
    const glyph = glyphs[raw] ?? glyphs[' '];
    const active = new Set<string>();
    glyph.forEach((row, rowIndex) => [...row].forEach((cell, column) => { if (cell === '1') active.add(`${column},${rowIndex}`); }));
    const visited = new Set<string>();
    const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for (const startKey of active) {
      if (visited.has(startKey)) continue;
      const path: InkPoint[] = [];
      const trace = (key: string) => {
        visited.add(key);
        const [column,row] = key.split(',').map(Number);
        path.push({ x:cursorX+column*scale+jitter(seed++), y:cursorY+row*scale+jitter(seed++) });
        for (const [dx,dy] of directions) {
          const next = `${column+dx},${row+dy}`;
          if (active.has(next) && !visited.has(next)) {
            trace(next);
            path.push({ x:cursorX+column*scale+jitter(seed++), y:cursorY+row*scale+jitter(seed++) });
          }
        }
      };
      trace(startKey);
      if (path.length === 1) path.push({ x:path[0].x+.8, y:path[0].y+.8 });
      strokes.push({ points:path, color, width });
    }
    cursorX += advance + jitter(seed++);
  }
  return strokes;
}

export function createCompiledInk(kind: string): InkStroke[] {
  const normalized = kind.toLowerCase();
  const result: InkStroke[] = [];
  result.push(...writeInk('SCRIBBLY STUDY SHEET', 62, 72, 4.2, '#24322f', 2.7));
  result.push(...writeInk(normalized.includes('example') ? 'EXAMPLES' : normalized.includes('definition') ? 'DEFINITIONS' : normalized.includes('custom') ? 'CUSTOM NOTES' : 'FORMULAS', 64, 138, 3.2, '#d76552', 2.3));
  if (normalized.includes('example')) {
    result.push(...writeInk('EX 1: FIND THE LIMIT', 72, 205, 3));
    result.push(...writeInk('LIM (X^2 - 4) / (X - 2) = 4', 92, 255, 3.2));
    result.push(...writeInk('FACTOR FIRST THEN CANCEL X - 2', 72, 330, 2.4, '#4f6e61', 2));
  } else if (normalized.includes('definition')) {
    result.push(...writeInk('LIMIT', 72, 205, 3.4));
    result.push(...writeInk('THE VALUE A FUNCTION APPROACHES AS X GETS CLOSE TO A POINT', 72, 255, 2.3, '#4f6e61', 2, 540));
    result.push(...writeInk('CONTINUOUS', 72, 370, 3.4));
    result.push(...writeInk('A GRAPH WITH NO BREAKS JUMPS OR HOLES', 72, 420, 2.3, '#4f6e61', 2));
  } else {
    result.push(...writeInk('LIMIT DEFINITION', 72, 205, 3));
    result.push(...writeInk('LIM F(X) = L', 120, 255, 4));
    result.push(...writeInk('X -> A', 170, 310, 2.5, '#4f6e61', 2));
    result.push(...writeInk('DIFFERENCE OF SQUARES', 72, 390, 3));
    result.push(...writeInk('X^2 - A^2 = (X-A)(X+A)', 85, 445, 3.3));
    result.push(...writeInk('POWER RULE', 72, 540, 3));
    result.push(...writeInk('D/DX X^N = N X^(N-1)', 90, 595, 3.3));
  }
  return result;
}

export type CompilationSection = { heading: string; lines: string[]; sourcePageIds: number[] };

export function createAICompiledInk(title: string, sections: CompilationSection[]): InkStroke[] {
  const result: InkStroke[] = [];
  let y = 64;
  result.push(...writeInk(title || 'SCRIBBLY STUDY SHEET', 62, y, 3.8, '#24322f', 2.7, 620));
  y += 72;
  for (const section of sections.slice(0, 8)) {
    result.push(...writeInk(section.heading, 64, y, 3, '#d76552', 2.3, 590));
    y += 48;
    for (const line of section.lines.slice(0, 8)) {
      result.push(...writeInk(line, 78, y, 2.45, '#24322f', 2, 570));
      y += 34 * Math.max(1, Math.ceil(line.length / 38));
      if (y > 930) break;
    }
    y += 24;
    if (y > 930) break;
  }
  return result;
}

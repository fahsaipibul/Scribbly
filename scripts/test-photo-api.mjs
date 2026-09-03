import assert from 'node:assert/strict';

// Start pnpm dev first. These rejection tests do not call OpenAI.
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const cases = [
  [{ 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, '{}', 403],
  [{ 'Content-Type': 'text/plain', Origin: origin }, '{}', 415],
  [{ 'Content-Type': 'application/json', Origin: origin }, 'not json', 400],
  [{ 'Content-Type': 'application/json', Origin: origin }, JSON.stringify({ image: 'https://untrusted.example/image.png' }), 400],
  [{ 'Content-Type': 'application/json', Origin: origin }, 'x'.repeat(4_000_001), 413],
];
for (const [headers, body, status] of cases) {
  const response = await fetch(`${origin}/api/recognize`, { method: 'POST', headers, body });
  assert.equal(response.status, status);
}
console.log('PASS: origin, content type, JSON, image URL, and upload size guards');

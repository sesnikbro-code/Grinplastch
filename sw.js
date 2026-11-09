/* Offline support: network first, so a new version shows up on the next open; the saved copy is used only offline.
   Also receives what is shared to the app (share target): a contact, or a quote as a PDF file, a picture or text, and hands it to the page. */
const SHELL = 'gp-shell-v9';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // only this app's own old copies; other apps on the same site keep theirs
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gp-shell') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
async function receiveShare(req) {
  const out = { at: Date.now(), title: '', text: '', url: '', files: [] };
  let doc = null;
  try {
    const fd = await req.formData();
    out.title = String(fd.get('title') || ''); out.text = String(fd.get('text') || ''); out.url = String(fd.get('url') || '');
    for (const f of fd.getAll('vcf')) { if (f && typeof f.text === 'function') out.files.push(await f.text()); }
    // a shared quote file (PDF or picture) is kept as it is for the page to read
    doc = fd.getAll('doc').find((f) => f && typeof f.arrayBuffer === 'function' && f.size) || null;
    if (doc) { out.docs = 1; out.docName = doc.name || 'quote.pdf'; out.docType = doc.type || 'application/pdf'; }
  } catch (_) {}
  const c = await caches.open('gp2-share');
  if (doc) await c.put('share-file-0', new Response(doc, { headers: { 'Content-Type': out.docType } }));
  await c.put('share-payload', new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } }));
  return Response.redirect('./?share=1', 303);
}
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});

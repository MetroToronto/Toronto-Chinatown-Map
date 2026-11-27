// Popup content and photo carousel.
// Each stop has its own manually maintained index.txt.
// All requests are relative to the published GitHub Pages site.
function parseStopMaterialIndex(raw, stopID) {
    const id = String(stopID);
    const folder = `./stop-locations/${encodeURIComponent(id)}/`;
    const photos = [], sections = [];
    const seen = new Set();
    for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const filename = line.trim();
        if (!filename || filename.startsWith('#') || seen.has(filename)) continue;
        seen.add(filename);
        const photo = filename.match(/^(\d+)\.(\d+)\.(jpg|jpeg|png|webp|gif|avif)$/i);
        const note = filename.match(/^(\d+)\.(\d+)(?:-(\d+)\.(\d+))?\.txt$/i);
        const path = folder + encodeURIComponent(filename);
        if (photo && photo[1] === id) {
            const number = Number(photo[2]);
            if (Number.isSafeInteger(number) && number > 0) photos.push({number, path});
        } else if (note && note[1] === id && (!note[3] || note[3] === id)) {
            const start = Number(note[2]), end = Number(note[4] || note[2]);
            if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start) {
                sections.push({start, end, path});
            }
        } else {
            console.warn(`Ignoring invalid filename in stop ${id}: ${filename}`);
        }
    }
    photos.sort((a,b) => a.number - b.number);
    sections.sort((a,b) => a.start - b.start || a.end - b.end);
    return {photos, sections};
}
async function loadStopMaterial(stopID) {
    const id = String(stopID ?? '');
    if (!/^\d+$/.test(id)) return {photos: [], sections: []};
    const path = `./stop-locations/${encodeURIComponent(id)}/index.txt`;
    try {
        const response = await fetch(path, {cache: 'no-cache'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseStopMaterialIndex(await response.text(), id);
    } catch (error) {
        console.warn(`Unable to load material for stop ${id}:`, error);
        return {photos: [], sections: []};
    }
}
// Fetch the actual text only when its photo group is displayed.
// Cache within a single popup, not across visits, so edits can be picked up.
function loadStopText(path, cache) {
    if (!cache.has(path)) {
        cache.set(path, fetch(path, {cache: 'no-cache'}).then(r => {
            if (!r.ok) throw new Error('Unable to load notes');
            return r.text();
        }).catch(e => { cache.delete(path); throw e; }));
    }
    return cache.get(path);
}
function parseStopText(raw) {
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const title = text.match(/^Title:[ \t]*(.*)$/mi)?.[1]?.trim() || '';
    const body = text.match(/^Text:[ \t]*([\s\S]*)/mi)?.[1]?.trim() || '';
    return { title, body };
}
function appendStopFormatted(element, text) {
    for (const [i, part] of text.split(/\*\*(.+?)\*\*/g).entries()) {
        if (i % 2) { const bold = document.createElement('strong'); bold.textContent = part; element.append(bold); }
        else element.append(document.createTextNode(part));
    }
}
function renderStopNotes(container, raw) {
    const { title, body } = parseStopText(raw);
    container.replaceChildren();
    if (title) { const h = document.createElement('h3'); h.className = 'stop-section-title'; h.textContent = title; container.append(h); }
    let list = null;
    for (const line of body.split('\n')) {
        const s = line.trim();
        if (!s) { list = null; continue; }
        if (/^[-•]\s+/.test(s)) {
            if (!list) { list = document.createElement('ul'); list.className = 'stop-notes'; container.append(list); }
            const li = document.createElement('li'); appendStopFormatted(li, s.replace(/^[-•]\s+/, '')); list.append(li);
        } else {
            list = null; const p = document.createElement('p'); appendStopFormatted(p, s); container.append(p);
        }
    }
}
function openStopPopup(p, layer) {
    const dialog = document.createElement('dialog');
    dialog.className = 'stop-dialog';
    dialog.setAttribute('aria-label', p.StopName || 'Chinatown Stop');
    dialog.innerHTML = `<div class="stop-popup">
        <button type="button" class="stop-close" aria-label="Close">&times;</button>
        <div class="stop-popup-header"><h2 class="stop-title"></h2><div class="stop-address"></div></div>
        <div class="stop-popup-body">
            <div class="stop-gallery"><div class="stop-photo">
                <img class="stop-photo-image" alt="" hidden>
                <span class="photo-placeholder">Photo Placeholder</span>
                <button type="button" class="photo-arrow photo-arrow-left" aria-label="Previous photo" disabled></button>
                <button type="button" class="photo-arrow photo-arrow-right" aria-label="Next photo" disabled></button>
            </div><div class="stop-photo-counter" aria-live="polite"></div><div class="stop-photo-dots" aria-label="Choose a photo"></div></div>
            <div class="stop-text" aria-live="polite"></div>
        </div></div>`;
    const q = s => dialog.querySelector(s);
    q('.stop-title').textContent = p.StopName || 'Chinatown Stop';
    q('.stop-address').textContent = p.StopAddress || p.StopDescription || '';
    const img = q('img'), placeholder = q('.photo-placeholder'), notes = q('.stop-text');
    const prev = q('.photo-arrow-left'), next = q('.photo-arrow-right'), counter = q('.stop-photo-counter');
    let photos = [], sections = [], current = 0, revision = 0, activePath = null;
    const dots = q('.stop-photo-dots');
    const textCache = new Map();
    const fallback = p.StopText || 'Information about this location will be added here.';
    notes.textContent = 'Loading information…';
    function update() {
        const photo = photos[current];
        const count = photos.length || sections.length;
        prev.disabled = next.disabled = count < 2;
        counter.textContent = count ? `${current + 1} / ${count}` : '';
        for (const [i, dot] of Array.from(dots.children).entries()) {
            dot.classList.toggle('active', i === current);
            dot.setAttribute('aria-pressed', String(i === current));
        }
        img.hidden = true; placeholder.hidden = false;
        if (photo) {
            img.alt = `${p.StopName || 'Stop'} — Photo ${photo.number}`;
            img.src = photo.path;
            if (img.complete && img.naturalWidth) { img.hidden = false; placeholder.hidden = true; }
        } else { img.removeAttribute('src'); }
        const section = photo ? sections.find(s => s.start <= photo.number && photo.number <= s.end) : sections[current];
        const path = section?.path || null;
        if (activePath === path && path !== null) return;
        activePath = path;
        const request = ++revision;
        if (!path) { notes.textContent = fallback; return; }
        notes.textContent = 'Loading information…';
        loadStopText(path, textCache).then(raw => {
            if (dialog.open && request === revision) renderStopNotes(notes, raw);
        }).catch(() => { if (dialog.open && request === revision) { notes.textContent = fallback; activePath = null; } });
    }
    img.addEventListener('load', () => { img.hidden = false; placeholder.hidden = true; });
    img.addEventListener('error', () => { img.hidden = true; placeholder.hidden = false; });
    function advance(step) {
        const count = photos.length || sections.length;
        if (count > 1) { current = (current + step + count) % count; update(); }
    }
    prev.onclick = () => advance(-1);
    next.onclick = () => advance(1);
    dialog.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); advance(e.key === 'ArrowLeft' ? -1 : 1); }
    });
    q('.stop-close').onclick = () => dialog.close();
    dialog.addEventListener('click', e => {
        if (e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { revision++; dialog.remove(); layer?.getElement?.()?.focus(); }, {once:true});
    document.body.append(dialog); dialog.showModal(); q('.stop-close').focus();
    loadStopMaterial(p.StopID).then(material => {
        if (!dialog.open) return;
        photos = Array.isArray(material.photos) ? material.photos : [];
        sections = Array.isArray(material.sections) ? material.sections : [];
        if (!photos.length && Array.isArray(p.StopPhotos)) photos = p.StopPhotos.filter(s => typeof s === 'string' && s.trim()).map((path,i) => ({number:i+1,path}));
        const count = photos.length || sections.length;
        if (count > 1) for (let i = 0; i < count; i++) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'stop-photo-dot';
            dot.setAttribute('aria-label', `Go to ${photos.length ? 'photo' : 'section'} ${i + 1}`);
            dot.onclick = () => { current = i; update(); };
            dots.append(dot);
        }
        update();
    });
}

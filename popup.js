// Popup content, manual stop-folder indexes, centred modal, and map alignment.
// Each stop folder has its own index.txt listing photos and note files.

const TOUR_DEFAULT_VIEW = MAP_HOME_CENTER;
const TOUR_DEFAULT_ZOOM = MAP_HOME_ZOOM;

let activeStopModal = null;
let activeStopCleanup = null;

function parseStopMaterialIndex(raw, stopID) {
    const id = String(stopID);
    const folder = `./stop-locations/${encodeURIComponent(id)}/`;
    const photos = [];
    const sections = [];
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
            if (Number.isSafeInteger(number) && number > 0) {
                photos.push({ number, path });
            }
        } else if (note && note[1] === id && (!note[3] || note[3] === id)) {
            const start = Number(note[2]);
            const end = Number(note[4] || note[2]);
            if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start) {
                sections.push({ start, end, path });
            }
        } else {
            console.warn(`Ignoring invalid filename in stop ${id}: ${filename}`);
        }
    }

    photos.sort((a, b) => a.number - b.number);
    sections.sort((a, b) => a.start - b.start || a.end - b.end);
    return { photos, sections };
}

async function loadStopMaterial(stopID) {
    const id = String(stopID ?? '');
    if (!/^\d+$/.test(id)) return { photos: [], sections: [] };

    const path = `./stop-locations/${encodeURIComponent(id)}/index.txt`;
    try {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseStopMaterialIndex(await response.text(), id);
    } catch (error) {
        console.warn(`Unable to load material for stop ${id}:`, error);
        return { photos: [], sections: [] };
    }
}

function loadStopText(path, cache) {
    if (!cache.has(path)) {
        cache.set(
            path,
            fetch(path, { cache: 'no-cache' })
                .then(response => {
                    if (!response.ok) throw new Error('Unable to load notes');
                    return response.text();
                })
                .catch(error => {
                    cache.delete(path);
                    throw error;
                })
        );
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
    for (const [index, part] of text.split(/\*\*(.+?)\*\*/g).entries()) {
        if (index % 2) {
            const strong = document.createElement('strong');
            strong.textContent = part;
            element.append(strong);
        } else {
            element.append(document.createTextNode(part));
        }
    }
}

function renderStopNotes(container, raw) {
    const { title, body } = parseStopText(raw);
    container.replaceChildren();

    if (title) {
        const heading = document.createElement('h3');
        heading.className = 'stop-section-title';
        heading.textContent = title;
        container.append(heading);
    }

    let list = null;
    for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            list = null;
            continue;
        }

        if (/^[-•]\s+/.test(trimmed)) {
            if (!list) {
                list = document.createElement('ul');
                list.className = 'stop-notes';
                container.append(list);
            }
            const item = document.createElement('li');
            appendStopFormatted(item, trimmed.replace(/^[-•]\s+/, ''));
            list.append(item);
        } else {
            list = null;
            const paragraph = document.createElement('p');
            appendStopFormatted(paragraph, trimmed);
            container.append(paragraph);
        }
    }
}

function getMapInteractionState() {
    return {
        dragging: !!map.dragging?.enabled(),
        touchZoom: !!map.touchZoom?.enabled(),
        doubleClickZoom: !!map.doubleClickZoom?.enabled(),
        scrollWheelZoom: !!map.scrollWheelZoom?.enabled(),
        boxZoom: !!map.boxZoom?.enabled(),
        keyboard: !!map.keyboard?.enabled(),
        tap: typeof map.tap?.enabled === 'function' ? map.tap.enabled() : false
    };
}

function setMapInteractionState(state) {
    const handlers = [
        ['dragging', map.dragging],
        ['touchZoom', map.touchZoom],
        ['doubleClickZoom', map.doubleClickZoom],
        ['scrollWheelZoom', map.scrollWheelZoom],
        ['boxZoom', map.boxZoom],
        ['keyboard', map.keyboard],
        ['tap', map.tap]
    ];

    handlers.forEach(([key, handler]) => {
        if (!handler) return;
        const shouldEnable = !!state[key];
        if (shouldEnable) handler.enable();
        else handler.disable();
    });
}

function disableMapInteractions() {
    const saved = getMapInteractionState();
    setMapInteractionState({
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false
    });
    return saved;
}

function getStopPointerTarget(dialog) {
    const rect = dialog.getBoundingClientRect();
    return L.point(rect.left - 52, rect.top + rect.height / 2);
}
function panMapToStopPointer(layer, dialog, animate = true) {
    if (!layer || !layer.getLatLng) return;
    const target = getStopPointerTarget(dialog);
    const bounds = map.getContainer().getBoundingClientRect();
    const marker = map.latLngToContainerPoint(layer.getLatLng());
    if (window.innerWidth <= 850) return;
    const delta = marker.subtract(L.point(target.x - bounds.left, target.y - bounds.top));
    if (delta.distanceTo(L.point(0, 0)) < 2) return;
    map.panBy(delta, { animate, duration: 0.45 });
}

function closeActiveStopModal(options = {}) {
    if (typeof activeStopCleanup === 'function') {
        activeStopCleanup(options);
    }
}

function openStopPopup(properties, layer, options = {}) {
    if (activeStopModal) {
        closeActiveStopModal({ restoreDefaultView: false, silent: true });
    }

    const modal = document.createElement('div');
    modal.className = 'stop-modal';
    modal.innerHTML = `
        <div class="stop-modal-overlay"></div>
        <div class="stop-marker-spotlight" aria-hidden="true"></div>
        <div class="stop-pointer" aria-hidden="true"></div>
        <section class="stop-dialog" role="dialog" aria-modal="true" aria-label="Chinatown Stop">
            <div class="stop-popup">
                <button type="button" class="stop-close" aria-label="Close">&times;</button>
                <div class="stop-popup-header">
                    <h2 class="stop-title"></h2>
                    <div class="stop-address"></div>
                </div>
                <div class="stop-popup-body">
                    <div class="stop-gallery">
                        <div class="stop-photo">
                            <img class="stop-photo-image" alt="" hidden>
                            <span class="photo-placeholder">Photo Placeholder</span>
                            <button type="button" class="stop-photo-expand" aria-label="Enlarge photograph" title="Enlarge photograph" disabled>
                                <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"/>
                                    <path d="M3 3l6 6 M21 3l-6 6 M21 21l-6-6 M3 21l6-6"/>
                                </svg>
                            </button>
                            <button type="button" class="photo-arrow photo-arrow-left" aria-label="Previous photo" disabled></button>
                            <button type="button" class="photo-arrow photo-arrow-right" aria-label="Next photo" disabled></button>
                        </div>
                        <div class="stop-photo-counter" aria-live="polite"></div>
                        <div class="stop-photo-dots" aria-label="Choose a photo"></div>
                    </div>
                    <div class="stop-text" aria-live="polite"></div>
                </div>
            </div>
        </section>`;

    const dialog = modal.querySelector('.stop-dialog');
    const overlay = modal.querySelector('.stop-modal-overlay');
    const pointer = modal.querySelector('.stop-pointer');
    dialog.setAttribute('aria-label', properties.StopName || 'Chinatown Stop');
    const spotlight = modal.querySelector('.stop-marker-spotlight');
    const title = modal.querySelector('.stop-title');
    const address = modal.querySelector('.stop-address');
    const img = modal.querySelector('.stop-photo-image');
    const placeholder = modal.querySelector('.photo-placeholder');
    const notes = modal.querySelector('.stop-text');
    const prev = modal.querySelector('.photo-arrow-left');
    const next = modal.querySelector('.photo-arrow-right');
    const counter = modal.querySelector('.stop-photo-counter');
    const dots = modal.querySelector('.stop-photo-dots');
    const closeButton = modal.querySelector('.stop-close');
    const expandButton = modal.querySelector('.stop-photo-expand');

    title.textContent = properties.StopName || 'Chinatown Stop';
    address.textContent = properties.StopAddress || properties.StopDescription || '';
    spotlight.textContent = properties.StopID ?? '';
    notes.textContent = 'Loading information…';

    const markerElement = layer?.getElement?.() || null;
    selectedStopMarker = layer;
    updateStopMarkerPositions();
    markerElement?.classList.add('active-stop-marker');

    let photos = [];
    let sections = [];
    let current = 0;
    let revision = 0;
    let activePath = null;
    const textCache = new Map();
    const fallback = properties.StopText || 'Information about this location will be added here.';
    const explorationLock = suspendMapExploration();
    const savedInteractionState = disableMapInteractions();
    const inertTargets = [map.getContainer(), document.querySelector('.tour-intro-panel')].filter(Boolean);
    const savedInert = inertTargets.map(el => el.inert);
    inertTargets.forEach(el => { el.inert = true; });

    // A native modal dialog opens above the stop popup and tour navigation.
    // It makes the rest of the page inert without changing map or tour state.
    let photoViewer = null;

    function closePhotoViewer(restoreFocus = true) {
        if (!photoViewer) return;
        const viewer = photoViewer;
        photoViewer = null;
        if (viewer.open) viewer.close();
        viewer.remove();
        if (restoreFocus && modal.isConnected) {
            expandButton.focus({ preventScroll: true });
        }
    }

    function openPhotoViewer() {
        if (photoViewer || expandButton.disabled || img.hidden || !img.naturalWidth) return;
        const photo = photos[current];
        if (!photo) return;
        const viewer = document.createElement('dialog');
        viewer.className = 'stop-image-viewer';
        viewer.setAttribute('aria-label', img.alt || 'Enlarged photograph');
        viewer.innerHTML = `<div class="stop-image-viewer-content">
            <button type="button" class="stop-image-viewer-close" aria-label="Close enlarged photograph" title="Close photograph">&times;</button>
            <img class="stop-image-viewer-image" alt="">
        </div>`;
        const largeImage = viewer.querySelector('img');
        const exit = viewer.querySelector('button');
        largeImage.alt = img.alt;
        largeImage.src = photo.path;
        exit.addEventListener('click', () => closePhotoViewer());
        viewer.addEventListener('cancel', event => {
            event.preventDefault();
            closePhotoViewer();
        });
        viewer.addEventListener('close', () => {
            if (photoViewer === viewer) closePhotoViewer();
        });
        // A backdrop click only closes the image viewer, never the stop popup.
        viewer.addEventListener('click', event => {
            if (event.target !== viewer) return;
            const rect = viewer.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom) closePhotoViewer();
        });
        // Prevent gallery/tour key handlers from reacting to viewer controls.
        viewer.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                closePhotoViewer();
            }
        });
        photoViewer = viewer;
        document.body.append(viewer);
        viewer.showModal();
        exit.focus({ preventScroll: true });
    }
    expandButton.addEventListener('click', openPhotoViewer);

    function update() {
        const photo = photos[current];
        const count = photos.length || sections.length;
        const section = photo
            ? sections.find(entry => entry.start <= photo.number && photo.number <= entry.end)
            : sections[current];

        prev.disabled = next.disabled = count < 2;
        counter.textContent = count ? `${current + 1} / ${count}` : '';

        for (const [index, dot] of Array.from(dots.children).entries()) {
            const active = index === current;
            dot.classList.toggle('active', active);
            dot.setAttribute('aria-pressed', String(active));
        }

        img.hidden = true;
        placeholder.hidden = false;
        expandButton.disabled = true;

        if (photo) {
            img.alt = `${properties.StopName || 'Stop'} — Photo ${photo.number}`;
            img.src = photo.path;
            if (img.complete && img.naturalWidth) {
                img.hidden = false;
                placeholder.hidden = true;
                expandButton.disabled = false;
            }
        } else {
            img.removeAttribute('src');
        }

        const path = section?.path || null;
        if (activePath === path && path !== null) return;

        activePath = path;
        const request = ++revision;

        if (!path) {
            notes.textContent = fallback;
            return;
        }

        notes.textContent = 'Loading information…';
        loadStopText(path, textCache)
            .then(raw => {
                if (modal.isConnected && request === revision) {
                    renderStopNotes(notes, raw);
                }
            })
            .catch(() => {
                if (modal.isConnected && request === revision) {
                    notes.textContent = fallback;
                    activePath = null;
                }
            });
    }

    function advance(step) {
        const count = photos.length || sections.length;
        if (count > 1) {
            current = (current + step + count) % count;
            update();
        }
    }

    function onKeyDown(event) {
        if (photoViewer) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            cleanup({ restoreDefaultView: true });
            return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            advance(event.key === 'ArrowLeft' ? -1 : 1);
        }
    }

    function onResize() {
        if (!modal.isConnected) return;
        panMapToStopPointer(layer, dialog, false);
        syncSpotlight();
    }

    function syncSpotlight() {
        if (!modal.isConnected || !layer?.getLatLng) return;
        const pos = map.latLngToContainerPoint(layer.getLatLng());
        const bounds = map.getContainer().getBoundingClientRect();
        spotlight.style.left = `${pos.x + bounds.left}px`;
        spotlight.style.top = `${pos.y + bounds.top}px`;
        const rect = dialog.getBoundingClientRect();
        pointer.style.left = `${rect.left - 24}px`;
        pointer.style.top = `${rect.top + rect.height / 2}px`;
    }
    // Re-align after text or gallery changes affect the modal dimensions.
    let lastTarget = null;
    const observer = new ResizeObserver(() => {
        if (!modal.isConnected) return;
        const target = getStopPointerTarget(dialog);
        if (!lastTarget || target.distanceTo(lastTarget) > 2) {
            lastTarget = target;
            panMapToStopPointer(layer, dialog, false);
        }
        syncSpotlight();
    });
    prev.addEventListener('click', () => advance(-1));
    next.addEventListener('click', () => advance(1));
    closeButton.addEventListener('click', () => cleanup({ restoreDefaultView: true }));
    overlay.addEventListener('click', () => { if (!options.tour) cleanup({ restoreDefaultView: true }); });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    img.addEventListener('load', () => {
        if (!photos[current] || !img.naturalWidth) return;
        img.hidden = false;
        placeholder.hidden = true;
        expandButton.disabled = false;
    });
    img.addEventListener('error', () => {
        img.hidden = true;
        placeholder.hidden = false;
        expandButton.disabled = true;
    });

    function cleanup({ restoreDefaultView = true, silent = false } = {}) {
        if (!modal.isConnected) return;

        closePhotoViewer(false);
        revision++;
        observer.disconnect();
        map.off('move zoom moveend zoomend', syncSpotlight);
        map.stop();
        selectedStopMarker = null;
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        markerElement?.classList.remove('active-stop-marker');
        setMapInteractionState(savedInteractionState);
        inertTargets.forEach((el,i) => {el.inert = savedInert[i];});
        modal.remove();
        activeStopModal = null;
        activeStopCleanup = null;
        if (!silent && !options.tour) layer?.getElement?.()?.focus?.({ preventScroll: true });

        if (restoreDefaultView && !options.tour) {
            returnToNeutralAndResume(explorationLock);
        } else {
            resumeMapExploration(explorationLock);
        }
        updateStopMarkerPositions();
        if (!silent && options.tour) options.onClose?.();
    }

    activeStopModal = modal;
    activeStopCleanup = cleanup;

    document.body.append(modal);
    closeButton.focus({ preventScroll: true });
    map.on('move zoom moveend zoomend', syncSpotlight);
    lastTarget = getStopPointerTarget(dialog);
    observer.observe(dialog);
    requestAnimationFrame(() => {
        if (!modal.isConnected) return;
        syncSpotlight();
        panMapToStopPointer(layer, dialog, true);
    });

    loadStopMaterial(properties.StopID).then(material => {
        if (!modal.isConnected) return;

        photos = Array.isArray(material.photos) ? material.photos : [];
        sections = Array.isArray(material.sections) ? material.sections : [];

        if (!photos.length && Array.isArray(properties.StopPhotos)) {
            photos = properties.StopPhotos
                .filter(path => typeof path === 'string' && path.trim())
                .map((path, index) => ({ number: index + 1, path }));
        }

        const count = photos.length || sections.length;
        dots.replaceChildren();
        if (count > 1) {
            for (let i = 0; i < count; i++) {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'stop-photo-dot';
                dot.setAttribute('aria-label', `Go to ${photos.length ? 'photo' : 'section'} ${i + 1}`);
                dot.addEventListener('click', () => {
                    current = i;
                    update();
                });
                dots.append(dot);
            }
        }

        update();
    });
}

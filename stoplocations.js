// Load Chinatown stop locations and create numbered markers and popups.
fetch('./geojson-data/Chinatown_StopLocations.geojson')
    .then(response => {
        if (!response.ok) throw new Error(`Unable to load stops: ${response.status}`);
        return response.json();
    })
    .then(data => {
        L.geoJSON(data, {
            pointToLayer(feature, latlng) {
                const p = feature.properties || {};
                const label = document.createElement('span');
                label.textContent = p.StopID ?? '';
                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'chinatown-stop-marker',
                        html: label,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                        popupAnchor: [0, -18]
                    }),
                    title: p.StopName || 'Chinatown Stop',
                    keyboard: true
                });
            },
            onEachFeature(feature, layer) {
                const p = feature.properties || {};
                const popup = document.createElement('div');
                popup.className = 'stop-popup';
                popup.innerHTML = `
                    <div class="stop-popup-header">
                        <h2 class="stop-title"></h2>
                        <div class="stop-address"></div>
                    </div>
                    <div class="stop-popup-body">
                        <div class="stop-photo">
                            <img class="stop-photo-image" alt="" hidden>
                            <span class="photo-placeholder">Photo Placeholder</span>
                            <button type="button" class="photo-arrow photo-arrow-left" aria-label="Previous photo"></button>
                            <button type="button" class="photo-arrow photo-arrow-right" aria-label="Next photo"></button>
                        </div>
                        <div class="stop-text"></div>
                    </div>`;
                popup.querySelector('.stop-title').textContent = p.StopName || 'Chinatown Stop';
                popup.querySelector('.stop-address').textContent = p.StopAddress || p.StopDescription || '';
                popup.querySelector('.stop-text').textContent = p.StopText || 'Information about this location will be added here.';
                const photos = Array.isArray(p.StopPhotos) ? p.StopPhotos.filter(s => typeof s === 'string' && s.trim()) : [];
                let current = 0;
                const img = popup.querySelector('.stop-photo-image');
                const placeholder = popup.querySelector('.photo-placeholder');
                const prev = popup.querySelector('.photo-arrow-left');
                const next = popup.querySelector('.photo-arrow-right');
                function updatePhoto() {
                    prev.disabled = next.disabled = photos.length < 2;
                    img.hidden = true;
                    placeholder.hidden = false;
                    if (!photos.length) return;
                    img.alt = `${p.StopName || 'Chinatown Stop'} — Photo ${current + 1}`;
                    img.src = photos[current];
                    if (img.complete && img.naturalWidth) { img.hidden = false; placeholder.hidden = true; }
                }
                img.addEventListener('load', () => { img.hidden = false; placeholder.hidden = true; });
                img.addEventListener('error', () => { img.hidden = true; placeholder.hidden = false; });
                prev.addEventListener('click', e => {
                    e.stopPropagation();
                    if (photos.length < 2) return;
                    current = (current - 1 + photos.length) % photos.length;
                    updatePhoto();
                });
                next.addEventListener('click', e => {
                    e.stopPropagation();
                    if (photos.length < 2) return;
                    current = (current + 1) % photos.length;
                    updatePhoto();
                });
                L.DomEvent.disableClickPropagation(popup);
                L.DomEvent.disableScrollPropagation(popup);
                updatePhoto();
                layer.bindPopup(popup, {
                    className: 'chinatown-popup', maxWidth: 800, minWidth: 0,
                    maxHeight: Math.max(150, window.innerHeight - 100),
                    closeButton: true, autoPan: true, autoPanPadding: [25, 25]
                });
            }
        }).addTo(map);
    })
    .catch(error => console.error('Error loading Chinatown stops:', error));

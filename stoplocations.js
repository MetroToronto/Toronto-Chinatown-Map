// ========================================
// NUMBERED MARKERS: SIZE AND COLLISION BUFFER
// ========================================
const stopMarkerSize = 44;
const stopMarkerGap = 8;
const stopMarkerSpacing = stopMarkerSize + stopMarkerGap + 2;
const stopMarkerEntries = [];
let selectedStopMarker = null;

function findStopMarkerPosition(origin, occupied) {
    const isFree = point => occupied.every(other => point.distanceTo(other) >= stopMarkerSpacing);
    if (isFree(origin)) return origin;

    for (let radius = 4; ; radius += 4) {
        const steps = Math.max(8, Math.ceil((2 * Math.PI * radius) / 4));
        for (let i = 0; i < steps; i++) {
            const angle = (i * 2 * Math.PI) / steps - Math.PI / 2;
            const candidate = L.point(
                Math.round(origin.x + radius * Math.cos(angle)),
                Math.round(origin.y + radius * Math.sin(angle))
            );
            if (isFree(candidate)) return candidate;
        }
    }
}

function updateStopMarkerPositions() {
    const entries = stopMarkerEntries.filter(entry => map.hasLayer(entry.marker)).map(entry => ({
        ...entry,
        point: map.latLngToLayerPoint(entry.originalLatLng)
    }));

    const isolated = entries.filter(entry =>
        entries.every(other => other === entry || entry.point.distanceTo(other.point) >= stopMarkerSpacing)
    );
    const crowded = entries.filter(entry => !isolated.includes(entry));
    const occupied = [];

    const ordered = [...isolated, ...crowded];
    ordered.sort((a,b) => Number(b.marker === selectedStopMarker) - Number(a.marker === selectedStopMarker));
    ordered.forEach(entry => {
        const position = findStopMarkerPosition(entry.point, occupied);
        occupied.push(position);
        const target = position.equals(entry.point)
            ? entry.originalLatLng
            : map.layerPointToLatLng(position);
        if (!entry.marker.getLatLng().equals(target, 0)) {
            entry.marker.setLatLng(target);
        }
    });
}

map.on('zoomend moveend resize', updateStopMarkerPositions);

// Load Chinatown stop locations and create numbered markers and popups.
const tourStopsReady = fetch('./geojson-data/Chinatown_StopLocations.geojson')
    .then(response => {
        if (!response.ok) throw new Error(`Unable to load stops: ${response.status}`);
        return response.json();
    })
    .then(data => {
        L.geoJSON(data, {
            pointToLayer(feature, latlng) {
                const properties = feature.properties || {};
                const label = document.createElement('span');
                label.textContent = properties.StopID ?? '';

                const marker = L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'chinatown-stop-marker',
                        html: label,
                        iconSize: [stopMarkerSize, stopMarkerSize],
                        iconAnchor: [stopMarkerSize / 2, stopMarkerSize / 2],
                        popupAnchor: [0, -stopMarkerSize / 2]
                    }),
                    title: properties.StopName || 'Chinatown Stop',
                    keyboard: true
                });

                stopMarkerEntries.push({
                    marker,
                    originalLatLng: latlng,
                    stopID: properties.StopID,
                    properties
                });

                return marker;
            },
            onEachFeature(feature, layer) {
                const properties = feature.properties || {};
                layer.on('click', () => {
                    if (!document.body.classList.contains('tour-running')) openStopPopup(properties, layer);
                });
            }
        }).addTo(map);

        updateStopMarkerPositions();

        return stopMarkerEntries;
    })
    .catch(error => { console.error('Error loading Chinatown stops:', error); return []; });

// Tour controller can show only the desired stop IDs. null restores all.
function showTourStops(ids = null) {
    const allowed = ids === null ? null : new Set(ids.map(String));
    for (const entry of stopMarkerEntries) {
        const show = allowed === null || allowed.has(String(entry.stopID).trim());
        if (show && !map.hasLayer(entry.marker)) entry.marker.addTo(map);
        if (!show && map.hasLayer(entry.marker)) entry.marker.remove();
    }
    updateStopMarkerPositions();
}
function getTourStop(id) {
    return stopMarkerEntries.find(entry => String(entry.stopID).trim() === String(id));
}

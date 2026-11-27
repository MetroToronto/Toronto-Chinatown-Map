// MAP INITIALIZATION — CARTO Positron
// CARTO basemap key (restrict to your website in CARTO).
const cartoApiKey = 'cb1_5g50_1_9d668e313ba9e65bee3ef1a7';
// Shared neutral view used by the basemap, popups and guided tour.
const MAP_HOME_CENTER = L.latLng(43.653328, -79.399137);
// Select the map layout at page load (including phones in landscape).
const MAP_IS_MOBILE = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1024px)').matches;
const MAP_HOME_ZOOM = MAP_IS_MOBILE ? 14.75 : 15.5;
const MAP_STAGE3_ZOOM = MAP_IS_MOBILE ? 12.5 : 14.5;
const MAP_MAX_ZOOM = 18;
// Double the previous horizontal and vertical centre-point panning limits.
const MAP_PAN_AREA_MULTIPLIER = 2;
const map = L.map('map', {
    zoomControl: false,
    minZoom: MAP_HOME_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    zoomSnap: MAP_IS_MOBILE ? 0.25 : 0.5,
    zoomDelta: MAP_IS_MOBILE ? 0.25 : 0.5,
    maxBoundsViscosity: 1
}).setView(MAP_HOME_CENTER, MAP_HOME_ZOOM);

L.tileLayer('https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=' + encodeURIComponent(cartoApiKey), {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
}).addTo(map);

// ========================================
// RIGHT-HAND ZOOM AND LIVE MAP INFORMATION
// ========================================
if (map.zoomControl) {
    map.zoomControl.setPosition('topright');
} else {
    L.control.zoom({ position: 'topright' }).addTo(map);
}

const mapInfoControl = L.control({ position: 'topright' });
mapInfoControl.onAdd = function () {
    const container = L.DomUtil.create('div', 'map-info-control');
    container.innerHTML = `
        <div class="map-info-box map-coordinate-box">
            <div class="map-info-heading">Map Centre</div>
            <div>Latitude: <span class="map-latitude"></span></div>
            <div>Longitude: <span class="map-longitude"></span></div>
        </div>
        <div class="map-info-box map-zoom-box">
            <div class="map-info-heading">Zoom Level</div>
            <div class="map-zoom-value"></div>
        </div>`;
    const latitude = container.querySelector('.map-latitude');
    const longitude = container.querySelector('.map-longitude');
    const zoom = container.querySelector('.map-zoom-value');
    function updateMapInfo() {
        const center = map.getCenter();
        latitude.textContent = center.lat.toFixed(6);
        longitude.textContent = center.lng.toFixed(6);
        zoom.textContent = Number(map.getZoom().toFixed(2)).toString();
    }
    map.on('move zoom moveend zoomend', updateMapInfo);
    this.onRemove = function () {
        map.off('move zoom moveend zoomend', updateMapInfo);
    };
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    updateMapInfo();
    return container;
};
mapInfoControl.addTo(map);


// ========================================
// FREE EXPLORATION LIMITS
// ========================================
// At the device-specific neutral zoom, dragging is disabled.
// Above the neutral zoom the centre can move within an expanded rectangle
// based on the neutral zoom-18 viewport (twice its width and height).
// Leaflet maxBounds limits the whole viewport, so expand that centre
// rectangle by half of the current viewport in projected pixel space.
// Popups and the tour temporarily suspend these limits for their own pans.
const mapExplorationLocks = new Set();
let refreshingMapLimits = false;

function getExplorationBounds(zoom) {
    const half = map.getSize().divideBy(2);
    const centre = map.project(MAP_HOME_CENTER, zoom);
    const allowed = zoom <= MAP_HOME_ZOOM
        ? L.point(0, 0)
        : half.multiplyBy(map.getZoomScale(zoom, MAP_MAX_ZOOM) * MAP_PAN_AREA_MULTIPLIER);
    const extent = allowed.add(half);
    return L.latLngBounds(
        map.unproject(centre.subtract(extent), zoom),
        map.unproject(centre.add(extent), zoom)
    );
}

function refreshMapExplorationLimits() {
    if (mapExplorationLocks.size || refreshingMapLimits) return;
    refreshingMapLimits = true;
    try {
        const zoom = map.getZoom();
        if (zoom <= MAP_HOME_ZOOM) {
            map.dragging.disable();
            // Restore the exact neutral centre, rather than retaining a panned view.
            if (zoom !== MAP_HOME_ZOOM || !map.getCenter().equals(MAP_HOME_CENTER, 1e-9)) {
                map.setMaxBounds(null);
                map.setView(MAP_HOME_CENTER, MAP_HOME_ZOOM, { animate: false });
            }
        } else {
            map.dragging.enable();
        }
        map.setMaxBounds(getExplorationBounds(map.getZoom()));
    } finally {
        refreshingMapLimits = false;
    }
}

// Each popup receives its own token. The tour holds a separate token,
// so closing a popup inside the tour never re-enables free navigation.
function suspendMapExploration({ tour = false } = {}) {
    const token = Symbol(tour ? 'tour' : 'popup');
    mapExplorationLocks.add(token);
    map.setMaxBounds(null);
    if (tour) map.setMinZoom(Math.min(MAP_STAGE3_ZOOM, MAP_HOME_ZOOM));
    return token;
}

function resumeMapExploration(token) {
    if (!mapExplorationLocks.delete(token) || mapExplorationLocks.size) return;
    map.setMinZoom(MAP_HOME_ZOOM);
    refreshMapExplorationLimits();
}

// Keep the existing animated popup reset, with bounds disabled until it ends.
function returnToNeutralAndResume(token) {
    let finished = false;
    let fallback;
    function finish() {
        if (finished) return;
        finished = true;
        map.off('moveend', finish);
        clearTimeout(fallback);
        resumeMapExploration(token);
    }
    map.stop();
    map.dragging.disable();
    if (map.getZoom() === MAP_HOME_ZOOM && map.getCenter().equals(MAP_HOME_CENTER, 1e-9)) {
        finish();
        return;
    }
    map.once('moveend', finish);
    fallback = setTimeout(finish, 1200);
    map.setView(MAP_HOME_CENTER, MAP_HOME_ZOOM, { animate: true, duration: 0.45 });
}

map.on('zoomend resize', refreshMapExplorationLimits);
refreshMapExplorationLimits();

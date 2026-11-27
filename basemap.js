// MAP INITIALIZATION — CARTO Positron
// Insert your existing restricted CARTO basemap key.
const cartoApiKey = 'YOUR_API_KEY';
const map = L.map('map', { zoomControl: false }).setView([43.6531, -79.3983], 16);

L.tileLayer('https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=' + encodeURIComponent(cartoApiKey), {
    maxZoom: 20,
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

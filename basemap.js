
// ========================================
// MAP CONFIGURATION
// ========================================

const map = L.map('map', {
    center: [43.6531, -79.3983],
    zoom: 16,
    zoomControl: true
});

// ========================================
// CARTO API KEY
// ========================================

const cartoApiKey = 'YOUR_API_KEY';

// ========================================
// CARTO POSITRON BASEMAP
// ========================================

const basemap = L.tileLayer(
    'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=' + cartoApiKey,
    {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
    }
).addTo(map);

// ========================================
// ADDITIONAL MAP LAYERS
// ========================================

// Future GeoJSON layers and markers go here.

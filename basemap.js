// Initialize Leaflet map
const map = L.map('map', {
    center: [43.6531, -79.3983],
    zoom: 16,
    minZoom: 2,
    maxZoom: 20,
    zoomControl: true
});

// OpenStreetMap Standard fallback
const fallback = L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxNativeZoom: 19,
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors'
    }
).addTo(map);

// OpenStreetMap Shortbread
let basemap;
let timer;

function useFallback(error) {
    clearTimeout(timer);
    console.error('Shortbread loading failed:', error);

    if (basemap && map.hasLayer(basemap)) {
        map.removeLayer(basemap);
    }

    if (!map.hasLayer(fallback)) {
        fallback.addTo(map);
    }
}

try {
    basemap = L.maplibreGL({
        style: 'https://vector.openstreetmap.org/styles/shortbread/colorful.json',
        attribution: '&copy; OpenStreetMap contributors',
        interactive: false
    });

    basemap.addTo(map);

    const glMap = basemap.getMaplibreMap();

    timer = setTimeout(() => {
        useFallback('Loading timed out');
    }, 20000);

    glMap.once('load', function () {
        clearTimeout(timer);
        map.removeLayer(fallback);
        console.log('Shortbread loaded successfully');
    });

    glMap.on('error', function (event) {
        console.error('MapLibre error:', event.error);
    });

} catch (error) {
    useFallback(error);
}

// Add future GeoJSON layers and markers below.

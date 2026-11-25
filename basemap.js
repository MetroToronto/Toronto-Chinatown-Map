
import * as L from 'leaflet';

import { maplibreGL } from 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/dist/leaflet-maplibre-gl.mjs';

// Initial map view
const map = L.map('map', {
    center: [43.6531, -79.3983],
    zoom: 16,
    minZoom: 2,
    maxZoom: 20,
    zoomControl: true
});

// OpenStreetMap Shortbread basemap
const basemap = maplibreGL({
    style: 'https://vector.openstreetmap.org/styles/shortbread/colorful.json',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Make Leaflet accessible to future scripts
window.L = L;
window.map = map;

// Initial view: Spadina Avenue and Dundas Street West
const map = L.map('map', {
    center: [43.6531, -79.3983],
    zoom: 16,
    zoomControl: true
});

// CARTO Positron basemap (light neutral greys)
const basemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

// Add future GeoJSON layers and markers below this line.

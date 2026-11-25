// Initial view: Spadina Avenue and Dundas Street West
const map = L.map('map', {
    center: [43.6531, -79.3983],
    zoom: 16,
    zoomControl: true
});

// CARTO API key
const cartoApiKey = 'cb1_5g50_1_9d668e313ba9e65bee3ef1a7';

// CARTO Positron basemap
const basemap = L.tileLayer(
    'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=' + cartoApiKey,
    {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attribution/">CARTO</a>'
    }
).addTo(map);

// Add future GeoJSON layers and markers below this line.

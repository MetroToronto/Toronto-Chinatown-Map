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
                layer.on('click', () => openStopPopup(p, layer));
            }
        }).addTo(map);
    })
    .catch(error => console.error('Error loading Chinatown stops:', error));

// ========================================
// CHINATOWN AND HISTORIC NEIGHBOURHOOD BOUNDARIES
// ========================================
const neighbourhoodBoundaryFiles = [
    'Chinatown_Boundary.geojson',
    'TheWard_Boundary.geojson',
    'Kensington_Boundary.geojson',
    'Chinatown-Core.geojson',
    'East-Chinatown_Boundary.geojson',
    'First-Chinatown_Boundary.geojson'
];

// Keep boundaries beneath stop markers, regardless of loading order.
map.createPane('neighbourhoodBoundaries');
map.getPane('neighbourhoodBoundaries').style.zIndex = '350';
map.getPane('neighbourhoodBoundaries').style.pointerEvents = 'none';

Promise.allSettled(neighbourhoodBoundaryFiles.map(async filename => {
    const response = await fetch('./geojson-data/' + filename);
    if (!response.ok) throw new Error(filename + ': HTTP ' + response.status);
    const data = await response.json();
    return L.geoJSON(data, {
        pane: 'neighbourhoodBoundaries',
        interactive: false,
        style: {
            color: '#922b2b',
            weight: 8,
            opacity: 1,
            dashArray: '14 12',
            lineCap: 'round',
            lineJoin: 'round',
            fill: false,
            fillOpacity: 0
        }
    });
})).then(results => {
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') result.value.addTo(map);
        else console.error('Error loading ' + neighbourhoodBoundaryFiles[index], result.reason);
    });
});

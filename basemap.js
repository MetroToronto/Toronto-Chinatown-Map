
// ========================================
// MAP CONFIGURATION
// ========================================

const centre = [43.6531, -79.3983];
const initialZoom = 16;

const rotationSpeed = 5;
const maximumSpeed = 90;
const acceleration = 180;

const mapStyle =
    'https://tiles.openfreemap.org/styles/positron';

const attribution =
    '<a href="https://openfreemap.org/">OpenFreeMap</a> | ' +
    '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> | ' +
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
).matches;


// ========================================
// SIMPLIFY BASEMAP FEATURES
// ========================================

function simplifyBasemap(glMap) {

    glMap.getStyle().layers.forEach(function (layer) {

        const id = layer.id.toLowerCase();
        const source = layer['source-layer'] || '';

        if (
            source === 'poi' ||
            source === 'housenumber' ||
            source === 'aeroway' ||
            source === 'aerodrome_label' ||
            source === 'place' ||
            id.includes('transit') ||
            id.includes('railway') ||
            id.includes('path') ||
            id.includes('building_label')
        ) {
            glMap.setLayoutProperty(
                layer.id,
                'visibility',
                'none'
            );
        }
    });
}


// ========================================
// MAIN INTERACTIVE LEAFLET MAP
// ========================================

const map = L.map('map', {
    center: centre,
    zoom: initialZoom,
    minZoom: 2,
    maxZoom: 20,
    zoomControl: true
});

const basemap = L.maplibreGL({
    style: mapStyle,
    interactive: false,
    attribution: attribution
}).addTo(map);

const glMap = basemap.getMaplibreMap();

glMap.once('load', function () {
    simplifyBasemap(glMap);
});


// ========================================
// ROTATING INTRODUCTION
// ========================================

const intro = document.getElementById('map-intro');

let introMap;
let animationFrame;
let previousTime;

let currentAngle = 0;
let currentSpeed = rotationSpeed;
let targetAngle = 0;

let introReady = false;
let stopping = false;
let finished = false;


// ========================================
// ROTATION ANIMATION
// ========================================

function animateRotation(timestamp) {

    if (finished) return;

    if (previousTime === undefined) {
        previousTime = timestamp;
    }

    const deltaTime = Math.min(
        (timestamp - previousTime) / 1000,
        0.05
    );

    previousTime = timestamp;

    // Normal introductory rotation
    if (!stopping) {

        currentAngle += rotationSpeed * deltaTime;

    } else {

        // Remaining clockwise distance to north
        const remaining = targetAngle - currentAngle;

        // Finish at exactly north
        if (remaining <= 0.01) {

            currentAngle = targetAngle;

            introMap.setBearing(0);

            finishIntro();
            return;
        }

        // Calculate speed needed to smoothly stop
        const brakingSpeed = Math.sqrt(
            2 * acceleration * remaining
        );

        const desiredSpeed = Math.min(
            maximumSpeed,
            brakingSpeed
        );

        // Gradually accelerate or decelerate
        if (currentSpeed < desiredSpeed) {

            currentSpeed = Math.min(
                currentSpeed + acceleration * deltaTime,
                desiredSpeed
            );

        } else {

            currentSpeed = Math.max(
                currentSpeed - acceleration * deltaTime,
                desiredSpeed
            );
        }

        // Prevent rotating beyond north
        currentAngle += Math.min(
            currentSpeed * deltaTime,
            remaining
        );
    }

    // Negative bearing creates clockwise map rotation
    introMap.setBearing(-(currentAngle % 360));

    animationFrame = requestAnimationFrame(
        animateRotation
    );
}


// ========================================
// CLICK ANYWHERE TO FINISH ROTATION
// ========================================

function startExploring() {

    if (stopping || finished) return;

    stopping = true;

    intro.classList.add('stopping');

    // Skip animation if the map has not loaded
    // or reduced motion is enabled
    if (!introReady || reduceMotion) {

        finishIntro();
        return;
    }

    // Calculate next north-facing position
    targetAngle = Math.ceil(
        currentAngle / 360
    ) * 360;
}

intro.addEventListener('click', function (event) {

    // Keep map attribution links functional
    if (event.target.closest('a, button')) return;

    startExploring();
});


// Keyboard accessibility
intro.addEventListener('keydown', function (event) {

    if (event.target !== intro) return;

    if (event.key === 'Enter' || event.key === ' ') {

        event.preventDefault();

        startExploring();
    }
});


// ========================================
// SWITCH TO INTERACTIVE MAP
// ========================================

function finishIntro() {

    if (finished) return;

    finished = true;

    cancelAnimationFrame(animationFrame);

    if (introMap) {

        introMap.remove();
        introMap = null;
    }

    intro.remove();

    document.getElementById('map').inert = false;

    map.invalidateSize();
}


// ========================================
// INITIALIZE ROTATING MAP
// ========================================

try {

    introMap = new maplibregl.Map({

        container: 'rotating-map',

        style: mapStyle,

        center: [
            centre[1],
            centre[0]
        ],

        zoom: initialZoom - 1,

        bearing: 0,
        pitch: 0,

        interactive: false

    });

    introMap.once('load', function () {

        if (finished) return;

        simplifyBasemap(introMap);

        introReady = true;

        if (!reduceMotion) {

            animationFrame = requestAnimationFrame(
                animateRotation
            );
        }
    });

    introMap.on('error', function (event) {

        console.error(
            'Introduction map error:',
            event.error
        );
    });

} catch (error) {

    console.error(
        'Introduction failed:',
        error
    );

    finishIntro();
}


// ========================================
// ADD FUTURE GEOJSON LAYERS BELOW
// ========================================

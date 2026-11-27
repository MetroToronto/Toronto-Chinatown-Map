// Guided tour: layer visibility, map views, and navigation.
(() => {
    const HOME = MAP_HOME_CENTER;
    const OVERVIEW = [43.658185, -79.378195];
    const BASE = 'west', CORE = 'core', WARD = 'ward', FIRST = 'first', EAST = 'east', KENSINGTON = 'kensington';
    const files = {
        west: ['Chinatown_Boundary.geojson'],
        core: ['Chinatown-Core_Boundary.geojson', 'Chinatown-Core.geojson', 'Chinatown_Core.geojson', 'Chinatown_Core_Boundary.geojson'],
        ward: ['TheWard_Boundary.geojson', 'The-Ward_Boundary.geojson'],
        first: ['First-Chinatown_Boundary.geojson'],
        east: ['East-Chinatown_Boundary.geojson'],
        kensington: ['Kensington_Boundary.geojson']
    };
    const fallbackNames = {west:'New (West) Chinatown', core:'Chinatown Commercial Core', ward:"St. John's Ward", first:"Toronto's First Chinatown", east:'East Chinatown', kensington:'Kensington Market'};
    const layers = new Map();
    const dataByKey = new Map();
    let stage = 0, savedInteractions = null, mask = null, labels = [], labelFrame = 0;
    let tourExplorationLock = null;
    const startButton = document.getElementById('start-tour-button');
    const baseStyle = {color:'#922b2b', weight:8, opacity:1, dashArray:null, lineCap:'round', lineJoin:'round', fill:false, fillOpacity:0};
    const dashed = {dashArray:'14 12'};
    const heavy = {weight:11};
    const lightFill = {fill:true, fillColor:'#e16a6a', fillOpacity:0.32};
    const darkFill = {fill:true, fillColor:'#922b2b', fillOpacity:0.60};
    const ordinary = [[BASE,dashed],[CORE,{}]];
    const remaining = [2,3,4,5,6,7];
    const stages = {
        1: {bounds:[[BASE,dashed],[CORE,{}]], stops:[], mask:true},
        2: {bounds:[[WARD,{}],[FIRST,heavy]], stops:[1], popup:1},
        3: {bounds:[[BASE,lightFill],[WARD,lightFill],[EAST,lightFill],[FIRST,{...heavy,...darkFill}]], stops:[], view:OVERVIEW, zoom:15, labels:true},
        4: {bounds:ordinary, stops:remaining, popup:2},
        5: {bounds:ordinary, stops:remaining, popup:3},
        6: {bounds:[[BASE,dashed],[KENSINGTON,{}]], stops:remaining, popup:4},
        7: {bounds:[[BASE,lightFill],[KENSINGTON,darkFill]], stops:[], labels:true},
        8: {bounds:[[BASE,dashed]], stops:remaining, popup:5},
        9: {bounds:[[BASE,dashed]], stops:remaining, popup:6},
        10:{bounds:[[BASE,dashed]], stops:remaining, popup:7}
    };
    map.createPane('tourMask');
    map.getPane('tourMask').style.zIndex = '340';
    map.getPane('tourMask').style.pointerEvents = 'none';
    map.createPane('neighbourhoodBoundaries');
    map.getPane('neighbourhoodBoundaries').style.zIndex = '350';
    map.getPane('neighbourhoodBoundaries').style.pointerEvents = 'none';

    // Overlay blocks map controls as well as mouse/touch input during every stage.
    const shield = document.createElement('div');
    shield.className = 'tour-map-shield'; shield.hidden = true;
    document.body.append(shield);
    const labelLayer = document.createElement('div');
    labelLayer.className = 'tour-label-layer'; labelLayer.hidden = true;
    document.body.append(labelLayer);
    const nav = document.createElement('nav');
    nav.className = 'tour-navigation'; nav.hidden = true;
    nav.setAttribute('aria-label','Guided tour navigation');
    nav.innerHTML = `<div class="tour-stage-status" aria-live="polite"></div>
        <div class="tour-nav-buttons">
          <button type="button" class="tour-prev" aria-label="Previous stage" title="Previous stage"></button>
          <button type="button" class="tour-reset">Close and Reset</button>
          <button type="button" class="tour-next" aria-label="Next stage" title="Next stage"></button>
        </div>`;
    document.body.append(nav);
    const previous = nav.querySelector('.tour-prev'), next = nav.querySelector('.tour-next');
    const status = nav.querySelector('.tour-stage-status');
    previous.addEventListener('click', () => { if (stage > 1) applyStage(stage-1); });
    next.addEventListener('click', () => { if (stage) applyStage(stage+1); });
    nav.querySelector('.tour-reset').addEventListener('click', endTour);

    async function loadBoundary(key, names) {
        for (const name of names) {
            try {
                const response = await fetch('./geojson-data/' + name);
                if (!response.ok) continue;
                const data = await response.json();
                const layer = L.geoJSON(data, {pane:'neighbourhoodBoundaries', interactive:false, style:baseStyle});
                if (!layer.getBounds().isValid()) throw new Error('Empty boundary');
                layers.set(key, layer); dataByKey.set(key, data); return;
            } catch(error) { console.warn('Unable to read boundary', name, error); }
        }
        console.error('Missing boundary:', key, names);
    }
    function showBoundaries(specs) {
        for (const layer of layers.values()) if (map.hasLayer(layer)) layer.remove();
        for (const [key, style] of specs) {
            const layer = layers.get(key);
            if (!layer) continue;
            layer.setStyle({...baseStyle, ...style});
            layer.addTo(map);
        }
    }
    function geometryList(data) {
        if (!data) return [];
        if (data.type === 'FeatureCollection') return data.features.flatMap(geometryList);
        if (data.type === 'Feature') return geometryList(data.geometry);
        if (data.type === 'GeometryCollection') return data.geometries.flatMap(geometryList);
        return data.type === 'Polygon' ? [data.coordinates] : data.type === 'MultiPolygon' ? data.coordinates : [];
    }
    function clearMask() { if (mask) { mask.remove(); mask = null; } }
    function showMask() {
        clearMask();
        const polygons = geometryList(dataByKey.get(BASE));
        if (!polygons.length) return;
        // A large surrounding rectangle plus every polygon ring; SVG even-odd
        // filling leaves the interior of Chinatown transparent.
        const rings = [[[20,-110],[70,-110],[70,-45],[20,-45]]];
        for (const polygon of polygons) for (const ring of polygon) {
            rings.push(ring.map(([lng,lat]) => [lat,lng]));
        }
        mask = L.polygon(rings,{pane:'tourMask', interactive:false, stroke:false, fill:true, fillColor:'#454545', fillOpacity:.54, fillRule:'evenodd', smoothFactor:0, noClip:true}).addTo(map);
    }
    function clearLabels() {
        labels = []; labelLayer.replaceChildren(); labelLayer.hidden = true; labelLayer.classList.remove('tour-label-stack');
        if (labelFrame) cancelAnimationFrame(labelFrame); labelFrame = 0;
    }
    function boundaryName(key) {
        const d = dataByKey.get(key);
        const features = d?.type === 'FeatureCollection' ? d.features : [d];
        return features.find(f => f?.properties?.StopName)?.properties.StopName || fallbackNames[key];
    }
    function makeLabels(specs) {
        clearLabels(); labelLayer.hidden = false;
        // First Chinatown and Kensington get priority in the collision layout.
        const sorted = [...specs].sort((a,b) => Number([FIRST,KENSINGTON].includes(b[0])) - Number([FIRST,KENSINGTON].includes(a[0])));
        for (const [key] of sorted) {
            const layer = layers.get(key); if (!layer) continue;
            const el = document.createElement('div'); el.className = 'tour-boundary-label';
            el.textContent = boundaryName(key); labelLayer.append(el);
            labels.push({el, anchor:layer.getBounds().getCenter()});
        }
        layoutLabels();
    }
    function layoutLabels() {
        if (!labels.length) return;
        labelLayer.classList.remove('tour-label-stack');
        const rect = map.getContainer().getBoundingClientRect();
        const margin = 10, gap = 12;
        const w = Math.min(window.innerWidth, rect.right), h = Math.min(window.innerHeight,rect.bottom);
        const occupied = [];
        for (const element of document.querySelectorAll('.tour-intro-panel, .leaflet-top.leaflet-right, .tour-navigation')) {
            const r = element.getBoundingClientRect();
            if (r.width && r.height) occupied.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
        }
        const overlaps = r => occupied.some(o => r.left < o.right+gap && r.right > o.left-gap && r.top < o.bottom+gap && r.bottom > o.top-gap);
        for (const {el,anchor} of labels) {
            el.style.visibility='hidden';
            const point = map.latLngToContainerPoint(anchor);
            const width = el.offsetWidth, height = el.offsetHeight;
            const minX = margin+width/2, maxX = Math.max(minX,w-margin-width/2);
            const minY = margin+height/2, maxY = Math.max(minY,h-margin-height/2);
            const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
            const x0 = clamp(point.x+rect.left,minX,maxX), y0 = clamp(point.y+rect.top,minY,maxY);
            const candidates = [[x0,y0]];
            for(let radius=24;radius<=Math.hypot(w,h);radius+=24) {
                const steps = Math.max(8,Math.ceil(2*Math.PI*radius/32));
                for(let i=0;i<steps;i++) {
                    const a=i*2*Math.PI/steps;
                    candidates.push([clamp(x0+radius*Math.cos(a),minX,maxX),clamp(y0+radius*Math.sin(a),minY,maxY)]);
                }
            }
            let chosen;
            for(const [x,y] of candidates) {
                const r={left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
                if (!overlaps(r)) {chosen={x,y,r};break;}
            }
            // On very small screens, a compact stacked legend is preferable to overlapping labels.
            if (!chosen) { labelLayer.classList.add('tour-label-stack'); for(const item of labels) item.el.style.visibility='visible'; return; }
            el.style.left=chosen.x+'px'; el.style.top=chosen.y+'px'; el.style.visibility='visible'; occupied.push(chosen.r);
        }
        labelLayer.classList.remove('tour-label-stack');
    }
    function scheduleLabelLayout() {
        if (!labels.length || labelFrame) return;
        labelFrame=requestAnimationFrame(()=>{ labelFrame=0; layoutLabels(); });
    }
    map.on('move zoom moveend zoomend resize',scheduleLabelLayout);
    window.addEventListener('resize',scheduleLabelLayout);
    function goHome() { map.stop(); map.setView(HOME,MAP_HOME_ZOOM,{animate:false}); }
    function applyStage(number) {
        if (number===11) {endTour();return;}
        const config=stages[number]; if(!config) return;
        closeActiveStopModal({restoreDefaultView:false,silent:true});
        map.stop(); clearMask(); clearLabels();
        stage=number;
        previous.disabled=number===1;
        next.title=number===10?'Finish tour':'Next stage'; next.setAttribute('aria-label',next.title);
        status.textContent=`Stage ${number} of 11`;
        showBoundaries(config.bounds);
        showTourStops(config.stops);
        map.setView(config.view || HOME,config.zoom || MAP_HOME_ZOOM,{animate:false});
        if(config.mask) showMask();
        if(config.labels) makeLabels(config.bounds);
        if(config.popup) {
            const entry=getTourStop(config.popup);
            if(entry) openStopPopup(entry.properties,entry.marker,{tour:true,onClose:()=>{goHome();next.focus({preventScroll:true});}});
            else status.textContent+=` · Stop ${config.popup} unavailable`;
        }
    }
    function startTour() {
        if(stage) return;
        tourExplorationLock = suspendMapExploration({tour:true});
        closeActiveStopModal({restoreDefaultView:false,silent:true});
        savedInteractions=disableMapInteractions();
        document.body.classList.add('tour-running');
        shield.hidden=false; nav.hidden=false; startButton.disabled=true;
        map.getContainer().inert=true;
        document.querySelector('.tour-intro-panel').inert=true;
        applyStage(1); next.focus({preventScroll:true});
    }
    function endTour() {
        if(!stage) return;
        closeActiveStopModal({restoreDefaultView:false,silent:true});
        clearMask(); clearLabels(); stage=0;
        showBoundaries(ordinary); showTourStops(); goHome();
        if(savedInteractions) setMapInteractionState(savedInteractions);
        resumeMapExploration(tourExplorationLock);
        tourExplorationLock = null;
        savedInteractions=null; nav.hidden=true; shield.hidden=true;
        map.getContainer().inert=false;
        document.querySelector('.tour-intro-panel').inert=false;
        document.body.classList.remove('tour-running');
        startButton.disabled=false; startButton.focus({preventScroll:true});
    }
    startButton.disabled=true;
    startButton.addEventListener('click',startTour);
    goHome();
    Promise.all([tourStopsReady, ...Object.entries(files).map(([key,names])=>loadBoundary(key,names))]).then(()=>{
        showBoundaries(ordinary);
        startButton.disabled=false;
        const missing=Object.keys(files).filter(key=>!layers.has(key));
        if(missing.length) console.warn('Tour boundaries unavailable:',missing);
    });
})();

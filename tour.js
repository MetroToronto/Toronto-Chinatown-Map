// Guided tour: layer visibility, map views, and navigation.
(() => {
    const HOME = MAP_HOME_CENTER;
    const OVERVIEW = [43.658485, -79.378695];
    // Stage 3 is the only stage with a separate device-specific overview zoom.
    const STAGE3_ZOOM = MAP_IS_MOBILE ? 12.5 : 14.5;
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
    const baseStyle = {color:'#922b2b', weight:6, opacity:1, dashArray:null, lineCap:'round', lineJoin:'round', fill:false, fillOpacity:0};
    const dashed = {dashArray:'14 12'};
    const heavy = {weight:9};
    const extraHeavy = {weight:13, color:'#6e1919'};
    const lightFill = {fill:true, fillColor:'#e16a6a', fillOpacity:0.32};
    const darkFill = {fill:true, fillColor:'#761b1b', fillOpacity:0.72};
    const ordinary = [[BASE,dashed],[CORE,{}]];
    const remaining = [2,3,4,5,6,7];
    const stages = {
        1: {bounds:[[BASE,dashed],[CORE,{}]], stops:[], mask:true},
        2: {bounds:[[WARD,{}],[FIRST,heavy]], stops:[1], popup:1},
        3: {bounds:[[BASE,lightFill],[WARD,lightFill],[EAST,lightFill],[FIRST,{...extraHeavy,...darkFill,weight:12}]], stops:[], view:OVERVIEW, zoom:STAGE3_ZOOM, labels:true},
        4: {bounds:ordinary, stops:remaining, popup:2},
        5: {bounds:ordinary, stops:remaining, popup:3},
        6: {bounds:[[BASE,dashed],[KENSINGTON,{}]], stops:remaining, popup:4},
        7: {bounds:[[BASE,{...lightFill,...dashed}],[KENSINGTON,{...extraHeavy,...darkFill}]], stops:[], labels:true},
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
        for (const [key, style] of sorted) {
            const layer = layers.get(key); if (!layer) continue;
            const el = document.createElement('div'); el.className = 'tour-boundary-label';
            el.textContent = boundaryName(key); labelLayer.append(el);
            labels.push({el, layer, key, weight:style.weight ?? baseStyle.weight,
                placement: stage === 3 && key === FIRST ? 'below' : stage === 7 && key === KENSINGTON ? 'inside' : 'above'});
        }
        layoutLabels();
    }
    function layoutLabels() {
        if (!labels.length) return;
        labelLayer.classList.remove('tour-label-stack');
        const rect = map.getContainer().getBoundingClientRect();
        const margin = 8, gap = 7, boundaryGap = 10;
        const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
        const right = Math.min(window.innerWidth, rect.right);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        const controls = [];
        for (const element of document.querySelectorAll('.tour-intro-panel, .leaflet-top.leaflet-right, .tour-navigation')) {
            const r = element.getBoundingClientRect();
            if (r.width && r.height) controls.push(r);
        }
        const intersects = (a,b,g=0) => a.left < b.right+g && a.right > b.left-g && a.top < b.bottom+g && a.bottom > b.top-g;
        const regions = labels.map(item => {
            const bounds = item.layer.getBounds();
            const nw = map.latLngToContainerPoint(bounds.getNorthWest());
            const se = map.latLngToContainerPoint(bounds.getSouthEast());
            const stroke = item.weight / 2;
            return {left: Math.min(nw.x,se.x)+rect.left-stroke, right: Math.max(nw.x,se.x)+rect.left+stroke,
                top: Math.min(nw.y,se.y)+rect.top-stroke, bottom: Math.max(nw.y,se.y)+rect.top+stroke};
        });
        // Project the actual polygon rings, not just the bounding box, for interior labels.
        const projected = labels.map(item => geometryList(dataByKey.get(item.key)).map(polygon =>
            polygon.map(ring => ring.map(([lng,lat]) => {
                const p = map.latLngToContainerPoint([lat,lng]);
                return {x:p.x+rect.left,y:p.y+rect.top};
            }))));
        function inRing(p,ring) {
            let inside=false;
            for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
                const a=ring[i],b=ring[j];
                if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
            }
            return inside;
        }
        // Liang-Barsky segment/rectangle test, including touches.
        function segmentHitsRect(a,b,r) {
            const dx=b.x-a.x,dy=b.y-a.y;
            let lo=0,hi=1;
            for(const [p,q] of [[-dx,a.x-r.left],[dx,r.right-a.x],[-dy,a.y-r.top],[dy,r.bottom-a.y]]) {
                if(p===0) {if(q<0)return false;continue;}
                const t=q/p;
                if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
                if(lo>hi)return false;
            }
            return true;
        }
        function insidePolygon(r,polygons,padding) {
            const expanded={left:r.left-padding,right:r.right+padding,top:r.top-padding,bottom:r.bottom+padding};
            const corners=[{x:expanded.left,y:expanded.top},{x:expanded.right,y:expanded.top},
                {x:expanded.right,y:expanded.bottom},{x:expanded.left,y:expanded.bottom}];
            return polygons.some(rings => rings.length &&
                corners.every(p=>inRing(p,rings[0])&&!rings.slice(1).some(ring=>inRing(p,ring))) &&
                !rings.some(ring=>ring.some((a,j)=>segmentHitsRect(a,ring[(j+1)%ring.length],expanded))));
        }
        // Ordinary labels prefer above; First Chinatown stays below, and
        // Kensington must fit inside its own polygon without touching its outline.
        function attempt(compact) {
            const occupied = [...controls];
            const missing = [];
            for (let i=0;i<labels.length;i++) {
                const {el, placement, weight}=labels[i], region=regions[i];
                el.classList.toggle('tour-label-compact',compact);
                el.style.visibility='hidden';
                const width=el.offsetWidth,height=el.offsetHeight;
                const minX=left+margin+width/2,maxX=right-margin-width/2;
                const minY=top+margin+height/2,maxY=bottom-margin-height/2;
                if (minX>maxX || minY>maxY) {missing.push(i);continue;}
                const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
                const x0=(region.left+region.right)/2;
                const y0=placement==='inside'?(region.top+region.bottom)/2:
                    placement==='below'?region.bottom+boundaryGap+height/2:region.top-boundaryGap-height/2;
                const positions=[];
                const add=(x,y)=>{
                    x=clamp(x,minX,maxX); y=clamp(y,minY,maxY);
                    const r={left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
                    if(placement==='inside') {
                        if(!insidePolygon(r,projected[i],weight/2+4))return;
                    } else {
                        if(intersects(r,region,boundaryGap-0.1))return;
                        if(placement==='below' && r.top<region.bottom+boundaryGap-0.1)return;
                    }
                    const preferred=placement!=='above'||r.bottom<=region.top-boundaryGap+0.1;
                    const otherCount=regions.filter((other,j)=>j!==i&&intersects(r,other,3)).length;
                    positions.push({x,y,r,score:(preferred?0:10000)+otherCount*2000+Math.hypot(x-x0,y-y0)});
                };
                add(x0,y0);
                if(placement==='inside') {
                    const step=4;
                    for(let y=Math.max(minY,region.top);y<=Math.min(maxY,region.bottom)+step;y+=step)
                        for(let x=Math.max(minX,region.left);x<=Math.min(maxX,region.right)+step;x+=step) add(x,y);
                } else {
                    if(placement==='above') for(let y=y0;y>=minY-14;y-=12) for(let x=minX;x<=maxX+12;x+=12) add(x,y);
                    for(let y=minY;y<=maxY+12;y+=12) for(let x=minX;x<=maxX+12;x+=12) add(x,y);
                }
                positions.sort((a,b)=>a.score-b.score);
                const chosen=positions.find(p=>!occupied.some(o=>intersects(p.r,o,gap)));
                if(!chosen){missing.push(i);continue;}
                el.style.left=chosen.x+'px';el.style.top=chosen.y+'px';el.style.visibility='visible';
                occupied.push(chosen.r);
            }
            return missing;
        }
        // Smaller labels are used only if necessary on particularly tight screens.
        if(attempt(false).length) attempt(true);
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
        // Ensure Leaflet cannot clamp the overview to an older minimum zoom.
        if (number === 3) map.setMinZoom(Math.min(STAGE3_ZOOM, MAP_HOME_ZOOM));
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
        tourExplorationLock = suspendMapExploration({tour:true,minZoom:STAGE3_ZOOM});
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

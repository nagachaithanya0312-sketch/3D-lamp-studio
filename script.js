/***********************************************************************
 * 1. STATE & PARAMETERS (All linear units in millimeters)
 ***********************************************************************/
const defaultParams = {
    height: 200,
    bottomRadius: 75,
    topRadius: 55,
    wallThickness: 2.0,

    profileType: 'bulbous',
    profileBulge: 22,
    profilePeak: 45,

    patternType: 'spiral_ribs',
    ribCount: 24,
    ribDepth: 7.5,
    twistAngle: 150,
    ribSharpness: 20,
    vertFreq: 2.0,
    vertAmp: 0.0,

    mountPosition: 'bottom', // 'bottom', 'top', 'solid_base', 'none'
    socketDiameter: 41.0,    // E27 default
    ringWidth: 8.0,
    spokeCount: 4,
    spokeWidth: 6.0,
    spokeHeight: 5.0,
    fitterOffset: 12,

    radialSegs: 180,
    heightSegs: 120
};

let params = { ...defaultParams };
let currentMaxOverhangDeg = 28;
let uploadedAIImageBase64 = null;
let uploadedAIImageMime = null;
let pendingAIOptimization = null;

// Material & Lighting Preview State
let renderState = {
    bulbOn: true,
    bulbPower: 85,
    bulbKelvin: 2700,
    darkRoom: true,
    renderMode: 'lit', // 'lit', 'overhang', 'normal'
    wireframe: false,
    filamentColor: 0xfff6e5,
    filamentRoughness: 0.38,
    filamentTransmission: 0.65,
    bedSize: 256
};

// Curated Design Presets
const PRESETS = {
    nordic: {
        height: 200, bottomRadius: 75, topRadius: 55, wallThickness: 2.0,
        profileType: 'bulbous', profileBulge: 24, profilePeak: 45,
        patternType: 'spiral_ribs', ribCount: 24, ribDepth: 7.5, twistAngle: 150,
        ribSharpness: 20, vertFreq: 2.0, vertAmp: 0.0,
        mountPosition: 'bottom', socketDiameter: 41.0, spokeCount: 4, fitterOffset: 12,
        radialSegs: 180, heightSegs: 120
    },
    lotus: {
        height: 190, bottomRadius: 65, topRadius: 48, wallThickness: 1.8,
        profileType: 'teardrop', profileBulge: 32, profilePeak: 38,
        patternType: 'origami', ribCount: 16, ribDepth: 14.0, twistAngle: 90,
        ribSharpness: 85, vertFreq: 3.0, vertAmp: 4.5,
        mountPosition: 'top', socketDiameter: 41.0, spokeCount: 3, fitterOffset: 10,
        radialSegs: 192, heightSegs: 120
    },
    midcentury: {
        height: 175, bottomRadius: 90, topRadius: 45, wallThickness: 2.2,
        profileType: 'bell', profileBulge: 16, profilePeak: 60,
        patternType: 'vertical_ribs', ribCount: 36, ribDepth: 4.5, twistAngle: 0,
        ribSharpness: 15, vertFreq: 0, vertAmp: 0,
        mountPosition: 'bottom', socketDiameter: 41.0, spokeCount: 4, fitterOffset: 15,
        radialSegs: 216, heightSegs: 100
    },
    honeycomb: {
        height: 215, bottomRadius: 70, topRadius: 65, wallThickness: 2.2,
        profileType: 'bulbous', profileBulge: 15, profilePeak: 50,
        patternType: 'diamond', ribCount: 20, ribDepth: 6.5, twistAngle: 180,
        ribSharpness: 55, vertFreq: 6.0, vertAmp: 3.5,
        mountPosition: 'bottom', socketDiameter: 41.0, spokeCount: 4, fitterOffset: 12,
        radialSegs: 180, heightSegs: 140
    },
    minimal: {
        height: 185, bottomRadius: 88, topRadius: 38, wallThickness: 2.4,
        profileType: 'bell', profileBulge: 20, profilePeak: 35,
        patternType: 'ripples', ribCount: 12, ribDepth: 0.0, twistAngle: 0,
        ribSharpness: 0, vertFreq: 8.0, vertAmp: 3.0,
        mountPosition: 'top', socketDiameter: 38.0, spokeCount: 3, fitterOffset: 14,
        radialSegs: 144, heightSegs: 130
    },
    cyber: {
        height: 210, bottomRadius: 80, topRadius: 50, wallThickness: 2.4,
        profileType: 'hourglass', profileBulge: -18, profilePeak: 55,
        patternType: 'faceted', ribCount: 8, ribDepth: 9.0, twistAngle: 60,
        ribSharpness: 95, vertFreq: 4.0, vertAmp: 6.0,
        mountPosition: 'bottom', socketDiameter: 41.0, spokeCount: 4, fitterOffset: 12,
        radialSegs: 64, heightSegs: 40
    }
};

/***********************************************************************
 * 2. THREE.JS SCENE INITIALIZATION
 ***********************************************************************/
let scene, camera, renderer, controls;
let lampMeshGroup, shadeMesh, fitterMesh, wireframeOverlay;
let bulbLight, bulbGlowMesh, bulbSocketPreview, studioDirLight, studioFillLight, ambientLight;
let printBedGroup;

// Materials
let litShadeMaterial, overhangMaterial, normalMaterial;

function initThreeScene() {
    const container = document.getElementById('viewport-container');
    const canvas = document.getElementById('three-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090a0d);
    scene.fog = new THREE.FogExp2(0x090a0d, 0.00075);

    camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 1, 3000);
    camera.position.set(270, 210, 310);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 100, 0);
    controls.maxDistance = 1200;
    controls.minDistance = 60;

    // Lighting Setup
    ambientLight = new THREE.AmbientLight(0xdbeafe, 0.25);
    scene.add(ambientLight);

    studioDirLight = new THREE.DirectionalLight(0xffffff, 0.45);
    studioDirLight.position.set(220, 400, 250);
    studioDirLight.castShadow = true;
    studioDirLight.shadow.mapSize.width = 2048;
    studioDirLight.shadow.mapSize.height = 2048;
    studioDirLight.shadow.bias = -0.0004;
    studioDirLight.shadow.normalBias = 0.04;
    scene.add(studioDirLight);

    studioFillLight = new THREE.DirectionalLight(0x93c5fd, 0.22);
    studioFillLight.position.set(-250, 120, -200);
    scene.add(studioFillLight);

    // Internal Lamp Bulb PointLight (Subsurface transmission handles internal illumination without shadow acne)
    bulbLight = new THREE.PointLight(0xffb454, 2.2, 700, 1.5);
    bulbLight.position.set(0, 95, 0);
    bulbLight.castShadow = false;
    scene.add(bulbLight);

    // Visual Bulb Sphere & Refined Socket Hardware Reference
    const bulbGroup = new THREE.Group();
    const bulbGeo = new THREE.SphereGeometry(22, 24, 24);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    bulbGlowMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbGroup.add(bulbGlowMesh);

    // Finished Hardware Socket Collar & Threads (Eliminates raw dark cylinder artifacts)
    const holderGeo = new THREE.CylinderGeometry(15, 15, 28, 24);
    const holderMat = new THREE.MeshStandardMaterial({ color: 0x333842, roughness: 0.45, metalness: 0.75 });
    const holderMesh = new THREE.Mesh(holderGeo, holderMat);
    holderMesh.position.y = -22;
    bulbGroup.add(holderMesh);

    const brassRingGeo = new THREE.CylinderGeometry(17, 17, 5, 24);
    const brassRingMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.3, metalness: 0.9 });
    const brassRingMesh = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRingMesh.position.y = -9;
    bulbGroup.add(brassRingMesh);

    bulbSocketPreview = bulbGroup;
    scene.add(bulbSocketPreview);

    // Initialize Custom Materials
    initMaterials();

    // Main Lamp Mesh Container
    lampMeshGroup = new THREE.Group();
    scene.add(lampMeshGroup);

    // Build Plate Reference Grid
    printBedGroup = new THREE.Group();
    scene.add(printBedGroup);
    updatePrintBed(renderState.bedSize);

    // Build Initial Parametric Lamp Shade
    rebuildLampGeometry();
    updateLightingFromUI();

    // Resize Listener
    window.addEventListener('resize', onWindowResize);
}

function initMaterials() {
    // 1. Realistic Translucent Filament Shader Material (Subsurface Light Attenuation)
    litShadeMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(renderState.filamentColor),
        roughness: renderState.filamentRoughness,
        metalness: 0.05,
        side: THREE.DoubleSide,
        shadowSide: THREE.BackSide
    });

    // Inject custom subsurface glow shader based on wall thickness and internal bulb distance
    litShadeMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uBulbPos = { value: new THREE.Vector3(0, 100, 0) };
        shader.uniforms.uBulbColor = { value: new THREE.Color(0xffaa44) };
        shader.uniforms.uBulbIntensity = { value: 1.0 };
        shader.uniforms.uWallThickness = { value: params.wallThickness };
        shader.uniforms.uTransmission = { value: renderState.filamentTransmission };

        shader.vertexShader = `
            varying vec3 vWorldPos;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

        shader.fragmentShader = `
            uniform vec3 uBulbPos;
            uniform vec3 uBulbColor;
            uniform float uBulbIntensity;
            uniform float uWallThickness;
            uniform float uTransmission;
            varying vec3 vWorldPos;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            // Compute subsurface transmission from internal bulb through filament wall
            vec3 toBulb = uBulbPos - vWorldPos;
            float dist = length(toBulb);
            vec3 lightDir = normalize(toBulb);
            
            // Wrap lighting for warm filament glow
            float wrap = max(0.0, (dot(-vNormal, lightDir) + 0.65) / 1.65);
            float atten = 1.0 / (1.0 + 0.00012 * dist * dist);
            float thicknessFactor = exp(-uWallThickness * 0.35);
            
            vec3 subsurfaceGlow = uBulbColor * uBulbIntensity * wrap * atten * thicknessFactor * uTransmission * 1.45;
            gl_FragColor.rgb += subsurfaceGlow;
            #include <dithering_fragment>
            `
        );

        litShadeMaterial.userData.shader = shader;
    };

    // 2. Overhang Printability Diagnostic Shader Material
    overhangMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            void main() {
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            void main() {
                vec3 n = normalize(vWorldNormal);
                // Downward facing normal Y component indicates overhang steepness
                float downDot = -n.y;
                // Ignoring bottom cap at y <= 1.0mm
                if (vWorldPos.y < 1.0) {
                    gl_FragColor = vec4(0.2, 0.75, 0.5, 1.0);
                    return;
                }
                // cos(45 deg) = 0.707
                vec3 safeColor = vec3(0.18, 0.22, 0.28);
                vec3 warnColor = vec3(0.96, 0.62, 0.04);
                vec3 dangerColor = vec3(0.95, 0.22, 0.30);

                // Layer line subtle stripe
                float layerStripe = 0.94 + 0.06 * sin(vWorldPos.y * 8.0);

                vec3 col = safeColor;
                if (downDot > 0.707) {
                    float t = clamp((downDot - 0.707) / 0.2, 0.0, 1.0);
                    col = mix(warnColor, dangerColor, t);
                } else if (downDot > 0.50) {
                    float t = clamp((downDot - 0.50) / 0.207, 0.0, 1.0);
                    col = mix(safeColor, warnColor, t);
                }
                gl_FragColor = vec4(col * layerStripe, 1.0);
            }
        `
    });

    // 3. Normal Map Inspection Material
    normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
}

/***********************************************************************
 * 3. PARAMETRIC GEOMETRY ENGINE (WATERTIGHT MANIFOLD SHELL + FITTER)
 ***********************************************************************/

// Evaluate outer radius R(v, theta) at normalized height v in [0, 1] and angle theta in [0, 2*PI]
function evaluateShadeRadius(v, theta) {
    const rBot = params.bottomRadius;
    const rTop = params.topRadius;
    const bulge = params.profileBulge;
    const peak = params.profilePeak / 100;

    // Base linear interpolation
    let baseR = rBot * (1 - v) + rTop * v;

    // Silhouette Profile Curve Modulation
    const pType = params.profileType;
    if (pType === 'bulbous') {
        // Skewed sine arch peaking at `peak`
        const remappedV = v < peak ? (v / peak) * 0.5 : 0.5 + ((v - peak) / (1 - peak)) * 0.5;
        baseR += bulge * Math.sin(remappedV * Math.PI);
    } else if (pType === 'bell') {
        const sCurve = v * v * (3 - 2 * v);
        baseR = rBot * (1 - sCurve) + rTop * sCurve;
        baseR += bulge * Math.sin(v * Math.PI * 2) * 0.45;
    } else if (pType === 'hourglass') {
        const remappedV = v < peak ? (v / peak) * 0.5 : 0.5 + ((v - peak) / (1 - peak)) * 0.5;
        baseR -= Math.abs(bulge) * Math.sin(remappedV * Math.PI);
    } else if (pType === 'teardrop') {
        baseR += bulge * Math.pow(1 - v, 1.4) * Math.sin(v * Math.PI);
    } else if (pType === 'pagoda') {
        baseR += bulge * 0.5 * Math.sin(v * Math.PI) + (bulge * 0.28) * Math.sin(v * Math.PI * 5);
    }

    // Procedural Surface Ribs & Pattern Modulation
    const pat = params.patternType;
    const N = params.ribCount;
    const depth = params.ribDepth;
    const twistRad = (params.twistAngle * Math.PI / 180) * v;
    const sharp = params.ribSharpness / 100;
    const vFreq = params.vertFreq;
    const vAmp = params.vertAmp;

    let dR = 0;

    if (pat !== 'smooth') {
        const phase = N * (theta + twistRad);

        if (pat === 'spiral_ribs' || pat === 'vertical_ribs') {
            const activePhase = pat === 'vertical_ribs' ? N * theta : phase;
            const s = Math.sin(activePhase);
            const t = (2 / Math.PI) * Math.asin(s);
            const wave = s * (1 - sharp) + t * sharp;
            dR += depth * 0.5 * wave;
        } else if (pat === 'origami') {
            // Alternating counter-twisted accordion pleats
            const w1 = (2 / Math.PI) * Math.asin(Math.sin(N * (theta + twistRad)));
            const w2 = (2 / Math.PI) * Math.asin(Math.sin(N * (theta - twistRad) + v * Math.PI * vFreq));
            dR += depth * 0.55 * (w1 * 0.65 + w2 * 0.35);
        } else if (pat === 'diamond') {
            // Counter-helical knurled diamond lattice
            const w1 = Math.sin(N * (theta + twistRad));
            const w2 = Math.sin(N * (theta - twistRad));
            const lattice = Math.abs(w1 * w2);
            dR += depth * (lattice - 0.4);
        } else if (pat === 'ripples') {
            dR += depth * 0.4 * Math.sin(N * theta) * Math.sin(v * Math.PI * Math.max(1, vFreq));
        } else if (pat === 'faceted') {
            // Low-poly stepped angular facets
            const t = (2 / Math.PI) * Math.asin(Math.sin(phase));
            dR += depth * 0.6 * t;
        }
    }

    // Secondary vertical wave modulation
    if (vAmp > 0 && vFreq > 0) {
        dR += vAmp * Math.sin(v * Math.PI * vFreq);
    }

    // Taper pattern slightly near mounting rims (top/bottom 4%) for clean circular stability
    const edgeBlend = Math.min(1.0, Math.min(v / 0.04, (1 - v) / 0.04));
    const patternAtten = 0.25 + 0.75 * edgeBlend;

    return Math.max(12, baseR + dR * patternAtten);
}

// Build watertight manifold BufferGeometry for the outer+inner shade shell
function createShadeShellGeometry() {
    const radSegs = params.radialSegs;
    const hSegs = params.heightSegs;
    const H = params.height;
    const wall = params.wallThickness;

    const positions = [];
    const indices = [];

    const outerGrid = [];
    const innerGrid = [];

    let maxOverhangAngleDeg = 0;

    // 1. Generate Outer & Inner Surface Rings
    for (let j = 0; j <= hSegs; j++) {
        const v = j / hSegs;
        const y = v * H;

        const outerRow = [];
        const innerRow = [];

        for (let i = 0; i < radSegs; i++) {
            const u = i / radSegs;
            const theta = u * Math.PI * 2;

            const rOut = evaluateShadeRadius(v, theta);
            // Solid base mode closes the bottom floor up to wallThickness height
            let rIn = Math.max(4, rOut - wall);

            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            // Outer vertex
            const outIdx = positions.length / 3;
            positions.push(rOut * cosT, y, rOut * sinT);
            outerRow.push(outIdx);

            // Inner vertex
            const inIdx = positions.length / 3;
            positions.push(rIn * cosT, y, rIn * sinT);
            innerRow.push(inIdx);
        }
        outerGrid.push(outerRow);
        innerGrid.push(innerRow);
    }

    // Compute max overhang angle across vertical steps
    const dy = H / hSegs;
    for (let j = 1; j <= hSegs; j++) {
        for (let i = 0; i < radSegs; i += 4) {
            const idxCurr = outerGrid[j][i] * 3;
            const idxPrev = outerGrid[j - 1][i] * 3;
            const rCurr = Math.hypot(positions[idxCurr], positions[idxCurr + 2]);
            const rPrev = Math.hypot(positions[idxPrev], positions[idxPrev + 2]);
            const dr = Math.abs(rCurr - rPrev);
            const angleDeg = Math.atan2(dr, dy) * (180 / Math.PI);
            if (angleDeg > maxOverhangAngleDeg) maxOverhangAngleDeg = angleDeg;
        }
    }

    // 2. Stitch Outer Wall Faces (Outward Winding)
    for (let j = 0; j < hSegs; j++) {
        for (let i = 0; i < radSegs; i++) {
            const nextI = (i + 1) % radSegs;
            const a = outerGrid[j][i];
            const b = outerGrid[j][nextI];
            const c = outerGrid[j + 1][nextI];
            const d = outerGrid[j + 1][i];

            indices.push(a, d, b);
            indices.push(b, d, c);
        }
    }

    // 3. Stitch Inner Wall Faces (Inward Winding)
    for (let j = 0; j < hSegs; j++) {
        for (let i = 0; i < radSegs; i++) {
            const nextI = (i + 1) % radSegs;
            const a = innerGrid[j][i];
            const b = innerGrid[j][nextI];
            const c = innerGrid[j + 1][nextI];
            const d = innerGrid[j + 1][i];

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    // 4. Stitch Top Rim Cap (j = hSegs)
    for (let i = 0; i < radSegs; i++) {
        const nextI = (i + 1) % radSegs;
        const outA = outerGrid[hSegs][i];
        const outB = outerGrid[hSegs][nextI];
        const inA = innerGrid[hSegs][i];
        const inB = innerGrid[hSegs][nextI];

        indices.push(outA, inA, outB);
        indices.push(outB, inA, inB);
    }

    // 5. Stitch Bottom Rim Cap (j = 0)
    for (let i = 0; i < radSegs; i++) {
        const nextI = (i + 1) % radSegs;
        const outA = outerGrid[0][i];
        const outB = outerGrid[0][nextI];
        const inA = innerGrid[0][i];
        const inB = innerGrid[0][nextI];

        indices.push(outA, outB, inA);
        indices.push(outB, inB, inA);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return { geom, maxOverhangAngleDeg };
}

// Build Watertight Manifold Geometry for the Socket Fitter Ring & Spider Struts
function createSocketFitterGeometry() {
    const mountPos = params.mountPosition;
    if (mountPos === 'none') return null;

    const H = params.height;
    const wall = params.wallThickness;
    const subGeometries = [];

    // Helper to build a watertight annular cylinder ring (or solid disc if rInner == 0)
    function buildManifoldRing(rInner, rOuter, yBottom, yTop, segs = 96) {
        const pos = [];
        const idx = [];

        if (rInner <= 0.01) {
            // Solid Cylinder Disc
            const botCenter = 0;
            pos.push(0, yBottom, 0);
            const topCenter = 1;
            pos.push(0, yTop, 0);

            const botRing = [];
            const topRing = [];
            for (let i = 0; i < segs; i++) {
                const theta = (i / segs) * Math.PI * 2;
                const c = Math.cos(theta), s = Math.sin(theta);
                botRing.push(pos.length / 3);
                pos.push(rOuter * c, yBottom, rOuter * s);
                topRing.push(pos.length / 3);
                pos.push(rOuter * c, yTop, rOuter * s);
            }
            for (let i = 0; i < segs; i++) {
                const ni = (i + 1) % segs;
                // Outer side
                idx.push(botRing[i], topRing[i], botRing[ni]);
                idx.push(botRing[ni], topRing[i], topRing[ni]);
                // Top cap
                idx.push(topCenter, topRing[ni], topRing[i]);
                // Bottom cap
                idx.push(botCenter, botRing[i], botRing[ni]);
            }
        } else {
            // Hollow Annular Ring (Hub Collar)
            const outBot = [], outTop = [], inBot = [], inTop = [];
            for (let i = 0; i < segs; i++) {
                const theta = (i / segs) * Math.PI * 2;
                const c = Math.cos(theta), s = Math.sin(theta);

                outBot.push(pos.length / 3);
                pos.push(rOuter * c, yBottom, rOuter * s);

                outTop.push(pos.length / 3);
                pos.push(rOuter * c, yTop, rOuter * s);

                inBot.push(pos.length / 3);
                pos.push(rInner * c, yBottom, rInner * s);

                inTop.push(pos.length / 3);
                pos.push(rInner * c, yTop, rInner * s);
            }

            for (let i = 0; i < segs; i++) {
                const ni = (i + 1) % segs;
                // Outer wall
                idx.push(outBot[i], outTop[i], outBot[ni]);
                idx.push(outBot[ni], outTop[i], outTop[ni]);
                // Inner hole wall
                idx.push(inBot[i], inBot[ni], inTop[i]);
                idx.push(inBot[ni], inTop[ni], inTop[i]);
                // Top face
                idx.push(outTop[i], inTop[i], outTop[ni]);
                idx.push(outTop[ni], inTop[i], inTop[ni]);
                // Bottom face
                idx.push(outBot[i], outBot[ni], inBot[i]);
                idx.push(outBot[ni], inBot[ni], inBot[i]);
            }
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    }

    if (mountPos === 'solid_base') {
        // Solid base plate at bottom
        const v = 0.01;
        let minR = Infinity;
        for (let i = 0; i < 64; i++) {
            const r = evaluateShadeRadius(v, (i / 64) * Math.PI * 2);
            if (r < minR) minR = r;
        }
        const discGeo = buildManifoldRing(0, minR - wall * 0.25, 0, Math.max(2.4, wall), 96);
        return discGeo;
    }

    // Spider Fitter Assembly (Bottom or Top)
    const strutH = params.spokeHeight;
    const strutW = params.spokeWidth;
    const spokeCount = params.spokeCount;
    const holeRadius = params.socketDiameter / 2;
    const hubOuterRadius = holeRadius + params.ringWidth;

    // Compute vertical height Y of the fitter assembly
    let yStart = params.fitterOffset;
    if (mountPos === 'top') {
        yStart = H - params.fitterOffset - strutH;
    }
    yStart = Math.max(0, Math.min(H - strutH, yStart));
    const yEnd = yStart + strutH;
    const vMid = ((yStart + yEnd) * 0.5) / H;

    // 1. Central Socket Collar Ring
    const hubGeo = buildManifoldRing(holeRadius, hubOuterRadius, yStart, yEnd, 96);
    subGeometries.push(hubGeo);

    // 2. Outer Anchor Ring embedded slightly into the inner shade wall for 100% solid connection
    let minShadeR = Infinity;
    for (let i = 0; i < 72; i++) {
        const r = evaluateShadeRadius(vMid, (i / 72) * Math.PI * 2);
        if (r < minShadeR) minShadeR = r;
    }
    const anchorOuterR = minShadeR - wall * 0.35;
    const anchorInnerR = Math.max(hubOuterRadius + 2, anchorOuterR - Math.max(2.6, wall));

    if (anchorOuterR > hubOuterRadius + 1) {
        const outerRimGeo = buildManifoldRing(anchorInnerR, anchorOuterR, yStart, yEnd, 96);
        subGeometries.push(outerRimGeo);

        // 3. Radial Spider Spokes connecting Central Collar to Outer Anchor Ring
        const spokeLen = (anchorInnerR + 1.2) - (hubOuterRadius - 1.2);
        if (spokeLen > 0.5) {
            const midR = (hubOuterRadius - 1.2) + spokeLen * 0.5;
            for (let s = 0; s < spokeCount; s++) {
                const angle = (s / spokeCount) * Math.PI * 2;
                const boxGeo = new THREE.BoxGeometry(spokeLen, strutH, strutW);
                // Transform vertices directly
                const rotMat = new THREE.Matrix4().makeRotationY(-angle);
                const transMat = new THREE.Matrix4().makeTranslation(
                    midR * Math.cos(angle),
                    yStart + strutH * 0.5,
                    midR * Math.sin(angle)
                );
                boxGeo.applyMatrix4(rotMat);
                boxGeo.applyMatrix4(transMat);
                subGeometries.push(boxGeo);
            }
        }
    }

    return mergeBufferGeometries(subGeometries);
}

// Utility to combine multiple BufferGeometries into one single BufferGeometry
function mergeBufferGeometries(geometries) {
    const positions = [];
    const normals = [];
    const indices = [];
    let indexOffset = 0;

    for (const geom of geometries) {
        if (!geom) continue;
        const posAttr = geom.getAttribute('position');
        const normAttr = geom.getAttribute('normal');
        const idxAttr = geom.getIndex();

        for (let i = 0; i < posAttr.count; i++) {
            positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            if (normAttr) {
                normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
            }
        }

        if (idxAttr) {
            for (let i = 0; i < idxAttr.count; i++) {
                indices.push(idxAttr.getX(i) + indexOffset);
            }
        } else {
            for (let i = 0; i < posAttr.count; i++) {
                indices.push(i + indexOffset);
            }
        }

        indexOffset += posAttr.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length === positions.length) {
        merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    merged.setIndex(indices);
    merged.computeVertexNormals();
    return merged;
}

/***********************************************************************
 * 4. REBUILD LAMP MESH & UPDATE TELEMETRY
 ***********************************************************************/
function rebuildLampGeometry() {
    // Clear existing children
    while (lampMeshGroup.children.length > 0) {
        const child = lampMeshGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        lampMeshGroup.remove(child);
    }

    // 1. Build Shade Shell
    const { geom: shadeGeom, maxOverhangAngleDeg } = createShadeShellGeometry();
    const activeMat = getActiveMaterial();

    shadeMesh = new THREE.Mesh(shadeGeom, activeMat);
    shadeMesh.castShadow = true;
    shadeMesh.receiveShadow = true;
    lampMeshGroup.add(shadeMesh);

    // 2. Build Socket Fitter Ring & Struts
    const fitterGeom = createSocketFitterGeometry();
    if (fitterGeom) {
        fitterMesh = new THREE.Mesh(fitterGeom, activeMat);
        fitterMesh.castShadow = true;
        fitterMesh.receiveShadow = true;
        lampMeshGroup.add(fitterMesh);
    } else {
        fitterMesh = null;
    }

    // 3. Optional Wireframe Overlay
    if (renderState.wireframe) {
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            wireframe: true,
            transparent: true,
            opacity: 0.25
        });
        wireframeOverlay = new THREE.Mesh(shadeGeom, wireMat);
        lampMeshGroup.add(wireframeOverlay);
    }

    // 4. Reposition Internal Bulb & Preview Hardware
    const bulbY = params.mountPosition === 'top'
        ? params.height * 0.58
        : params.height * 0.44;
    bulbLight.position.set(0, bulbY, 0);
    bulbSocketPreview.position.set(0, bulbY, 0);
    bulbSocketPreview.rotation.x = params.mountPosition === 'top' ? Math.PI : 0;

    if (litShadeMaterial.userData.shader) {
        litShadeMaterial.userData.shader.uniforms.uBulbPos.value.set(0, bulbY, 0);
        litShadeMaterial.userData.shader.uniforms.uWallThickness.value = params.wallThickness;
    }

    // 5. Update Print Telemetry Readout
    updatePrintTelemetry(shadeGeom, fitterGeom, maxOverhangAngleDeg);
}

function getActiveMaterial() {
    if (renderState.renderMode === 'overhang') return overhangMaterial;
    if (renderState.renderMode === 'normal') return normalMaterial;
    return litShadeMaterial;
}

// Compute accurate bounding box, volume, filament weight, and overhang alert
function updatePrintTelemetry(shadeGeom, fitterGeom, maxOverhangAngleDeg) {
    shadeGeom.computeBoundingBox();
    const bb = shadeGeom.boundingBox;
    const sizeX = Math.round(bb.max.x - bb.min.x);
    const sizeZ = Math.round(bb.max.z - bb.min.z);
    const sizeY = Math.round(params.height);

    document.getElementById('stat-bbox').textContent = `${sizeX}×${sizeZ}×${sizeY} mm`;

    // Triangle Count
    let totalTris = shadeGeom.getIndex().count / 3;
    if (fitterGeom && fitterGeom.getIndex()) {
        totalTris += fitterGeom.getIndex().count / 3;
    }
    document.getElementById('stat-tris').textContent = totalTris.toLocaleString();

    // Estimate Filament Weight (PLA density = 1.24 g/cm³)
    const avgRadius = (params.bottomRadius + params.topRadius) * 0.5 + Math.abs(params.profileBulge) * 0.4;
    const ribLengthFactor = 1 + (params.ribDepth * params.ribCount) / (2 * Math.PI * avgRadius) * 0.35;
    const shellVolumeMm3 = 2 * Math.PI * avgRadius * params.height * params.wallThickness * ribLengthFactor;

    let fitterVolumeMm3 = 0;
    if (params.mountPosition === 'bottom' || params.mountPosition === 'top') {
        const holeR = params.socketDiameter * 0.5;
        const hubOuterR = holeR + params.ringWidth;
        fitterVolumeMm3 += Math.PI * (hubOuterR * hubOuterR - holeR * holeR) * params.spokeHeight;
        fitterVolumeMm3 += params.spokeCount * (avgRadius - hubOuterR) * params.spokeWidth * params.spokeHeight;
    } else if (params.mountPosition === 'solid_base') {
        fitterVolumeMm3 += Math.PI * params.bottomRadius * params.bottomRadius * params.wallThickness;
    }

    const totalVolumeCm3 = (shellVolumeMm3 + fitterVolumeMm3) / 1000;
    const weightGrams = Math.max(12, Math.round(totalVolumeCm3 * 1.24 * 0.88));
    const lengthMeters = Math.max(4, Math.round(weightGrams / 2.98)); // 1.75mm filament ~2.98g/m

    document.getElementById('stat-weight').innerHTML = `~${weightGrams} g <span class="text-slate-400 font-normal">(${lengthMeters}m)</span>`;

    // Print Time Estimate (~42g/hour on modern coreXY printer)
    const totalMinutes = Math.max(25, Math.round((weightGrams / 40) * 60));
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    document.getElementById('stat-time').textContent = `~${hrs}h ${mins}m`;

    // Overhang Warning Assessment
    const iconEl = document.getElementById('overhang-icon');
    const titleEl = document.getElementById('overhang-title');
    const descEl = document.getElementById('overhang-desc');

    // Factor in twist steepness
    const twistOverhang = Math.abs(params.twistAngle) > 0
        ? (Math.abs(params.twistAngle) / 360) * (params.ribDepth * 1.4)
        : 0;
    const effectiveAngle = Math.min(82, Math.round(maxOverhangAngleDeg + twistOverhang));
    currentMaxOverhangDeg = effectiveAngle;

    if (effectiveAngle <= 45) {
        iconEl.className = 'ph-fill ph-check-circle text-emerald-400 text-base shrink-0 mt-0.5';
        titleEl.className = 'font-medium text-emerald-300';
        titleEl.textContent = 'Support-Free Printable';
        descEl.textContent = `Max overhang slope is ~${effectiveAngle}° (safe < 45°).`;
    } else if (effectiveAngle <= 58) {
        iconEl.className = 'ph-fill ph-warning text-amber-400 text-base shrink-0 mt-0.5';
        titleEl.className = 'font-medium text-amber-300';
        titleEl.textContent = 'Moderate Overhangs';
        descEl.textContent = `Max overhang ~${effectiveAngle}°. Use 0.16mm layer height & 100% part cooling fan.`;
    } else {
        iconEl.className = 'ph-fill ph-warning-octagon text-rose-400 text-base shrink-0 mt-0.5';
        titleEl.className = 'font-medium text-rose-300';
        titleEl.textContent = 'Steep Overhangs Detected';
        descEl.textContent = `Overhang reaches ~${effectiveAngle}°. Reduce Rib Depth or Curve Bulge.`;
    }
}

/***********************************************************************
 * 5. PRINT BED REFERENCE VISUALIZATION
 ***********************************************************************/
function updatePrintBed(sizeStr) {
    const size = parseInt(sizeStr, 10);
    renderState.bedSize = size;

    while (printBedGroup.children.length > 0) {
        const c = printBedGroup.children[0];
        if (c.geometry) c.geometry.dispose();
        printBedGroup.remove(c);
    }

    if (size <= 0) return;

    // Build plate translucent base
    const plateGeo = new THREE.PlaneGeometry(size, size);
    plateGeo.rotateX(-Math.PI / 2);
    const plateMat = new THREE.MeshStandardMaterial({
        color: 0x161920,
        roughness: 0.75,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.y = -0.2;
    plateMesh.receiveShadow = true;
    printBedGroup.add(plateMesh);

    // Millimeter Grid Helper (10mm minor, 50mm major)
    const divisions = Math.round(size / 10);
    const grid = new THREE.GridHelper(size, divisions, 0xf59e0b, 0x2a2f3a);
    grid.position.y = 0;
    printBedGroup.add(grid);

    // Outer Build Plate Frame Border
    const half = size / 2;
    const borderPts = [
        new THREE.Vector3(-half, 0.2, -half),
        new THREE.Vector3(half, 0.2, -half),
        new THREE.Vector3(half, 0.2, half),
        new THREE.Vector3(-half, 0.2, half),
        new THREE.Vector3(-half, 0.2, -half)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5 });
    printBedGroup.add(new THREE.Line(borderGeo, borderMat));
}

/***********************************************************************
 * 6. BINARY .STL EXPORTER (1:1 MILLIMETER WATERTIGHT MESH)
 ***********************************************************************/
function exportBinarySTL() {
    // Generate clean combined geometry for export
    const { geom: shadeGeom } = createShadeShellGeometry();
    const fitterGeom = createSocketFitterGeometry();
    const exportGeom = fitterGeom
        ? mergeBufferGeometries([shadeGeom, fitterGeom])
        : shadeGeom;

    const posAttr = exportGeom.getAttribute('position');
    const idxAttr = exportGeom.getIndex();
    const numTriangles = idxAttr.count / 3;

    // Binary STL layout: 80-byte header + 4-byte uint32 count + (50 bytes * numTriangles)
    const bufferLength = 84 + numTriangles * 50;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // Write 80-byte ASCII Header
    const headerText = `LuminaCAD Parametric Lamp Shade (${params.height}mm H, ${params.socketDiameter}mm Socket)`;
    for (let i = 0; i < 80; i++) {
        view.setUint8(i, i < headerText.length ? headerText.charCodeAt(i) : 32);
    }

    // Write Triangle Count
    view.setUint32(80, numTriangles, true);

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
        const i0 = idxAttr.getX(i * 3);
        const i1 = idxAttr.getX(i * 3 + 1);
        const i2 = idxAttr.getX(i * 3 + 2);

        // Note: Three.js is Y-up; slicers (PrusaSlicer, Bambu, Cura) expect Z-up!
        // Convert (X, Y, Z) -> (X, -Z, Y) so the shade stands upright on the print bed automatically.
        vA.set(posAttr.getX(i0), -posAttr.getZ(i0), posAttr.getY(i0));
        vB.set(posAttr.getX(i1), -posAttr.getZ(i1), posAttr.getY(i1));
        vC.set(posAttr.getX(i2), -posAttr.getZ(i2), posAttr.getY(i2));

        // Compute face normal
        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab).normalize();

        // Normal
        view.setFloat32(offset, cb.x, true); offset += 4;
        view.setFloat32(offset, cb.y, true); offset += 4;
        view.setFloat32(offset, cb.z, true); offset += 4;

        // Vertex 1
        view.setFloat32(offset, vA.x, true); offset += 4;
        view.setFloat32(offset, vA.y, true); offset += 4;
        view.setFloat32(offset, vA.z, true); offset += 4;

        // Vertex 2
        view.setFloat32(offset, vB.x, true); offset += 4;
        view.setFloat32(offset, vB.y, true); offset += 4;
        view.setFloat32(offset, vB.z, true); offset += 4;

        // Vertex 3
        view.setFloat32(offset, vC.x, true); offset += 4;
        view.setFloat32(offset, vC.y, true); offset += 4;
        view.setFloat32(offset, vC.z, true); offset += 4;

        // 2-byte attribute byte count
        view.setUint16(offset, 0, true); offset += 2;
    }

    // Trigger File Download
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LuminaCAD_Shade_${params.patternType}_${params.height}mm.stl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(
        'Binary STL Exported!',
        `Saved ${numTriangles.toLocaleString()} triangles (Z-up, 1:1 mm) ready for Bambu Studio / PrusaSlicer.`
    );
}

/***********************************************************************
 * 7. UI CONTROLS, PRESETS, LIGHTING & CAMERA BINDINGS
 ***********************************************************************/
function bindUIControls() {
    const paramKeys = Object.keys(defaultParams);

    paramKeys.forEach((key) => {
        const el = document.getElementById(`param-${key}`);
        if (!el) return;

        el.addEventListener('input', () => {
            const val = el.type === 'range' ? parseFloat(el.value) : el.value;
            params[key] = val;
            syncUILabels();
            rebuildLampGeometry();
        });
    });
}

function syncUILabels() {
    // Update DOM inputs to match `params`
    Object.keys(params).forEach((key) => {
        const el = document.getElementById(`param-${key}`);
        if (el && el.value !== String(params[key])) {
            el.value = params[key];
        }
    });

    // Formatted Value Labels
    document.getElementById('val-height').textContent = `${params.height} mm`;
    document.getElementById('val-bottomRadius').textContent = `${params.bottomRadius} mm`;
    document.getElementById('val-bottomDia').textContent = `Ø${params.bottomRadius * 2}`;
    document.getElementById('val-topRadius').textContent = `${params.topRadius} mm`;
    document.getElementById('val-topDia').textContent = `Ø${params.topRadius * 2}`;
    document.getElementById('val-wallThickness').textContent = `${params.wallThickness.toFixed(1)} mm`;

    const bSign = params.profileBulge >= 0 ? '+' : '';
    document.getElementById('val-profileBulge').textContent = `${bSign}${params.profileBulge} mm`;
    document.getElementById('val-profilePeak').textContent = `${params.profilePeak}%`;

    document.getElementById('val-ribCount').textContent = `${params.ribCount}`;
    document.getElementById('val-ribDepth').textContent = `${params.ribDepth.toFixed(1)} mm`;
    document.getElementById('val-twistAngle').textContent = `${params.twistAngle}°`;

    let sharpText = 'Smooth Sine';
    if (params.ribSharpness > 75) sharpText = 'Razor Pleats';
    else if (params.ribSharpness > 35) sharpText = 'Crisp Crease';
    document.getElementById('val-ribSharpness').textContent = sharpText;

    document.getElementById('val-vertFreq').textContent = `${params.vertFreq.toFixed(1)}x`;
    document.getElementById('val-vertAmp').textContent = `${params.vertAmp.toFixed(1)} mm`;

    document.getElementById('val-socketDiameter').textContent = `${params.socketDiameter.toFixed(1)} mm`;
    document.getElementById('val-ringWidth').textContent = `${params.ringWidth.toFixed(1)} mm`;
    document.getElementById('val-spokeCount').textContent = `${params.spokeCount} Spokes`;
    document.getElementById('val-spokeWidth').textContent = `${params.spokeWidth}mm`;
    document.getElementById('val-spokeHeight').textContent = `${params.spokeHeight}mm`;
    document.getElementById('val-fitterOffset').textContent = `${params.fitterOffset} mm`;

    document.getElementById('val-radialSegs').textContent = `${params.radialSegs}`;
    document.getElementById('val-heightSegs').textContent = `${params.heightSegs}`;

    // Show/hide spider fitter details if solid_base or none selected
    const detailsGroup = document.getElementById('fitter-details-group');
    if (params.mountPosition === 'bottom' || params.mountPosition === 'top') {
        detailsGroup.style.display = 'block';
    } else {
        detailsGroup.style.display = 'none';
    }
}

function applySocketStandard(val) {
    if (val === 'custom') return;
    params.socketDiameter = parseFloat(val);
    syncUILabels();
    rebuildLampGeometry();
}

function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;
    params = { ...defaultParams, ...p };

    // Highlight active pill
    document.querySelectorAll('.preset-pill').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`preset-${presetKey}`);
    if (activeBtn) activeBtn.classList.add('active');

    syncUILabels();
    rebuildLampGeometry();
}

function randomizeDesign() {
    const profiles = ['bulbous', 'conical', 'bell', 'hourglass', 'teardrop', 'pagoda'];
    const patterns = ['spiral_ribs', 'origami', 'diamond', 'vertical_ribs', 'ripples', 'faceted'];

    params.height = Math.floor(150 + Math.random() * 110);
    params.bottomRadius = Math.floor(55 + Math.random() * 45);
    params.topRadius = Math.floor(40 + Math.random() * 45);
    params.profileType = profiles[Math.floor(Math.random() * profiles.length)];
    params.profileBulge = Math.floor(-15 + Math.random() * 50);
    params.profilePeak = Math.floor(30 + Math.random() * 45);

    params.patternType = patterns[Math.floor(Math.random() * patterns.length)];
    params.ribCount = Math.floor(8 + Math.random() * 32);
    params.ribDepth = Math.round((3 + Math.random() * 12) * 2) / 2;
    params.twistAngle = Math.floor((-240 + Math.random() * 480) / 15) * 15;
    params.ribSharpness = Math.floor(Math.random() * 20) * 5;
    params.vertFreq = Math.floor(Math.random() * 10) / 2;
    params.vertAmp = Math.random() > 0.5 ? Math.round(Math.random() * 6) : 0;

    document.querySelectorAll('.preset-pill').forEach(btn => btn.classList.remove('active'));
    syncUILabels();
    rebuildLampGeometry();
}

function resetToDefault() {
    applyPreset('nordic');
}

// Convert Color Temperature in Kelvin (2200K - 6500K) to RGB Color
function kelvinToColor(kelvin) {
    const temp = kelvin / 100;
    let r, g, b;

    if (temp <= 66) {
        r = 255;
        g = 99.4708025861 * Math.log(temp) - 161.1195681661;
        b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
        r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        b = 255;
    }

    return new THREE.Color(
        Math.min(255, Math.max(0, r)) / 255,
        Math.min(255, Math.max(0, g)) / 255,
        Math.min(255, Math.max(0, b)) / 255
    );
}

let customLampColor = null;

function setCustomLampColor(hexColor) {
    if (!hexColor) return;
    customLampColor = hexColor;
    const col = new THREE.Color(hexColor);
    const effectiveIntensity = renderState.bulbOn ? (renderState.bulbPower / 100) * 2.2 : 0;

    // 1. Update 3D PointLight in real time
    if (bulbLight) {
        bulbLight.color.copy(col);
        bulbLight.intensity = effectiveIntensity;
    }

    // 2. Update visual 3D internal bulb mesh
    if (bulbGlowMesh && bulbGlowMesh.material) {
        bulbGlowMesh.material.color.copy(col).multiplyScalar(renderState.bulbOn ? 1.0 : 0.15);
    }

    // 3. Update subsurface shader transmission color
    if (litShadeMaterial && litShadeMaterial.userData.shader) {
        litShadeMaterial.userData.shader.uniforms.uBulbColor.value.copy(col);
        litShadeMaterial.userData.shader.uniforms.uBulbIntensity.value = effectiveIntensity;
    }

    // 4. Update UI input & hex label
    const picker = document.getElementById('picker-custom-lamp');
    const hexLabel = document.getElementById('label-custom-lamp-hex');
    if (picker) picker.value = hexColor;
    if (hexLabel) hexLabel.textContent = hexColor.toUpperCase();

    // 5. Update active swatch indicators
    document.querySelectorAll('.custom-color-swatch-btn').forEach(b => b.classList.remove('active'));
    const normalizedHex = hexColor.toLowerCase();
    const swatchMap = {
        '#f59e0b': 'swatch-color-amber',
        '#06b6d4': 'swatch-color-cyan',
        '#a855f7': 'swatch-color-violet',
        '#f8fafc': 'swatch-color-white'
    };
    const activeId = swatchMap[normalizedHex];
    if (activeId) {
        const btn = document.getElementById(activeId);
        if (btn) btn.classList.add('active');
    }
}

function resetCustomLampColor() {
    customLampColor = null;
    const picker = document.getElementById('picker-custom-lamp');
    const hexLabel = document.getElementById('label-custom-lamp-hex');
    if (picker) picker.value = '#f59e0b';
    if (hexLabel) hexLabel.textContent = '#F59E0B';

    document.querySelectorAll('.custom-color-swatch-btn').forEach(b => b.classList.remove('active'));
    const amberBtn = document.getElementById('swatch-color-amber');
    if (amberBtn) amberBtn.classList.add('active');

    updateLightingFromUI();
}

function updateLightingFromUI() {
    const powerEl = document.getElementById('ctrl-bulbPower');
    const kelvinEl = document.getElementById('ctrl-bulbKelvin');

    if (powerEl) renderState.bulbPower = parseFloat(powerEl.value);
    if (kelvinEl) renderState.bulbKelvin = parseFloat(kelvinEl.value);

    document.getElementById('val-bulbPower').textContent = `${renderState.bulbPower}%`;

    let kLabel = `${renderState.bulbKelvin}K`;
    if (renderState.bulbKelvin <= 3000) kLabel += ' Warm';
    else if (renderState.bulbKelvin <= 4500) kLabel += ' Neutral';
    else kLabel += ' Daylight';
    document.getElementById('val-bulbKelvin').textContent = kLabel;

    const bulbColor = customLampColor ? new THREE.Color(customLampColor) : kelvinToColor(renderState.bulbKelvin);
    const effectiveIntensity = renderState.bulbOn ? (renderState.bulbPower / 100) * 2.2 : 0;

    bulbLight.color.copy(bulbColor);
    bulbLight.intensity = effectiveIntensity;

    bulbGlowMesh.material.color.copy(bulbColor).multiplyScalar(renderState.bulbOn ? 1.0 : 0.15);

    if (litShadeMaterial.userData.shader) {
        litShadeMaterial.userData.shader.uniforms.uBulbColor.value.copy(bulbColor);
        litShadeMaterial.userData.shader.uniforms.uBulbIntensity.value = effectiveIntensity;
    }
}

function toggleBulb() {
    renderState.bulbOn = !renderState.bulbOn;
    const btn = document.getElementById('btn-bulb');
    if (renderState.bulbOn) {
        btn.className = 'px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center gap-1.5 hover:bg-amber-500/30 transition shrink-0';
        btn.innerHTML = '<i class="ph-fill ph-lightbulb text-sm"></i><span>Bulb ON</span>';
    } else {
        btn.className = 'px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 text-xs font-medium flex items-center gap-1.5 hover:bg-white/10 transition shrink-0';
        btn.innerHTML = '<i class="ph-bold ph-lightbulb text-sm"></i><span>Bulb OFF</span>';
    }
    updateLightingFromUI();
}

function toggleDarkRoom() {
    renderState.darkRoom = !renderState.darkRoom;
    const btn = document.getElementById('btn-room-mode');
    if (renderState.darkRoom) {
        scene.background.setHex(0x090a0d);
        scene.fog.color.setHex(0x090a0d);
        ambientLight.intensity = 0.25;
        studioDirLight.intensity = 0.45;
        studioFillLight.intensity = 0.22;
        btn.textContent = 'Dark Room';
    } else {
        scene.background.setHex(0x1e222b);
        scene.fog.color.setHex(0x1e222b);
        ambientLight.intensity = 0.75;
        studioDirLight.intensity = 1.15;
        studioFillLight.intensity = 0.55;
        btn.textContent = 'Bright Studio';
    }
}

function setMaterialPreset(type) {
    const presets = {
        warm_pla:   { color: 0xfff6e5, rough: 0.38, trans: 0.68 },
        clear_petg: { color: 0xf1f5f9, rough: 0.18, trans: 0.92 },
        terracotta: { color: 0xd96b43, rough: 0.65, trans: 0.35 },
        silk_gold:  { color: 0xeab308, rough: 0.22, trans: 0.45 },
        emerald:    { color: 0x10b981, rough: 0.25, trans: 0.72 },
        matte_black:{ color: 0x22252b, rough: 0.75, trans: 0.08 }
    };
    const p = presets[type];
    if (!p) return;

    renderState.filamentColor = p.color;
    renderState.filamentRoughness = p.rough;
    renderState.filamentTransmission = p.trans;

    litShadeMaterial.color.setHex(p.color);
    litShadeMaterial.roughness = p.rough;
    if (litShadeMaterial.userData.shader) {
        litShadeMaterial.userData.shader.uniforms.uTransmission.value = p.trans;
    }

    if (renderState.renderMode !== 'lit') {
        setRenderMode('lit');
    }
}

function setRenderMode(mode) {
    renderState.renderMode = mode;
    ['lit', 'overhang', 'normal'].forEach(m => {
        const btn = document.getElementById(`mode-${m}`);
        if (m === mode) {
            btn.classList.add('bg-white/10', 'text-white');
            btn.classList.remove('text-slate-300');
        } else {
            btn.classList.remove('bg-white/10', 'text-white');
            btn.classList.add('text-slate-300');
        }
    });

    const mat = getActiveMaterial();
    if (shadeMesh) shadeMesh.material = mat;
    if (fitterMesh) fitterMesh.material = mat;
}

function toggleWireframe() {
    renderState.wireframe = !renderState.wireframe;
    const btn = document.getElementById('btn-wireframe');
    if (renderState.wireframe) {
        btn.classList.add('bg-amber-500/20', 'text-amber-300');
    } else {
        btn.classList.remove('bg-amber-500/20', 'text-amber-300');
    }
    rebuildLampGeometry();
}

function setCameraView(view) {
    const halfH = params.height * 0.5;
    controls.target.set(0, halfH, 0);

    if (view === 'iso') {
        camera.position.set(270, halfH + 110, 310);
    } else if (view === 'front') {
        camera.position.set(0, halfH, 420);
    } else if (view === 'top') {
        camera.position.set(0, params.height + 280, 0.1);
    } else if (view === 'bottom') {
        camera.position.set(0, -280, 0.1);
    }
    controls.update();
}

function toggleSection(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.className = 'ph-bold ph-caret-down text-slate-400 text-xs';
    } else {
        el.classList.add('hidden');
        icon.className = 'ph-bold ph-caret-right text-slate-400 text-xs';
    }
}

function showToast(title, msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
    }, 4000);
}

/***********************************************************************
 * 8. GEMINI API INTEGRATION (TEXT/VISION-TO-CAD & SLICER ADVISOR)
 ***********************************************************************/
const apiKey = window.GEMINI_API_KEY || ""; // Provided by runtime environment

async function callGeminiAPI(payload, maxRetries = 4) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    let delay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Empty response from Gemini API');
            return JSON.parse(text);
        } catch (err) {
            if (attempt === maxRetries) throw err;
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
}

// Modal 1: AI Lamp Designer Controls
function openAIDesignerModal() {
    const modal = document.getElementById('ai-designer-modal');
    if (modal) modal.classList.remove('hidden');
    const status = document.getElementById('ai-designer-status');
    if (status) status.classList.add('hidden');
}

function closeAIDesignerModal() {
    const modal = document.getElementById('ai-designer-modal');
    if (modal) modal.classList.add('hidden');
}

function setQuickPrompt(text) {
    document.getElementById('ai-prompt-input').value = text;
}

function handleAIImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        uploadedAIImageMime = file.type || 'image/jpeg';
        uploadedAIImageBase64 = dataUrl.split(',')[1];

        document.getElementById('ai-image-preview').src = dataUrl;
        document.getElementById('ai-image-name').textContent = file.name;
        document.getElementById('ai-image-preview-wrap').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function clearAIImage() {
    uploadedAIImageBase64 = null;
    uploadedAIImageMime = null;
    document.getElementById('ai-image-input').value = '';
    document.getElementById('ai-image-preview-wrap').classList.add('hidden');
}

async function generateCADWithGemini() {
    const promptText = document.getElementById('ai-prompt-input').value.trim();
    const strictOverhang = document.getElementById('ai-strict-overhang').checked;
    const statusBox = document.getElementById('ai-designer-status');
    const btn = document.getElementById('btn-generate-cad');

    if (!promptText && !uploadedAIImageBase64) {
        statusBox.textContent = 'Please enter a design description or upload an inspiration photo.';
        statusBox.classList.remove('hidden');
        return;
    }

    statusBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i><span>Synthesizing CAD...</span>';

    const systemPrompt = `You are a master industrial lighting designer and 3D-printing parametric CAD engineer for LuminaCAD.
Convert the user's aesthetic request (and/or attached reference image) into a cohesive, mathematically sound, 3D-printable parametric lamp shade configuration.
Rules:
- All dimensions are in millimeters.
- height: 90 to 320
- bottomRadius: 35 to 130
- topRadius: 25 to 125
- wallThickness: 1.2 to 3.2 (use thinner walls like 1.4-1.8mm for warm translucent glow, thicker 2.2-3.0mm for structural/architectural shadows)
- profileType must be one of: "bulbous", "conical", "bell", "hourglass", "teardrop", "pagoda"
- profileBulge: -35 to 50
- profilePeak: 20 to 80
- patternType must be one of: "spiral_ribs", "origami", "diamond", "vertical_ribs", "ripples", "faceted", "smooth"
- ribCount: 4 to 60
- ribDepth: 0 to 18 (${strictOverhang ? 'keep ribDepth <= 10 and moderate bulge so overhangs stay under 45 degrees for support-free printing' : 'can be bold'})
- twistAngle: -360 to 360
- ribSharpness: 0 to 100
- vertFreq: 0 to 12
- vertAmp: 0 to 10
- mountPosition: "bottom" (table lamp), "top" (pendant), or "solid_base"
- filamentPreset must be one of: "warm_pla", "clear_petg", "terracotta", "silk_gold", "emerald", "matte_black"
- bulbKelvin: 2200 to 6000`;

    const userParts = [];
    if (promptText) {
        userParts.push({ text: `User design request: "${promptText}"` });
    } else {
        userParts.push({ text: `Analyze this inspiration image and design a 3D-printable lamp shade that complements or recreates its form, texture, and lighting mood.` });
    }

    if (uploadedAIImageBase64) {
        userParts.push({
            inlineData: {
                mimeType: uploadedAIImageMime,
                data: uploadedAIImageBase64
            }
        });
    }

    const payload = {
        contents: [{ role: 'user', parts: userParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    conceptName: { type: "STRING" },
                    designRationale: { type: "STRING" },
                    height: { type: "NUMBER" },
                    bottomRadius: { type: "NUMBER" },
                    topRadius: { type: "NUMBER" },
                    wallThickness: { type: "NUMBER" },
                    profileType: { type: "STRING", enum: ["bulbous", "conical", "bell", "hourglass", "teardrop", "pagoda"] },
                    profileBulge: { type: "NUMBER" },
                    profilePeak: { type: "NUMBER" },
                    patternType: { type: "STRING", enum: ["spiral_ribs", "origami", "diamond", "vertical_ribs", "ripples", "faceted", "smooth"] },
                    ribCount: { type: "NUMBER" },
                    ribDepth: { type: "NUMBER" },
                    twistAngle: { type: "NUMBER" },
                    ribSharpness: { type: "NUMBER" },
                    vertFreq: { type: "NUMBER" },
                    vertAmp: { type: "NUMBER" },
                    mountPosition: { type: "STRING", enum: ["bottom", "top", "solid_base"] },
                    filamentPreset: { type: "STRING", enum: ["warm_pla", "clear_petg", "terracotta", "silk_gold", "emerald", "matte_black"] },
                    bulbKelvin: { type: "NUMBER" }
                },
                required: [
                    "conceptName", "designRationale", "height", "bottomRadius", "topRadius",
                    "wallThickness", "profileType", "profileBulge", "profilePeak", "patternType",
                    "ribCount", "ribDepth", "twistAngle", "ribSharpness", "vertFreq", "vertAmp",
                    "mountPosition", "filamentPreset", "bulbKelvin"
                ]
            }
        }
    };

    try {
        const design = await callGeminiAPI(payload);

        // Clamp & apply parameters safely
        const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
        params.height = Math.round(clamp(design.height, 50, 340));
        params.bottomRadius = Math.round(clamp(design.bottomRadius, 25, 140));
        params.topRadius = Math.round(clamp(design.topRadius, 20, 140));
        params.wallThickness = Math.round(clamp(design.wallThickness, 0.8, 5.0) * 5) / 5;
        params.profileType = design.profileType;
        params.profileBulge = Math.round(clamp(design.profileBulge, -45, 65));
        params.profilePeak = Math.round(clamp(design.profilePeak, 15, 85));
        params.patternType = design.patternType;
        params.ribCount = Math.round(clamp(design.ribCount, 3, 64));
        params.ribDepth = Math.round(clamp(design.ribDepth, 0, 25) * 2) / 2;
        params.twistAngle = Math.round(clamp(design.twistAngle, -540, 540) / 5) * 5;
        params.ribSharpness = Math.round(clamp(design.ribSharpness, 0, 100) / 5) * 5;
        params.vertFreq = Math.round(clamp(design.vertFreq, 0, 14) * 2) / 2;
        params.vertAmp = Math.round(clamp(design.vertAmp, 0, 15) * 2) / 2;
        params.mountPosition = design.mountPosition;

        // Apply material and kelvin
        if (design.filamentPreset) setMaterialPreset(design.filamentPreset);
        if (design.bulbKelvin) {
            const k = Math.round(clamp(design.bulbKelvin, 2200, 6500) / 100) * 100;
            document.getElementById('ctrl-bulbKelvin').value = k;
            updateLightingFromUI();
        }

        document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
        syncUILabels();
        rebuildLampGeometry();

        // Show AI Concept Banner in Viewport
        document.getElementById('ai-concept-name').textContent = design.conceptName;
        document.getElementById('ai-concept-desc').textContent = design.designRationale;
        document.getElementById('ai-concept-banner').classList.remove('hidden');

        closeAIDesignerModal();
        showToast(`✨ ${design.conceptName}`, design.designRationale);
    } catch (error) {
        statusBox.textContent = 'Could not synthesize CAD geometry right now. Please try again.';
        statusBox.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph-bold ph-magic-wand"></i><span>Synthesize 3D Shade</span>';
    }
}

// Modal 2: AI Master Slicer & Printability Advisor
function openAISlicerModal() {
    const modal = document.getElementById('ai-slicer-modal');
    if (modal) {
        modal.classList.remove('hidden');
        runAISlicerAnalysis();
    }
}

function closeAISlicerModal() {
    const modal = document.getElementById('ai-slicer-modal');
    if (modal) modal.classList.add('hidden');
}

async function runAISlicerAnalysis() {
    const loadingEl = document.getElementById('ai-slicer-loading');
    const resultsEl = document.getElementById('ai-slicer-results');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');

    const telemetryPrompt = `Analyze this 3D-printable parametric lamp shade geometry and generate an expert FDM 3D printing slicer profile (for Bambu Studio / PrusaSlicer / Cura):
- Dimensions: Height=${params.height}mm, Bottom Diameter=${params.bottomRadius * 2}mm, Top Diameter=${params.topRadius * 2}mm
- Shell Wall Thickness: ${params.wallThickness}mm
- Silhouette Profile: ${params.profileType} (Bulge: ${params.profileBulge}mm at ${params.profilePeak}% height)
- Surface Pattern: ${params.patternType} (${params.ribCount} ribs, ${params.ribDepth}mm depth, ${params.twistAngle}° helical twist, sharpness ${params.ribSharpness}%, vertical ripple ${params.vertFreq}x @ ${params.vertAmp}mm)
- Socket Fitter Mount: ${params.mountPosition} (Hole Ø${params.socketDiameter}mm, ${params.spokeCount} spider struts)
- Estimated Max Overhang Angle: ${currentMaxOverhangDeg}°
- Estimated Weight: ${document.getElementById('stat-weight').textContent}`;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: telemetryPrompt }] }],
        systemInstruction: {
            parts: [{
                text: `You are a senior additive manufacturing engineer specializing in 3D printed lighting and translucent FDM shells.
Provide concrete, actionable slicer parameters for the exact geometry provided. Note that when a spider socket fitter ring is present, standard perimeters (0% infill or gyroid) are needed rather than single-wall Spiral Vase Mode, unless mountPosition is solid_base or none. If overhangs exceed 48 degrees, suggest a concrete parameter tweak in suggestedWallThickness and suggestedRibDepth.`
            }]
        },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    verdictTitle: { type: "STRING" },
                    verdictSummary: { type: "STRING" },
                    difficultyBadge: { type: "STRING", enum: ["EASY PRINT", "MODERATE OVERHANGS", "EXPERT TUNING NEEDED"] },
                    layerAndNozzle: { type: "STRING" },
                    wallsAndInfill: { type: "STRING" },
                    vaseModeCompatibility: { type: "STRING" },
                    seamPosition: { type: "STRING" },
                    supportsAndAdhesion: { type: "STRING" },
                    recommendedFilament: { type: "STRING" },
                    opticalAndThermalAdvice: { type: "STRING" },
                    slicerChecklist: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                    },
                    needsOptimization: { type: "BOOLEAN" },
                    optimizationReason: { type: "STRING" },
                    suggestedWallThickness: { type: "NUMBER" },
                    suggestedRibDepth: { type: "NUMBER" }
                },
                required: [
                    "verdictTitle", "verdictSummary", "difficultyBadge", "layerAndNozzle",
                    "wallsAndInfill", "vaseModeCompatibility", "seamPosition", "supportsAndAdhesion",
                    "recommendedFilament", "opticalAndThermalAdvice", "slicerChecklist",
                    "needsOptimization", "optimizationReason", "suggestedWallThickness", "suggestedRibDepth"
                ]
            }
        }
    };

    try {
        const advice = await callGeminiAPI(payload);

        document.getElementById('slicer-verdict-title').textContent = advice.verdictTitle;
        document.getElementById('slicer-verdict-summary').textContent = advice.verdictSummary;

        const badge = document.getElementById('slicer-difficulty-badge');
        badge.textContent = advice.difficultyBadge;
        if (advice.difficultyBadge === 'EASY PRINT') {
            badge.className = 'text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0';
        } else if (advice.difficultyBadge === 'MODERATE OVERHANGS') {
            badge.className = 'text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0';
        } else {
            badge.className = 'text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0';
        }

        document.getElementById('slicer-layer').textContent = advice.layerAndNozzle;
        document.getElementById('slicer-walls').textContent = advice.wallsAndInfill;
        document.getElementById('slicer-vase').textContent = advice.vaseModeCompatibility;
        document.getElementById('slicer-seam').textContent = advice.seamPosition;
        document.getElementById('slicer-supports').textContent = advice.supportsAndAdhesion;
        document.getElementById('slicer-filament').textContent = advice.recommendedFilament;
        document.getElementById('slicer-optical-notes').textContent = advice.opticalAndThermalAdvice;

        const listEl = document.getElementById('slicer-checklist');
        listEl.innerHTML = '';
        (advice.slicerChecklist || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            listEl.appendChild(li);
        });

        const autoBox = document.getElementById('slicer-autotune-box');
        if (advice.needsOptimization) {
            pendingAIOptimization = {
                wallThickness: advice.suggestedWallThickness,
                ribDepth: advice.suggestedRibDepth
            };
            document.getElementById('slicer-autotune-desc').textContent = advice.optimizationReason;
            autoBox.classList.remove('hidden');
        } else {
            pendingAIOptimization = null;
            autoBox.classList.add('hidden');
        }

        loadingEl.classList.add('hidden');
        resultsEl.classList.remove('hidden');
    } catch (err) {
        loadingEl.innerHTML = `<div class="text-xs text-rose-400">Unable to reach Gemini Slicer Advisor right now. Please try again.</div>`;
    }
}

function applyAISlicerOptimization() {
    if (!pendingAIOptimization) return;
    if (pendingAIOptimization.wallThickness) {
        params.wallThickness = Math.max(0.8, Math.min(4.0, Math.round(pendingAIOptimization.wallThickness * 5) / 5));
    }
    if (pendingAIOptimization.ribDepth !== undefined) {
        params.ribDepth = Math.max(0, Math.min(20, Math.round(pendingAIOptimization.ribDepth * 2) / 2));
    }
    syncUILabels();
    rebuildLampGeometry();
    document.getElementById('slicer-autotune-box').classList.add('hidden');
    showToast('✨ Printability Optimized', 'Updated wall thickness and rib depth per Gemini Slicer recommendations.');
}

function onWindowResize() {
    const container = document.getElementById('viewport-container');
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

/***********************************************************************
 * 9. MAIN ANIMATION LOOP
 ***********************************************************************/
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Global exposure for all inline HTML event handlers
window.applyPreset = applyPreset;
window.applySocketStandard = applySocketStandard;
window.randomizeDesign = randomizeDesign;
window.resetToDefault = resetToDefault;
window.exportBinarySTL = exportBinarySTL;
window.openAIDesignerModal = openAIDesignerModal;
window.closeAIDesignerModal = closeAIDesignerModal;
window.setQuickPrompt = setQuickPrompt;
window.handleAIImageUpload = handleAIImageUpload;
window.clearAIImage = clearAIImage;
window.generateCADWithGemini = generateCADWithGemini;
window.openAISlicerModal = openAISlicerModal;
window.closeAISlicerModal = closeAISlicerModal;
window.runAISlicerAnalysis = runAISlicerAnalysis;
window.applyAISlicerOptimization = applyAISlicerOptimization;
window.toggleDarkRoom = toggleDarkRoom;
window.setMaterialPreset = setMaterialPreset;
window.updateLightingFromUI = updateLightingFromUI;
window.setCustomLampColor = setCustomLampColor;
window.resetCustomLampColor = resetCustomLampColor;
window.toggleBulb = toggleBulb;
window.setRenderMode = setRenderMode;
window.toggleWireframe = toggleWireframe;
window.updatePrintBed = updatePrintBed;
window.setCameraView = setCameraView;
window.toggleSection = toggleSection;

/***********************************************************************
 * 10. CINEMATIC 3D ANIMATED INTRO (PIXEL FORMATION & PROCEDURAL LAMP)
 ***********************************************************************/
let introScene, introCamera, introRenderer, introAnimId;
let introLampGroup, introShadeMesh, introParticles, introSparks, introAmbientParticles;
let introBulbLight, introBulbCoreMesh, introKeyLight, introRimLight;
let introStartTime = 0;
let isIntroActive = false;

// Controlled 3D rotation state with natural inertia & limits
const introPointerState = {
    targetYaw: 0,
    targetPitch: 0,
    currentYaw: 0,
    currentPitch: 0,
    isInteracting: false,
    damping: 0.055, // Silky smooth inertia
    maxYaw: 0.55,   // ~31.5 deg max yaw (prevents flips/uncontrolled spinning)
    maxPitch: 0.28  // ~16 deg max pitch (controlled elevation angle)
};

function onIntroPointerMove(e) {
    if (!isIntroActive) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const normX = (e.clientX - width * 0.5) / (width * 0.5);
    const normY = (e.clientY - height * 0.5) / (height * 0.5);
    const clampedX = Math.max(-1, Math.min(1, normX));
    const clampedY = Math.max(-1, Math.min(1, normY));

    // Follow cursor direction naturally: moving right rotates lamp right, moving up tilts up
    introPointerState.targetYaw = clampedX * introPointerState.maxYaw;
    introPointerState.targetPitch = -clampedY * introPointerState.maxPitch;
    introPointerState.isInteracting = true;
}

function onIntroPointerLeave() {
    // When cursor leaves the lamp/intro area, smoothly return to original front-facing position
    introPointerState.targetYaw = 0;
    introPointerState.targetPitch = 0;
    introPointerState.isInteracting = false;
}

function onIntroTouchMove(e) {
    if (!isIntroActive || !e.touches || !e.touches[0]) return;
    const touch = e.touches[0];
    const width = window.innerWidth;
    const height = window.innerHeight;
    const normX = (touch.clientX - width * 0.5) / (width * 0.5);
    const normY = (touch.clientY - height * 0.5) / (height * 0.5);
    const clampedX = Math.max(-1, Math.min(1, normX));
    const clampedY = Math.max(-1, Math.min(1, normY));

    introPointerState.targetYaw = clampedX * introPointerState.maxYaw;
    introPointerState.targetPitch = -clampedY * introPointerState.maxPitch;
    introPointerState.isInteracting = true;
}

function onIntroTouchEnd() {
    introPointerState.targetYaw = 0;
    introPointerState.targetPitch = 0;
    introPointerState.isInteracting = false;
}

function createPixelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Outer soft glow
    const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(251, 191, 36, 0.95)');
    grad.addColorStop(0.75, 'rgba(245, 158, 11, 0.45)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();

    // Crisp pixelated center core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(13, 13, 6, 6);

    return new THREE.CanvasTexture(canvas);
}

function createMediumSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Rich luminous radial flare for medium glowing particles
    const grad = ctx.createRadialGradient(24, 24, 1, 24, 24, 23);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.25, 'rgba(254, 240, 138, 0.95)');
    grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.55)');
    grad.addColorStop(0.85, 'rgba(217, 119, 6, 0.18)');
    grad.addColorStop(1, 'rgba(217, 119, 6, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(24, 24, 23, 0, Math.PI * 2);
    ctx.fill();

    // Medium pixelated incandescent core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 20, 8, 8);

    return new THREE.CanvasTexture(canvas);
}

function buildIntroLampGeometry() {
    // Generate an exquisite parametric Scandinavian lamp shade with curved ribs and waves
    const hSegs = 90;
    const radSegs = 120;
    const H = 175;

    const geom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    function evalIntroRadius(v, theta) {
        // Bell-bulbous silhouette
        const baseR = 52 * (1 - v) + 38 * v + 24 * Math.sin(Math.pow(v, 0.85) * Math.PI);
        // 22 Spiral ribs with vertical twist
        const twist = 2.4 * v;
        const ribs = 22;
        const ribWave = Math.sin(ribs * (theta + twist));
        // Vertical ripple wave
        const vertWave = Math.sin(v * Math.PI * 2.8);
        const ribAmp = 7.5 * (0.35 + 0.65 * Math.sin(v * Math.PI));

        return Math.max(12, baseR + ribWave * ribAmp + vertWave * 2.5);
    }

    const wallThick = 2.2;
    const outerGrid = [];
    const innerGrid = [];

    for (let j = 0; j <= hSegs; j++) {
        const v = j / hSegs;
        const y = v * H;
        const outRow = [];
        const inRow = [];

        for (let i = 0; i < radSegs; i++) {
            const u = i / radSegs;
            const theta = u * Math.PI * 2;
            const rOut = evalIntroRadius(v, theta);
            const rIn = Math.max(4, rOut - wallThick);
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            // Outer vertex
            const outIdx = positions.length / 3;
            positions.push(rOut * cosT, y, rOut * sinT);
            outRow.push(outIdx);

            // Inner vertex
            const inIdx = positions.length / 3;
            positions.push(rIn * cosT, y, rIn * sinT);
            inRow.push(inIdx);
        }
        outerGrid.push(outRow);
        innerGrid.push(inRow);
    }

    // Outer & inner quads
    for (let j = 0; j < hSegs; j++) {
        for (let i = 0; i < radSegs; i++) {
            const nextI = (i + 1) % radSegs;
            const o0 = outerGrid[j][i];
            const o1 = outerGrid[j][nextI];
            const o2 = outerGrid[j + 1][i];
            const o3 = outerGrid[j + 1][nextI];
            indices.push(o0, o1, o2);
            indices.push(o1, o3, o2);

            const i0 = innerGrid[j][i];
            const i1 = innerGrid[j][nextI];
            const i2 = innerGrid[j + 1][i];
            const i3 = innerGrid[j + 1][nextI];
            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    // Bottom and top closing rims
    for (let i = 0; i < radSegs; i++) {
        const nextI = (i + 1) % radSegs;
        indices.push(outerGrid[0][i], innerGrid[0][i], outerGrid[0][nextI]);
        indices.push(innerGrid[0][i], innerGrid[0][nextI], outerGrid[0][nextI]);

        indices.push(outerGrid[hSegs][i], outerGrid[hSegs][nextI], innerGrid[hSegs][i]);
        indices.push(innerGrid[hSegs][i], outerGrid[hSegs][nextI], innerGrid[hSegs][nextI]);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
}

// 1. Primary Fine Structural Pixel Assembly (~3,500 voxels, size 4.0)
function createIntroParticleAssembly(shadeGeometry) {
    const posAttr = shadeGeometry.getAttribute('position');
    const totalVerts = posAttr.count;

    const count = 3500;
    const step = Math.max(1, Math.floor(totalVerts / count));
    const actualCount = Math.min(count, Math.floor(totalVerts / step));

    const positions = new Float32Array(actualCount * 3);
    const targetPositions = new Float32Array(actualCount * 3);
    const spreadPositions = new Float32Array(actualCount * 3);
    const corePositions = new Float32Array(actualCount * 3);
    const colors = new Float32Array(actualCount * 3);
    const delays = new Float32Array(actualCount);
    const durations = new Float32Array(actualCount);

    const colorPalette = [
        new THREE.Color(0xf59e0b), // Warm Amber
        new THREE.Color(0xfbbf24), // Gold
        new THREE.Color(0xfffbeb), // Warm Incandescent
        new THREE.Color(0x38bdf8), // Cyan Tech Accent
        new THREE.Color(0xffd28a)  // Filament Glow
    ];

    let pIdx = 0;
    for (let i = 0; i < totalVerts; i += step) {
        if (pIdx >= actualCount) break;

        const tx = posAttr.getX(i);
        const ty = posAttr.getY(i);
        const tz = posAttr.getZ(i);

        targetPositions[pIdx * 3] = tx;
        targetPositions[pIdx * 3 + 1] = ty;
        targetPositions[pIdx * 3 + 2] = tz;

        // Core origin (near central column)
        const coreX = (Math.random() - 0.5) * 16;
        const coreY = ty * 0.5 + 30 + (Math.random() - 0.5) * 25;
        const coreZ = (Math.random() - 0.5) * 16;
        corePositions[pIdx * 3] = coreX;
        corePositions[pIdx * 3 + 1] = coreY;
        corePositions[pIdx * 3 + 2] = coreZ;

        // Spread position: blossomed outward into space before gathering
        const baseRad = Math.sqrt(tx * tx + tz * tz);
        const spreadDist = baseRad * (2.4 + Math.random() * 1.5) + (Math.random() * 60 + 25);
        const spreadAngle = Math.atan2(tz, tx) + (Math.random() - 0.5) * 1.7;
        const sx = spreadDist * Math.cos(spreadAngle);
        const sy = ty + (Math.random() - 0.5) * 110 + 10;
        const sz = spreadDist * Math.sin(spreadAngle);

        spreadPositions[pIdx * 3] = sx;
        spreadPositions[pIdx * 3 + 1] = sy;
        spreadPositions[pIdx * 3 + 2] = sz;

        // Initial starting position at core
        positions[pIdx * 3] = coreX;
        positions[pIdx * 3 + 1] = coreY;
        positions[pIdx * 3 + 2] = coreZ;

        // Color selection
        const rand = Math.random();
        let col = colorPalette[0];
        if (rand < 0.35) col = colorPalette[1];
        else if (rand < 0.65) col = colorPalette[2];
        else if (rand < 0.88) col = colorPalette[4];
        else col = colorPalette[3]; // Subtle cyan accent

        colors[pIdx * 3] = col.r;
        colors[pIdx * 3 + 1] = col.g;
        colors[pIdx * 3 + 2] = col.b;

        // Individualized assembly delay (0.4s to 1.6s)
        delays[pIdx] = 0.4 + Math.random() * 1.2;
        durations[pIdx] = 1.1 + Math.random() * 0.6;

        pIdx++;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pTexture = createPixelTexture();
    const particleMat = new THREE.PointsMaterial({
        size: 4.0,
        map: pTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const points = new THREE.Points(particleGeom, particleMat);
    points.userData = {
        targetPositions,
        spreadPositions,
        corePositions,
        delays,
        durations,
        count: actualCount
    };
    return points;
}

// 2. Radiant Medium Glowing Accent Sparks (~850 sparks, size 6.8)
function createIntroSparksAssembly(shadeGeometry) {
    const posAttr = shadeGeometry.getAttribute('position');
    const totalVerts = posAttr.count;

    const count = 850;
    const step = Math.max(1, Math.floor(totalVerts / count));
    const actualCount = Math.min(count, Math.floor(totalVerts / step));

    const positions = new Float32Array(actualCount * 3);
    const targetPositions = new Float32Array(actualCount * 3);
    const spreadPositions = new Float32Array(actualCount * 3);
    const corePositions = new Float32Array(actualCount * 3);
    const colors = new Float32Array(actualCount * 3);
    const delays = new Float32Array(actualCount);
    const durations = new Float32Array(actualCount);

    const sparkPalette = [
        new THREE.Color(0xfbbf24), // Vibrant Gold
        new THREE.Color(0xf59e0b), // Radiant Amber
        new THREE.Color(0xfffbeb), // White Hot Core
        new THREE.Color(0xffe082)  // Luminous Candlelight
    ];

    let pIdx = 0;
    for (let i = 3; i < totalVerts; i += step) {
        if (pIdx >= actualCount) break;

        const tx = posAttr.getX(i);
        const ty = posAttr.getY(i);
        const tz = posAttr.getZ(i);

        targetPositions[pIdx * 3] = tx;
        targetPositions[pIdx * 3 + 1] = ty;
        targetPositions[pIdx * 3 + 2] = tz;

        // Core origin
        const coreX = (Math.random() - 0.5) * 12;
        const coreY = ty * 0.5 + 40 + (Math.random() - 0.5) * 20;
        const coreZ = (Math.random() - 0.5) * 12;
        corePositions[pIdx * 3] = coreX;
        corePositions[pIdx * 3 + 1] = coreY;
        corePositions[pIdx * 3 + 2] = coreZ;

        // Wider outward dispersion for medium accent sparks
        const baseRad = Math.sqrt(tx * tx + tz * tz);
        const spreadDist = baseRad * (2.7 + Math.random() * 1.8) + (Math.random() * 70 + 35);
        const spreadAngle = Math.atan2(tz, tx) + (Math.random() - 0.5) * 2.0;
        const sx = spreadDist * Math.cos(spreadAngle);
        const sy = ty + (Math.random() - 0.5) * 130 + 15;
        const sz = spreadDist * Math.sin(spreadAngle);

        spreadPositions[pIdx * 3] = sx;
        spreadPositions[pIdx * 3 + 1] = sy;
        spreadPositions[pIdx * 3 + 2] = sz;

        positions[pIdx * 3] = coreX;
        positions[pIdx * 3 + 1] = coreY;
        positions[pIdx * 3 + 2] = coreZ;

        const rand = Math.random();
        const col = rand < 0.45 ? sparkPalette[0] : (rand < 0.75 ? sparkPalette[1] : sparkPalette[2]);
        colors[pIdx * 3] = col.r;
        colors[pIdx * 3 + 1] = col.g;
        colors[pIdx * 3 + 2] = col.b;

        // Staggered assembly delay (0.55s to 1.75s)
        delays[pIdx] = 0.55 + Math.random() * 1.2;
        durations[pIdx] = 1.15 + Math.random() * 0.65;

        pIdx++;
    }

    const sparkGeom = new THREE.BufferGeometry();
    sparkGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const sTexture = createMediumSparkTexture();
    const sparkMat = new THREE.PointsMaterial({
        size: 6.8, // Medium glowing pixels
        map: sTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const sparks = new THREE.Points(sparkGeom, sparkMat);
    sparks.userData = {
        targetPositions,
        spreadPositions,
        corePositions,
        delays,
        durations,
        count: actualCount
    };
    return sparks;
}

// 3. Ambient Floating Background Pixels (160 particles)
function createIntroAmbientParticles() {
    const count = 160;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifespans = new Float32Array(count);
    const maxLifespans = new Float32Array(count);

    const warmAmber = new THREE.Color(0xf59e0b);
    const softGold = new THREE.Color(0xfbbf24);
    const brightWhite = new THREE.Color(0xfffbeb);

    for (let i = 0; i < count; i++) {
        const radius = Math.random() * 135 + 20;
        const angle = Math.random() * Math.PI * 2;
        positions[i * 3] = radius * Math.cos(angle);
        positions[i * 3 + 1] = Math.random() * 195 - 10;
        positions[i * 3 + 2] = radius * Math.sin(angle);

        velocities[i * 3] = (Math.random() - 0.5) * 0.35;
        velocities[i * 3 + 1] = Math.random() * 0.45 + 0.2;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.35;

        maxLifespans[i] = Math.random() * 3.5 + 2.0;
        lifespans[i] = Math.random() * maxLifespans[i];

        const r = Math.random();
        const c = r < 0.45 ? warmAmber : (r < 0.8 ? softGold : brightWhite);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: 3.4,
        map: createPixelTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const points = new THREE.Points(geom, mat);
    points.userData = { velocities, lifespans, maxLifespans, count };
    return points;
}

// Particle update simulation: handles outward spread then inward gathering
function updateParticleCloud(cloud, elapsed) {
    if (!cloud) return;
    const posAttr = cloud.geometry.getAttribute('position');
    const pos = posAttr.array;
    const { targetPositions, spreadPositions, corePositions, delays, durations, count } = cloud.userData;

    // Blossom ease for initial outward dispersion (0 to 0.65s)
    const blossomT = Math.min(1.0, elapsed / 0.65);
    const blossomEase = Math.sin(blossomT * Math.PI * 0.5);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const delay = delays[i];
        const dur = durations[i];

        const coreX = corePositions[i3];
        const coreY = corePositions[i3 + 1];
        const coreZ = corePositions[i3 + 2];

        const sprX = spreadPositions[i3];
        const sprY = spreadPositions[i3 + 1];
        const sprZ = spreadPositions[i3 + 2];

        // Organic floating drift before locking into place
        const driftX = Math.sin(elapsed * 1.5 + i * 0.3) * 2.2;
        const driftY = Math.cos(elapsed * 1.2 + i * 0.2) * 2.0;
        const driftZ = Math.cos(elapsed * 1.5 + i * 0.3) * 2.2;

        const curSprX = coreX + (sprX - coreX) * blossomEase + driftX;
        const curSprY = coreY + (sprY - coreY) * blossomEase + driftY;
        const curSprZ = coreZ + (sprZ - coreZ) * blossomEase + driftZ;

        if (elapsed < delay) {
            // Phase 1: Visible outward pixel spreading & gentle drifting
            pos[i3] = curSprX;
            pos[i3 + 1] = curSprY;
            pos[i3 + 2] = curSprZ;
        } else {
            // Phase 2: Inward gathering with smooth acceleration & curved flight
            const t = Math.min(1.0, (elapsed - delay) / dur);
            if (t >= 1.0) {
                // Final polished watertight assembly lock
                pos[i3] = targetPositions[i3];
                pos[i3 + 1] = targetPositions[i3 + 1];
                pos[i3 + 2] = targetPositions[i3 + 2];
            } else {
                // Smooth cubic ease out with slight spiral curve
                const ease = 1 - Math.pow(1 - t, 3.2);
                const spiral = Math.sin(t * Math.PI) * (1 - t) * 4.5;
                const sinI = Math.sin(i);
                const cosI = Math.cos(i);

                pos[i3] = curSprX + (targetPositions[i3] - curSprX) * ease + spiral * cosI;
                pos[i3 + 1] = curSprY + (targetPositions[i3 + 1] - curSprY) * ease;
                pos[i3 + 2] = curSprZ + (targetPositions[i3 + 2] - curSprZ) * ease + spiral * sinI;
            }
        }
    }
    posAttr.needsUpdate = true;
}

function updateIntroParticles(elapsed) {
    // 1. Update fine structural voxels
    updateParticleCloud(introParticles, elapsed);

    // 2. Update medium glowing accent sparks
    updateParticleCloud(introSparks, elapsed);

    // 3. Ambient floating background sparkles
    if (introAmbientParticles) {
        const ambPosAttr = introAmbientParticles.geometry.getAttribute('position');
        const ambPos = ambPosAttr.array;
        const { velocities, lifespans, maxLifespans, count: ambCount } = introAmbientParticles.userData;

        for (let i = 0; i < ambCount; i++) {
            const i3 = i * 3;
            lifespans[i] += 0.016;

            ambPos[i3] += velocities[i3] + Math.sin(elapsed + i) * 0.12;
            ambPos[i3 + 1] += velocities[i3 + 1];
            ambPos[i3 + 2] += velocities[i3 + 2] + Math.cos(elapsed + i) * 0.12;

            if (lifespans[i] > maxLifespans[i] || ambPos[i3 + 1] > 220) {
                // Respawn at bottom
                lifespans[i] = 0;
                const r = Math.random() * 120 + 20;
                const a = Math.random() * Math.PI * 2;
                ambPos[i3] = r * Math.cos(a);
                ambPos[i3 + 1] = Math.random() * 20;
                ambPos[i3 + 2] = r * Math.sin(a);
            }
        }
        ambPosAttr.needsUpdate = true;
    }
}

function buildIntroLampAssembly() {
    introLampGroup = new THREE.Group();

    // 1. Procedural Shade Geometry
    const shadeGeo = buildIntroLampGeometry();
    const shadeMat = new THREE.MeshStandardMaterial({
        color: 0xfff7ea,
        roughness: 0.28,
        metalness: 0.08,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0 // Fades in as particles lock into place
    });
    introShadeMesh = new THREE.Mesh(shadeGeo, shadeMat);
    introLampGroup.add(introShadeMesh);

    // 2. Primary Particle Assembly System (Fine voxels ~3,500)
    introParticles = createIntroParticleAssembly(shadeGeo);
    introLampGroup.add(introParticles);

    // 3. Medium Radiant Sparks (~850 glowing accent pixels)
    introSparks = createIntroSparksAssembly(shadeGeo);
    introLampGroup.add(introSparks);

    // 4. Ambient Floating Pixels (160)
    introAmbientParticles = createIntroAmbientParticles();
    introLampGroup.add(introAmbientParticles);

    // 5. Lamp Stand: Weighted Base + Slender Stem + Socket Fitter
    const baseGroup = new THREE.Group();
    // Weighted base disc
    const baseGeo = new THREE.CylinderGeometry(52, 58, 8, 48);
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.38, metalness: 0.85 });
    const baseMesh = new THREE.Mesh(baseGeo, darkMetalMat);
    baseMesh.position.y = 4;
    baseGroup.add(baseMesh);

    // Brushed bevel ring on base
    const ringGeo = new THREE.TorusGeometry(53, 1.2, 16, 48);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.3, metalness: 0.9 });
    const ringMesh = new THREE.Mesh(ringGeo, brassMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 7.5;
    baseGroup.add(ringMesh);

    // Slender brass stem
    const stemGeo = new THREE.CylinderGeometry(4.2, 4.2, 90, 24);
    const stemMesh = new THREE.Mesh(stemGeo, brassMat);
    stemMesh.position.y = 52;
    baseGroup.add(stemMesh);

    // Hardware socket collar at shade base
    const collarGeo = new THREE.CylinderGeometry(16, 16, 14, 32);
    const collarMesh = new THREE.Mesh(collarGeo, darkMetalMat);
    collarMesh.position.y = 96;
    baseGroup.add(collarMesh);

    introLampGroup.add(baseGroup);

    // 6. Internal Lamp Bulb & PointLight
    const bulbGeo = new THREE.SphereGeometry(20, 28, 28);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: 0.2 });
    introBulbCoreMesh = new THREE.Mesh(bulbGeo, bulbMat);
    introBulbCoreMesh.position.y = 115;
    introLampGroup.add(introBulbCoreMesh);

    introBulbLight = new THREE.PointLight(0xffa83b, 0, 800, 1.7);
    introBulbLight.position.set(0, 115, 0);
    introLampGroup.add(introBulbLight);

    introScene.add(introLampGroup);
}

function initLuminaIntro() {
    const canvas = document.getElementById('intro-canvas');
    const container = document.getElementById('lumina-intro');
    if (!canvas || !container) return;

    introScene = new THREE.Scene();
    introScene.fog = new THREE.FogExp2(0x08090d, 0.00085);

    const width = window.innerWidth;
    const height = window.innerHeight;

    introCamera = new THREE.PerspectiveCamera(40, width / height, 1, 3000);
    introCamera.position.set(0, 95, 360);
    introCamera.lookAt(0, 80, 0);

    introRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    introRenderer.setSize(width, height);
    introRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    introRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    introRenderer.toneMappingExposure = 1.15;

    // Cinematic Studio Lighting
    const ambientLight = new THREE.AmbientLight(0x141824, 0.4);
    introScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffecc4, 0.72);
    keyLight.position.set(180, 280, 220);
    introScene.add(keyLight);
    introKeyLight = keyLight;

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.42);
    rimLight.position.set(-220, 160, -200);
    introScene.add(rimLight);
    introRimLight = rimLight;

    buildIntroLampAssembly();

    // Initialize Interactive Color Ring & Intro Audio
    initColorRing();
    initIntroAudio();

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Event listeners for window resize & 3D interactive rotation
    window.addEventListener('resize', onIntroResize);
    window.addEventListener('pointermove', onIntroPointerMove);
    container.addEventListener('pointerleave', onIntroPointerLeave);
    window.addEventListener('touchmove', onIntroTouchMove, { passive: true });
    window.addEventListener('touchend', onIntroTouchEnd);
    window.addEventListener('touchcancel', onIntroTouchEnd);

    introStartTime = performance.now();
    isIntroActive = true;

    // Reset pointer rotation state
    introPointerState.targetYaw = 0;
    introPointerState.targetPitch = 0;
    introPointerState.currentYaw = 0;
    introPointerState.currentPitch = 0;
    introPointerState.isInteracting = false;

    // Intro Animation Loop
    function introLoop(time) {
        if (!isIntroActive) return;
        introAnimId = requestAnimationFrame(introLoop);

        const elapsed = (time - introStartTime) / 1000;

        // 1. Particle Assembly Update (outward spread blossom then inward lock)
        updateIntroParticles(elapsed);

        // 2. Translucent Shade Fade-In as Particles arrive
        if (introShadeMesh) {
            if (prefersReducedMotion) {
                introShadeMesh.material.opacity = 1.0;
            } else if (elapsed > 1.6) {
                const fadeT = Math.min(1.0, (elapsed - 1.6) / 1.0);
                introShadeMesh.material.opacity = fadeT;
            }
        }

        // 3. Realistic Warm Light Gradual Illumination & Blinking
        if (introBulbLight && introBulbCoreMesh) {
            if (prefersReducedMotion) {
                introBulbLight.intensity = 2.4;
                introBulbCoreMesh.material.opacity = 1.0;
            } else if (elapsed < 1.1) {
                introBulbLight.intensity = 0.05;
                introBulbCoreMesh.material.opacity = 0.15;
            } else if (elapsed < 1.3) {
                // Initial warm ignition spark
                const spark = (elapsed - 1.1) / 0.2;
                introBulbLight.intensity = spark * 1.2;
                introBulbCoreMesh.material.opacity = spark * 0.7;
            } else if (elapsed < 1.55) {
                // Soft filament dip / warm up
                introBulbLight.intensity = 0.4;
                introBulbCoreMesh.material.opacity = 0.35;
            } else if (elapsed < 2.2) {
                // Radiant blossoming illumination
                const t = (elapsed - 1.55) / 0.65;
                introBulbLight.intensity = 0.4 + t * 2.2;
                introBulbCoreMesh.material.opacity = 0.35 + t * 0.65;
            } else {
                // Smooth breathing pulse synchronized with title text
                const pulse = Math.sin(elapsed * 1.8);
                introBulbLight.intensity = 2.4 + 0.4 * pulse;
                introBulbCoreMesh.material.opacity = 0.9 + 0.1 * pulse;
            }
        }

        // 4. Interactive 3D Rotation with Premium Inertia, Depth & Specular Reflections
        if (introLampGroup && !prefersReducedMotion) {
            // Silky smooth inertia damping
            introPointerState.currentYaw += (introPointerState.targetYaw - introPointerState.currentYaw) * introPointerState.damping;
            introPointerState.currentPitch += (introPointerState.targetPitch - introPointerState.currentPitch) * introPointerState.damping;

            // Controlled 3D rotation following cursor naturally (no flip or uncontrolled spin)
            introLampGroup.rotation.y = introPointerState.currentYaw;
            introLampGroup.rotation.x = introPointerState.currentPitch;

            // Dynamic lighting reflection shifts
            if (introKeyLight) {
                introKeyLight.position.x = 180 + introPointerState.currentYaw * 55;
                introKeyLight.position.y = 280 - introPointerState.currentPitch * 40;
            }

            // Realistic perspective depth parallax
            introCamera.position.x = -introPointerState.currentYaw * 32;
            introCamera.position.y = 95 - introPointerState.currentPitch * 22;
            introCamera.position.z = 360;
            introCamera.lookAt(0, 80, 0);
        }

        // 5. UI Elements Reveal Progression
        const subtitle = document.getElementById('intro-subtitle');
        const bulbSection = document.getElementById('intro-bulb-section');

        if (subtitle && elapsed > 1.0) subtitle.classList.remove('opacity-0');

        if (bulbSection && (elapsed > 2.0 || prefersReducedMotion)) {
            bulbSection.classList.remove('opacity-0', 'translate-y-3');
        }

        introRenderer.render(introScene, introCamera);
    }

    introAnimId = requestAnimationFrame(introLoop);
}

function onIntroResize() {
    if (!introRenderer || !introCamera) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    introCamera.aspect = width / height;
    introCamera.updateProjectionMatrix();
    introRenderer.setSize(width, height);
}

/***********************************************************************
 * 11. INTRO AUDIO MANAGEMENT (MP3 PLAYBACK & AUTOPLAY RECOVERY)
 ***********************************************************************/
let introAudio = null;
let isAudioMuted = false;

function initIntroAudio() {
    const audioBtn = document.getElementById('btn-intro-audio');
    if (!audioBtn) return;

    if (!introAudio) {
        introAudio = new Audio('moon.mp3');
        introAudio.loop = true;
        introAudio.volume = 0.75;
    }

    const audioIcon = document.getElementById('intro-audio-icon');
    const audioLabel = document.getElementById('intro-audio-label');

    // Attempt to start playback when permitted by browser
    introAudio.play().then(() => {
        isAudioMuted = false;
        if (audioLabel) audioLabel.textContent = 'Music: ON';
        if (audioIcon) audioIcon.className = 'ph-fill ph-speaker-high text-amber-400 text-sm animate-pulse';
        if (audioBtn) audioBtn.classList.remove('ring-2', 'ring-amber-400', 'animate-pulse');
    }).catch(() => {
        // Autoplay blocked by browser policy: present clear, accessible sound control
        if (audioLabel) audioLabel.textContent = 'Enable Sound';
        if (audioIcon) audioIcon.className = 'ph-fill ph-speaker-slash text-amber-300 text-sm animate-bounce';
        if (audioBtn) {
            audioBtn.classList.add('ring-2', 'ring-amber-400', 'animate-pulse');
        }

        // Also resume on first pointer interaction with intro
        const onFirstInteract = () => {
            if (isIntroActive && introAudio && introAudio.paused && !isAudioMuted) {
                introAudio.play().then(() => {
                    if (audioLabel) audioLabel.textContent = 'Music: ON';
                    if (audioIcon) audioIcon.className = 'ph-fill ph-speaker-high text-amber-400 text-sm animate-pulse';
                    if (audioBtn) audioBtn.classList.remove('ring-2', 'ring-amber-400', 'animate-pulse');
                }).catch(() => {});
            }
            window.removeEventListener('pointerdown', onFirstInteract);
        };
        window.addEventListener('pointerdown', onFirstInteract, { once: true });
    });
}

function toggleIntroAudio() {
    const audioBtn = document.getElementById('btn-intro-audio');
    if (!audioBtn) return;

    if (!introAudio) {
        initIntroAudio();
        return;
    }

    const audioIcon = document.getElementById('intro-audio-icon');
    const audioLabel = document.getElementById('intro-audio-label');

    if (introAudio.paused) {
        introAudio.play().then(() => {
            isAudioMuted = false;
            if (audioLabel) audioLabel.textContent = 'Music: ON';
            if (audioIcon) audioIcon.className = 'ph-fill ph-speaker-high text-amber-400 text-sm animate-pulse';
            if (audioBtn) audioBtn.classList.remove('ring-2', 'ring-amber-400', 'animate-pulse');
        }).catch(console.error);
    } else {
        introAudio.pause();
        isAudioMuted = true;
        if (audioLabel) audioLabel.textContent = 'Music: OFF';
        if (audioIcon) audioIcon.className = 'ph-fill ph-speaker-slash text-slate-400 text-sm';
        if (audioBtn) audioBtn.classList.remove('ring-2', 'ring-amber-400', 'animate-pulse');
    }
}

function stopIntroAudio() {
    if (introAudio) {
        introAudio.pause();
        introAudio.currentTime = 0;
    }
}

/***********************************************************************
 * 12. CIRCULAR MULTICOLOR RING & REACTIVE BULB GLOW
 ***********************************************************************/
let currentRingHue = 38; // Default warm amber hue (38 deg)
let isDraggingRing = false;

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function updateColorRing(hue, updateThumbPos = true) {
    currentRingHue = ((hue % 360) + 360) % 360;
    const hex = hslToHex(currentRingHue, 100, 52);
    const colorHsl = `hsl(${currentRingHue}, 100%, 52%)`;
    const glowHsl = `hsla(${currentRingHue}, 100%, 52%, 0.45)`;

    // Update CSS variables for bulb and ring
    document.documentElement.style.setProperty('--bulb-hue', currentRingHue);
    document.documentElement.style.setProperty('--current-color', colorHsl);
    document.documentElement.style.setProperty('--current-glow', glowHsl);

    // Update readout labels and swatches
    const swatch = document.getElementById('color-swatch-dot');
    const label = document.getElementById('color-hex-label');
    const thumb = document.getElementById('color-ring-thumb');

    if (swatch) swatch.style.backgroundColor = colorHsl;
    if (label) label.textContent = hex;

    // Update thumb position along the circular track
    if (updateThumbPos && thumb) {
        const container = document.getElementById('color-ring-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            const radius = (rect.width / 2) - 6; // Center of 12px ring band
            const rad = (currentRingHue * Math.PI) / 180;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const x = cx + radius * Math.cos(rad);
            const y = cy + radius * Math.sin(rad);
            thumb.style.left = `${x}px`;
            thumb.style.top = `${y}px`;
            thumb.setAttribute('aria-valuenow', Math.round(currentRingHue));
        }
    }

    // Reactively update 3D intro rim light to harmonize with chosen color
    if (introRimLight) {
        introRimLight.color.setStyle(colorHsl);
    }
}

function handleRingPointer(e) {
    const container = document.getElementById('color-ring-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;

    updateColorRing(deg, true);
}

function initColorRing() {
    const container = document.getElementById('color-ring-container');
    const track = document.getElementById('color-ring-track');
    const thumb = document.getElementById('color-ring-thumb');
    if (!container || !track || !thumb) return;

    // Set initial position for default amber hue 38°
    updateColorRing(38, true);

    const onPointerDown = (e) => {
        isDraggingRing = true;
        if (thumb.setPointerCapture) thumb.setPointerCapture(e.pointerId);
        handleRingPointer(e);
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!isDraggingRing) return;
        handleRingPointer(e);
    };

    const onPointerUp = (e) => {
        if (isDraggingRing) {
            isDraggingRing = false;
            if (thumb.releasePointerCapture) {
                try { thumb.releasePointerCapture(e.pointerId); } catch (_) {}
            }
        }
    };

    track.addEventListener('pointerdown', onPointerDown);
    thumb.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // Keyboard accessibility on selector knob
    thumb.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            updateColorRing(currentRingHue + 5, true);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            updateColorRing(currentRingHue - 5, true);
            e.preventDefault();
        }
    });

    // Re-adjust thumb on resize
    window.addEventListener('resize', () => {
        updateColorRing(currentRingHue, true);
    });
}

function resetColorRing(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    updateColorRing(38, true);
}

function enterStudio() {
    const introEl = document.getElementById('lumina-intro');
    if (!introEl) return;

    // Stop intro music immediately and reset playback position
    stopIntroAudio();

    introEl.classList.add('intro-dismissed');

    // Smooth transition
    setTimeout(() => {
        isIntroActive = false;
        if (introAnimId) cancelAnimationFrame(introAnimId);
        window.removeEventListener('resize', onIntroResize);
        window.removeEventListener('pointermove', onIntroPointerMove);
        if (introEl) introEl.removeEventListener('pointerleave', onIntroPointerLeave);
        window.removeEventListener('touchmove', onIntroTouchMove);
        window.removeEventListener('touchend', onIntroTouchEnd);
        window.removeEventListener('touchcancel', onIntroTouchEnd);

        // Clean up intro Three.js resources to release GPU memory
        if (introRenderer) {
            introRenderer.dispose();
        }
        if (introShadeMesh) {
            introShadeMesh.geometry.dispose();
            introShadeMesh.material.dispose();
        }
        if (introParticles) {
            introParticles.geometry.dispose();
            introParticles.material.dispose();
        }
        if (introSparks) {
            introSparks.geometry.dispose();
            introSparks.material.dispose();
        }
        if (introAmbientParticles) {
            introAmbientParticles.geometry.dispose();
            introAmbientParticles.material.dispose();
        }

        introEl.style.display = 'none';

        // Trigger resize on the main studio viewport to ensure 100% crisp canvas & full responsiveness
        if (typeof onWindowResize === 'function') {
            onWindowResize();
        }
    }, 650);
}

function playIntroAgain() {
    const introEl = document.getElementById('lumina-intro');
    if (!introEl) return;

    introEl.style.display = 'flex';
    introEl.classList.remove('intro-dismissed');

    const subtitle = document.getElementById('intro-subtitle');
    const bulbSection = document.getElementById('intro-bulb-section');

    if (subtitle) subtitle.classList.add('opacity-0');
    if (bulbSection) bulbSection.classList.add('opacity-0', 'translate-y-3');

    // Reset 3D interactive pointer orientation
    introPointerState.targetYaw = 0;
    introPointerState.targetPitch = 0;
    introPointerState.currentYaw = 0;
    introPointerState.currentPitch = 0;
    introPointerState.isInteracting = false;

    initLuminaIntro();

    // Clean audio re-trigger without duplicate instances
    if (!isAudioMuted && introAudio) {
        introAudio.currentTime = 0;
        introAudio.play().catch(() => {});
    }
}

window.enterStudio = enterStudio;
window.playIntroAgain = playIntroAgain;
window.toggleIntroAudio = toggleIntroAudio;
window.resetColorRing = resetColorRing;

/***********************************************************************
 * 10. CREATOR SPOTLIGHT INTERACTIVE 3D ENGINE & COMPONENT
 ***********************************************************************/
const SPOTLIGHT_STORAGE_KEY = 'luminacad_creator_spotlights';
let currentSpotlightImage = null;
let currentSpotlightRating = 0;
let isSpotlightLivePreviewOpen = false;
let currentSubmissionId = null;
let pendingDeleteTarget = null;

// Dedicated Spotlight Three.js Sub-system
let spotlightScene = null;
let spotlightCamera = null;
let spotlightRenderer = null;
let spotlightControls = null;
let spotlightAnimId = null;
let isSpotlightOpen = false;

// 3D Scene Components
let spotlightLampGroup = null;
let spotlightShadeMesh = null;
let spotlightFitterMesh = null;
let spotlightPointLight = null;
let spotlightAmbientLight = null;
let spotlightDirLight = null;
let spotlightFillLight = null;

// Initial camera framing anchors
const spotlightInitialCamPos = new THREE.Vector3(260, 180, 260);
const spotlightInitialTarget = new THREE.Vector3(0, 100, 0);

function escapeSpotlightHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCurrentDesignSpecs() {
    let presetName = 'Custom Model';
    if (params.patternType === 'spiral_ribs') presetName = 'Nordic Spiral';
    else if (params.patternType === 'origami') presetName = 'Origami Lotus';
    else if (params.patternType === 'vertical_ribs') presetName = 'Mid-Century Ribbed';
    else if (params.patternType === 'diamond') presetName = 'Diamond Lattice';
    else if (params.patternType === 'ripples') presetName = 'Minimalist Bell';
    else if (params.patternType === 'faceted') presetName = 'Cyber Faceted';

    const kLabel = renderState.bulbKelvin ? `${renderState.bulbKelvin}K` : '2700K';
    return `${presetName} • ${params.height || 200}mm • ${kLabel}`;
}

function getStoredSpotlights() {
    try {
        const raw = localStorage.getItem(SPOTLIGHT_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Could not read saved creator spotlights:', e);
        return [];
    }
}

function saveSpotlightToStorage(item) {
    try {
        const list = getStoredSpotlights();
        list.unshift(item);
        if (list.length > 25) list.length = 25;
        localStorage.setItem(SPOTLIGHT_STORAGE_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        console.warn('Could not save creator spotlight:', e);
        return false;
    }
}

function updateSpotlightGalleryBadge() {
    const badge = document.getElementById('spotlight-saved-count');
    if (!badge) return;
    const list = getStoredSpotlights();
    badge.textContent = list.length;
}

/**
 * Initialize Dedicated Three.js Scene for Creator Spotlight
 */
function initSpotlight3DScene() {
    if (spotlightRenderer) return; // already initialized

    const canvas = document.getElementById('spotlight-three-canvas');
    const container = document.getElementById('spotlight-canvas-container');
    if (!canvas || !container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 280;

    // 1. Scene
    spotlightScene = new THREE.Scene();
    spotlightScene.background = new THREE.Color(0x090a0e);

    // 2. Camera
    spotlightCamera = new THREE.PerspectiveCamera(40, width / height, 1, 3000);
    spotlightCamera.position.copy(spotlightInitialCamPos);

    // 3. Renderer with high-performance WebGL settings
    spotlightRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
    });
    spotlightRenderer.setSize(width, height);
    spotlightRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    spotlightRenderer.shadowMap.enabled = true;
    spotlightRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    spotlightRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    spotlightRenderer.toneMappingExposure = 1.15;

    // 4. Smooth OrbitControls (360° inspection, zoom, pan, mobile gestures)
    spotlightControls = new THREE.OrbitControls(spotlightCamera, spotlightRenderer.domElement);
    spotlightControls.enableDamping = true;
    spotlightControls.dampingFactor = 0.08;
    spotlightControls.enableZoom = true;
    spotlightControls.enableRotate = true;
    spotlightControls.enablePan = true;
    spotlightControls.minDistance = 35;
    spotlightControls.maxDistance = 1400;
    spotlightControls.target.copy(spotlightInitialTarget);

    // 5. Lighting Setup tailored for inspecting interior & exterior geometry
    spotlightAmbientLight = new THREE.AmbientLight(0xdbeafe, 0.45);
    spotlightScene.add(spotlightAmbientLight);

    spotlightDirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    spotlightDirLight.position.set(220, 380, 240);
    spotlightDirLight.castShadow = true;
    spotlightDirLight.shadow.mapSize.width = 1024;
    spotlightDirLight.shadow.mapSize.height = 1024;
    spotlightScene.add(spotlightDirLight);

    spotlightFillLight = new THREE.DirectionalLight(0x93c5fd, 0.38);
    spotlightFillLight.position.set(-220, 160, -200);
    spotlightScene.add(spotlightFillLight);

    spotlightPointLight = new THREE.PointLight(0xffb454, 2.4, 750, 1.4);
    spotlightPointLight.position.set(0, 100, 0);
    spotlightScene.add(spotlightPointLight);

    // 6. Lamp Mesh Group
    spotlightLampGroup = new THREE.Group();
    spotlightScene.add(spotlightLampGroup);

    // 7. Auto-resize with ResizeObserver
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (isSpotlightOpen) onSpotlightResize();
        });
        ro.observe(container);
    }
}

function onSpotlightResize() {
    const container = document.getElementById('spotlight-canvas-container');
    if (!container || !spotlightRenderer || !spotlightCamera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    spotlightCamera.aspect = width / height;
    spotlightCamera.updateProjectionMatrix();
    spotlightRenderer.setSize(width, height);
}

function animateSpotlight() {
    if (!isSpotlightOpen) return;
    spotlightAnimId = requestAnimationFrame(animateSpotlight);

    if (spotlightControls) spotlightControls.update();
    if (spotlightRenderer && spotlightScene && spotlightCamera) {
        spotlightRenderer.render(spotlightScene, spotlightCamera);
    }
}

/**
 * Capture & Sync the User's Actual 3D Lamp into Creator Spotlight
 */
function syncLampToSpotlight3D() {
    if (!spotlightScene || !spotlightLampGroup) return;

    // Clear previous spotlight lamp children cleanly
    while (spotlightLampGroup.children.length > 0) {
        const child = spotlightLampGroup.children[0];
        spotlightLampGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
    }

    const height = params.height || 200;
    const centerY = height * 0.48;

    // 1. Replicate User's Actual Lamp Shade Geometry & Material
    if (shadeMesh && shadeMesh.geometry) {
        const shadeGeo = shadeMesh.geometry.clone();
        
        // Translucent PBR material reflecting user's filament settings
        const filamentCol = renderState.filamentColor || 0xfff6e5;
        const shadeMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(filamentCol),
            roughness: renderState.filamentRoughness || 0.38,
            metalness: 0.06,
            side: THREE.DoubleSide
        });

        // Add soft warm internal emission when bulb is turned on
        if (renderState.bulbOn) {
            const glowCol = bulbLight ? bulbLight.color : new THREE.Color(0xffaa44);
            shadeMat.emissive = glowCol;
            shadeMat.emissiveIntensity = 0.16;
        }

        spotlightShadeMesh = new THREE.Mesh(shadeGeo, shadeMat);
        spotlightShadeMesh.castShadow = true;
        spotlightShadeMesh.receiveShadow = true;
        spotlightLampGroup.add(spotlightShadeMesh);
    }

    // 2. Replicate User's Socket Fitter Struts & Ring
    if (fitterMesh && fitterMesh.geometry) {
        const fitterGeo = fitterMesh.geometry.clone();
        const fitterMat = new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.4,
            metalness: 0.65,
            side: THREE.DoubleSide
        });
        spotlightFitterMesh = new THREE.Mesh(fitterGeo, fitterMat);
        spotlightFitterMesh.castShadow = true;
        spotlightLampGroup.add(spotlightFitterMesh);
    }

    // 3. Replicate Internal Bulb & Finished Hardware Socket Reference
    const bulbGroup = new THREE.Group();
    const bulbGeo = new THREE.SphereGeometry(20, 24, 24);
    const activeBulbColor = bulbLight ? bulbLight.color : new THREE.Color(0xffd28a);
    const bulbMat = new THREE.MeshBasicMaterial({
        color: renderState.bulbOn ? activeBulbColor : 0x52525b
    });
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbGroup.add(bulbMesh);

    // Hardware socket collar & brass thread ring
    const holderGeo = new THREE.CylinderGeometry(14, 14, 26, 20);
    const holderMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.45, metalness: 0.8 });
    const holderMesh = new THREE.Mesh(holderGeo, holderMat);
    holderMesh.position.y = -20;
    bulbGroup.add(holderMesh);

    const brassRingGeo = new THREE.CylinderGeometry(16, 16, 4.5, 20);
    const brassRingMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.3, metalness: 0.9 });
    const brassRingMesh = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRingMesh.position.y = -8;
    bulbGroup.add(brassRingMesh);

    // Calculate bulb position matching actual studio mount
    let bulbY = centerY;
    if (params.mountPosition === 'top') {
        bulbY = Math.max(30, height - (params.fitterOffset || 12) - 24);
    } else if (params.mountPosition === 'solid_base') {
        bulbY = 45;
    } else {
        bulbY = Math.max(35, (params.fitterOffset || 12) + 32);
    }
    bulbGroup.position.set(0, bulbY, 0);
    spotlightLampGroup.add(bulbGroup);

    // Sync Spotlight PointLight
    if (spotlightPointLight) {
        spotlightPointLight.position.set(0, bulbY, 0);
        spotlightPointLight.color.copy(activeBulbColor);
        spotlightPointLight.intensity = renderState.bulbOn ? 2.5 : 0.25;
    }

    // 4. Subtle Circular Blueprint Floor Accent (Provides spatial orientation)
    const floorR = Math.max(params.bottomRadius || 75, params.topRadius || 55) + 18;
    const ringGeo = new THREE.RingGeometry(floorR - 1.2, floorR, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.2;
    spotlightLampGroup.add(ringMesh);

    // 5. Intelligent Camera Framing: Ensure entire lamp is visible
    const maxR = Math.max(params.bottomRadius || 75, params.topRadius || 55) + Math.abs(params.profileBulge || 0) + Math.abs(params.ribDepth || 0);
    const span = Math.max(height, maxR * 2.2);
    const camDist = span * 1.55;

    spotlightInitialCamPos.set(camDist * 0.78, centerY + camDist * 0.32, camDist * 0.82);
    spotlightInitialTarget.set(0, centerY, 0);

    spotlightCamera.position.copy(spotlightInitialCamPos);
    spotlightControls.target.copy(spotlightInitialTarget);
    spotlightControls.update();

    // 6. Capture fallback PNG for download and card gallery
    if (spotlightRenderer && spotlightScene && spotlightCamera) {
        spotlightRenderer.render(spotlightScene, spotlightCamera);
        try {
            currentSpotlightImage = spotlightRenderer.domElement.toDataURL('image/png', 0.95);
        } catch (e) {
            console.warn('Could not generate dataURL:', e);
        }
    }

    // Update specs badge
    const specsBadge = document.getElementById('spotlight-live-specs-badge');
    if (specsBadge) {
        specsBadge.textContent = getCurrentDesignSpecs();
    }
}

/**
 * Reset Camera View in Spotlight Viewport
 */
function resetSpotlightCamera() {
    if (!spotlightCamera || !spotlightControls) return;
    spotlightCamera.position.copy(spotlightInitialCamPos);
    spotlightControls.target.copy(spotlightInitialTarget);
    spotlightControls.update();

    if (typeof showToast === 'function') {
        showToast('🎥 View Reset', 'Spotlight camera returned to optimal framing.');
    }
}

/**
 * Open Creator Spotlight Modal
 */
function openCreatorSpotlight() {
    const modal = document.getElementById('creator-spotlight-modal');
    if (!modal) return;

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');

    // Switch to create form view by default if not previously submitted
    const createView = document.getElementById('spotlight-create-view');
    const resultView = document.getElementById('spotlight-result-view');
    const galleryView = document.getElementById('spotlight-gallery-view');
    
    if (galleryView) galleryView.classList.add('hidden');
    if (!resultView || resultView.classList.contains('hidden')) {
        if (createView) createView.classList.remove('hidden');
        if (resultView) resultView.classList.add('hidden');
    }

    // Initialize 3D scene and sync current lamp
    initSpotlight3DScene();
    syncLampToSpotlight3D();

    // Start 3D rendering loop
    isSpotlightOpen = true;
    animateSpotlight();

    // Resize canvas to container
    requestAnimationFrame(() => {
        onSpotlightResize();
    });

    updateSpotlightGalleryBadge();
}

/**
 * Close Creator Spotlight Modal without disturbing main studio
 */
function closeCreatorSpotlight() {
    const modal = document.getElementById('creator-spotlight-modal');
    if (!modal) return;

    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');

    // Pause 3D animation loop to save CPU/GPU resources
    isSpotlightOpen = false;
    if (spotlightAnimId) {
        cancelAnimationFrame(spotlightAnimId);
        spotlightAnimId = null;
    }
}

/**
 * Capture My Lamp: Preserves user's exact current lamp geometry
 */
function captureLampFromStudio() {
    try {
        // Flash animation
        const flash = document.getElementById('spotlight-camera-flash');
        if (flash) {
            flash.style.opacity = '0.9';
            setTimeout(() => { flash.style.opacity = '0'; }, 220);
        }

        // Re-sync 3D model with latest design
        syncLampToSpotlight3D();

        // Update status badge
        const captureStatus = document.getElementById('spotlight-capture-status');
        const liveSpecs = document.getElementById('spotlight-live-specs-badge');
        const captureBtnText = document.getElementById('text-capture-button');
        const captureIcon = document.getElementById('icon-capture-camera');

        if (captureStatus) {
            captureStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Design Captured (${params.height}mm)`;
        }
        if (liveSpecs) {
            liveSpecs.textContent = getCurrentDesignSpecs();
        }
        if (captureBtnText) {
            captureBtnText.textContent = 'Capture Again';
        }
        if (captureIcon) {
            captureIcon.className = 'ph-bold ph-camera-rotate text-amber-400 text-sm group-hover:rotate-180 transition-transform duration-300';
        }

        // Clear validation error if any
        const errEl = document.getElementById('spotlight-form-error');
        if (errEl && errEl.textContent.includes('capture')) {
            errEl.textContent = '';
        }

        if (typeof showToast === 'function') {
            showToast('📸 3D Lamp Captured', 'Interactive 3D model updated with your latest studio design.');
        }
    } catch (err) {
        console.error('Lamp snapshot failed:', err);
        const errEl = document.getElementById('spotlight-form-error');
        if (errEl) {
            errEl.textContent = '⚠️ Capture failed: ' + (err.message || 'Could not sync 3D model.');
        }
    }
}

function setSpotlightRating(stars) {
    currentSpotlightRating = stars;
    const starContainer = document.getElementById('spotlight-star-container');
    const ratingText = document.getElementById('spotlight-rating-text');
    const clearBtn = document.getElementById('btn-clear-rating');

    if (!starContainer) return;
    const buttons = starContainer.querySelectorAll('.spotlight-star-btn');
    buttons.forEach((btn, idx) => {
        if (idx < stars) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const labels = [
        'Select rating',
        '1 / 5 ★ Needs Work',
        '2 / 5 ★★ Fair Design Tool',
        '3 / 5 ★★★ Good Studio',
        '4 / 5 ★★★★ Very Impressive!',
        '5 / 5 ★★★★★ Masterpiece Studio!'
    ];
    if (ratingText) {
        ratingText.textContent = labels[stars] || `${stars} / 5 Stars`;
    }
    if (clearBtn) {
        if (stars > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
}

function previewSpotlightRating(stars) {
    const starContainer = document.getElementById('spotlight-star-container');
    if (!starContainer) return;
    const buttons = starContainer.querySelectorAll('.spotlight-star-btn');
    buttons.forEach((btn, idx) => {
        if (stars > 0 && idx < stars) {
            btn.classList.add('hover-active');
        } else {
            btn.classList.remove('hover-active');
        }
    });
}

function clearSpotlightRating() {
    setSpotlightRating(0);
}

function updateSpotlightCharCount() {
    const reviewInput = document.getElementById('spotlight-review-text');
    const charCount = document.getElementById('spotlight-char-count');
    if (reviewInput && charCount) {
        charCount.textContent = `${reviewInput.value.length} / 600`;
    }
}

function buildCreatorCardHTML(data, showActions = true) {
    const safeName = escapeSpotlightHTML(data.creatorName || 'Anonymous Creator');
    const safeReview = escapeSpotlightHTML(data.review || 'No review provided.');
    const safeSpecs = escapeSpotlightHTML(data.specs || getCurrentDesignSpecs());
    const dateStr = data.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let starsHtml = '';
    if (data.rating && data.rating > 0) {
        starsHtml = `<div class="flex items-center gap-1 text-amber-400 text-xs" title="${data.rating} out of 5 stars">`;
        for (let i = 1; i <= 5; i++) {
            if (i <= data.rating) {
                starsHtml += `<i class="ph-fill ph-star"></i>`;
            } else {
                starsHtml += `<i class="ph-bold ph-star text-slate-600"></i>`;
            }
        }
        starsHtml += `<span class="ml-1 text-[11px] font-mono text-amber-300 font-bold">${data.rating}/5</span></div>`;
    } else {
        starsHtml = `<span class="text-[10px] font-mono text-slate-500 italic">No rating provided</span>`;
    }

    const initial = (data.creatorName && data.creatorName.trim().length > 0)
        ? data.creatorName.trim().charAt(0).toUpperCase()
        : 'C';

    const thumbnail = data.image
        ? `<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-black/60 border border-white/10 shrink-0 shadow-inner flex items-center justify-center">
             <img src="${data.image}" alt="${safeName}'s 3D Lamp" class="w-full h-full object-contain">
           </div>`
        : '';

    // Action buttons: Remodel Lamp and Delete (Compact, professional, matching LuminaCAD style)
    const actionButtonsHtml = showActions ? `
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-white/10">
            <button type="button" onclick="remodelLampFromSpotlight('${data.id}')"
                class="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm group"
                title="Load this creator's design into the 3D lamp designer">
                <i class="ph-bold ph-arrows-clockwise text-xs text-amber-400 group-hover:rotate-180 transition-transform duration-300"></i>
                <span>Remodel Lamp</span>
            </button>
            <button type="button" onclick="confirmDeleteSpotlight('${data.id}')"
                class="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
                title="Delete this creator entry">
                <i class="ph-bold ph-trash text-xs text-rose-400"></i>
                <span>Delete</span>
            </button>
        </div>
    ` : '';

    return `
        <div class="creator-spotlight-card rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-b from-[#14161f] to-[#0c0e12] shadow-2xl p-3.5 sm:p-4 relative" id="card-${data.id}">
            <!-- Header Bar -->
            <div class="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
                <div class="flex items-center gap-2">
                    <div class="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <i class="ph-fill ph-lightbulb text-xs"></i>
                    </div>
                    <span class="text-xs font-bold text-white tracking-wide">LuminaCAD <span class="text-amber-400 font-normal font-mono">Spotlight</span></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <i class="ph-bold ph-hard-drive"></i> Locally Saved
                    </span>
                    <span class="text-[10px] font-mono text-slate-400">${dateStr}</span>
                </div>
            </div>

            <!-- Content Body with Creator & Review -->
            <div class="flex items-start gap-3">
                ${thumbnail}
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-black font-bold text-[10px] flex items-center justify-center shadow-md">
                                ${initial}
                            </div>
                            <span class="text-xs font-bold text-white">${safeName}</span>
                            <i class="ph-fill ph-seal-check text-amber-400 text-xs" title="LuminaCAD Creator"></i>
                        </div>
                        ${starsHtml}
                    </div>

                    <div class="text-[10px] font-mono text-amber-300/80 mb-2">${safeSpecs}</div>

                    <!-- Review Text -->
                    <div class="rounded-lg bg-black/40 border border-white/5 p-2.5 text-xs text-slate-200 leading-relaxed italic relative">
                        "${safeReview}"
                    </div>
                </div>
            </div>

            <!-- Card Actions -->
            ${actionButtonsHtml}
        </div>
    `;
}

function validateSpotlightForm() {
    const nameInput = document.getElementById('spotlight-creator-name');
    const reviewInput = document.getElementById('spotlight-review-text');
    const errorEl = document.getElementById('spotlight-form-error');

    const name = nameInput ? nameInput.value.trim() : '';
    const review = reviewInput ? reviewInput.value.trim() : '';

    if (!name || name.length < 2) {
        if (errorEl) errorEl.textContent = '⚠️ Please enter your Creator Name (at least 2 characters).';
        if (nameInput) {
            nameInput.focus();
            nameInput.classList.add('border-rose-500');
            setTimeout(() => nameInput.classList.remove('border-rose-500'), 2500);
        }
        return null;
    }

    if (!review || review.length < 5) {
        if (errorEl) errorEl.textContent = '⚠️ Please write a brief review or feedback (at least 5 characters).';
        if (reviewInput) {
            reviewInput.focus();
            reviewInput.classList.add('border-rose-500');
            setTimeout(() => reviewInput.classList.remove('border-rose-500'), 2500);
        }
        return null;
    }

    if (errorEl) errorEl.textContent = '';
    return {
        creatorName: name,
        rating: currentSpotlightRating,
        review: review,
        image: currentSpotlightImage,
        specs: getCurrentDesignSpecs()
    };
}

function submitCreatorSpotlight() {
    const data = validateSpotlightForm();
    if (!data) return;

    const submission = {
        id: 'spotlight_' + Date.now(),
        creatorName: data.creatorName,
        rating: data.rating,
        review: data.review,
        image: data.image,
        specs: data.specs,
        params: JSON.parse(JSON.stringify(params)),
        renderState: {
            bulbOn: renderState.bulbOn,
            bulbPower: renderState.bulbPower,
            bulbKelvin: renderState.bulbKelvin,
            darkRoom: renderState.darkRoom,
            renderMode: renderState.renderMode,
            wireframe: renderState.wireframe,
            filamentColor: renderState.filamentColor,
            filamentRoughness: renderState.filamentRoughness,
            filamentTransmission: renderState.filamentTransmission,
            bedSize: renderState.bedSize
        },
        date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }),
        isLocalOnly: true
    };

    currentSubmissionId = submission.id;

    // Save to local storage
    saveSpotlightToStorage(submission);
    updateSpotlightGalleryBadge();

    // Render single card in result container (without duplicate card actions since action bar is right below)
    const singleContainer = document.getElementById('spotlight-single-card-container');
    if (singleContainer) {
        singleContainer.innerHTML = buildCreatorCardHTML(submission, false);
    }

    // Switch view to result view (interactive 3D viewer remains visible above!)
    const createView = document.getElementById('spotlight-create-view');
    const resultView = document.getElementById('spotlight-result-view');
    const galleryView = document.getElementById('spotlight-gallery-view');

    if (createView) createView.classList.add('hidden');
    if (resultView) resultView.classList.remove('hidden');
    if (galleryView) galleryView.classList.add('hidden');

    if (typeof showToast === 'function') {
        showToast('🎉 Review Submitted!', `Thank you, ${submission.creatorName}! Your 3D lamp & review are saved.`);
    }
}

/**
 * Remodel a creator's lamp design: loads geometry, dimensions, materials, and filament parameters
 * into the main LuminaCAD studio without replacing or mutating the saved gallery entry.
 */
function remodelLampFromSpotlight(id) {
    const list = getStoredSpotlights();
    const entry = list.find(item => item.id === id);

    if (!entry) {
        if (typeof showToast === 'function') {
            showToast('⚠️ Entry Not Found', 'Could not locate the saved lamp record.');
        }
        return;
    }

    if (!entry.params || typeof entry.params !== 'object' || Object.keys(entry.params).length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ Design Unavailable', 'Parametric CAD data is not available for this entry. Design cannot be remodeled.');
        }
        return;
    }

    try {
        // 1. Restore geometry & dimension parameters
        params = { ...defaultParams, ...entry.params };

        // 2. Restore filament, lighting, and material settings if saved
        if (entry.renderState && typeof entry.renderState === 'object') {
            const rs = entry.renderState;
            if (rs.bulbPower !== undefined) renderState.bulbPower = rs.bulbPower;
            if (rs.bulbKelvin !== undefined) renderState.bulbKelvin = rs.bulbKelvin;
            if (rs.bulbOn !== undefined) {
                renderState.bulbOn = rs.bulbOn;
                const bulbBtn = document.getElementById('btn-bulb');
                if (bulbBtn) {
                    if (renderState.bulbOn) {
                        bulbBtn.className = 'px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center gap-1.5 hover:bg-amber-500/30 transition shrink-0';
                        bulbBtn.innerHTML = '<i class="ph-fill ph-lightbulb text-sm"></i><span>Bulb ON</span>';
                    } else {
                        bulbBtn.className = 'px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 text-xs font-medium flex items-center gap-1.5 hover:bg-white/10 transition shrink-0';
                        bulbBtn.innerHTML = '<i class="ph-bold ph-lightbulb text-sm"></i><span>Bulb OFF</span>';
                    }
                }
            }
            if (rs.filamentColor !== undefined) {
                renderState.filamentColor = rs.filamentColor;
                if (litShadeMaterial) litShadeMaterial.color.setHex(rs.filamentColor);
            }
            if (rs.filamentRoughness !== undefined) {
                renderState.filamentRoughness = rs.filamentRoughness;
                if (litShadeMaterial) litShadeMaterial.roughness = rs.filamentRoughness;
            }
            if (rs.filamentTransmission !== undefined) {
                renderState.filamentTransmission = rs.filamentTransmission;
                if (litShadeMaterial && litShadeMaterial.userData.shader && litShadeMaterial.userData.shader.uniforms.uTransmission) {
                    litShadeMaterial.userData.shader.uniforms.uTransmission.value = rs.filamentTransmission;
                }
            }
            if (rs.renderMode !== undefined && typeof setRenderMode === 'function') {
                setRenderMode(rs.renderMode || 'lit');
            }
            if (rs.bedSize !== undefined && typeof updatePrintBed === 'function') {
                updatePrintBed(rs.bedSize);
            }

            // Sync bulb slider inputs
            const pEl = document.getElementById('ctrl-bulbPower');
            if (pEl) pEl.value = renderState.bulbPower;
            const kEl = document.getElementById('ctrl-bulbKelvin');
            if (kEl) kEl.value = renderState.bulbKelvin;
            updateLightingFromUI();
        }

        // 3. Highlight corresponding preset pill if pattern matches
        document.querySelectorAll('.preset-pill').forEach(btn => btn.classList.remove('active'));
        if (typeof PRESETS === 'object') {
            Object.keys(PRESETS).forEach(pKey => {
                if (PRESETS[pKey].patternType === params.patternType && PRESETS[pKey].profileType === params.profileType) {
                    const pBtn = document.getElementById(`preset-${pKey}`);
                    if (pBtn) pBtn.classList.add('active');
                }
            });
        }

        // 4. Synchronize UI inputs and labels
        syncUILabels();

        // 5. Rebuild lamp 3D geometry
        rebuildLampGeometry();

        // 6. Close spotlight modal without modifying original saved entry
        closeCreatorSpotlight();

        // 7. Show success feedback
        if (typeof showToast === 'function') {
            const creatorName = entry.creatorName || 'Creator';
            showToast('✨ Design Remodeled', `Loaded ${creatorName}'s lamp design into the 3D designer. You can continue editing.`);
        }
    } catch (err) {
        console.error('Error remodeling design:', err);
        if (typeof showToast === 'function') {
            showToast('⚠️ Remodel Error', 'Could not fully restore design parameters.');
        }
    }
}

/**
 * Open confirmation dialog to delete a specific creator gallery entry
 */
function confirmDeleteSpotlight(id) {
    pendingDeleteTarget = { type: 'entry', id: id };
    const modal = document.getElementById('spotlight-delete-modal');
    const msgEl = document.getElementById('spotlight-delete-message');
    if (msgEl) {
        msgEl.textContent = 'Are you sure you want to delete this creator entry?';
    }
    if (modal) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
    }
}

/**
 * Open confirmation dialog to delete the review currently in the feedback box
 */
function confirmDeleteCurrentFeedback() {
    if (!currentSubmissionId) {
        const list = getStoredSpotlights();
        if (list.length > 0) {
            currentSubmissionId = list[0].id;
        }
    }
    if (!currentSubmissionId) {
        if (typeof showToast === 'function') {
            showToast('⚠️ No Review Selected', 'No active review found to delete.');
        }
        return;
    }
    pendingDeleteTarget = { type: 'feedback', id: currentSubmissionId };
    const modal = document.getElementById('spotlight-delete-modal');
    const msgEl = document.getElementById('spotlight-delete-message');
    if (msgEl) {
        msgEl.textContent = 'Are you sure you want to delete this review?';
    }
    if (modal) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
    }
}

/**
 * Cancel pending deletion
 */
function cancelDeleteSpotlight() {
    pendingDeleteTarget = null;
    const modal = document.getElementById('spotlight-delete-modal');
    if (modal) {
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        modal.classList.add('opacity-0', 'pointer-events-none');
    }
}

/**
 * Execute deletion of selected creator entry or review upon user confirmation
 */
function executeDeleteSpotlight() {
    if (!pendingDeleteTarget || !pendingDeleteTarget.id) {
        cancelDeleteSpotlight();
        return;
    }

    const targetId = pendingDeleteTarget.id;
    const targetType = pendingDeleteTarget.type;

    try {
        let list = getStoredSpotlights();
        list = list.filter(item => item.id !== targetId);
        localStorage.setItem(SPOTLIGHT_STORAGE_KEY, JSON.stringify(list));
        updateSpotlightGalleryBadge();

        if (targetType === 'feedback') {
            // Reset feedback form fields
            const nameInput = document.getElementById('spotlight-creator-name');
            const reviewInput = document.getElementById('spotlight-review-text');
            if (nameInput) nameInput.value = '';
            if (reviewInput) reviewInput.value = '';
            clearSpotlightRating();
            updateSpotlightCharCount();

            // Switch result view back to create view
            const createView = document.getElementById('spotlight-create-view');
            const resultView = document.getElementById('spotlight-result-view');
            if (createView) createView.classList.remove('hidden');
            if (resultView) resultView.classList.add('hidden');

            currentSubmissionId = null;

            if (typeof showToast === 'function') {
                showToast('🗑️ Review Deleted', 'Your spotlight review has been deleted.');
            }
        } else {
            // Re-render gallery
            renderSpotlightGallery();

            if (currentSubmissionId === targetId) {
                currentSubmissionId = null;
                const resultView = document.getElementById('spotlight-result-view');
                if (resultView && !resultView.classList.contains('hidden')) {
                    const createView = document.getElementById('spotlight-create-view');
                    if (createView) createView.classList.remove('hidden');
                    resultView.classList.add('hidden');
                }
            }

            if (typeof showToast === 'function') {
                showToast('🗑️ Entry Deleted', 'Creator entry was removed from the gallery.');
            }
        }
    } catch (e) {
        console.error('Delete error:', e);
        if (typeof showToast === 'function') {
            showToast('⚠️ Delete Failed', 'Could not delete entry from storage.');
        }
    } finally {
        cancelDeleteSpotlight();
    }
}

function editCurrentSpotlightReview() {
    const createView = document.getElementById('spotlight-create-view');
    const resultView = document.getElementById('spotlight-result-view');
    const galleryView = document.getElementById('spotlight-gallery-view');

    if (createView) createView.classList.remove('hidden');
    if (resultView) resultView.classList.add('hidden');
    if (galleryView) galleryView.classList.add('hidden');
}

function downloadCurrentSpotlightCard() {
    if (!currentSpotlightImage) {
        if (typeof showToast === 'function') {
            showToast('⚠️ No Image Available', 'Please capture your 3D lamp design first.');
        }
        return;
    }

    const nameInput = document.getElementById('spotlight-creator-name');
    const safeName = (nameInput && nameInput.value.trim() ? nameInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') : 'creator');
    const a = document.createElement('a');
    a.href = currentSpotlightImage;
    a.download = `luminacad_spotlight_${safeName}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (typeof showToast === 'function') {
        showToast('✨ Image Downloaded', 'Your 3D lamp capture has been exported as PNG.');
    }
}

function showCreateNewSpotlight() {
    const createView = document.getElementById('spotlight-create-view');
    const resultView = document.getElementById('spotlight-result-view');
    const galleryView = document.getElementById('spotlight-gallery-view');

    if (createView) createView.classList.remove('hidden');
    if (resultView) resultView.classList.add('hidden');
    if (galleryView) galleryView.classList.add('hidden');

    // Fresh snapshot of the current 3D viewport
    captureLampFromStudio();
}

function toggleSpotlightGalleryView() {
    const createView = document.getElementById('spotlight-create-view');
    const resultView = document.getElementById('spotlight-result-view');
    const galleryView = document.getElementById('spotlight-gallery-view');

    if (!galleryView) return;
    const isShowingGallery = !galleryView.classList.contains('hidden');

    if (isShowingGallery) {
        galleryView.classList.add('hidden');
        if (createView) createView.classList.remove('hidden');
        if (resultView) resultView.classList.add('hidden');
    } else {
        renderSpotlightGallery();
        galleryView.classList.remove('hidden');
        if (createView) createView.classList.add('hidden');
        if (resultView) resultView.classList.add('hidden');
    }
}

function renderSpotlightGallery() {
    const listEl = document.getElementById('spotlight-gallery-list');
    if (!listEl) return;

    const spotlights = getStoredSpotlights();
    if (spotlights.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-8 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01]">
                <div class="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
                    <i class="ph-bold ph-cards text-2xl"></i>
                </div>
                <div class="text-xs font-bold text-white">No Saved Spotlights Yet</div>
                <div class="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">Capture your 3D lamp, write your review, and submit to save your first spotlight card!</div>
                <button type="button" onclick="showCreateNewSpotlight()" class="mt-3 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition">
                    Create Spotlight Now
                </button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = spotlights.map(item => buildCreatorCardHTML(item, true)).join('');
}

// Global exposure
window.openCreatorSpotlight = openCreatorSpotlight;
window.closeCreatorSpotlight = closeCreatorSpotlight;
window.captureLampFromStudio = captureLampFromStudio;
window.resetSpotlightCamera = resetSpotlightCamera;
window.setSpotlightRating = setSpotlightRating;
window.previewSpotlightRating = previewSpotlightRating;
window.clearSpotlightRating = clearSpotlightRating;
window.updateSpotlightCharCount = updateSpotlightCharCount;
window.submitCreatorSpotlight = submitCreatorSpotlight;
window.editCurrentSpotlightReview = editCurrentSpotlightReview;
window.downloadCurrentSpotlightCard = downloadCurrentSpotlightCard;
window.showCreateNewSpotlight = showCreateNewSpotlight;
window.toggleSpotlightGalleryView = toggleSpotlightGalleryView;
window.renderSpotlightGallery = renderSpotlightGallery;
window.remodelLampFromSpotlight = remodelLampFromSpotlight;
window.confirmDeleteSpotlight = confirmDeleteSpotlight;
window.confirmDeleteCurrentFeedback = confirmDeleteCurrentFeedback;
window.cancelDeleteSpotlight = cancelDeleteSpotlight;
window.executeDeleteSpotlight = executeDeleteSpotlight;

// Close on Escape key (handles delete modal first, then spotlight modal)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const delModal = document.getElementById('spotlight-delete-modal');
        if (delModal && !delModal.classList.contains('pointer-events-none')) {
            cancelDeleteSpotlight();
            return;
        }
        const modal = document.getElementById('creator-spotlight-modal');
        if (modal && !modal.classList.contains('pointer-events-none')) {
            closeCreatorSpotlight();
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    initThreeScene();
    bindUIControls();
    syncUILabels();
    animate();
    initLuminaIntro();
    updateSpotlightGalleryBadge();

    const btnSpotlight = document.getElementById('btn-creator-spotlight');
    if (btnSpotlight) {
        btnSpotlight.addEventListener('click', openCreatorSpotlight);
    }
});

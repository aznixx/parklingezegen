import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from 'maplibre-gl-draw';
import intersect from '@turf/intersect';
import booleanWithin from '@turf/boolean-within';
import area from '@turf/area';
import bbox from '@turf/bbox';
import length from '@turf/length';
import { boomGebieden, usageByType } from './tree-zones-data.js';
import { supabase } from './supabaseClient.js';

// Mode Management
let currentMode = null; // 'visitor' or 'staff'
const STAFF_PASSWORD = 'lingezegen2025'; // Verander dit naar een veilig wachtwoord

// Mode Selector Logic
const modeSelector = document.getElementById('modeSelector');
const visitorModeBtn = document.getElementById('visitorMode');
const staffModeBtn = document.getElementById('staffMode');
const passwordModal = document.getElementById('passwordModal');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');
const cancelPasswordBtn = document.getElementById('cancelPassword');
const confirmPasswordBtn = document.getElementById('confirmPassword');

visitorModeBtn.addEventListener('click', () => {
  startMode('visitor');
});

staffModeBtn.addEventListener('click', () => {
  passwordModal.classList.add('active');
  passwordInput.value = '';
  passwordError.textContent = '';
  setTimeout(() => passwordInput.focus(), 100);
});

cancelPasswordBtn.addEventListener('click', () => {
  passwordModal.classList.remove('active');
});

confirmPasswordBtn.addEventListener('click', () => {
  checkPassword();
});

passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    checkPassword();
  }
});

function checkPassword() {
  const enteredPassword = passwordInput.value;
  if (enteredPassword === STAFF_PASSWORD) {
    passwordModal.classList.remove('active');
    startMode('staff');
  } else {
    passwordError.textContent = '❌ Onjuist wachtwoord';
    passwordInput.value = '';
    passwordInput.focus();
  }
}

function startMode(mode) {
  currentMode = mode;
  modeSelector.classList.add('hidden');
  
  // Hide mode selector after animation
  setTimeout(() => {
    modeSelector.style.display = 'none';
  }, 300);
  
  // Store mode in sessionStorage (niet localStorage, zodat het bij elke nieuwe sessie opnieuw wordt gevraagd)
  sessionStorage.setItem('appMode', mode);
  
  console.log(`🚀 Starting in ${mode} mode`);
  
  // Show/hide admin toggle based on mode
  const adminToggle = document.querySelector('.admin-toggle');
  if (adminToggle) {
    adminToggle.style.display = mode === 'visitor' ? 'none' : 'block';
  }
  
  // Check if device is mobile
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  
  // Create mode switcher button (only on desktop)
  if (!isMobile) {
    const modeSwitcherBtn = document.createElement('button');
    modeSwitcherBtn.className = 'mode-switcher-btn';
    
    // Use SVG icons instead of emojis for consistency
    const visitorIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>`;
    
    const staffIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>`;
    
    modeSwitcherBtn.innerHTML = `
      <span class="mode-switcher-btn__icon">${mode === 'visitor' ? visitorIcon : staffIcon}</span>
      <span>${mode === 'visitor' ? 'Bezoeker Modus' : 'Medewerker Modus'}</span>
    `;
    modeSwitcherBtn.title = 'Verander modus';
    document.body.appendChild(modeSwitcherBtn);

    modeSwitcherBtn.addEventListener('click', () => {
      const confirmSwitch = confirm(
        mode === 'visitor' 
          ? '🔧 Wilt u naar Medewerker modus wisselen?\n\n(U moet opnieuw inloggen met het wachtwoord)'
          : '👥 Wilt u naar Bezoeker modus wisselen?\n\n(Admin functies worden uitgeschakeld)'
      );
      
      if (confirmSwitch) {
        sessionStorage.removeItem('appMode');
        window.location.reload();
      }
    });
  }
}

// Check if device is mobile
const isMobile = window.matchMedia('(max-width: 768px)').matches;

// Check if we need to show mode selector or restore previous mode
const savedMode = sessionStorage.getItem('appMode');

if (isMobile) {
  // On mobile, always use visitor mode automatically
  currentMode = 'visitor';
  modeSelector.style.display = 'none';
  console.log('📱 Mobile detected - Auto-starting in visitor mode');
} else if (savedMode) {
  // Auto-start in saved mode (alleen voor deze sessie)
  currentMode = savedMode;
  modeSelector.style.display = 'none';
  console.log(`📱 Restoring ${savedMode} mode`);
} else {
  // Show mode selector on desktop - set currentMode to null to prevent initialization
  currentMode = null;
  console.log('👋 Showing mode selector');
}

// Only initialize app if mode is selected
if (currentMode === null) {
  // Wait for mode selection - don't initialize anything yet
  console.log('⏸️ Waiting for mode selection...');
  // The rest of the code will run but checks should prevent admin tools from showing
}

// API KEY for MapTiler
const MAPTILER_KEY = import.meta?.env?.VITE_MAPTILER_KEY ?? 'aD6x6RAmSJQgz7BkjLMH';

// Available MapTiler styles with metadata for the UI
const mapStyles = {
  dataviz: {
    label: 'Eenvoudig',
    emoji: '📊',
    accent: 'linear-gradient(120deg,#22c55e,#0ea5e9)',
    description: 'Heldere basiskaart voor infographics',
    url: `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_KEY}`
  },
  streets: {
    label: 'Stratenkaart',
    emoji: '🗺️',
    accent: 'linear-gradient(135deg,#f97316,#facc15)',
    description: 'Klassieke stadskaart met labels',
    url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  },
  satellite: {
    label: 'Luchtfoto',
    emoji: '🛰️',
    accent: 'linear-gradient(135deg,#0f172a,#1e293b)',
    description: 'Volledige luchtfoto achtergrond',
    url: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`
  },
  hybrid: {
    label: 'Luchtfoto met labels',
    emoji: '🌍',
    accent: 'linear-gradient(135deg,#14b8a6,#f97316)',
    description: 'Satellietbeeld met labels',
    url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
  },
  outdoor: {
    label: 'Wandelkaart',
    emoji: '🏔️',
    accent: 'linear-gradient(135deg,#3b82f6,#22d3ee)',
    description: 'Topo-stijl voor routes en trails',
    url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
  },
  topo: {
    label: 'Hoogtekaart',
    emoji: '⛰️',
    accent: 'linear-gradient(135deg,#eab308,#f472b6)',
    description: 'Gedetailleerde hoogtekaart',
    url: `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`
  }
};

const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const DEFAULT_STYLE_ID = 'dataviz';
let currentStyleId = mapStyles[DEFAULT_STYLE_ID] ? DEFAULT_STYLE_ID : Object.keys(mapStyles)[0];


// Your park boundary (complete coordinates)
const lingezegenPark = {
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": { "naam": "Park Lingezegen" },
    "geometry": {
      "type": "MultiPolygon",
      "coordinates": [[[
        [5.829609538508772, 51.94556939503185],
        [5.837292573500244, 51.945369029665535],
        [5.837469874307739, 51.944531128435706],
        [5.84169554355305, 51.94425789638951],
        [5.849614979621182, 51.94300100753919],
        [5.850353732985749, 51.94449469759237],
        [5.866783607813677, 51.94179873307432],
        [5.868517215709191, 51.94206590796238],
        [5.872260232756321, 51.94138582329913],
        [5.875136445855693, 51.94043854533597],
        [5.876436651777329, 51.939977043697276],
        [5.877500456622302, 51.93876254301436],
        [5.879391665235588, 51.93878683335023],
        [5.883528684077153, 51.937232225340736],
        [5.884907690357675, 51.93732938991953],
        [5.888099104892595, 51.93565327144234],
        [5.892472524810821, 51.93560468736428],
        [5.89846135208623, 51.934122847712175],
        [5.890778317094754, 51.92542516298362],
        [5.912330215250331, 51.91320182476663],
        [5.914497225119722, 51.911719245346546],
        [5.920210251139025, 51.90661490908899],
        [5.923283465135616, 51.90564258878837],
        [5.92615967823499, 51.90180171782343],
        [5.928444888642711, 51.900853604199675],
        [5.930060295999893, 51.89995409329023],
        [5.931636303177632, 51.898592637115],
        [5.93309410981704, 51.89815501743958],
        [5.932345506407615, 51.89766876835641],
        [5.923559266391721, 51.89416761960748],
        [5.923519866212276, 51.89370564210801],
        [5.921195255625113, 51.89275735762361],
        [5.916112632476906, 51.89472684917323],
        [5.91378802188974, 51.89540764098992],
        [5.912881817762538, 51.89601548211008],
        [5.911660412199792, 51.900999469136515],
        [5.908035595690992, 51.900950847543534],
        [5.905513984206611, 51.90150999268583],
        [5.893733330553012, 51.90051325083852],
        [5.893457529296906, 51.899224746898646],
        [5.891408719965846, 51.89876282139316],
        [5.891369319786403, 51.89820364205845],
        [5.891684521221951, 51.89774170605436],
        [5.888296105789813, 51.8977052372202],
        [5.888217305430927, 51.897243296091766],
        [5.879450765504755, 51.897166305441935],
        [5.876456351867052, 51.89259525570898],
        [5.876666486157416, 51.891784737364695],
        [5.886069995651259, 51.89162263194157],
        [5.88685799924013, 51.89052029955677],
        [5.889694812160059, 51.889871856111434],
        [5.888644140708231, 51.88870463433223],
        [5.88817133855491, 51.88711586708832],
        [5.88817133855491, 51.885818872600225],
        [5.888591607135641, 51.88487852819344],
        [5.889064409288961, 51.88435970906534],
        [5.888906808571188, 51.883938164114475],
        [5.893372162241449, 51.88419757685977],
        [5.893319628668858, 51.88374360357305],
        [5.892111356499258, 51.88322477134567],
        [5.892058822926667, 51.881992520805625],
        [5.890745483611884, 51.88046837472791],
        [5.890745483611884, 51.87858744238104],
        [5.886122529223849, 51.87547400212894],
        [5.886595331377172, 51.873106345969255],
        [5.886280129941622, 51.87236034628411],
        [5.885912394933484, 51.871289977293756],
        [5.886332663514215, 51.869570846509035],
        [5.885964928506078, 51.86807871746441],
        [5.885124391344617, 51.86684605178513],
        [5.883285716303919, 51.866002629487284],
        [5.883180649158739, 51.865159191374296],
        [5.882707847005417, 51.86476990691108],
        [5.881657175553591, 51.86522407179063],
        [5.881341974118043, 51.86558091240769],
        [5.880711571246946, 51.86538627242203],
        [5.879976101230669, 51.867073124317024],
        [5.880133701948442, 51.86944109812247],
        [5.881447041263226, 51.87002496291429],
        [5.878662761915887, 51.877322633279924],
        [5.877349422601102, 51.87743614324227],
        [5.877218088669623, 51.881635810397796],
        [5.873225537152686, 51.88946657420691],
        [5.871728330333834, 51.88913424031801],
        [5.869127918490564, 51.88906939439463],
        [5.867473110953939, 51.88928014330356],
        [5.865739503058425, 51.889336883225575],
        [5.863533093009592, 51.889458468531544],
        [5.862416754592026, 51.88964489869516],
        [5.874315608783955, 51.90530227171043],
        [5.875655214885033, 51.91679059851293],
        [5.87665335276427, 51.92500400324756],
        [5.876994820986111, 51.927563297606625],
        [5.855718724086636, 51.931806869154585],
        [5.855561123368862, 51.92928021076292],
        [5.853118312243367, 51.929434081848164],
        [5.852645510090047, 51.92965273985123],
        [5.849349028409941, 51.92983090484382],
        [5.847602287121281, 51.929911888697525],
        [5.845737345294289, 51.930146741046876],
        [5.844148204723402, 51.93030870746826],
        [5.842664131297699, 51.93054355774096],
        [5.842230729323821, 51.93077030856222],
        [5.840812322863856, 51.93075411211297],
        [5.834679028263825, 51.938187667893246],
        [5.833155554658676, 51.93881922044426],
        [5.832603952146469, 51.940292808489296],
        [5.831343146404278, 51.940875753035336],
        [5.829609538508772, 51.94556939503185]
      ]]]
    }
  }]
};

// Load from localStorage or use default data
const loadBoomGebieden = () => {
  // Start with localStorage or default
  const saved = localStorage.getItem('boomGebiedenMetGebruik');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved data, using default');
    }
  }
  
  // Default data with usage
  return {
    ...boomGebieden,
    features: boomGebieden.features.map(feature => {
      const originalProps = feature.properties || {};
      const type = originalProps.type;
      const toepassingen = originalProps.toepassingen || usageByType[type] || 'Bruikbaar hout en biomassa voor lokale productie';
      return {
        ...feature,
        properties: {
          ...originalProps,
          toepassingen
        }
      };
    })
  };
};

// Save to localStorage
const saveBoomGebieden = () => {
  try {
    localStorage.setItem('boomGebiedenMetGebruik', JSON.stringify(boomGebiedenMetGebruik));
    console.log('Tree zones saved to localStorage');
  } catch (e) {
    console.error('Failed to save tree zones:', e);
  }
};

// ============================================
// SUPABASE DATABASE FUNCTIONS
// ============================================

// Load zones from Supabase
async function loadZonesFromDatabase() {
  try {
    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      // Convert database format to GeoJSON
      const features = data.map(zone => ({
        type: 'Feature',
        properties: {
          id: zone.id,
          naam: zone.naam,
          soort: zone.soort,
          type: zone.type,
          color: zone.color,
          toepassingen: zone.toepassingen,
          photos: zone.photos || []
        },
        geometry: zone.geometry
      }));

      return {
        type: 'FeatureCollection',
        features: features
      };
    }

    return null;
  } catch (error) {
    console.error('Error loading zones from database:', error);
    return null;
  }
}

// Save zone to Supabase
async function saveZoneToDatabase(feature) {
  try {
    const zoneData = {
      naam: feature.properties.naam,
      soort: feature.properties.soort,
      type: feature.properties.type,
      color: feature.properties.color,
      toepassingen: feature.properties.toepassingen,
      geometry: feature.geometry,
      photos: feature.properties.photos || []
    };

    const { data, error } = await supabase
      .from('zones')
      .insert([zoneData])
      .select()
      .single();

    if (error) throw error;

    // Update the feature with the database ID
    feature.properties.id = data.id;
    
    console.log('Zone saved to database:', data);
    return data;
  } catch (error) {
    console.error('Error saving zone to database:', error);
    showNotification('Fout bij opslaan naar database', 'error');
    throw error;
  }
}

// Update zone in Supabase
async function updateZoneInDatabase(feature) {
  try {
    const zoneData = {
      naam: feature.properties.naam,
      soort: feature.properties.soort,
      type: feature.properties.type,
      color: feature.properties.color,
      toepassingen: feature.properties.toepassingen,
      geometry: feature.geometry,
      photos: feature.properties.photos || []
    };

    const { data, error } = await supabase
      .from('zones')
      .update(zoneData)
      .eq('id', feature.properties.id)
      .select()
      .single();

    if (error) throw error;

    console.log('Zone updated in database:', data);
    return data;
  } catch (error) {
    console.error('Error updating zone in database:', error);
    showNotification('Fout bij updaten in database', 'error');
    throw error;
  }
}

// Delete zone from Supabase
async function deleteZoneFromDatabase(zoneId) {
  try {
    const { error } = await supabase
      .from('zones')
      .delete()
      .eq('id', zoneId);

    if (error) throw error;

    console.log('Zone deleted from database:', zoneId);
  } catch (error) {
    console.error('Error deleting zone from database:', error);
    showNotification('Fout bij verwijderen uit database', 'error');
    throw error;
  }
}

// Subscribe to real-time changes
function subscribeToZoneChanges() {
  const channel = supabase
    .channel('zones-changes')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'zones' 
      }, 
      async (payload) => {
        console.log('Database change detected:', payload);
        
        // Reload zones from database
        const freshZones = await loadZonesFromDatabase();
        if (freshZones) {
          boomGebiedenMetGebruik = freshZones;
          addCustomSourcesAndLayers();
          if (adminMode) {
            refreshZonesList();
          }
          showNotification('Zones bijgewerkt', 'info');
        }
      }
    )
    .subscribe();

  return channel;
}

let boomGebiedenMetGebruik = loadBoomGebieden();

// Load from database in background and update if available
(async () => {
  const dbZones = await loadZonesFromDatabase();
  if (dbZones && dbZones.features.length > 0) {
    console.log('Loaded zones from Supabase database');
    boomGebiedenMetGebruik = dbZones;
    
    // Refresh map if it's already initialized
    if (typeof addCustomSourcesAndLayers === 'function') {
      addCustomSourcesAndLayers();
    }
  }
  
  // Subscribe to real-time changes
  if (currentMode === 'staff') {
    subscribeToZoneChanges();
  }
})();

const defaultTypeMeta = {
  label: 'Boomzone',
  icon: '🌳',
  fill: 'rgba(34,139,34,0.5)',
  stroke: 'rgba(34,139,34,1)',
  surface: 'rgba(15,23,42,0.95)',
  pillBg: 'rgba(187,247,208,0.95)',
  pillColor: '#052e16',
  description: 'Groene parkzone met gemengde beplanting.',
  badges: ['schaduw', 'biodiversiteit'],
  border: 'rgba(74,222,128,0.45)',
  glow: 'rgba(34,197,94,0.25)',
  subtitle: 'Park Lingezegen'
};

const typeMeta = {
  wetland_forest: {
    label: 'Waterrijk bos',
    icon: '🌊',
    fill: 'rgba(100,149,237,0.5)',
    stroke: 'rgba(100,149,237,0.95)',
    pillBg: 'rgba(191,219,254,0.95)',
    pillColor: '#082f49',
    description: 'Ooibos met wilgen, populieren en elzen voor waterbuffering.',
    badges: ['waterberging', 'knotwilgen', 'ooibos'],
    border: 'rgba(59,130,246,0.45)',
    glow: 'rgba(59,130,246,0.28)',
    products: createProducts({
      logs: ['Palen voor vlonders', 'Gekliefde oeverbeschoeiing'],
      lumber: ['Nat hout voor boardwalks', 'Constructie voor observatiehutten'],
      fibers: ['Bastvezels voor touw', 'Wilgentenen voor manden'],
      residues: ['Slibfilter van houtsnippers', 'Biochar uit natte biomassa']
    })
  },
  orchard: {
    label: 'Boomgaard',
    icon: '🍎',
    fill: 'rgba(255,99,71,0.5)',
    stroke: 'rgba(255,99,71,0.95)',
    pillBg: 'rgba(254,215,170,0.95)',
    pillColor: '#7c2d12',
    description: 'Historische fruitbomen en erfgoedrassen.',
    badges: ['fruitteelt', 'erfgoed', 'biodiversiteit'],
    border: 'rgba(251,146,60,0.5)',
    glow: 'rgba(251,146,60,0.25)',
    products: createProducts({
      harvest: ['Hoogwaardige dessertappels', 'Cider, siroop, azijn'],
      processing: ['Gedroogde schijfjes als snacks', 'Pectine voor confituur'],
      wood: ['Appelhout voor rooksnippers', 'Takjes voor theeblend'],
      residues: ['Schillen voor diervoeder', 'Pulp voor compost met fruitzuur']
    })
  },
  nut_grove: {
    label: 'Notengaard',
    icon: '🌰',
    fill: 'rgba(139,69,19,0.5)',
    stroke: 'rgba(139,69,19,0.95)',
    pillBg: 'rgba(248,211,166,0.95)',
    pillColor: '#5f370e',
    description: 'Walnoten, hazelaars en andere noten voor voedsel en hout.',
    badges: ['noten', 'voedsel', 'heggen'],
    border: 'rgba(217,119,6,0.5)',
    glow: 'rgba(217,119,6,0.24)',
    products: createProducts({
      harvest: ['Walnoten en hazelnoten voor retail', 'Notenolie koudgeperst'],
      lumber: ['Walnotenhoutfineer', 'Hazelaarstammen voor stokken'],
      byproducts: ['Notenschalen voor kleurstof', 'Gemalen schil als scrub'],
      residues: ['Perskoek voor plantaardig meel', 'Schilcompost rijk aan calcium']
    })
  },
  avenue: {
    label: 'Laanbeplanting',
    icon: '🌿',
    fill: 'rgba(60,179,113,0.5)',
    stroke: 'rgba(60,179,113,0.95)',
    pillBg: 'rgba(187,247,208,0.95)',
    pillColor: '#064e3b',
    description: 'Begeleide lanen met linden en eiken voor structuur en schaduw.',
    badges: ['structuur', 'schaduw', 'wandelroute'],
    border: 'rgba(34,197,94,0.45)',
    glow: 'rgba(34,197,94,0.25)',
    products: createProducts({
      logs: ['Eiken balken voor draagstructuren', 'Lindehout voor klankkasten'],
      specialty: ['Bloesem voor lindehoning', 'Lindeblad voor kruidenthee'],
      byproducts: ['Snoeihout voor wattle fences', 'Bast voor touw en papier'],
      residues: ['Sawdust voor rookhout', 'Houtsnippers voor wandelpaden']
    })
  },
  mixed_woodland: {
    label: 'Gemengd bos',
    icon: '🌳',
    fill: 'rgba(34,139,34,0.5)',
    stroke: 'rgba(34,139,34,0.95)',
    pillBg: 'rgba(187,247,208,0.95)',
    pillColor: '#14532d',
    description: 'Variatie aan loofbomen voor biodiversiteit en microklimaat.',
    badges: ['biodiversiteit', 'nestgelegenheid', 'schaduw'],
    border: 'rgba(74,222,128,0.45)',
    glow: 'rgba(74,222,128,0.25)',
    products: createProducts({
      logs: ['Selectie voor parket', 'Fineer voor interieurs'],
      fibers: ['Bastmix voor papier', 'Takjes voor bio-based panelen'],
      extracts: ['Berkensap voor drank', 'Eiken tannine voor looien'],
      residues: ['Houtsnippers voor mulch', 'Sawdust voor rookmot']
    })
  },
  educational_route: {
    label: 'Educatieve route',
    icon: '🧭',
    fill: 'rgba(210,105,30,0.5)',
    stroke: 'rgba(210,105,30,0.95)',
    pillBg: 'rgba(254,215,170,0.95)',
    pillColor: '#78350f',
    description: 'Route met bijzondere bomen en verhalen.',
    badges: ['educatie', 'wandelroute', 'beleving'],
    border: 'rgba(249,115,22,0.45)',
    glow: 'rgba(249,115,22,0.25)',
    products: createProducts({
      showcase: ['Demoblokken voor leertrajecten', 'Gegraveerde planken voor wayfinding'],
      craft: ['Relikwieën voor souvenirshop', 'Handvatten voor gereedschap'],
      residues: ['Afvalhout voor pyrography', 'Sawdust voor kinderkunst'],
      digital: ['3D scans van bijzondere stammen', 'Augmented reality assets']
    })
  },
  deciduous_forest: {
    label: 'Loofbos',
    icon: '🍂',
    fill: 'rgba(46,139,87,0.5)',
    stroke: 'rgba(46,139,87,0.95)',
    pillBg: 'rgba(187,247,208,0.95)',
    pillColor: '#14532d',
    description: 'Eiken, lindes en beuken zorgen voor schaduw en biodiversiteit.',
    badges: ['koelte', 'fauna', 'hout'],
    border: 'rgba(74,222,128,0.45)',
    glow: 'rgba(74,222,128,0.25)',
    products: createProducts({
      lumber: ['Massieve vloerdelen', 'Trapbomen en treden'],
      byproducts: ['Schorsmulch', 'Houtskool voor slow food'],
      sawdust: ['Rookmot voor vis en kaas', 'Vulstof voor bio-composieten'],
      residues: ['Leaf mold voor potgrond', 'Biochar voor bodemverbetering']
    })
  },
  hedgerow: {
    label: 'Heggen',
    icon: '🪵',
    fill: 'rgba(255,215,0,0.5)',
    stroke: 'rgba(255,215,0,0.95)',
    pillBg: 'rgba(254,249,195,0.95)',
    pillColor: '#713f12',
    description: 'Meidoorn, sleedoorn en haagbeuk als natuurlijke afscheiding.',
    badges: ['nestplek', 'bijen', 'windbreker'],
    border: 'rgba(250,204,21,0.5)',
    glow: 'rgba(250,204,21,0.25)',
    products: createProducts({
      craft: ['Vlechtwerk voor natuurlijke hekken', 'Prikkeldraadvervangers'],
      harvest: ['Meidoornbessen voor jam', 'Sleedoorn voor gin'],
      habitat: ['Takbossen voor insecthotels', 'Bijenvoer'],
      residues: ['Houtsnippers voor paadjes', 'Leaves voor mulch']
    })
  },
  riparian_forest: {
    label: 'Oeverbos',
    icon: '💧',
    fill: 'rgba(0,128,128,0.5)',
    stroke: 'rgba(0,128,128,0.95)',
    pillBg: 'rgba(167,243,208,0.95)',
    pillColor: '#064e3b',
    description: 'Langs waterlopen voor koelte en waterveiligheid.',
    badges: ['waterveiligheid', 'koelte', 'vissen'],
    border: 'rgba(45,212,191,0.45)',
    glow: 'rgba(45,212,191,0.25)',
    products: createProducts({
      logs: ['Waterbestendige palen', 'Elzenhout voor rookovens'],
      fibers: ['Wilgenbast voor bio-textiel', 'Rietmix voor dakbedekking'],
      extracts: ['Schors tannine voor verf', 'Wilgensalixine als natuurlijke pijnstiller'],
      residues: ['Nat houtchips als filter', 'Biochar uit overschot']
    })
  },
  pollarded_trees: {
    label: 'Knotbomen',
    icon: '✂️',
    fill: 'rgba(176,224,230,0.5)',
    stroke: 'rgba(176,224,230,0.95)',
    pillBg: 'rgba(191,219,254,0.95)',
    pillColor: '#1e3a8a',
    description: 'Geknotte wilgen, populieren en linden langs de grens.',
    badges: ['beheer', 'landschap', 'historie'],
    border: 'rgba(147,197,253,0.5)',
    glow: 'rgba(147,197,253,0.3)',
    products: createProducts({
      poles: ['Staken voor bonenrekken', 'Staanders voor tuinconstructies'],
      craft: ['Knotwilgscheuten voor mandvlechten', 'Bast voor koorden'],
      residues: ['Sawdust voor stalstrooisel', 'Snippers voor biomassa'],
      heritage: ['Educatief materiaal over knotbeheer', 'Workshops wilgentenen']
    })
  },
  food_forest: {
    label: 'Voedselbos',
    icon: '🥗',
    fill: 'rgba(147,112,219,0.5)',
    stroke: 'rgba(147,112,219,0.95)',
    pillBg: 'rgba(233,213,255,0.95)',
    pillColor: '#581c87',
    description: 'Laag-op-laag voedselbos met diverse eetbare soorten.',
    badges: ['voedsel', 'educatie', 'permacultuur'],
    border: 'rgba(192,132,252,0.5)',
    glow: 'rgba(192,132,252,0.3)',
    products: createProducts({
      harvest: ['Bessen, bladgroen, noten', 'Peren, vijgen en kruiden'],
      processed: ['Fermentaties en chutneys', 'Plant-based spreads'],
      fibers: ['Hennep/vezelmix voor touwen', 'Takjes voor biochar'],
      residues: ['Mulchlaag uit bladeren', 'Compostthee voor bodemherstel']
    })
  },
  hedge_system: {
    label: 'Hoopheggen',
    icon: '🪵',
    fill: 'rgba(255,165,0,0.5)',
    stroke: 'rgba(255,165,0,0.95)',
    pillBg: 'rgba(254,215,170,0.95)',
    pillColor: '#7c2d12',
    description: 'Meervoudig gevlochten heggen voor fauna en erfgoed.',
    badges: ['habitat', 'cultuur', 'beschutting'],
    border: 'rgba(251,146,60,0.5)',
    glow: 'rgba(251,146,60,0.25)',
    products: createProducts({
      craft: ['Hoopheggenpanelen', 'Stokhout voor gereedschap'],
      harvest: ['Sleedoornbessen voor sloe gin', 'Meidoornblad voor tinctuur'],
      byproducts: ['Vogelvoer mixen', 'Stekjes voor plantgoed'],
      residues: ['Snippers voor padverharding', 'Bladcompost voor bloembedden']
    })
  },
  willow_stand: {
    label: 'Wilgenstrook',
    icon: '🍃',
    fill: 'rgba(135,206,250,0.5)',
    stroke: 'rgba(135,206,250,0.95)',
    pillBg: 'rgba(186,230,253,0.95)',
    pillColor: '#0c4a6e',
    description: 'Wilgenstroken voor windbreking en biomassa.',
    badges: ['windfilter', 'biomassa', 'biodiversiteit'],
    border: 'rgba(56,189,248,0.5)',
    glow: 'rgba(56,189,248,0.3)',
    products: createProducts({
      poles: ['Wilgenstaken voor hutten', 'Levendschermen voor wind'],
      craft: ['Mandwerk, sculpturen', 'Wilgenteen meubels'],
      fibers: ['Bast voor bio-textiel', 'Hout voor papiervezels'],
      residues: ['Sawdust voor dierbedding', 'Bio-energie pellets']
    })
  },
  forest_edge: {
    label: 'Bosrand',
    icon: '🌱',
    fill: 'rgba(107,142,35,0.5)',
    stroke: 'rgba(107,142,35,0.95)',
    pillBg: 'rgba(190,242,100,0.95)',
    pillColor: '#365314',
    description: 'Overgangszone tussen open veld en bos.',
    badges: ['ecologische rand', 'schuilplek'],
    border: 'rgba(132,204,22,0.45)',
    glow: 'rgba(132,204,22,0.25)',
    products: createProducts({
      logs: ['Speeltoestellen en klauterstammen', 'Kleine balken voor shelters'],
      fibers: ['Twijgen voor vlechtwerk', 'Bast voor papier'],
      residues: ['Bladcompost voor borders', 'Maaisel voor mulch'],
      habitat: ['Nestmateriaal kits', 'Takpakketten voor natuurspel']
    })
  },
  spontaneous_woodland: {
    label: 'Spoorbos',
    icon: '🚉',
    fill: 'rgba(189,183,107,0.5)',
    stroke: 'rgba(189,183,107,0.95)',
    pillBg: 'rgba(253,230,138,0.95)',
    pillColor: '#713f12',
    description: 'Spontaan bos met jonge opslag langs spoorlijnen.',
    badges: ['pioniersbos', 'natuurontwikkeling'],
    border: 'rgba(234,179,8,0.45)',
    glow: 'rgba(234,179,8,0.25)',
    products: createProducts({
      logs: ['Pallet- en kratthermen', 'Zaagtimmer voor oefenprojecten'],
      training: ['Zelfzagen voor vrijwilligers', 'Circulaire bouwmodules'],
      residues: ['Snippers voor houtsnipperpaden', 'Sawdust voor stal'],
      habitat: ['Deadwood habitats', 'Houtblokken voor insecthotels']
    })
  },
  heritage_orchard: {
    label: 'Erfgoedbongerd',
    icon: '🍐',
    fill: 'rgba(255,20,147,0.5)',
    stroke: 'rgba(255,20,147,0.95)',
    pillBg: 'rgba(251,207,232,0.95)',
    pillColor: '#831843',
    description: 'Bijzondere collectie fruitbomen uit Europa.',
    badges: ['erfgoed', 'veredeling', 'educatie'],
    border: 'rgba(244,114,182,0.45)',
    glow: 'rgba(244,114,182,0.25)',
    products: createProducts({
      harvest: ['Historische fruitselecties', 'Sappen voor proeverij'],
      genetics: ['Entmateriaal voor kwekerij', 'Zaailingen voor onderzoek'],
      wood: ['Fruitboom hout voor lepels', 'Schors voor kleurstoffen'],
      residues: ['Pulp voor cosmetica', 'Schilcompost voor kwekerij']
    })
  },
  parkland: {
    label: 'Parklandschap',
    icon: '🌼',
    fill: 'rgba(152,251,152,0.5)',
    stroke: 'rgba(152,251,152,0.95)',
    pillBg: 'rgba(220,252,231,0.95)',
    pillColor: '#065f46',
    description: 'Open graslanden met solitaire bomen voor recreatie.',
    badges: ['picknick', 'speelveld', 'zichtlijnen'],
    border: 'rgba(74,222,128,0.45)',
    glow: 'rgba(74,222,128,0.25)',
    products: createProducts({
      timber: ['Solitaire stammen voor eye-catcher meubels', 'Schaaldelen voor tafels'],
      craft: ['Takbundels voor kunst', 'Boomschijven voor signage'],
      residues: ['Grasstrooisel voor vee', 'Mulch voor moestuinen'],
      experience: ['Houtkits voor workshops', 'Picknickbank materiaal']
    })
  }
};

// Clip tree zones to park boundary
function clipZonesToPark(treeZones, parkBoundary) {
  const clippedFeatures = [];
  const parkFeature = parkBoundary.features[0];
  
  treeZones.features.forEach(zone => {
    try {
      // Check if zone is completely within park
      const isWithin = booleanWithin(zone, parkFeature);
      
      if (isWithin) {
        // Zone is completely inside - keep it as is
        clippedFeatures.push(zone);
      } else {
        // Zone overlaps or is outside - try to clip it
        const clipped = intersect(zone, parkFeature);
        
        if (clipped) {
          // Keep original properties
          clipped.properties = zone.properties;
          clippedFeatures.push(clipped);
        }
        // If clipped is null, the zone is completely outside - skip it
      }
    } catch (error) {
      console.warn('Failed to clip zone:', zone.properties?.naam, error);
      // On error, keep original zone
      clippedFeatures.push(zone);
    }
  });
  
  return {
    type: 'FeatureCollection',
    features: clippedFeatures
  };
}

const smoothLingezegenPark = smoothFeatureCollection(lingezegenPark, 3);
const clippedBoomGebieden = clipZonesToPark(boomGebiedenMetGebruik, lingezegenPark);
const smoothBoomGebieden = smoothFeatureCollection(clippedBoomGebieden, 2);
const fillColorExpression = buildTypeColorExpression('fill');
const strokeColorExpression = buildTypeColorExpression('stroke');

if (!MAPTILER_KEY) {
  console.warn('VITE_MAPTILER_KEY ontbreekt, demotiles worden gebruikt (beperkte details).');
}

const map = new maplibregl.Map({
  container: 'map',
  style: getStyleUrl(currentStyleId),
  center: [5.88, 51.91],
  zoom: 12.8,
  pitch: 0,
  attributionControl: true
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Create side panel for zone info
const zonePanel = document.createElement('div');
zonePanel.className = 'zone-panel';
document.body.appendChild(zonePanel);

map.on('load', () => {
  addCustomSourcesAndLayers();

  map.on('click', 'boom-fill', event => {
    const feature = event.features && event.features[0];
    console.log('Zone clicked:', feature?.properties?.naam);
    if (feature) {
      // Find the original feature with all properties including photos
      const featureId = feature.properties.id || feature.properties.naam;
      const originalFeature = boomGebiedenMetGebruik.features.find(f => 
        f.properties.id === featureId || f.properties.naam === featureId
      );
      showZonePanel(originalFeature || feature);
    }
  });

  map.on('mousemove', 'boom-fill', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'boom-fill', () => {
    map.getCanvas().style.cursor = '';
  });
});

const styleSwitcherControl = createStyleSwitcherControl({
  styles: mapStyles,
  initialStyle: currentStyleId,
  onSelect: styleId => {
    if (!mapStyles[styleId]) {
      return;
    }
    currentStyleId = styleId;
    map.setStyle(getStyleUrl(styleId));
  }
});

// Don't add to map - we'll add it to the DOM directly for better control
const styleSwitcherElement = styleSwitcherControl.onAdd();
document.body.appendChild(styleSwitcherElement);

// ============================================
// ADMIN PANEL FUNCTIONALITY
// ============================================
let adminMode = false;
let draw;

// Create admin toggle button
const adminToggle = document.createElement('button');
adminToggle.className = 'admin-toggle';
adminToggle.innerHTML = '⚙️ Admin';
adminToggle.title = 'Toggle Admin Mode';
document.body.appendChild(adminToggle);

// Hide admin toggle in visitor mode OR if no mode selected yet
if (currentMode === 'visitor' || currentMode === null) {
  adminToggle.style.display = 'none';
}

// Mode switcher button will be created in startMode() function

// Admin panel - ONLY for staff mode
let adminPanel;

// Create admin panel ONLY in staff mode or when not on mobile
if (currentMode === 'staff' || !isMobile) {
  adminPanel = document.createElement('div');
adminPanel.className = 'admin-panel';
adminPanel.innerHTML = `
  <div class="admin-panel__header">
    <h2>Beheerpaneel</h2>
    <button class="admin-panel__close">×</button>
  </div>
  <div class="admin-panel__content">
    <!-- Zone Templates -->
    <div class="admin-section">
      <h3>Zone Sjablonen</h3>
      <p class="admin-hint">Klik op een sjabloon om snel een vooraf ingevulde zone te maken</p>
      <div class="templates-grid">
        <button class="template-btn" data-template="wetland_forest">
          <span class="template-icon">🌊</span>
          <span class="template-name">Waterrijk Bos</span>
        </button>
        <button class="template-btn" data-template="orchard">
          <span class="template-icon">🍎</span>
          <span class="template-name">Boomgaard</span>
        </button>
        <button class="template-btn" data-template="nut_grove">
          <span class="template-icon">🌰</span>
          <span class="template-name">Notengaard</span>
        </button>
        <button class="template-btn" data-template="mixed_woodland">
          <span class="template-icon">🌳</span>
          <span class="template-name">Gemengd Bos</span>
        </button>
        <button class="template-btn" data-template="food_forest">
          <span class="template-icon">🥗</span>
          <span class="template-name">Voedselbos</span>
        </button>
        <button class="template-btn" data-template="hedgerow">
          <span class="template-icon">🪵</span>
          <span class="template-name">Heggen</span>
        </button>
      </div>
    </div>
    
    <div class="admin-section">
      <h3>Tekengereedschap</h3>
      <p class="admin-hint">Gebruik de tekengereedschappen op de kaart om polygonen te maken</p>
      <div class="button-group">
        <button class="admin-btn" id="drawPolygon">🔷 Teken Polygoon</button>
        <button class="admin-btn" id="deleteShape">🗑️ Verwijder Geselecteerde</button>
      </div>
    </div>
    
    <div class="admin-section">
      <h3>Zone Formulier</h3>
      <form id="zoneForm" autocomplete="off">
        <div class="form-group">
          <label>Zonenaam *</label>
          <input type="text" id="zoneName" required placeholder="bijv., Nieuwe bomenzone">
        </div>
        
        <div class="form-group">
          <label>Boomsoorten *</label>
          <input type="text" id="zoneSpecies" required placeholder="bijv., Eik, Es, Beuk">
        </div>
        
        <div class="form-group">
          <label>Zonetype *</label>
          <select id="zoneType" required>
            <option value="">-- Selecteer Type --</option>
            <option value="loofbos">Loofbos</option>
            <option value="gemengd_bos">Gemengd Bos</option>
            <option value="oeverbos">Oeverbos</option>
            <option value="moerasbos">Moerasbos</option>
            <option value="heggenrij">Heggenrij</option>
            <option value="heggensysteem">Heggensysteem</option>
            <option value="knotbomen">Knotbomen</option>
            <option value="wilgenopstand">Wilgenopstand</option>
            <option value="voedselbos">Voedselbos</option>
            <option value="erfboomgaard">Erfboomgaard</option>
            <option value="parklandschap">Parklandschap</option>
            <option value="bosrand">Bosrand</option>
            <option value="spontaan_bos">Spontaan Bos</option>
            <option value="educatieve_route">Educatieve Route</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Zone Kleur</label>
          <div class="color-picker-wrapper">
            <input type="color" id="zoneColor" value="#4ade80">
            <span class="color-preview" id="colorPreview">#4ade80</span>
          </div>
          <p class="admin-hint" style="margin-top: 5px;">Kies een kleur voor deze zone op de kaart</p>
        </div>
        
        <div class="form-group">
          <label>Foto's toevoegen</label>
          <div class="photo-dropzone" id="photoDropzone">
            <input type="file" id="zonePhoto" accept="image/*" multiple style="display: none;">
            <div class="dropzone-placeholder">
              <span class="dropzone-icon">📸</span>
              <p>Sleep foto's hierheen of klik om te selecteren</p>
              <span class="admin-hint">Meerdere bestanden tegelijk toegestaan</span>
            </div>
            <div class="photo-previews" id="photoPreviewsContainer"></div>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="admin-btn admin-btn-primary">💾 Zone Opslaan</button>
        </div>
      </form>
    </div>
    
    <div class="admin-section">
      <h3>Bestaande Zones</h3>
      <div class="zones-controls">
        <input type="text" id="zoneSearchInput" class="search-input" placeholder="🔍 Zoek zones... (Ctrl+F)">
        <div class="filter-controls">
          <select id="typeFilter" class="filter-select">
            <option value="">Alle Types</option>
            <option value="loofbos">Loofbos</option>
            <option value="gemengd_bos">Gemengd Bos</option>
            <option value="oeverbos">Oeverbos</option>
            <option value="moerasbos">Moerasbos</option>
            <option value="voedselbos">Voedselbos</option>
          </select>
          <select id="sortBy" class="filter-select">
            <option value="name">Sorteer: Naam</option>
            <option value="date">Sorteer: Datum</option>
            <option value="type">Sorteer: Type</option>
            <option value="size">Sorteer: Grootte</option>
          </select>
        </div>
        <div class="bulk-actions" id="bulkActionsBar" style="display: none;">
          <span id="selectedCount">0 geselecteerd</span>
          <button class="admin-btn admin-btn-small" id="bulkDeleteBtn">🗑️ Verwijder</button>
          <button class="admin-btn admin-btn-small" id="bulkExportBtn">📥 Export</button>
          <button class="admin-btn admin-btn-small" id="deselectAllBtn">✕ Deselecteer</button>
        </div>
      </div>
      <div id="zonesList" class="zones-list"></div>
    </div>
    
    <div class="admin-section">
      <h3>Gegevens Importeren</h3>
      <input type="file" id="importGeoJSON" accept=".geojson,.json" style="display: none;">
      <button class="admin-btn" id="importBtn">📤 Importeer GeoJSON</button>
    </div>
    
    <div class="admin-section">
      <h3>Gegevens Exporteren</h3>
      <button class="admin-btn admin-btn-success" id="exportGeoJSON">📥 Download GeoJSON</button>
      <button class="admin-btn admin-btn-success" id="exportCode">📋 Code Kopiëren</button>
      <button class="admin-btn admin-btn-success" id="printMap">🖨️ Print Kaart</button>
    </div>
    
    <div class="admin-section">
      <h3>Gegevens Resetten</h3>
      <button class="admin-btn" id="resetData" style="border-color: #dc2626; color: #dc2626;">🔄 Terugzetten naar Standaard</button>
      <p class="admin-hint" style="margin-top: 10px;">Dit herstelt de originele bomenzones en verwijdert al uw aangepaste wijzigingen.</p>
    </div>
  </div>
`;
document.body.appendChild(adminPanel);
}

// Create legend panel
const legendPanel = document.createElement('div');
legendPanel.className = 'legend-panel';
legendPanel.innerHTML = `
  <div class="legend-header">
    <h3>Legenda</h3>
    <button class="legend-close">×</button>
  </div>
  <div class="legend-content" id="legendContent"></div>
`;
document.body.appendChild(legendPanel);

// Populate legend
function updateLegend() {
  const legendContent = document.getElementById('legendContent');
  if (!legendContent) return;
  
  const types = {
    loofbos: { name: 'Loofbos', color: '#22c55e' },
    gemengd_bos: { name: 'Gemengd Bos', color: '#4ade80' },
    oeverbos: { name: 'Oeverbos', color: '#3b82f6' },
    moerasbos: { name: 'Moerasbos', color: '#0ea5e9' },
    heggenrij: { name: 'Heggenrij', color: '#8b5cf6' },
    heggensysteem: { name: 'Heggensysteem', color: '#a855f7' },
    knotbomen: { name: 'Knotbomen', color: '#d946ef' },
    wilgenopstand: { name: 'Wilgenopstand', color: '#ec4899' },
    voedselbos: { name: 'Voedselbos', color: '#f97316' },
    erfboomgaard: { name: 'Erfboomgaard', color: '#eab308' },
    parklandschap: { name: 'Parklandschap', color: '#84cc16' },
    bosrand: { name: 'Bosrand', color: '#10b981' },
    spontaan_bos: { name: 'Spontaan Bos', color: '#14b8a6' },
    educatieve_route: { name: 'Educatieve Route', color: '#06b6d4' }
  };
  
  let html = '';
  for (const [key, value] of Object.entries(types)) {
    html += `
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${value.color};"></span>
        <span class="legend-label">${value.name}</span>
      </div>
    `;
  }
  legendContent.innerHTML = html;
}

updateLegend();

// Create photo lightbox
const photoLightbox = document.createElement('div');
photoLightbox.className = 'photo-lightbox';
photoLightbox.innerHTML = `
  <div class="photo-lightbox__overlay"></div>
  <div class="photo-lightbox__content">
    <button class="photo-lightbox__close">×</button>
    <button class="photo-lightbox__prev">‹</button>
    <button class="photo-lightbox__next">›</button>
    <img class="photo-lightbox__image" src="" alt="" />
    <div class="photo-lightbox__info">
      <span class="photo-lightbox__counter"></span>
      <span class="photo-lightbox__date"></span>
    </div>
  </div>
`;
document.body.appendChild(photoLightbox);

let currentLightboxPhotos = [];
let currentLightboxIndex = 0;

function openPhotoLightbox(photos, index) {
  currentLightboxPhotos = photos;
  currentLightboxIndex = index;
  updateLightboxPhoto();
  photoLightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  photoLightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function updateLightboxPhoto() {
  const photo = currentLightboxPhotos[currentLightboxIndex];
  const img = photoLightbox.querySelector('.photo-lightbox__image');
  const counter = photoLightbox.querySelector('.photo-lightbox__counter');
  const date = photoLightbox.querySelector('.photo-lightbox__date');
  
  img.src = photo.url;
  img.alt = photo.name || 'Zone foto';
  counter.textContent = `${currentLightboxIndex + 1} / ${currentLightboxPhotos.length}`;
  date.textContent = new Date(photo.timestamp).toLocaleDateString('nl-NL');
  
  // Show/hide navigation buttons
  const prevBtn = photoLightbox.querySelector('.photo-lightbox__prev');
  const nextBtn = photoLightbox.querySelector('.photo-lightbox__next');
  prevBtn.style.display = currentLightboxIndex > 0 ? 'block' : 'none';
  nextBtn.style.display = currentLightboxIndex < currentLightboxPhotos.length - 1 ? 'block' : 'none';
}

function nextLightboxPhoto() {
  if (currentLightboxIndex < currentLightboxPhotos.length - 1) {
    currentLightboxIndex++;
    updateLightboxPhoto();
  }
}

function prevLightboxPhoto() {
  if (currentLightboxIndex > 0) {
    currentLightboxIndex--;
    updateLightboxPhoto();
  }
}

// Lightbox event listeners
photoLightbox.querySelector('.photo-lightbox__close').addEventListener('click', closeLightbox);
photoLightbox.querySelector('.photo-lightbox__overlay').addEventListener('click', closeLightbox);
photoLightbox.querySelector('.photo-lightbox__next').addEventListener('click', nextLightboxPhoto);
photoLightbox.querySelector('.photo-lightbox__prev').addEventListener('click', prevLightboxPhoto);

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
  if (!photoLightbox.classList.contains('active')) return;
  
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextLightboxPhoto();
  if (e.key === 'ArrowLeft') prevLightboxPhoto();
});

// Color picker update handler - ONLY if admin panel exists
if (adminPanel) {
  const colorInput = document.getElementById('zoneColor');
  const colorPreview = document.getElementById('colorPreview');

  colorInput.addEventListener('input', (e) => {
    const color = e.target.value;
    colorPreview.textContent = color.toUpperCase();
    colorPreview.style.color = color;
  });
}

// Photo upload handler - store photos temporarily until zone is saved - ONLY if admin panel exists
if (adminPanel) {
  let pendingPhotos = [];

  document.getElementById('zonePhoto').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length === 0) return;
    
    pendingPhotos = [];
    let filesProcessed = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        pendingPhotos.push({
          url: event.target.result,
          name: file.name,
          timestamp: Date.now()
        });
        filesProcessed++;
        
        if (filesProcessed === files.length) {
          showNotification(`${files.length} foto${files.length > 1 ? "'s" : ''} geselecteerd`, 'success');
        }
      };
      
      reader.readAsDataURL(file);
    }
  });

// Initialize MapboxDraw - ONLY if admin panel exists
draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: {},
  styles: [
    // Polygon fill
    {
      'id': 'gl-draw-polygon-fill',
      'type': 'fill',
      'filter': ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      'paint': {
        'fill-color': '#cad400',
        'fill-outline-color': '#cad400',
        'fill-opacity': 0.3
      }
    },
    // Polygon outline stroke
    {
      'id': 'gl-draw-polygon-stroke-active',
      'type': 'line',
      'filter': ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      'layout': {
        'line-cap': 'round',
        'line-join': 'round'
      },
      'paint': {
        'line-color': '#cad400',
        'line-width': 3
      }
    },
    // Vertex points
    {
      'id': 'gl-draw-polygon-and-line-vertex-active',
      'type': 'circle',
      'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      'paint': {
        'circle-radius': 5,
        'circle-color': '#fff',
        'circle-stroke-color': '#cad400',
        'circle-stroke-width': 2
      }
    }
  ]
});

  // Admin toggle functionality - ONLY if admin panel exists
  if (adminPanel) {
    adminToggle.addEventListener('click', () => {
    adminMode = !adminMode;
    if (adminMode) {
      adminPanel.classList.add('active');
      adminToggle.classList.add('active');
      map.addControl(draw, 'top-left');
      refreshZonesList();
    } else {
      adminPanel.classList.remove('active');
      adminToggle.classList.remove('active');
      map.removeControl(draw);
    }
  });

  // Close admin panel
  adminPanel.querySelector('.admin-panel__close').addEventListener('click', () => {
    adminMode = false;
    adminPanel.classList.remove('active');
    adminToggle.classList.remove('active');
    map.removeControl(draw);
  });

  // Drawing tools
  document.getElementById('drawPolygon').addEventListener('click', () => {
    draw.changeMode('draw_polygon');
  });

  document.getElementById('deleteShape').addEventListener('click', () => {
    const selected = draw.getSelected();
    if (selected.features.length > 0) {
      selected.features.forEach(feature => {
        draw.delete(feature.id);
      });
    }
  });

  // ============================================
  // PRODUCTIVITY FEATURES
  // ============================================

  // Zone Templates
  const zoneTemplates = {
    wetland_forest: {
      naam: 'Waterrijk Bos',
      soort: 'Wilg, Populier, Els',
      type: 'moerasbos',
      color: '#6495ed',
      toepassingen: 'Ooibos met wilgen, populieren en elzen voor waterbuffering'
    },
    orchard: {
      naam: 'Nieuwe Boomgaard',
      soort: 'Appel, Peer, Pruim',
      type: 'erfboomgaard',
      color: '#ff6347',
      toepassingen: 'Historische fruitbomen en erfgoedrassen'
    },
    nut_grove: {
      naam: 'Notengaard',
      soort: 'Walnoot, Hazelaar, Kastanje',
      type: 'nut_grove',
      color: '#8b4513',
      toepassingen: 'Walnoten, hazelaars en andere noten voor voedsel en hout'
    },
    mixed_woodland: {
      naam: 'Gemengd Bos',
      soort: 'Eik, Beuk, Es',
      type: 'gemengd_bos',
      color: '#228b22',
      toepassingen: 'Variatie aan loofbomen voor biodiversiteit'
    },
    food_forest: {
      naam: 'Voedselbos',
      soort: 'Diverse eetbare soorten',
      type: 'voedselbos',
      color: '#9370db',
      toepassingen: 'Laag-op-laag voedselbos met diverse eetbare soorten'
    },
    hedgerow: {
      naam: 'Heggenrij',
      soort: 'Meidoorn, Sleedoorn, Haagbeuk',
      type: 'heggenrij',
      color: '#ffd700',
      toepassingen: 'Natuurlijke afscheiding met biodiversiteit'
    }
  };

  // Template buttons
  document.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const templateKey = btn.dataset.template;
      const template = zoneTemplates[templateKey];
      if (template) {
        document.getElementById('zoneName').value = template.naam;
        document.getElementById('zoneSpecies').value = template.soort;
        document.getElementById('zoneType').value = template.type;
        document.getElementById('zoneColor').value = template.color;
        document.getElementById('colorPreview').textContent = template.color.toUpperCase();
        document.getElementById('colorPreview').style.color = template.color;
        showNotification(`Sjabloon "${template.naam}" geladen`, 'success');
        
        // Scroll to form
        document.getElementById('zoneForm').scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Drag & Drop for Photos
  const photoDropzone = document.getElementById('photoDropzone');
  const photoInput = document.getElementById('zonePhoto');
  const photoPreviewsContainer = document.getElementById('photoPreviewsContainer');

  photoDropzone.addEventListener('click', (e) => {
    if (e.target.closest('.photo-preview')) return;
    photoInput.click();
  });

  photoDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    photoDropzone.classList.add('dragover');
  });

  photoDropzone.addEventListener('dragleave', () => {
    photoDropzone.classList.remove('dragover');
  });

  photoDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    photoDropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handlePhotoFiles(files);
    }
  });

  photoInput.addEventListener('change', (e) => {
    handlePhotoFiles(e.target.files);
  });

  function handlePhotoFiles(files) {
    pendingPhotos = [];
    photoPreviewsContainer.innerHTML = '';
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const photoData = {
          url: event.target.result,
          name: file.name,
          timestamp: Date.now()
        };
        pendingPhotos.push(photoData);
        
        // Show preview
        const preview = document.createElement('div');
        preview.className = 'photo-preview';
        preview.innerHTML = `
          <img src="${photoData.url}" alt="${file.name}">
          <button class="photo-preview-remove" data-index="${pendingPhotos.length - 1}">×</button>
          <span class="photo-preview-name">${file.name}</span>
        `;
        photoPreviewsContainer.appendChild(preview);
        
        // Remove button
        preview.querySelector('.photo-preview-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(e.target.dataset.index);
          pendingPhotos.splice(index, 1);
          preview.remove();
          updatePhotoPreviewIndices();
        });
      };
      
      reader.readAsDataURL(file);
    }
    
    if (files.length > 0) {
      showNotification(`${files.length} foto${files.length > 1 ? "'s" : ''} toegevoegd`, 'success');
    }
  }

  function updatePhotoPreviewIndices() {
    photoPreviewsContainer.querySelectorAll('.photo-preview-remove').forEach((btn, index) => {
      btn.dataset.index = index;
    });
  }

  // Live Search & Filter
  const searchInput = document.getElementById('zoneSearchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortBy = document.getElementById('sortBy');
  let currentSearchTerm = '';
  let currentTypeFilter = '';
  let currentSort = 'name';

  searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.toLowerCase();
    refreshZonesList();
  });

  typeFilter.addEventListener('change', (e) => {
    currentTypeFilter = e.target.value;
    refreshZonesList();
  });

  sortBy.addEventListener('change', (e) => {
    currentSort = e.target.value;
    refreshZonesList();
  });

  // Bulk Selection
  let selectedZones = new Set();

  // Bulk operations are still available via keyboard shortcuts and zone list checkboxes
  // No dedicated bulk edit button in quick actions anymore

  document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
    if (selectedZones.size === 0) return;
    if (confirm(`${selectedZones.size} zones verwijderen?`)) {
      const zonesToDelete = Array.from(selectedZones);
      zonesToDelete.forEach(zoneId => {
        const index = boomGebiedenMetGebruik.features.findIndex(f => 
          (f.properties.id || f.properties.naam) === zoneId
        );
        if (index !== -1) {
          saveToHistory('delete', boomGebiedenMetGebruik.features[index]);
          boomGebiedenMetGebruik.features.splice(index, 1);
        }
      });
      saveBoomGebieden();
      addCustomSourcesAndLayers();
      selectedZones.clear();
      refreshZonesList();
      updateBulkActionsBar();
      showNotification(`${zonesToDelete.length} zones verwijderd`, 'success');
    }
  });

  document.getElementById('bulkExportBtn').addEventListener('click', () => {
    if (selectedZones.size === 0) return;
    const selectedFeatures = boomGebiedenMetGebruik.features.filter(f =>
      selectedZones.has(f.properties.id || f.properties.naam)
    );
    const exportData = {
      type: 'FeatureCollection',
      features: selectedFeatures
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selected-zones-${Date.now()}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification(`${selectedZones.size} zones geëxporteerd`, 'success');
  });

  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    selectedZones.clear();
    updateBulkActionsBar();
    refreshZonesList();
  });

  function updateBulkActionsBar() {
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCount = document.getElementById('selectedCount');
    if (selectedZones.size > 0) {
      bulkActionsBar.style.display = 'flex';
      selectedCount.textContent = `${selectedZones.size} geselecteerd`;
    } else {
      bulkActionsBar.style.display = 'none';
    }
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Only when admin panel is active
    if (!adminMode) return;

    // Ctrl+S - Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      document.getElementById('zoneForm').requestSubmit();
    }

    // Ctrl+Z - Undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      redo();
    }

    // Ctrl+F - Focus search
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('zoneSearchInput');
      if (searchInput) searchInput.focus();
    }

    // Ctrl+N - New zone (focus name field)
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      document.getElementById('zoneName').focus();
      document.getElementById('zoneForm').scrollIntoView({ behavior: 'smooth' });
    }

    // Ctrl+K - Show shortcuts
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      showShortcutsModal();
    }

    // Escape - Clear selection / close modals
    if (e.key === 'Escape') {
      selectedZones.clear();
      updateBulkActionsBar();
      refreshZonesList();
    }

    // Delete - Delete selected zones
    if (e.key === 'Delete' && selectedZones.size > 0) {
      const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
      if (bulkDeleteBtn) bulkDeleteBtn.click();
    }
  });

  // Show shortcuts modal function
  function showShortcutsModal() {
    const modal = document.createElement('div');
    modal.className = 'shortcuts-modal';
    modal.innerHTML = `
      <div class="shortcuts-modal__overlay"></div>
      <div class="shortcuts-modal__content">
        <h3>⌨️ Sneltoetsen</h3>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>S</kbd>
            <span>Zone opslaan</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Z</kbd>
            <span>Ongedaan maken</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Y</kbd>
            <span>Opnieuw</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>F</kbd>
            <span>Zoeken</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>N</kbd>
            <span>Nieuwe zone</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>K</kbd>
            <span>Sneltoetsen tonen</span>
          </div>
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>Deselecteren / Sluiten</span>
          </div>
          <div class="shortcut-item">
            <kbd>Delete</kbd>
            <span>Geselecteerde verwijderen</span>
          </div>
        </div>
        <button class="admin-btn admin-btn-primary" onclick="this.closest('.shortcuts-modal').remove()">Sluiten</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.shortcuts-modal__overlay').addEventListener('click', () => modal.remove());
  }

  // Auto-save is still active in background (no toggle button needed)
  
  // Continue with existing drawing tools
  document.getElementById('deleteShape').addEventListener('click', () => {
    const selected = draw.getSelected();
    if (selected.features.length > 0) {
      selected.features.forEach(feature => {
        draw.delete(feature.id);
      });
    }
  });

  // Edit mode tracking
  let editingZoneId = null;
  let editingFeature = null;

  // Zone form submission
  document.getElementById('zoneForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const drawnFeatures = draw.getAll();
  if (drawnFeatures.features.length === 0 && !editingZoneId) {
    alert('Teken eerst een polygoon op de kaart!');
    return;
  }
  
  const properties = {
    naam: document.getElementById('zoneName').value,
    soort: document.getElementById('zoneSpecies').value,
    type: document.getElementById('zoneType').value,
    color: document.getElementById('zoneColor').value,
    toepassingen: usageByType[document.getElementById('zoneType').value] || 'Bruikbaar hout en biomassa voor lokale productie'
  };
  
  // Only add photos if there are any
  if (pendingPhotos.length > 0) {
    properties.photos = pendingPhotos;
  }
  
  if (editingZoneId && editingFeature) {
    // EDIT MODE - Update existing zone
    Object.assign(editingFeature.properties, properties);
    
    // If there's a new drawing, update geometry too
    if (drawnFeatures.features.length > 0) {
      const lastFeature = drawnFeatures.features[drawnFeatures.features.length - 1];
      editingFeature.geometry.coordinates = lastFeature.geometry.coordinates;
    }
    
    // Update in database
    await updateZoneInDatabase(editingFeature);
    
    saveToHistory('edit', editingFeature);
    saveBoomGebieden();
    addCustomSourcesAndLayers();
    
    showNotification(`Zone "${properties.naam}" bijgewerkt!`, 'success');
    
    // Clear edit mode
    editingZoneId = null;
    editingFeature = null;
  } else {
    // CREATE MODE - Add new zone
    const lastFeature = drawnFeatures.features[drawnFeatures.features.length - 1];
    const coords = lastFeature.geometry.coordinates;
    
    properties.id = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const newZone = {
      type: 'Feature',
      properties: properties,
      geometry: {
        type: 'Polygon',
        coordinates: coords
      }
    };
    
    // Save to database first
    await saveZoneToDatabase(newZone);
    
    boomGebiedenMetGebruik.features.push(newZone);
    
    console.log('New zone created:', newZone);
    console.log('Photos attached:', pendingPhotos.length);
    
    saveToHistory('add', newZone);
    saveBoomGebieden();
    addCustomSourcesAndLayers();
    
    console.log('Zone added to map, total zones:', boomGebiedenMetGebruik.features.length);
    
    showNotification(`Zone "${newZone.properties.naam}" succesvol toegevoegd!`, 'success');
  }
  
  // Clear form and drawing
  document.getElementById('zoneForm').reset();
  document.getElementById('zoneColor').value = '#4ade80';
  document.getElementById('colorPreview').textContent = '#4ADE80';
  pendingPhotos = [];
  photoPreviewsContainer.innerHTML = '';
  draw.deleteAll();
  
  // Refresh zones list
  refreshZonesList();
});

// Refresh zones list with search, filter, and sort
function refreshZonesList() {
  const zonesList = document.getElementById('zonesList');
  zonesList.innerHTML = '';
  
  // Filter zones
  let filteredZones = boomGebiedenMetGebruik.features.filter(feature => {
    const props = feature.properties;
    const matchesSearch = !currentSearchTerm || 
      (props.naam && props.naam.toLowerCase().includes(currentSearchTerm)) ||
      (props.type && props.type.toLowerCase().includes(currentSearchTerm)) ||
      (props.soort && props.soort.toLowerCase().includes(currentSearchTerm));
    
    const matchesType = !currentTypeFilter || props.type === currentTypeFilter;
    
    return matchesSearch && matchesType;
  });
  
  // Sort zones
  filteredZones.sort((a, b) => {
    switch (currentSort) {
      case 'name':
        return (a.properties.naam || '').localeCompare(b.properties.naam || '');
      case 'type':
        return (a.properties.type || '').localeCompare(b.properties.type || '');
      case 'date':
        return (b.properties.id || '').localeCompare(a.properties.id || '');
      case 'size':
        const areaA = area(a);
        const areaB = area(b);
        return areaB - areaA;
      default:
        return 0;
    }
  });
  
  // Render zones
  filteredZones.forEach((feature, index) => {
    const zoneItem = document.createElement('div');
    zoneItem.className = 'zone-item';
    
    const zoneId = feature.properties.id || feature.properties.naam;
    const isSelected = selectedZones.has(zoneId);
    if (isSelected) {
      zoneItem.classList.add('selected');
    }
    
    const colorIndicator = feature.properties.color 
      ? `<span class="zone-item__color" style="background-color: ${feature.properties.color}"></span>`
      : '';
    
    const bulkCheckbox = document.body.classList.contains('bulk-select-mode')
      ? `<input type="checkbox" class="zone-item__checkbox" ${isSelected ? 'checked' : ''} data-zone-id="${zoneId}">`
      : '';
    
    const zoneArea = (area(feature) / 10000).toFixed(2);
    
    zoneItem.innerHTML = `
      ${bulkCheckbox}
      ${colorIndicator}
      <div class="zone-item__info">
        <strong class="zone-item__name" contenteditable="false" data-zone-id="${zoneId}">${feature.properties.naam}</strong>
        <span class="zone-item__type">${feature.properties.type}</span>
        <span class="zone-item__area">${zoneArea} ha</span>
      </div>
      <div class="zone-item__actions">
        <button class="zone-item__zoom" data-zone-id="${zoneId}" title="Zoom naar zone">🔍</button>
        <button class="zone-item__edit" data-zone-id="${zoneId}" title="Bewerk">✏️</button>
        <button class="zone-item__delete" data-zone-id="${zoneId}" title="Verwijder">🗑️</button>
      </div>
    `;
    zonesList.appendChild(zoneItem);
  });
  
  // Show results count
  if (currentSearchTerm || currentTypeFilter) {
    const resultsInfo = document.createElement('div');
    resultsInfo.className = 'search-results-info';
    resultsInfo.textContent = `${filteredZones.length} van ${boomGebiedenMetGebruik.features.length} zones`;
    zonesList.insertBefore(resultsInfo, zonesList.firstChild);
  }
  
  // Add event handlers
  document.querySelectorAll('.zone-item__checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const zoneId = e.target.dataset.zoneId;
      if (e.target.checked) {
        selectedZones.add(zoneId);
      } else {
        selectedZones.delete(zoneId);
      }
      updateBulkActionsBar();
      refreshZonesList();
    });
  });
  
  document.querySelectorAll('.zone-item__zoom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const zoneId = e.target.dataset.zoneId;
      const feature = boomGebiedenMetGebruik.features.find(f => 
        (f.properties.id || f.properties.naam) === zoneId
      );
      if (feature) {
        const bounds = bbox(feature);
        map.fitBounds(bounds, { padding: 100, maxZoom: 16 });
        showZonePanel(feature);
      }
    });
  });
  
  document.querySelectorAll('.zone-item__edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const zoneId = e.target.dataset.zoneId;
      const feature = boomGebiedenMetGebruik.features.find(f => 
        (f.properties.id || f.properties.naam) === zoneId
      );
      if (feature) {
        // Set edit mode
        editingZoneId = zoneId;
        editingFeature = feature;
        
        // Load zone data into form
        document.getElementById('zoneName').value = feature.properties.naam || '';
        document.getElementById('zoneSpecies').value = feature.properties.soort || '';
        document.getElementById('zoneType').value = feature.properties.type || '';
        document.getElementById('zoneColor').value = feature.properties.color || '#4ade80';
        document.getElementById('colorPreview').textContent = (feature.properties.color || '#4ade80').toUpperCase();
        
        // Load photos if they exist
        if (feature.properties.photos && feature.properties.photos.length > 0) {
          pendingPhotos = [...feature.properties.photos];
          photoPreviewsContainer.innerHTML = '';
          feature.properties.photos.forEach((photoData, index) => {
            const preview = document.createElement('div');
            preview.className = 'photo-preview';
            preview.innerHTML = `
              <img src="${photoData}" alt="Preview ${index + 1}">
              <button class="photo-preview__remove" data-index="${index}">×</button>
            `;
            photoPreviewsContainer.appendChild(preview);
          });
        }
        
        // Load geometry into draw for editing
        draw.deleteAll();
        draw.add(feature);
        
        // Zoom to feature
        const bounds = turf.bbox(feature);
        map.fitBounds(bounds, { padding: 100, maxZoom: 16 });
        
        // Scroll to form
        document.getElementById('zoneForm').scrollIntoView({ behavior: 'smooth' });
        showNotification('Zone geladen voor bewerking - pas aan en klik opslaan', 'info');
      }
    });
  });
  
  document.querySelectorAll('.zone-item__delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const zoneId = e.target.dataset.zoneId;
      const feature = boomGebiedenMetGebruik.features.find(f => 
        (f.properties.id || f.properties.naam) === zoneId
      );
      if (feature) {
        const zoneName = feature.properties.naam;
        if (confirm(`Zone "${zoneName}" verwijderen?`)) {
          // Delete from database if it has an ID
          if (feature.properties.id) {
            await deleteZoneFromDatabase(feature.properties.id);
          }
          
          saveToHistory('delete', feature);
          const index = boomGebiedenMetGebruik.features.indexOf(feature);
          if (index !== -1) {
            boomGebiedenMetGebruik.features.splice(index, 1);
          }
          saveBoomGebieden();
          addCustomSourcesAndLayers();
          refreshZonesList();
          showNotification(`Zone "${zoneName}" verwijderd`, 'info');
        }
      }
    });
  });
  
  // Inline name editing
  document.querySelectorAll('.zone-item__name').forEach(nameEl => {
    nameEl.addEventListener('dblclick', (e) => {
      e.target.contentEditable = 'true';
      e.target.focus();
      document.execCommand('selectAll', false, null);
    });
    
    nameEl.addEventListener('blur', (e) => {
      e.target.contentEditable = 'false';
      const newName = e.target.textContent.trim();
      const zoneId = e.target.dataset.zoneId;
      const feature = boomGebiedenMetGebruik.features.find(f => 
        (f.properties.id || f.properties.naam) === zoneId
      );
      if (feature && newName && newName !== feature.properties.naam) {
        feature.properties.naam = newName;
        saveBoomGebieden();
        showNotification('Zone naam bijgewerkt', 'success');
      }
    });
    
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.target.textContent = e.target.dataset.originalName || e.target.textContent;
        e.target.blur();
      }
    });
  });
}

// Export GeoJSON
document.getElementById('exportGeoJSON').addEventListener('click', () => {
  const dataStr = JSON.stringify(boomGebiedenMetGebruik, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tree-zones.geojson';
  link.click();
  URL.revokeObjectURL(url);
});

// Export as code
document.getElementById('exportCode').addEventListener('click', () => {
  const code = `const boomGebiedenMetGebruik = ${JSON.stringify(boomGebiedenMetGebruik, null, 2)};`;
  navigator.clipboard.writeText(code).then(() => {
    alert('Code gekopieerd naar klembord! U kunt het plakken in main.js');
  });
});

// Reset to default data
document.getElementById('resetData').addEventListener('click', () => {
  if (confirm('Weet u zeker dat u alle bomenzones wilt resetten naar de standaardgegevens? Dit verwijdert al uw aangepaste wijzigingen!')) {
    localStorage.removeItem('boomGebiedenMetGebruik');
    boomGebiedenMetGebruik = loadBoomGebieden();
    addCustomSourcesAndLayers();
    refreshZonesList();
    saveToHistory('reset', { timestamp: Date.now() });
    alert('Bomenzones zijn teruggezet naar standaardgegevens!');
  }
});

// Import GeoJSON
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importGeoJSON').click();
});

document.getElementById('importGeoJSON').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    importGeoJSON(file);
    e.target.value = ''; // Reset input
  }
});

  // Print map
  document.getElementById('printMap').addEventListener('click', printMap);
  
  } // End of inner admin panel event listeners if block
} // End of photo upload handler if block

// Map click handler
map.on('click', (e) => {
  if (!map.isStyleLoaded()) {
    return;
  }
  const features = map.queryRenderedFeatures(e.point, { layers: ['boom-fill'] });
  if (!features.length) {
    hideZonePanel();
  }
});

// Legend toggle
document.querySelector('.legend-close').addEventListener('click', () => {
  legendPanel.classList.remove('active');
});

// ============================================
// END ADMIN PANEL
// ============================================

function addCustomSourcesAndLayers() {
  // Recalculate smoothed zones with current data
  const currentClippedZones = clipZonesToPark(boomGebiedenMetGebruik, lingezegenPark);
  const currentSmoothZones = smoothFeatureCollection(currentClippedZones, 2);
  
  ensureGeoSource('park-boundary', smoothLingezegenPark);
  ensureGeoSource('tree-zones', currentSmoothZones);

  ensureLayer('park-fill', {
    id: 'park-fill',
    type: 'fill',
    source: 'park-boundary',
    paint: {
      'fill-color': 'rgba(34,197,94,0.08)',
      'fill-outline-color': 'rgba(34,197,94,0.6)'
    }
  });

  ensureLayer('park-outline', {
    id: 'park-outline',
    type: 'line',
    source: 'park-boundary',
    paint: {
      'line-color': '#22c55e',
      'line-width': 3
    }
  });

  ensureLayer('boom-fill', {
    id: 'boom-fill',
    type: 'fill',
    source: 'tree-zones',
    paint: {
      'fill-color': fillColorExpression,
      'fill-opacity': 0.35,
      'fill-outline-color': strokeColorExpression
    }
  });

  ensureLayer('boom-outline', {
    id: 'boom-outline',
    type: 'line',
    source: 'tree-zones',
    paint: {
      'line-color': strokeColorExpression,
      'line-width': 1.8
    }
  });
  
  // Add zone labels
  ensureLayer('boom-labels', {
    id: 'boom-labels',
    type: 'symbol',
    source: 'tree-zones',
    layout: {
      'text-field': ['get', 'naam'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-anchor': 'center',
      'text-allow-overlap': false,
      'text-ignore-placement': false
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
      'text-halo-blur': 1
    }
  });
}

// Listen for style changes and restore overlays
map.on('styledata', (e) => {
  // Only restore when a new style is loaded (not on data updates)
  if (e.dataType === 'style') {
    addCustomSourcesAndLayers();
  }
});

function ensureGeoSource(id, data) {
  const existing = map.getSource(id);
  if (existing && typeof existing.setData === 'function') {
    existing.setData(data);
    return;
  }
  map.addSource(id, {
    type: 'geojson',
    data
  });
}

function ensureLayer(id, config) {
  if (map.getLayer(id)) {
    return;
  }
  map.addLayer(config);
}

function getStyleUrl(styleId) {
  return mapStyles[styleId]?.url || FALLBACK_STYLE_URL;
}

function createStyleSwitcherControl({ styles, initialStyle, onSelect }) {
  let activeStyle = initialStyle;
  let isOpen = false;
  
  const container = document.createElement('div');
  container.className = 'maplibregl-ctrl style-switcher';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'style-switcher__toggle';
  toggle.setAttribute('aria-label', 'Toggle basemap menu');
  toggle.innerHTML = `
    <span class="style-switcher__hamburger-line"></span>
    <span class="style-switcher__hamburger-line"></span>
    <span class="style-switcher__hamburger-line"></span>
  `;

  const panel = document.createElement('div');
  panel.className = 'style-switcher__panel';

  const label = document.createElement('div');
  label.className = 'style-switcher__label';
  label.textContent = 'Basemap';

  const grid = document.createElement('div');
  grid.className = 'style-switcher__grid';

  panel.append(label, grid);
  container.append(toggle, panel);

  function renderOptions() {
    grid.innerHTML = '';
    Object.entries(styles).forEach(([id, style]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.styleId = id;
      button.className = `style-switcher__option${id === activeStyle ? ' is-active' : ''}`;
      
      // Use local preview images
      const previewUrl = `/previews/${id}.png`;
      
      button.innerHTML = `
        <span class="style-switcher__swatch">
          <img src="${previewUrl}" alt="${style.label}" />
        </span>
        <div class="style-switcher__text">
          <span class="style-switcher__name">${style.label}</span>
          <span class="style-switcher__hint">${style.description || 'Mapstijl'}</span>
        </div>
      `;
      grid.appendChild(button);
    });
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    toggle.classList.toggle('is-open', isOpen);
    panel.classList.toggle('is-visible', isOpen);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen && !container.contains(e.target)) {
      isOpen = false;
      toggle.classList.remove('is-open');
      panel.classList.remove('is-visible');
    }
  });

  panel.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button[data-style-id]') : null;
    if (!target) return;
    const styleId = target.getAttribute('data-style-id');
    if (!styleId || styleId === activeStyle) return;
    activeStyle = styleId;
    renderOptions();
    onSelect(styleId);
    
    // Close menu after selection
    isOpen = false;
    toggle.classList.remove('is-open');
    panel.classList.remove('is-visible');
  });

  return {
    onAdd() {
      renderOptions();
      return container;
    },
    onRemove() {
      container.remove();
    },
    setActive(styleId) {
      activeStyle = styleId;
      renderOptions();
    }
  };
}

function buildTypeColorExpression(kind) {
  // First check if feature has a custom color property
  const expression = [
    'case',
    ['has', 'color'],
    ['get', 'color'], // Use custom color if it exists
    // Otherwise, match by type
    ['match', ['get', 'type']]
  ];
  
  const typeExpression = expression[3]; // Reference to the match expression
  Object.entries(typeMeta).forEach(([type, meta]) => {
    const value = kind === 'stroke'
      ? meta.stroke || defaultTypeMeta.stroke
      : meta.fill || defaultTypeMeta.fill;
    typeExpression.push(type, value);
  });
  typeExpression.push(kind === 'stroke' ? defaultTypeMeta.stroke : defaultTypeMeta.fill);
  
  return expression;
}

function showZonePanel(feature) {
  if (!feature) {
    hideZonePanel();
    return;
  }
  const props = feature.properties || {};
  const meta = getTypeMeta(props.type);
  const html = createZonePanelContent(props, meta);
  zonePanel.innerHTML = html;
  zonePanel.classList.add('is-open');
  styleSwitcherElement.classList.add('panel-open');
  
  // Add event listeners after content is added
  const closeBtn = zonePanel.querySelector('.zone-panel__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideZonePanel);
  }
  
  const sectionHeaders = zonePanel.querySelectorAll('.zone-panel__section-header');
  sectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.parentElement;
      section.classList.toggle('is-open');
    });
  });
  
  // Add lightbox event listeners to photos
  const photoElements = zonePanel.querySelectorAll('.zone-panel__photo');
  photoElements.forEach(photoEl => {
    photoEl.addEventListener('click', () => {
      const photosContainer = photoEl.parentElement;
      const photosData = JSON.parse(photosContainer.getAttribute('data-photos'));
      const photoIndex = parseInt(photoEl.getAttribute('data-photo-index'));
      openPhotoLightbox(photosData, photoIndex);
    });
  });
}

function hideZonePanel() {
  zonePanel.classList.remove('is-open');
  styleSwitcherElement.classList.remove('panel-open');
}

function createZonePanelContent(props, meta) {
  const zoneName = props.naam || 'Onbekende zone';
  const species = props.soort || 'Onbekende soorten';
  const usageText = props.toepassingen || meta.description || '';
  const productSections = props.products || meta.products || [];
  const badges = getBadgeList(props.badges, usageText, meta);
  
  const sections = [];
  
  // Species section
  sections.push(`
    <div class="zone-panel__section">
      <div class="zone-panel__section-header">
        <span class="zone-panel__section-label">Boomsoorten</span>
        <span class="zone-panel__section-toggle">▼</span>
      </div>
      <div class="zone-panel__section-content">
        <div class="zone-panel__section-inner">
          <div class="zone-panel__section-value">${species}</div>
        </div>
      </div>
    </div>
  `);
  
  // Usage section
  if (usageText) {
    sections.push(`
      <div class="zone-panel__section">
        <div class="zone-panel__section-header">
          <span class="zone-panel__section-label">Gebruik & Waarde</span>
          <span class="zone-panel__section-toggle">▼</span>
        </div>
        <div class="zone-panel__section-content">
          <div class="zone-panel__section-inner">
            <div class="zone-panel__section-value">${usageText}</div>
          </div>
        </div>
      </div>
    `);
  }
  
  // Products section
  if (productSections.length) {
    const productsMarkup = productSections.map(section => `
      <div class="zone-panel__product-group">
        <span class="zone-panel__product-label">${section.label}</span>
        <ul class="zone-panel__product-list">
          ${section.items.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    
    sections.push(`
      <div class="zone-panel__section">
        <div class="zone-panel__section-header">
          <span class="zone-panel__section-label">Productketen</span>
          <span class="zone-panel__section-toggle">▼</span>
        </div>
        <div class="zone-panel__section-content">
          <div class="zone-panel__section-inner">
            <div class="zone-panel__products">
              ${productsMarkup}
            </div>
          </div>
        </div>
      </div>
    `);
  }
  
  // Badges section
  if (badges.length) {
    const badgesMarkup = badges.map(text => `<span class="zone-panel__badge">${text}</span>`).join('');
    sections.push(`
      <div class="zone-panel__section">
        <div class="zone-panel__section-header">
          <span class="zone-panel__section-label">Kenmerken</span>
          <span class="zone-panel__section-toggle">▼</span>
        </div>
        <div class="zone-panel__section-content">
          <div class="zone-panel__section-inner">
            <div class="zone-panel__badges">
              ${badgesMarkup}
            </div>
          </div>
        </div>
      </div>
    `);
  }
  
  // Photos section
  if (props.photos && Array.isArray(props.photos) && props.photos.length > 0) {
    console.log('Displaying photos:', props.photos.length, props.photos);
    const photosMarkup = props.photos.map((photo, index) => `
      <div class="zone-panel__photo" data-photo-index="${index}">
        <img src="${photo.url}" alt="${photo.name || 'Zone foto'}" />
        <span class="zone-panel__photo-date">${new Date(photo.timestamp).toLocaleDateString('nl-NL')}</span>
      </div>
    `).join('');
    
    sections.push(`
      <div class="zone-panel__section">
        <div class="zone-panel__section-header">
          <span class="zone-panel__section-label">Foto's (${props.photos.length})</span>
          <span class="zone-panel__section-toggle">▼</span>
        </div>
        <div class="zone-panel__section-content">
          <div class="zone-panel__section-inner">
            <div class="zone-panel__photos" data-photos='${JSON.stringify(props.photos).replace(/'/g, "&apos;")}'>
              ${photosMarkup}
            </div>
          </div>
        </div>
      </div>
    `);
  } else {
    console.log('No photos to display. props.photos:', props.photos);
  }
  
  return `
    <div class="zone-panel__header">
      <div class="zone-panel__icon">${meta.icon || '🌳'}</div>
      <div class="zone-panel__header-info">
        <h3 class="zone-panel__title">${zoneName}</h3>
        <span class="zone-panel__type">${meta.label || 'Boomzone'}</span>
      </div>
      <button class="zone-panel__close">✕</button>
    </div>
    <div class="zone-panel__body">
      ${sections.join('')}
    </div>
  `;
}

function showFeaturePopup(feature, lngLat) {
  if (!feature) {
    hidePopup();
    return;
  }
  const props = feature.properties || {};
  const meta = getTypeMeta(props.type);
  const html = createPopupContent(props, meta);
  popup.setLngLat(lngLat).setHTML(html).addTo(map);
}

function hidePopup() {
  popup.remove();
}

function createPopupContent(props, meta) {
  const zoneName = props.naam || 'Onbekende zone';
  const subtitle = props.deelgebied || meta.subtitle || '';
  const species = props.soort || 'Onbekende soorten';
  const usageText = props.toepassingen || meta.description || '';
  const productSections = props.products || meta.products || [];
  const badges = getBadgeList(props.badges, usageText, meta);
  const subtitleMarkup = subtitle ? `<p class="popup-subtitle">${subtitle}</p>` : '';
  const usageMarkup = usageText ? `
    <div class="popup-detail">
      <span class="popup-detail-label">Gebruik & waarde</span>
      <span class="popup-detail-value">${usageText}</span>
    </div>` : '';
  const productsMarkup = productSections.length ? `
    <div class="popup-detail">
      <span class="popup-detail-label">Productketen</span>
      <div class="popup-products">
        ${productSections.map(section => `
          <div class="popup-product-group">
            <span class="popup-product-label">${section.label}</span>
            <ul class="popup-product-list">
              ${section.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>` : '';
  const badgeMarkup = badges.length ? `
    <div class="popup-badge-row">
      ${badges.map(text => `<span class="popup-badge">${text}</span>`).join('')}
    </div>` : '';

  return `
    <div class="popup-card">
      <div class="popup-header">
        <div class="popup-header-info">
          <h3 class="popup-title">${zoneName}</h3>
          ${subtitleMarkup}
        </div>
        <span class="popup-type-pill">
          ${meta.icon || '🌳'} ${meta.label || 'Boomzone'}
        </span>
      </div>
      <div class="popup-body">
        <div class="popup-detail">
          <span class="popup-detail-label">Boomsoorten</span>
          <span class="popup-detail-value">${species}</span>
        </div>
        ${usageMarkup}
        ${productsMarkup}
        ${badgeMarkup}
      </div>
    </div>`;
}

function getBadgeList(badgeProp, usageText, meta) {
  const explicitBadges = toBadgeArray(badgeProp);
  if (explicitBadges.length) return explicitBadges;

  const usageBadges = usageText && usageText.includes(',')
    ? usageText.split(',').map(item => item.trim()).filter(Boolean)
    : [];
  if (usageBadges.length) return usageBadges.slice(0, 4);

  if (meta.products && meta.products.length) {
    return meta.products
      .map(section => section.label)
      .slice(0, 3);
  }

  return meta.badges || [];
}

function toBadgeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function createProducts(sections) {
  const entries = Object.entries(sections || {});
  return entries.map(([key, value]) => ({
    label: formatProductLabel(key),
    items: Array.isArray(value) ? value : [value].filter(Boolean)
  })).filter(section => section.items.length);
}

function formatProductLabel(key) {
  const mapping = {
    logs: 'Stammen & balken',
    lumber: 'Zagerijproducten',
    fibers: 'Vezels & bast',
    residues: 'Bijproducten & reststromen',
    harvest: 'Verse oogst',
    processing: 'Verwerking',
    wood: 'Houttoepassingen',
    sawdust: 'Sawdust & schors',
    byproducts: 'Nevenstromen',
    poles: 'Staken & palen',
    craft: 'Ambacht & design',
    specialty: 'Specifieke toepassingen',
    extracts: 'Extracten & chemie',
    showcase: 'Demonstratie',
    digital: 'Digitale toepassingen',
    habitat: 'Habitatmateriaal',
    training: 'Training & experiment',
    genetics: 'Genetisch materiaal',
    processed: 'Verwerkte voeding',
    experience: 'Beleving & educatie'
  };
  return mapping[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function getTypeMeta(type) {
  return typeMeta[type] || defaultTypeMeta;
}

function smoothFeatureCollection(featureCollection, iterations = 2) {
  return {
    ...featureCollection,
    features: featureCollection.features.map(feature => ({
      ...feature,
      geometry: smoothGeometry(feature.geometry, iterations)
    }))
  };
}

function smoothGeometry(geometry, iterations) {
  if (!geometry) return geometry;

  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(ring => smoothRing(ring, iterations))
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(polygon =>
        polygon.map(ring => smoothRing(ring, iterations))
      )
    };
  }

  return geometry;
}

function smoothRing(ring, iterations) {
  if (!ring || ring.length < 4) {
    return ring;
  }

  let workingRing = ring;
  const isClosed = pointsEqual(workingRing[0], workingRing[workingRing.length - 1]);
  if (isClosed) {
    workingRing = workingRing.slice(0, -1);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRing = [];
    for (let i = 0; i < workingRing.length; i++) {
      const current = workingRing[i];
      const next = workingRing[(i + 1) % workingRing.length];
      const q = [
        0.75 * current[0] + 0.25 * next[0],
        0.75 * current[1] + 0.25 * next[1]
      ];
      const r = [
        0.25 * current[0] + 0.75 * next[0],
        0.25 * current[1] + 0.75 * next[1]
      ];
      newRing.push(q);
      newRing.push(r);
    }
    workingRing = newRing;
  }

  return [...workingRing, workingRing[0]];
}

function pointsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1];
}

// ============================================================================
// ADVANCED FEATURES
// ============================================================================

// History management for undo/redo
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function saveToHistory(action, data) {
  // Remove any forward history when making a new change
  historyStack = historyStack.slice(0, historyIndex + 1);
  
  historyStack.push({ action, data, timestamp: Date.now() });
  
  // Limit history size
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  } else {
    historyIndex++;
  }
  
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex < 0) return;
  
  const entry = historyStack[historyIndex];
  
  if (entry.action === 'add') {
    // Remove the added zone
    const zones = loadZonesFromStorage();
    const filtered = zones.features.filter(f => f.properties.id !== entry.data.id);
    saveZonesToStorage({ type: 'FeatureCollection', features: filtered });
  } else if (entry.action === 'delete') {
    // Restore the deleted zone
    const zones = loadZonesFromStorage();
    zones.features.push(entry.data);
    saveZonesToStorage(zones);
  } else if (entry.action === 'edit') {
    // Restore previous version
    const zones = loadZonesFromStorage();
    const index = zones.features.findIndex(f => f.properties.id === entry.data.old.properties.id);
    if (index !== -1) {
      zones.features[index] = entry.data.old;
      saveZonesToStorage(zones);
    }
  }
  
  historyIndex--;
  updateUndoRedoButtons();
  refreshZonesList();
  updateZoneLayer();
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  
  historyIndex++;
  const entry = historyStack[historyIndex];
  
  if (entry.action === 'add') {
    // Re-add the zone
    const zones = loadZonesFromStorage();
    zones.features.push(entry.data);
    saveZonesToStorage(zones);
  } else if (entry.action === 'delete') {
    // Re-delete the zone
    const zones = loadZonesFromStorage();
    const filtered = zones.features.filter(f => f.properties.id !== entry.data.properties.id);
    saveZonesToStorage({ type: 'FeatureCollection', features: filtered });
  } else if (entry.action === 'edit') {
    // Re-apply the edit
    const zones = loadZonesFromStorage();
    const index = zones.features.findIndex(f => f.properties.id === entry.data.new.properties.id);
    if (index !== -1) {
      zones.features[index] = entry.data.new;
      saveZonesToStorage(zones);
    }
  }
  
  updateUndoRedoButtons();
  refreshZonesList();
  updateZoneLayer();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  
  if (undoBtn) undoBtn.disabled = historyIndex < 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

// Search functionality
let searchResults = [];
let currentSearchIndex = 0;

function performSearch(query) {
  if (!query || query.trim() === '') {
    clearSearch();
    return;
  }
  
  const lowerQuery = query.toLowerCase();
  
  searchResults = boomGebiedenMetGebruik.features.filter(feature => {
    const name = (feature.properties.naam || '').toLowerCase();
    const type = (feature.properties.type || '').toLowerCase();
    const species = (feature.properties.soort || '').toLowerCase();
    
    return name.includes(lowerQuery) || 
           type.includes(lowerQuery) || 
           species.includes(lowerQuery);
  });
  
  if (searchResults.length > 0) {
    currentSearchIndex = 0;
    highlightSearchResult(searchResults[currentSearchIndex]);
    updateSearchCounter();
  } else {
    clearSearch();
    showNotification('Geen zones gevonden', 'warning');
  }
}

function highlightSearchResult(feature) {
  // Zoom to feature
  const bounds = turf.bbox(feature);
  map.fitBounds(bounds, { padding: 100, maxZoom: 16 });
  
  // Highlight on map (could add a temporary highlight layer)
  if (map.getLayer('search-highlight')) {
    map.removeLayer('search-highlight');
    map.removeSource('search-highlight-source');
  }
  
  map.addSource('search-highlight-source', {
    type: 'geojson',
    data: feature
  });
  
  map.addLayer({
    id: 'search-highlight',
    type: 'line',
    source: 'search-highlight-source',
    paint: {
      'line-color': '#ff0000',
      'line-width': 4,
      'line-opacity': 0.8
    }
  });
  
  // Show in side panel
  showZoneDetails(feature);
}

function clearSearch() {
  searchResults = [];
  currentSearchIndex = 0;
  
  if (map.getLayer('search-highlight')) {
    map.removeLayer('search-highlight');
    map.removeSource('search-highlight-source');
  }
  
  updateSearchCounter();
}

function nextSearchResult() {
  if (searchResults.length === 0) return;
  currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
  highlightSearchResult(searchResults[currentSearchIndex]);
  updateSearchCounter();
}

function previousSearchResult() {
  if (searchResults.length === 0) return;
  currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
  highlightSearchResult(searchResults[currentSearchIndex]);
  updateSearchCounter();
}

function updateSearchCounter() {
  const counter = document.getElementById('searchCounter');
  if (counter) {
    if (searchResults.length > 0) {
      counter.textContent = `${currentSearchIndex + 1} / ${searchResults.length}`;
      counter.style.display = 'block';
    } else {
      counter.style.display = 'none';
    }
  }
}

// Measurement tools
let measurementMode = null;
let measurementPoints = [];

function startMeasurement(mode) {
  measurementMode = mode; // 'distance' or 'area'
  measurementPoints = [];
  map.getCanvas().style.cursor = 'crosshair';
  
  // Clear previous measurements
  if (map.getLayer('measurement-line')) {
    map.removeLayer('measurement-line');
    map.removeSource('measurement-line-source');
  }
  if (map.getLayer('measurement-points')) {
    map.removeLayer('measurement-points');
    map.removeSource('measurement-points-source');
  }
  
  showNotification(`${mode === 'distance' ? 'Afstand' : 'Oppervlakte'} meten: klik op de kaart`, 'info');
}

function stopMeasurement() {
  measurementMode = null;
  measurementPoints = [];
  map.getCanvas().style.cursor = '';
  
  if (map.getLayer('measurement-line')) {
    map.removeLayer('measurement-line');
    map.removeSource('measurement-line-source');
  }
  if (map.getLayer('measurement-points')) {
    map.removeLayer('measurement-points');
    map.removeSource('measurement-points-source');
  }
}

function handleMeasurementClick(e) {
  if (!measurementMode) return;
  
  measurementPoints.push([e.lngLat.lng, e.lngLat.lat]);
  
  if (measurementMode === 'distance') {
    updateDistanceMeasurement();
  } else if (measurementMode === 'area') {
    updateAreaMeasurement();
  }
}

function updateDistanceMeasurement() {
  if (measurementPoints.length < 2) return;
  
  const line = turf.lineString(measurementPoints);
  const distance = turf.length(line, { units: 'meters' });
  
  // Update visualization
  if (map.getSource('measurement-line-source')) {
    map.getSource('measurement-line-source').setData(line);
  } else {
    map.addSource('measurement-line-source', { type: 'geojson', data: line });
    map.addLayer({
      id: 'measurement-line',
      type: 'line',
      source: 'measurement-line-source',
      paint: {
        'line-color': '#ff0000',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });
  }
  
  showNotification(`Afstand: ${distance.toFixed(2)} meter`, 'success');
}

function updateAreaMeasurement() {
  if (measurementPoints.length < 3) return;
  
  const polygon = turf.polygon([[...measurementPoints, measurementPoints[0]]]);
  const area = turf.area(polygon);
  
  // Update visualization
  if (map.getSource('measurement-line-source')) {
    map.getSource('measurement-line-source').setData(polygon);
  } else {
    map.addSource('measurement-line-source', { type: 'geojson', data: polygon });
    map.addLayer({
      id: 'measurement-line',
      type: 'fill',
      source: 'measurement-line-source',
      paint: {
        'fill-color': '#ff0000',
        'fill-opacity': 0.2
      }
    });
  }
  
  showNotification(`Oppervlakte: ${area.toFixed(2)} m²`, 'success');
}

// Photo attachments
function attachPhotoToZone(zoneId, photoDataUrl) {
  const zones = loadZonesFromStorage();
  const zone = zones.features.find(f => f.properties.id === zoneId);
  
  if (zone) {
    if (!zone.properties.photos) {
      zone.properties.photos = [];
    }
    zone.properties.photos.push({
      url: photoDataUrl,
      timestamp: Date.now()
    });
    saveZonesToStorage(zones);
    refreshZonesList();
    updateZoneLayer();
  }
}

function handlePhotoUpload(e, zoneId) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    attachPhotoToZone(zoneId, event.target.result);
    showNotification('Foto toegevoegd', 'success');
  };
  reader.readAsDataURL(file);
}

// Import GeoJSON
function importGeoJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const geojson = JSON.parse(e.target.result);
      
      if (!geojson.type || !geojson.features) {
        throw new Error('Ongeldig GeoJSON formaat');
      }
      
      const zones = loadZonesFromStorage();
      
      // Add imported features
      geojson.features.forEach(feature => {
        if (!feature.properties.id) {
          feature.properties.id = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        }
        zones.features.push(feature);
      });
      
      saveZonesToStorage(zones);
      refreshZonesList();
      updateZoneLayer();
      showNotification(`${geojson.features.length} zones geïmporteerd`, 'success');
    } catch (error) {
      showNotification('Fout bij importeren: ' + error.message, 'error');
    }
  };
  reader.readAsText(file);
}

// Export to PDF/Print
function printMap() {
  // Create a print-friendly view
  const printWindow = window.open('', '_blank');
  const mapContainer = document.getElementById('map');
  const canvas = mapContainer.querySelector('canvas');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Park Lingezegen - Boomsoorten Kaart</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        img { max-width: 100%; border: 1px solid #ccc; }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>Park Lingezegen - Boomsoorten Overzicht</h1>
      <p>Gegenereerd op: ${new Date().toLocaleDateString('nl-NL')}</p>
      <img src="${canvas.toDataURL()}" alt="Kaart">
      <button class="no-print" onclick="window.print()">Print</button>
    </body>
    </html>
  `);
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('notification--show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('notification--show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Turf.js helper object
const turf = {
  area,
  bbox,
  length,
  lineString: (coords) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords }
  }),
  polygon: (coords) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords }
  })
};

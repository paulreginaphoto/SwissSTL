export type Lang = "fr" | "en" | "de" | "it" | "rm";

export const LANG_LABELS: Record<Lang, string> = {
  fr: "Fran\u00e7ais",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
  rm: "Rumantsch",
};

const fr = {
  appTitle: "SwissSTL",
  appSubtitle: "G\u00e9n\u00e9rateur de mod\u00e8les 3D imprimables de la Suisse",

  // Zone
  zoneTitle: "Zone s\u00e9lectionn\u00e9e",
  zoneHint: "Maintenez Shift + glissez sur la carte pour s\u00e9lectionner une zone.",
  area: "Superficie",
  dimensions: "Dimensions",

  // Draw modes
  drawMode: "Mode de s\u00e9lection",
  modeRect: "Rectangle",
  modeCircle: "Cercle",
  modeFreehand: "Dessin libre",

  // Parameters
  paramsTitle: "Param\u00e8tres",
  resolution: "R\u00e9solution terrain",
  res05: "0.5m - D\u00e9tail maximum (LiDAR)",
  res2: "2m - Haute qualit\u00e9",
  res10: "10m - Rapide",
  res05Short: "0.5m (max)",
  res2Short: "2m",
  res10Short: "10m (rapide)",
  zExaggeration: "Exag\u00e9ration verticale",
  baseHeight: "\u00c9paisseur de base",
  modelWidth: "Largeur du mod\u00e8le",
  includeBuildings: "Inclure les b\u00e2timents 3D",
  includeRoads: "Inclure les routes",

  // Progress
  progressTitle: "Progression",
  state: "\u00c9tat",
  jobId: "Job ID",
  elapsed: "Temps \u00e9coul\u00e9",
  noProgress: "Sans progression",
  lastUpdate: "Derni\u00e8re MAJ",
  stallWarning: "Pas d'avanc\u00e9e depuis {time}. Le backend est probablement en calcul lourd.",
  downloadStl: "T\u00e9l\u00e9charger le STL",
  downloadZip: "T\u00e9l\u00e9charger le ZIP ({n} tuiles)",
  connectionLost: "Connexion au serveur perdue",

  // Grid split
  gridTitle: "D\u00e9coupage en grille",
  gridSingle: "1 seul",
  gridInfo: "{n}x{n} = {total} tuiles STL (ZIP), chaque tuile = {width}mm",

  // Buttons
  generating: "G\u00e9n\u00e9ration en cours... {pct}%",
  generate: "G\u00e9n\u00e9rer le STL",
  selectFirst: "S\u00e9lectionnez une zone d'abord",

  // Map hints
  mapHintRect: "Maintenez {key} + glissez pour s\u00e9lectionner une zone",
  mapHintCircle: "Maintenez {key} + glissez depuis le centre pour dessiner un cercle",
  mapHintFreehand: "Maintenez {key} + dessinez \u00e0 main lev\u00e9e sur la carte",
  mapHintRelease: "Rel\u00e2chez pour confirmer la s\u00e9lection...",
};

const en: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "3D printable model generator for Switzerland",

  zoneTitle: "Selected area",
  zoneHint: "Hold Shift + drag on the map to select an area.",
  area: "Area",
  dimensions: "Dimensions",

  drawMode: "Selection mode",
  modeRect: "Rectangle",
  modeCircle: "Circle",
  modeFreehand: "Freehand",

  paramsTitle: "Parameters",
  resolution: "Terrain resolution",
  res05: "0.5m - Maximum detail (LiDAR)",
  res2: "2m - High quality",
  res10: "10m - Fast",
  res05Short: "0.5m (max)",
  res2Short: "2m",
  res10Short: "10m (fast)",
  zExaggeration: "Vertical exaggeration",
  baseHeight: "Base thickness",
  modelWidth: "Model width",
  includeBuildings: "Include 3D buildings",
  includeRoads: "Include roads",

  progressTitle: "Progress",
  state: "State",
  jobId: "Job ID",
  elapsed: "Elapsed time",
  noProgress: "No progress",
  lastUpdate: "Last update",
  stallWarning: "No progress for {time}. The backend is probably computing.",
  downloadStl: "Download STL",
  downloadZip: "Download ZIP ({n} tiles)",
  connectionLost: "Connection to server lost",

  gridTitle: "Grid split",
  gridSingle: "Single",
  gridInfo: "{n}x{n} = {total} STL tiles (ZIP), each tile = {width}mm",

  generating: "Generating... {pct}%",
  generate: "Generate STL",
  selectFirst: "Select an area first",

  mapHintRect: "Hold {key} + drag to select an area",
  mapHintCircle: "Hold {key} + drag from center to draw a circle",
  mapHintFreehand: "Hold {key} + draw freehand on the map",
  mapHintRelease: "Release to confirm selection...",
};

const de: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "3D-druckbarer Modellgenerator f\u00fcr die Schweiz",

  zoneTitle: "Ausgew\u00e4hlter Bereich",
  zoneHint: "Halten Sie Shift + ziehen Sie auf der Karte, um einen Bereich auszuw\u00e4hlen.",
  area: "Fl\u00e4che",
  dimensions: "Abmessungen",

  drawMode: "Auswahlmodus",
  modeRect: "Rechteck",
  modeCircle: "Kreis",
  modeFreehand: "Freihand",

  paramsTitle: "Parameter",
  resolution: "Gel\u00e4ndeaufl\u00f6sung",
  res05: "0.5m - Maximale Details (LiDAR)",
  res2: "2m - Hohe Qualit\u00e4t",
  res10: "10m - Schnell",
  res05Short: "0.5m (max)",
  res2Short: "2m",
  res10Short: "10m (schnell)",
  zExaggeration: "Vertikale \u00dcberh\u00f6hung",
  baseHeight: "Basisdicke",
  modelWidth: "Modellbreite",
  includeBuildings: "3D-Geb\u00e4ude einbeziehen",
  includeRoads: "Strassen einbeziehen",

  progressTitle: "Fortschritt",
  state: "Status",
  jobId: "Job-ID",
  elapsed: "Verstrichene Zeit",
  noProgress: "Kein Fortschritt",
  lastUpdate: "Letztes Update",
  stallWarning: "Kein Fortschritt seit {time}. Das Backend rechnet wahrscheinlich.",
  downloadStl: "STL herunterladen",
  downloadZip: "ZIP herunterladen ({n} Kacheln)",
  connectionLost: "Verbindung zum Server verloren",

  gridTitle: "Rasteraufteilung",
  gridSingle: "Einzeln",
  gridInfo: "{n}x{n} = {total} STL-Kacheln (ZIP), jede Kachel = {width}mm",

  generating: "Generierung l\u00e4uft... {pct}%",
  generate: "STL generieren",
  selectFirst: "W\u00e4hlen Sie zuerst einen Bereich aus",

  mapHintRect: "Halten Sie {key} + ziehen Sie, um einen Bereich auszuw\u00e4hlen",
  mapHintCircle: "Halten Sie {key} + ziehen Sie vom Zentrum, um einen Kreis zu zeichnen",
  mapHintFreehand: "Halten Sie {key} + zeichnen Sie frei auf der Karte",
  mapHintRelease: "Loslassen, um die Auswahl zu best\u00e4tigen...",
};

const it: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "Generatore di modelli 3D stampabili della Svizzera",

  zoneTitle: "Zona selezionata",
  zoneHint: "Tieni premuto Shift + trascina sulla mappa per selezionare una zona.",
  area: "Superficie",
  dimensions: "Dimensioni",

  drawMode: "Modalit\u00e0 di selezione",
  modeRect: "Rettangolo",
  modeCircle: "Cerchio",
  modeFreehand: "Mano libera",

  paramsTitle: "Parametri",
  resolution: "Risoluzione terreno",
  res05: "0.5m - Dettaglio massimo (LiDAR)",
  res2: "2m - Alta qualit\u00e0",
  res10: "10m - Veloce",
  res05Short: "0.5m (max)",
  res2Short: "2m",
  res10Short: "10m (veloce)",
  zExaggeration: "Esagerazione verticale",
  baseHeight: "Spessore base",
  modelWidth: "Larghezza modello",
  includeBuildings: "Includi edifici 3D",
  includeRoads: "Includi strade",

  progressTitle: "Progresso",
  state: "Stato",
  jobId: "Job ID",
  elapsed: "Tempo trascorso",
  noProgress: "Nessun progresso",
  lastUpdate: "Ultimo aggiornamento",
  stallWarning: "Nessun progresso da {time}. Il backend sta probabilmente calcolando.",
  downloadStl: "Scarica STL",
  downloadZip: "Scarica ZIP ({n} tessere)",
  connectionLost: "Connessione al server persa",

  gridTitle: "Suddivisione a griglia",
  gridSingle: "Singolo",
  gridInfo: "{n}x{n} = {total} tessere STL (ZIP), ogni tessera = {width}mm",

  generating: "Generazione in corso... {pct}%",
  generate: "Genera STL",
  selectFirst: "Seleziona prima una zona",

  mapHintRect: "Tieni premuto {key} + trascina per selezionare una zona",
  mapHintCircle: "Tieni premuto {key} + trascina dal centro per disegnare un cerchio",
  mapHintFreehand: "Tieni premuto {key} + disegna a mano libera sulla mappa",
  mapHintRelease: "Rilascia per confermare la selezione...",
};

const rm: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "Generator da models 3D stampabels da la Svizra",

  zoneTitle: "Zona tschernida",
  zoneHint: "Tegn Shift + tira sin la carta per tscherner ina zona.",
  area: "Surfatscha",
  dimensions: "Dimensiuns",

  drawMode: "Modus da selecziun",
  modeRect: "Rectangul",
  modeCircle: "Circul",
  modeFreehand: "Maun libra",

  paramsTitle: "Parameters",
  resolution: "Resoluziun dal terren",
  res05: "0.5m - Detagl maximal (LiDAR)",
  res2: "2m - Auta qualitad",
  res10: "10m - Spert",
  res05Short: "0.5m (max)",
  res2Short: "2m",
  res10Short: "10m (spert)",
  zExaggeration: "Exageraziun verticala",
  baseHeight: "Grossezza da basa",
  modelWidth: "Largezza dal model",
  includeBuildings: "Includer edifizis 3D",
  includeRoads: "Includer vias",

  progressTitle: "Progress",
  state: "Status",
  jobId: "Job ID",
  elapsed: "Temp passà",
  noProgress: "Nagin progress",
  lastUpdate: "Ultima actualisaziun",
  stallWarning: "Nagin progress dapi {time}. Il backend calculescha probablamain.",
  downloadStl: "Telechargiar STL",
  downloadZip: "Telechargiar ZIP ({n} plattas)",
  connectionLost: "Connexiun al server persa",

  gridTitle: "Partiziun en griglia",
  gridSingle: "Singul",
  gridInfo: "{n}x{n} = {total} plattas STL (ZIP), mintga platta = {width}mm",

  generating: "Generaziun en cors... {pct}%",
  generate: "Generar STL",
  selectFirst: "Tscherna emprim ina zona",

  mapHintRect: "Tegn {key} + tira per tscherner ina zona",
  mapHintCircle: "Tegn {key} + tira dal center per dissegnar in circul",
  mapHintFreehand: "Tegn {key} + dissegna a maun libra sin la carta",
  mapHintRelease: "Slaschà per confermar la selecziun...",
};

export type TranslationKey = keyof typeof fr;

export const translations: Record<Lang, Record<TranslationKey, string>> = { fr, en, de, it, rm };

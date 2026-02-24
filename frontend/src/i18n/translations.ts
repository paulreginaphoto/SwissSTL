export type Lang = "fr" | "en" | "de";

export const LANG_LABELS: Record<Lang, string> = {
  fr: "Fran\u00e7ais",
  en: "English",
  de: "Deutsch",
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
  connectionLost: "Connexion au serveur perdue",

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
  connectionLost: "Connection to server lost",

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
  connectionLost: "Verbindung zum Server verloren",

  generating: "Generierung l\u00e4uft... {pct}%",
  generate: "STL generieren",
  selectFirst: "W\u00e4hlen Sie zuerst einen Bereich aus",

  mapHintRect: "Halten Sie {key} + ziehen Sie, um einen Bereich auszuw\u00e4hlen",
  mapHintCircle: "Halten Sie {key} + ziehen Sie vom Zentrum, um einen Kreis zu zeichnen",
  mapHintFreehand: "Halten Sie {key} + zeichnen Sie frei auf der Karte",
  mapHintRelease: "Loslassen, um die Auswahl zu best\u00e4tigen...",
};

export type TranslationKey = keyof typeof fr;

export const translations: Record<Lang, Record<TranslationKey, string>> = { fr, en, de };

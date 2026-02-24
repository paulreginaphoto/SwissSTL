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
  clearSelection: "Effacer la s\u00e9lection",
  zoneHint: "Maintenez Shift + glissez sur la carte pour s\u00e9lectionner une zone.",
  area: "Superficie",
  dimensions: "Dimensions",

  // Draw modes
  drawMode: "Mode de s\u00e9lection",
  modeRect: "Rectangle",
  modeCircle: "Cercle",
  modeFreehand: "Dessin libre",

  // Mask
  maskTitle: "Masque personnalis\u00e9",
  uploadMask: "Importer un masque PNG",
  maskHint: "Forme noire sur fond transparent. S\u00e9lectionnez d'abord une zone.",
  maskError: "Impossible d'extraire une forme du PNG. V\u00e9rifiez que c'est du noir sur transparent.",

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

  // Tooltips
  tipResolution: "Taille des pixels du terrain. 0.5m = tr\u00e8s d\u00e9taill\u00e9 mais plus lent, 10m = rapide mais moins pr\u00e9cis.",
  tipBaseHeight: "Epaisseur du socle sous le terrain. Plus \u00e9pais = plus solide \u00e0 l'impression.",
  tipModelWidth: "Largeur physique du mod\u00e8le imprim\u00e9. La hauteur est calcul\u00e9e proportionnellement.",

  // Progress
  progressTitle: "Progression",
  state: "\u00c9tat",
  jobId: "Job ID",
  elapsed: "Temps \u00e9coul\u00e9",
  noProgress: "Sans progression",
  lastUpdate: "Derni\u00e8re MAJ",
  etaRemaining: "restantes",
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
  historyTitle: "Historique",
  generate: "G\u00e9n\u00e9rer le STL",
  generateAnother: "G\u00e9n\u00e9rer un autre STL",
  selectFirst: "S\u00e9lectionnez une zone d'abord",

  // Warnings
  warnLargeZone: "\u26a0\ufe0f Zone large ({area} km\u00b2) en {res}m \u2014 g\u00e9n\u00e9ration tr\u00e8s longue (~{time} min). Envisagez une r\u00e9solution inf\u00e9rieure.",
  warnHugeZone: "\u26a0\ufe0f Zone tr\u00e8s large ({area} km\u00b2) en {res}m \u2014 peut prendre plus d'une heure et consommer beaucoup de RAM.",

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
  clearSelection: "Clear selection",
  zoneHint: "Hold Shift + drag on the map to select an area.",
  area: "Area",
  dimensions: "Dimensions",

  drawMode: "Selection mode",
  modeRect: "Rectangle",
  modeCircle: "Circle",
  modeFreehand: "Freehand",

  maskTitle: "Custom mask",
  uploadMask: "Upload PNG mask",
  maskHint: "Black shape on transparent background. Select a zone first.",
  maskError: "Could not extract a shape from the PNG. Make sure it's black on transparent.",

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

  tipResolution: "Terrain pixel size. 0.5m = very detailed but slower, 10m = fast but less precise.",
  tipBaseHeight: "Thickness of the base plate under the terrain. Thicker = stronger for printing.",
  tipModelWidth: "Physical width of the printed model. Height is calculated proportionally.",

  progressTitle: "Progress",
  state: "State",
  jobId: "Job ID",
  elapsed: "Elapsed time",
  noProgress: "No progress",
  lastUpdate: "Last update",
  etaRemaining: "remaining",
  stallWarning: "No progress for {time}. The backend is probably computing.",
  downloadStl: "Download STL",
  downloadZip: "Download ZIP ({n} tiles)",
  connectionLost: "Connection to server lost",

  gridTitle: "Grid split",
  gridSingle: "Single",
  gridInfo: "{n}x{n} = {total} STL tiles (ZIP), each tile = {width}mm",

  generating: "Generating... {pct}%",
  historyTitle: "History",
  generate: "Generate STL",
  generateAnother: "Generate another STL",
  selectFirst: "Select an area first",

  warnLargeZone: "\u26a0\ufe0f Large zone ({area} km\u00b2) at {res}m \u2014 generation will be very long (~{time} min). Consider a lower resolution.",
  warnHugeZone: "\u26a0\ufe0f Very large zone ({area} km\u00b2) at {res}m \u2014 may take over an hour and use a lot of RAM.",

  mapHintRect: "Hold {key} + drag to select an area",
  mapHintCircle: "Hold {key} + drag from center to draw a circle",
  mapHintFreehand: "Hold {key} + draw freehand on the map",
  mapHintRelease: "Release to confirm selection...",
};

const de: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "3D-druckbarer Modellgenerator f\u00fcr die Schweiz",

  zoneTitle: "Ausgew\u00e4hlter Bereich",
  clearSelection: "Auswahl l\u00f6schen",
  zoneHint: "Halten Sie Shift + ziehen Sie auf der Karte, um einen Bereich auszuw\u00e4hlen.",
  area: "Fl\u00e4che",
  dimensions: "Abmessungen",

  drawMode: "Auswahlmodus",
  modeRect: "Rechteck",
  modeCircle: "Kreis",
  modeFreehand: "Freihand",

  maskTitle: "Benutzerdefinierte Maske",
  uploadMask: "PNG-Maske hochladen",
  maskHint: "Schwarze Form auf transparentem Hintergrund. W\u00e4hlen Sie zuerst einen Bereich.",
  maskError: "Konnte keine Form aus dem PNG extrahieren. Stellen Sie sicher, dass es schwarz auf transparent ist.",

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

  tipResolution: "Gel\u00e4nde-Pixelgr\u00f6sse. 0.5m = sehr detailliert aber langsamer, 10m = schnell aber weniger genau.",
  tipBaseHeight: "Dicke der Grundplatte unter dem Gel\u00e4nde. Dicker = stabiler beim Drucken.",
  tipModelWidth: "Physische Breite des gedruckten Modells. Die H\u00f6he wird proportional berechnet.",

  progressTitle: "Fortschritt",
  state: "Status",
  jobId: "Job-ID",
  elapsed: "Verstrichene Zeit",
  noProgress: "Kein Fortschritt",
  lastUpdate: "Letztes Update",
  etaRemaining: "verbleibend",
  stallWarning: "Kein Fortschritt seit {time}. Das Backend rechnet wahrscheinlich.",
  downloadStl: "STL herunterladen",
  downloadZip: "ZIP herunterladen ({n} Kacheln)",
  connectionLost: "Verbindung zum Server verloren",

  gridTitle: "Rasteraufteilung",
  gridSingle: "Einzeln",
  gridInfo: "{n}x{n} = {total} STL-Kacheln (ZIP), jede Kachel = {width}mm",

  generating: "Generierung l\u00e4uft... {pct}%",
  historyTitle: "Verlauf",
  generate: "STL generieren",
  generateAnother: "Weiteres STL generieren",
  selectFirst: "W\u00e4hlen Sie zuerst einen Bereich aus",

  warnLargeZone: "\u26a0\ufe0f Grosse Zone ({area} km\u00b2) bei {res}m \u2014 Generierung dauert sehr lange (~{time} Min). Erw\u00e4gen Sie eine niedrigere Aufl\u00f6sung.",
  warnHugeZone: "\u26a0\ufe0f Sehr grosse Zone ({area} km\u00b2) bei {res}m \u2014 kann \u00fcber eine Stunde dauern und viel RAM verbrauchen.",

  mapHintRect: "Halten Sie {key} + ziehen Sie, um einen Bereich auszuw\u00e4hlen",
  mapHintCircle: "Halten Sie {key} + ziehen Sie vom Zentrum, um einen Kreis zu zeichnen",
  mapHintFreehand: "Halten Sie {key} + zeichnen Sie frei auf der Karte",
  mapHintRelease: "Loslassen, um die Auswahl zu best\u00e4tigen...",
};

const it: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "Generatore di modelli 3D stampabili della Svizzera",

  zoneTitle: "Zona selezionata",
  clearSelection: "Cancella selezione",
  zoneHint: "Tieni premuto Shift + trascina sulla mappa per selezionare una zona.",
  area: "Superficie",
  dimensions: "Dimensioni",

  drawMode: "Modalit\u00e0 di selezione",
  modeRect: "Rettangolo",
  modeCircle: "Cerchio",
  modeFreehand: "Mano libera",

  maskTitle: "Maschera personalizzata",
  uploadMask: "Carica maschera PNG",
  maskHint: "Forma nera su sfondo trasparente. Seleziona prima una zona.",
  maskError: "Impossibile estrarre una forma dal PNG. Assicurati che sia nero su trasparente.",

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

  tipResolution: "Dimensione pixel del terreno. 0.5m = molto dettagliato ma pi\u00f9 lento, 10m = veloce ma meno preciso.",
  tipBaseHeight: "Spessore della base sotto il terreno. Pi\u00f9 spesso = pi\u00f9 resistente per la stampa.",
  tipModelWidth: "Larghezza fisica del modello stampato. L'altezza viene calcolata proporzionalmente.",

  progressTitle: "Progresso",
  state: "Stato",
  jobId: "Job ID",
  elapsed: "Tempo trascorso",
  noProgress: "Nessun progresso",
  lastUpdate: "Ultimo aggiornamento",
  etaRemaining: "rimanenti",
  stallWarning: "Nessun progresso da {time}. Il backend sta probabilmente calcolando.",
  downloadStl: "Scarica STL",
  downloadZip: "Scarica ZIP ({n} tessere)",
  connectionLost: "Connessione al server persa",

  gridTitle: "Suddivisione a griglia",
  gridSingle: "Singolo",
  gridInfo: "{n}x{n} = {total} tessere STL (ZIP), ogni tessera = {width}mm",

  generating: "Generazione in corso... {pct}%",
  historyTitle: "Cronologia",
  generate: "Genera STL",
  generateAnother: "Genera un altro STL",
  selectFirst: "Seleziona prima una zona",

  warnLargeZone: "\u26a0\ufe0f Zona grande ({area} km\u00b2) a {res}m \u2014 generazione molto lunga (~{time} min). Considera una risoluzione inferiore.",
  warnHugeZone: "\u26a0\ufe0f Zona molto grande ({area} km\u00b2) a {res}m \u2014 pu\u00f2 richiedere pi\u00f9 di un'ora e molta RAM.",

  mapHintRect: "Tieni premuto {key} + trascina per selezionare una zona",
  mapHintCircle: "Tieni premuto {key} + trascina dal centro per disegnare un cerchio",
  mapHintFreehand: "Tieni premuto {key} + disegna a mano libera sulla mappa",
  mapHintRelease: "Rilascia per confermare la selezione...",
};

const rm: typeof fr = {
  appTitle: "SwissSTL",
  appSubtitle: "Generator da models 3D stampabels da la Svizra",

  zoneTitle: "Zona tschernida",
  clearSelection: "Stizzar la selecziun",
  zoneHint: "Tegn Shift + tira sin la carta per tscherner ina zona.",
  area: "Surfatscha",
  dimensions: "Dimensiuns",

  drawMode: "Modus da selecziun",
  modeRect: "Rectangul",
  modeCircle: "Circul",
  modeFreehand: "Maun libra",

  maskTitle: "Masca persunalisada",
  uploadMask: "Chargiar masca PNG",
  maskHint: "Furma naira sin fund transparent. Tscherna emprim ina zona.",
  maskError: "Impussibel d'extrair ina furma dal PNG. Controllai ch'i saja nair sin transparent.",

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

  tipResolution: "Grondezza da pixels dal terren. 0.5m = fitg detaglià ma pli plaun, 10m = spert ma main exact.",
  tipBaseHeight: "Grossezza da la basa sut il terren. Pli grossa = pli stabila per stampar.",
  tipModelWidth: "Largezza fisica dal model stampà. L'autezza vegn calculada proporziunalmain.",

  progressTitle: "Progress",
  state: "Status",
  jobId: "Job ID",
  elapsed: "Temp passà",
  noProgress: "Nagin progress",
  lastUpdate: "Ultima actualisaziun",
  etaRemaining: "restant",
  stallWarning: "Nagin progress dapi {time}. Il backend calculescha probablamain.",
  downloadStl: "Telechargiar STL",
  downloadZip: "Telechargiar ZIP ({n} plattas)",
  connectionLost: "Connexiun al server persa",

  gridTitle: "Partiziun en griglia",
  gridSingle: "Singul",
  gridInfo: "{n}x{n} = {total} plattas STL (ZIP), mintga platta = {width}mm",

  generating: "Generaziun en cors... {pct}%",
  historyTitle: "Istorgia",
  generate: "Generar STL",
  generateAnother: "Generar in auter STL",
  selectFirst: "Tscherna emprim ina zona",

  warnLargeZone: "\u26a0\ufe0f Zona gronda ({area} km\u00b2) a {res}m \u2014 generaziun fitg lunga (~{time} min). Considerai ina resoluziun pli bassa.",
  warnHugeZone: "\u26a0\ufe0f Zona fitg gronda ({area} km\u00b2) a {res}m \u2014 po durar dapli ch'ina ura e dovrar bler RAM.",

  mapHintRect: "Tegn {key} + tira per tscherner ina zona",
  mapHintCircle: "Tegn {key} + tira dal center per dissegnar in circul",
  mapHintFreehand: "Tegn {key} + dissegna a maun libra sin la carta",
  mapHintRelease: "Slaschà per confermar la selecziun...",
};

export type TranslationKey = keyof typeof fr;

export const translations: Record<Lang, Record<TranslationKey, string>> = { fr, en, de, it, rm };

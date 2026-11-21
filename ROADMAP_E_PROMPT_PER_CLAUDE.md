# Dashboard di allenamento — Roadmap e prompt per l'assistente di sviluppo

> Questo file è pensato per essere dato in pasto a un assistente di programmazione (Claude o simili).
> Contiene: (1) come lavorare sul progetto, (2) com'è fatto oggi, (3) una lista di obiettivi ordinati dal più fattibile/facile al più complesso, con per ciascuno cosa serve in più, (4) i temi trasversali (privacy, multi-utente, termini delle API).
> Lingua dell'interfaccia e dei commenti nel codice: **italiano**.

---

## 0. Come usare questo file

**Per chi sviluppa (l'amico):**
1. Metti questo file nel repository (cartella principale) e invialo all'assistente insieme ai file che vuoi modificare (`app.js`, `index.html`, `fetch_data.py`, ecc.).
2. Scegli **un solo obiettivo alla volta** dalla sezione 4 e scrivi, per esempio:
   > «Leggi tutto il documento. Lavoriamo sull'obiettivo n. 3. Prima di scrivere codice, fammi le domande che ti servono. Poi dammi le modifiche come funzioni o blocchi completi, con l'indicazione esatta di dove inserirli.»
3. **Non incollare mai dati personali reali** (`garmin_data.json`, cartella `dettagli/`, `.env.local`, chiavi API) nella chat dell'assistente. Per testare usa dati finti: chiedi all'assistente di generarne di sintetici nello stesso formato (sezione 2.4).
4. Lavora su un ramo Git (`git checkout -b nome-funzione`) e apri una Pull Request: il proprietario del progetto la rivede e la unisce.

**Per l'assistente (istruzioni di lavoro):**
- Rispetta lo stile e l'architettura esistenti (sezione 2). Non introdurre build step, bundler o framework senza averlo concordato.
- Prima di cambiare qualcosa di grande (struttura dati, archiviazione, dipendenze nuove), **proponi le alternative con pro e contro e chiedi conferma**.
- Dai le modifiche come blocchi/funzioni **completi**, con ancora precise (nome della funzione da sostituire o commento `// ==== BLOCCO ====` dove inserire). Evita diff parziali ambigui.
- Mantieni compatibilità all'indietro: i dati e le note già salvati dall'utente non devono rompersi (chiavi `localStorage`, formato di `garmin_data.json`, `piano.json`).
- Ogni funzione nuova deve degradare con grazia se mancano dati (mostra un messaggio chiaro, non un errore).
- Non scrivere mai segreti nel codice. Nessuna chiamata a servizi esterni dal browser, salvo CDN già in uso, a meno di decisione esplicita (privacy).
- Testo dell'interfaccia in italiano, numeri in formato italiano (virgola decimale), date `gg mmm aaaa`.
- Sii onesto sulle stime: ogni punteggio/previsione deve dire chiaramente che è una **stima basata su regole**, non una misura né un parere medico.
- Se un'informazione non è certa (formato di un'API, comportamento di un dispositivo), **dillo** e proponi una verifica, invece di inventare.

---

## 1. Il progetto in due righe

Dashboard web personale che mostra, per un atleta, i dati di allenamento e salute presi da un orologio Garmin: attività, sonno, HRV, record, previsioni di gara, confronto con un piano di allenamento, calendario, carico (forma/fatica), analisi per singola attività. È un sito **statico** (HTML + JavaScript puro) alimentato da uno script Python che scarica i dati.

---

## 2. Com'è fatto oggi

### 2.1 Architettura e flusso dei dati

```
Garmin Connect (Personal API, chiave personale)
        │   fetch_data.py (Python, solo libreria standard)
        ▼
garmin_data.json  +  dettagli/<id>.json  +  data/meteo.json (cache, non pubblicata)
        │   GitHub Actions (ogni 6 ore) fa commit su GitHub
        ▼
Cloudflare Pages pubblica il sito  →  Cloudflare Access protegge con codice via email
        ▼
Browser: index.html + app.js + styles.css leggono i JSON e disegnano le pagine
```

- Repository GitHub **privato**. Il sito è pubblicato su Cloudflare Pages e protetto con Cloudflare Access (accesso solo a email autorizzate).
- La chiave Garmin sta **solo** nel file `.env.local` (non versionato) e nei Secrets di GitHub (`GARMIN_PERSONAL_API_KEY`).
- Aggiornamento locale opzionale: `aggiorna.bat` e `installa_avvio.bat` (Windows).

### 2.2 File principali

| File | Contenuto |
|---|---|
| `index.html` | Guscio della pagina: 6 schede (Generale, Salute & Recovery, Record & PB, Comparazione, Attività, Piano & Coach). Tailwind via CDN, Chart.js via CDN, font Plus Jakarta Sans. Meta PWA. |
| `styles.css` | Stile "vetro + neon": classi `glass-card`, `neon-orange-bright`, `neon-cyan-bright`, `neon-amber`, `neon-azure`, `neon-coral`, `neon-emerald`, `neon-purple`, `nav-btn`. |
| `app.js` | **Un solo file**, JavaScript puro, senza moduli né build. Diviso in blocchi con commenti `// ==== NOME ====` / `// ==== FINE NOME ====` (vedi 2.3). |
| `fetch_data.py` | Scarica i dati dalla Garmin Personal API, importa lo storico dai CSV, scarica dettagli attività e meteo, scrive `garmin_data.json`. Solo libreria standard Python. Costanti di configurazione in alto (obiettivo gara, record, previsioni, VO2 max manuale). |
| `piano.json` | Piano di allenamento (metadati, settimane, giorni, esercizi). Schema in 2.5. |
| `garmin_data.json` | Dati per il sito. Schema in 2.4. |
| `dettagli/<id>.json` | Dettaglio di una attività: giri/km (`laps`), serie temporali (`serie`), percorso (`percorso`). Possono mancare se l'API non li offre. |
| `activities.csv`, `athlete_*_wellness.csv` | Storico del vecchio orologio (export Strava e Intervals), importato da `fetch_data.py`. |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Base per l'app installabile (PWA). **Manca ancora il service worker.** |
| `.github/workflows/aggiorna-dati.yml` | Aggiornamento automatico ogni 6 ore e commit dei dati. |

### 2.3 Mappa di `app.js` (blocchi e funzioni chiave)

Stato globale: `rawData` (contenuto di `garmin_data.json`), `pianoDati`/`pianoMeta` (piano), variabili di stato per scenari (`scenarioScelto`, `stopDa`, `stopA`), note utente in `localStorage`.

| Blocco | Cosa fa | Funzioni principali |
|---|---|---|
| Base (inizio file) | Caricamento dati, scheda Generale (settimana, card, grafici), scheda Salute | `loadDashboard()`, `renderOverview()`, `renderHealthTab()`, `switchTab()`, `getVal()`, `getHealthArray()` |
| `RECORD & PB` | Record, stime di gara, blocco "prossima gara" con indice di realizzabilità | `renderRecords()`, `renderPrevisioni()`, `calcolaPrevisioni()`, `stimaMista()`, `tempoStimatoPer()`, `sceltaRecord()` |
| `ORE PER DISCIPLINA` | Ore settimanali per disciplina | `renderWeeklyHours()` |
| `COMPARAZIONE E PREVISIONE` | Confronto periodi/attività, efficienza (m per battito), lavori di qualità, scenari di progresso, previsione giorno per giorno con stop | `calcolaTendenze()`, `elencoScenari()`, `simulaGiorni()`, `probObiettivo()`, `renderPrevisioneFutura()`, `fattoreGiorno()` |
| `ATTIVITA` | Elenco attività, filtri, dettaglio, analisi a regole e voto, grafici (passo/FC, dinamica di corsa, multi-misura) | `renderAttivita()`, `renderDettaglio()`, `analizzaAttivita()`, `riconosciTipo()`, `trovaRipetute()`, `datiMetrica()`, `pianoPer()`, `leggiNote()/salvaNote()` |
| `SPORT` (dentro ATTIVITA) | Forza (registro esercizi, progressi carichi), tennis (partita), altri sport, meteo, esportazione/importazione note | `tipoSport()`, `analizzaNonCorsa()`, `htmlRegistroEsercizi()`, `righeCarico()`, `htmlPartita()`, `esportaNote()`, `importaNote()` |
| `CALENDARIO` | Calendario mensile, piano con stato (fatto/parziale/saltato), scheda del piano | `renderCalendario()`, `statoPiano()`, `applicaPiano()`, `renderPianoCard()` |
| `CARICO` | Sforzo relativo (TRIMP di Edwards sulle zone), forma e fatica (EWMA 42/7 giorni) | `caricoAttivita()`, `serieFF()`, `renderCarico()` |

Costanti dei modelli (in cima ai rispettivi blocchi): `RIEGEL = 1.06`, `PESO_GARMIN = 0.2` (peso della previsione Garmin nella stima mista), `SIGMA_GARA = 0.025`, `SIGMA_RATE = 0.007`, `CAP_TENDENZA = 0.03`, `DETRAIN_SETT = 0.003`, `ZONE_FC = [97,135,154,174,183,193]`.

### 2.4 Formato di `garmin_data.json` (dati reali da NON incollare in chat: usare dati sintetici)

```jsonc
{
  "last_updated": "2026-11-20 10:00:00",
  "activities": [ {
      "id": 123, "name": "Vercelli - Easy Run", "type": "running", "date": "2026-11-18 18:30:00", // ora locale
      "distance_km": 7.7, "duration_min": 44.2, "avg_hr": 152, "max_hr": 161, "calories": 560,
      "elevation_gain_m": 30, "elevation_loss_m": 28, "avg_cadence": 172, "max_cadence": 190,
      "aerobic_te": 2.8, "anaerobic_te": 0.4, "te_label": "AEROBIC_BASE", "body_battery_delta": -9,
      "hr_zones_sec": [120, 700, 1650, 270, 0],          // 5 zone Garmin
      "fastest_1km_s": 300, "fastest_5km_s": 1500,
      "avg_vert_osc": 8.6, "avg_gct": 238, "avg_stride": 112, "avg_vert_ratio": 7.9, "avg_power": 250,
      "split_summaries": [ {"type": "INTERVAL_ACTIVE", "n": 8, "d": 2000, "t": 480, "v": 4.2} ],
      "start_lat": 45.32, "start_lon": 8.42,              // arrotondate a ~1 km
      "meteo": {"t": 9.0, "app": 6.0, "um": 78, "vento": 12, "pioggia": 0.0, "codice": 3},
      "extra": { "totalSets": 2 },                         // solo per sport non di corsa: altri valori numerici dell'orologio
      "event_type": "uncategorized", "location": "Vercelli",
      "fonte": "storico"                                   // presente solo per attività importate dai CSV
  } ],
  "daily_health": [ { "date": "2026-11-18", "steps": 14000, "resting_hr": 47, "hrv": 78, "sleep_hours": 7.1, "sleep_score": 84,
                      "stress_level": 24, "body_battery": 80, "body_battery_min": 20, "respiration_rate": 14, "calories": 2800, "vo2_max": 55 } ],
  "next_event": { "title": "Mezza di Vercelli", "date": "2027-02-28", "goal": "Sub 1h30", "distance_km": 21.0975, "goal_time_s": 5400 },
  "race_predictions": { "5k": 1163, "10k": 2477, "mezza": 5560, "maratona": 12352, "fonte": "manuale" }, // secondi
  "personal_records": { "1k": 243, "5k": 1293, "10k": 2609, "mezza": 6056, "dates": { "5k": "2026-09-27" }, "fonte": "manuale" }
}
```

`daily_health` e `activities` sono ordinati dal più recente. I campi possono mancare: il codice usa `getVal()` e controlli `Number(x) > 0`.

### 2.5 Formato di `piano.json`

```jsonc
{ "nome": "...", "gara": {"nome": "...", "data": "2027-02-28"}, "obiettivi": {"A": "1h35'-1h37'", "B": "sub 1h30'"},
  "settimane": [ {"da": "2026-11-16", "a": "2026-11-22", "nome": "Settimana 1", "km": 24, "progresso": 0.4} ],  // progresso = quota del ritmo di miglioramento normale
  "regole": ["..."],
  "giorni": [ {"date": "2026-11-16", "tipo": "facile|lungo|forza|riposo|...", "titolo": "...", "distanza_km": 7,
               "passo_min_s": 340, "passo_max_s": 360, "fc_max": 145, "dolore_max": 2, "scarpa": "...",
               "descrizione": "...", "obiettivo": "...", "kpi": "...",
               "esercizi": [ {"nome": "...", "attrezzo": "Bilanciere", "serie": 3, "rip": 10, "nota": "..."} ] } ] }
```

### 2.6 Dati salvati nel browser (`localStorage`)

- `noteAttivita`: per ogni attività (chiave = id) `{ tipo, rpe, dolore, testo, esercizi: [...], partita: { sets: [[io, avv], ...], superficie, avversario } }`.
- `ipotesiGara`: `{ scenario, da, a }` (scenario di progresso e periodo di stop).
- Limite: i dati sono **per dispositivo/browser**. Esistono i pulsanti "Salva una copia" / "Ripristina da file".

### 2.6b Modelli già implementati (non reinventarli)

- **Stima di gara**: formula di Riegel dalle migliori prestazioni recenti, mista con le previsioni Garmin (peso 20%).
- **Scenari di progresso**: prudente, realistico, ottimistico, "tua tendenza" (da efficienza = metri per battito, solo corse registrate dall'orologio, limitata al 3% al mese); calo di forma durante lo stop; probabilità di centrare l'obiettivo con distribuzione normale; il piano modula il progresso settimana per settimana.
- **Analisi di una corsa**: riconoscimento del tipo (nome, dati, piano, scelta manuale), valutazione a regole con voto, confronto "piano contro fatto" (distanza, passo, FC, dolore).
- **Carico**: sforzo relativo per attività e forma/fatica.

### 2.7 Convenzioni

- JavaScript puro (ES2017), funzioni dichiarate globali, stringhe HTML costruite con `esc()` per l'escape.
- Colori delle card: classi `neon-*`; il titolo di ogni card ha il colore della sua barra (mappa `TITOLO_COLORE`).
- Grafici: Chart.js; molti colori sono scritti come esadecimali nel codice (da centralizzare per i temi, obiettivo 9).
- Percentuali e confronti: si mostrano sempre con la scritta "stima"/"indicativo" dove opportuno.

---

## 3. Scale usate nella tabella

- **Fattibilità**: Alta = si può fare con quello che c'è; Media = servono dati/servizi aggiuntivi o decisioni; Bassa = dipende da condizioni esterne (termini d'uso, permessi, API non disponibili).
- **Difficoltà di codifica** (1–5): 1 = poche righe/solo interfaccia; 2 = una funzione nuova con dati già presenti; 3 = un modulo nuovo con dati e logica propri; 4 = integrazioni esterne o cambi architetturali; 5 = piattaforma (backend, account, aspetti legali).

---

## 4. Obiettivi, in ordine di fattibilità e difficoltà

| # | Obiettivo | Fattibilità | Diff. | Dipende da |
|---|---|---|---|---|
| 1 | Tennis: scegliere i set giocati e adattare lo spazio | Alta | 1 | — |
| 2 | Cambiare l'obiettivo di gara dal sito | Alta | 2 | — |
| 3 | Inserire e modificare le previsioni Garmin dal sito | Alta | 2 | — |
| 4 | Tennis: livello degli avversari e progressi | Alta | 2 | 1 |
| 5 | Pendenza della retta di previsione per settimana | Alta | 2 | — |
| 6 | "Sensazione" nelle valutazioni degli allenamenti | Alta | 2 | — |
| 7 | App installabile (PWA) per telefono e PC | Alta | 2 (store: 4) | — |
| 8 | Allenamenti inseriti a mano | Alta | 3 | — |
| 9 | Pagina Infortuni collegata a dolore, stop e valutazioni | Alta | 3 | 8 (consigliato) |
| 10 | Temi e grafica personalizzabili, modello di orologio | Alta/Media | 3 | — |
| 11 | Bici e nuoto, triathlon/multisport | Media | 4 | dati di dettaglio |
| 12 | Funzioni Garmin di fascia alta (Forerunner 965 ecc.) | Media | 2–5 (a pezzi) | 10, 11 |
| 13 | Nuoto artistico (sincronizzato) | Media | 4 | 8, 14 (profili sport) |
| 14 | Più orologi e fonti (Strava, Apple Watch, file FIT) | Media/Bassa | 4 | decisioni sezione 5 |
| 15 | Privacy, trattamento dati e uso aggregato | — (non è codice) | 5 | da fare **prima** di 16 |
| 16 | Più utenti | Media | 5 | 14, 15 |

> Nota sull'ordine: il 15 (privacy) è ultimo per difficoltà ma va **deciso prima di aprire il sito ad altri utenti**. Il 14 ha una "strada consigliata" a basso rischio (importare file) descritta nella scheda.

---

## 4.1 Obiettivo 1 — Tennis: scelta dei set giocati e layout adattivo

**Cosa vuole l'utente:** poter scegliere quanti set sono stati giocati (1, 2, 3, 5) e usare lo spazio di conseguenza, senza righe vuote.

**Stato attuale:** `htmlPartita()` mostra sempre 5 righe di set; i dati sono in `noteAttivita[id].partita.sets` (array di `[io, avv]`). Calcolo del risultato in `risultatoPartita()`.

**Cosa fare:**
- Aggiungere un selettore "Set giocati" (1–5, o "al meglio dei 3/5") e mostrare solo quelle righe.
- Disporre i set in griglia responsiva (da 1 a 5 colonne/righe) e centrare il blocco quando sono pochi.
- Pulsante "+ aggiungi set" / "– togli set"; non perdere i valori inseriti se si cambia il numero.
- Supportare il tie-break (campo opzionale `tb` per set, es. 7-6 (4)) e il super tie-break al posto del terzo set.

**Cosa serve in più:** niente di esterno. Decidere se il numero di set va salvato (`partita.nSet`).

**Criteri di accettazione:** con 2 set vedo 2 righe e il layout non lascia buchi; i risultati già salvati si leggono ancora; il calcolo di set/game vinti resta corretto.

---

## 4.2 Obiettivo 2 — Cambiare l'obiettivo di gara dal sito

**Cosa vuole l'utente:** modificare dal sito tempo obiettivo, distanza, nome e data della gara, e magari avere più obiettivi (A e B) ognuno col suo indice di realizzabilità.

**Stato attuale:** l'obiettivo è letto da `garmin_data.json` → `next_event` (scritto da `fetch_data.py` dalle costanti `EVENTO_MANUALE`, `EVENTO_DISTANZA_KM`, `EVENTO_TEMPO_OBIETTIVO`). Il blocco "prossima gara" è in `renderPrevisioni()`; `statoGara` alimenta la scheda Comparazione.

**Cosa fare:**
- Una "configurazione dell'atleta" unica (oggetto `config`) con precedenza: valori inseriti dal sito > `piano.json` > `next_event`.
- Finestra/modulo con: nome gara, data, distanza (preset 5 km/10 km/mezza/maratona + libera), tempo obiettivo (hh:mm:ss) e il relativo passo calcolato; lista di obiettivi con etichetta (A/B/C).
- Il blocco gara mostra l'indice per l'obiettivo selezionato (o tutti, affiancati).
- Salvataggio in `localStorage` + pulsante esporta/importa (come per le note).

**Cosa serve in più:** decidere dove vive la configurazione se si vuole condividerla fra dispositivi (vedi 4.8 e 5.2: serve un backend o un file nel repository). Per ora `localStorage` è sufficiente.

**Criteri di accettazione:** cambio l'obiettivo e vedo subito indice, delta di tempo e di passo ricalcolati; dopo un ricaricamento il valore resta; senza configurazione il sito funziona come oggi.

---

## 4.3 Obiettivo 3 — Inserire e modificare le previsioni Garmin dal sito

**Cosa vuole l'utente:** copiare dall'orologio le previsioni (5 km, 10 km, mezza, maratona) direttamente nel sito, modificarle facilmente e vedere come cambiano nel tempo.

**Stato attuale:** le previsioni vanno scritte nel codice (`PREVISIONI_MANUALI` in `fetch_data.py`) e finiscono in `race_predictions`; la stima mista usa il peso `PESO_GARMIN`.

**Cosa fare:**
- Modulo con 4 campi (formato `mm:ss` / `h:mm:ss`) + data di rilevazione; validazione e normalizzazione in secondi.
- Storico delle rilevazioni (tabella + piccolo grafico "previsione Garmin nel tempo" affiancato alla stima del sito).
- Precedenza: valori inseriti dal sito > API (se disponibili) > `fetch_data.py` > calcolo interno.
- Regolare dal sito anche il peso della previsione Garmin nella stima mista (cursore 0–50%).

**Cosa serve in più:** nulla di esterno. Valutare se le previsioni sono disponibili via API (finora no con la Personal API): in quel caso inserirle a mano resta la strada.

**Criteri di accettazione:** inserisco le 4 previsioni, la stima mista si aggiorna subito; posso correggerne una e vedere lo storico.

---

## 4.4 Obiettivo 4 — Tennis: livello degli avversari e progressi

**Cosa vuole l'utente:** assegnare un livello a ogni avversario per misurare i propri progressi in funzione di chi si affronta.

**Stato attuale:** la partita salva set, superficie e avversario (testo libero).

**Cosa fare:**
- Campo "Livello avversario" con scala semplice (per esempio 1–10, o categorie: principiante, intermedio, avanzato, agonista) più un campo facoltativo per una classifica ufficiale (es. rating federale) come testo.
- Anagrafica avversari (nome → livello) per non reinserire: lista con suggerimenti, modifica del livello nel tempo.
- Grafici: % di set e game vinti per fascia di livello nel tempo; "risultato atteso vs ottenuto" (differenza media di game rispetto al livello); testa a testa per avversario.
- Soglia minima di partite prima di mostrare conclusioni (es. 5) e avviso sulla scarsa numerosità.

**Cosa serve in più:** scegliere la scala di livello (semplice e soggettiva è sufficiente; un rating ufficiale richiederebbe dati esterni e licenze). Dipende da 4.1 per avere i set ben salvati.

**Criteri di accettazione:** dopo 5+ partite con livelli diversi vedo un grafico che separa i risultati per livello e un indicatore di tendenza.

---

## 4.5 Obiettivo 5 — Pendenza della retta di previsione per settimana

**Cosa vuole l'utente:** nel grafico della previsione verso la gara, indicare per ogni settimana di lavoro la pendenza della retta (quanto tempo si guadagna o si perde a settimana).

**Stato attuale:** `renderPrevisioneFutura()` disegna giorno per giorno la previsione di tre-quattro scenari (`simulaGiorni()`), con banda di stop e linea dell'obiettivo. Le settimane del piano hanno un fattore `progresso`.

**Cosa fare:**
- Calcolare, per ogni settimana (di calendario o del piano), la variazione del tempo previsto fra inizio e fine settimana: secondi/settimana e % (per lo scenario scelto).
- Mostrarla come etichette sul grafico (plugin Chart.js personalizzato o libreria *annotation* via CDN), come tratti colorati (verde = migliora, rosso = peggiora, grigio = stop) e come piccola tabella sotto il grafico.
- Collegare le etichette al nome della settimana del piano (es. "Sett. 1 — rientro: −0,4 s/giorno").

**Cosa serve in più:** nessun dato nuovo. Quando il piano avrà volumi per settimana si potrà derivare il progresso dai carichi (vedi 4.12, carico e prontezza).

**Criteri di accettazione:** ogni settimana ha una pendenza leggibile, coerente con i fattori del piano e con gli stop; cambiando scenario o stop i valori si aggiornano.

---

## 4.6 Obiettivo 6 — "Sensazione" nelle valutazioni degli allenamenti

**Cosa vuole l'utente:** indicare come ci si è sentiti (come fa Garmin: per esempio molto male, male, normale, bene, molto bene) e far cambiare di conseguenza la valutazione dell'allenamento.

**Stato attuale:** nel dettaglio attività ci sono "Sforzo percepito (1–10)", "Dolore (0–10)" e note, salvati in `noteAttivita`. `analizzaAttivita()` usa dolore e sforzo.

**Cosa fare:**
- Aggiungere il campo `sensazione` (scala a 5 livelli) al dettaglio attività; salvare in `noteAttivita`.
- Regole di combinazione (da definire e documentare) con battiti, passo, zone, dolore e sforzo. Esempi: sensazione "male" con FC bassa e passo lento → possibile stanchezza o malessere (segnala, non penalizzare l'esecuzione); "molto bene" ma FC oltre il target del piano → attenzione al rischio di eccedere; "male" + dolore sopra limite → consiglio di fermarsi (come da piano).
- La sensazione modula il **voto** e soprattutto il **testo** ("buon allenamento nonostante la giornata no" ecc.).
- Mostrare l'andamento delle sensazioni nel tempo e la correlazione con sonno, HRV, carico.

**Cosa serve in più:**
- Verificare se i dati Garmin dell'attività contengono già la sensazione e lo sforzo inseriti sull'orologio (campi che potrebbero chiamarsi `directWorkoutFeel` e `directWorkoutRpe`: **da verificare** in `data/struttura.txt`). Se presenti, importarli automaticamente e usare l'input manuale solo se mancano.
- Decidere la mappa di scala (es. 5 livelli ↔ valori numerici).

**Criteri di accettazione:** cambiando la sensazione cambia il testo della valutazione e, entro limiti dichiarati, il voto; le regole sono visibili in un elenco ("come ragiono") nel codice commentato.

---

## 4.7 Obiettivo 7 — App installabile (PWA) per telefono e PC

**Cosa vuole l'utente:** poter "scaricare" il sito come app su telefono e computer.

**Stato attuale:** esistono `manifest.webmanifest`, icone e meta tag; il manifest è dichiarato con `crossorigin="use-credentials"` perché il sito sta dietro Cloudflare Access. **Manca il service worker**, quindi niente uso offline.

**Cosa fare:**
- Service worker: cache dei file statici (HTML, JS, CSS, icone) con strategia *stale-while-revalidate*; per `garmin_data.json`, `dettagli/*` e `piano.json` strategia *network-first* con ultima copia come riserva offline.
- Banner "Offline: dati dell'ultimo aggiornamento" e pulsante "Installa l'app" (evento `beforeinstallprompt`).
- Gestione aggiornamenti: versione della cache e messaggio "Nuova versione disponibile".
- Attenzione all'interazione con Cloudflare Access: non memorizzare pagine di login; verificare che la prima apertura da "schermata Home" richieda comunque il codice.
- Istruzioni per iPhone (Safari → Aggiungi a Home) e Android/PC (installa app).

**Cosa serve in più (solo per gli store):** per pubblicare su App Store e Google Play servono wrapper nativi (Capacitor per iOS/Android, oppure TWA per Android), account sviluppatore a pagamento (Apple annuale, Google una tantum), schede privacy e revisione. Su desktop si può impacchettare con Tauri/Electron. **La PWA basta per l'uso personale**: i wrapper aggiungono costi e vincoli senza vantaggi per ora.

**Criteri di accettazione:** l'app si installa su Android, iPhone e PC; offline mostra l'ultima versione dei dati; un aggiornamento del sito arriva senza reinstallare.

---

## 4.8 Obiettivo 8 — Allenamenti inseriti a mano

**Cosa vuole l'utente:** poter registrare allenamenti senza orologio (utile per chi non ne ha uno).

**Stato attuale:** tutte le attività arrivano da `garmin_data.json`. Esistono già note, esercizi di forza e partite di tennis salvati a mano, ma collegati ad attività esistenti.

**Cosa fare:**
- Modulo "Nuovo allenamento": disciplina, titolo, data e ora, durata, distanza (facoltativa), FC media/massima (facoltative), sforzo percepito, sensazione, calorie (facoltative), note; moduli specifici per forza (registro esercizi) e tennis (set).
- Salvare come attività con `fonte: "manuale"` e id univoco (`m_<timestamp>`) in `localStorage` (`attivitaManuali`) e **unirle a `rawData.activities` al caricamento**, così tutte le pagine (calendario, ore, carico, record) le vedono.
- Per l'assenza di battiti: **carico stimato dallo sforzo percepito × durata** (metodo *session-RPE*), da usare in forma/fatica al posto della stima dalle zone.
- Modifica ed eliminazione; esporta/importa JSON.
- Segnalare nelle schede quando un dato è manuale (icona) per non confonderlo con le misure dell'orologio.

**Cosa serve in più:** decidere se le attività manuali devono sincronizzarsi fra dispositivi (richiede un backend o un file nel repository, vedi 5.2). Per un utente senza orologio il sito dovrà funzionare anche **senza** `garmin_data.json` (gestire il caso "file assente").

**Criteri di accettazione:** inserisco una corsa a mano e compare in calendario, elenco, ore settimanali e carico; senza alcun dato Garmin il sito si apre e permette di cominciare.

---

## 4.9 Obiettivo 9 — Pagina Infortuni

**Cosa vuole l'utente:** una pagina dedicata agli infortuni: descrivere il problema, vedere come evolve nel tempo e quali effetti ha sugli allenamenti; collegarla al dolore già registrato negli allenamenti, agli stop nelle previsioni e alle valutazioni.

**Stato attuale:** `dolore` (0–10) per attività in `noteAttivita`; limite di dolore nel piano (`dolore_max`); periodi di stop nella previsione (`stopDa`/`stopA`, `DETRAIN_SETT`).

**Cosa fare:**
- Modello dati `infortuni[]`: `id`, zona del corpo e lato, tipo (muscolare, tendineo, osseo, articolare, altro), data di insorgenza, gravità iniziale, stato (attivo / in recupero / risolto), data di risoluzione, note, trattamenti (fisioterapia, esercizi), limitazioni (es. niente salti), e una **cronologia** di voci `{data, dolore, nota}`.
- Passare da un `dolore` unico per attività a un dolore **per infortunio** (migrazione: i dolori esistenti vanno a un infortunio predefinito).
- Pagina con: elenco infortuni, scheda di dettaglio con grafico del dolore nel tempo sovrapposto al carico (sforzo relativo, volume settimanale), giorni di stop, attività svolte con dolore, e confronto prima/dopo (efficienza, ritmo a parità di FC).
- Collegamenti: uno stop registrato in un infortunio può diventare automaticamente il periodo di stop della previsione; la valutazione di un allenamento usa le limitazioni dell'infortunio attivo (come oggi usa `dolore_max` del piano).
- Silhouette del corpo semplice (SVG) per scegliere la zona.
- **Avvisi chiari**: non è un dispositivo medico, nessuna diagnosi; per sintomi importanti rivolgersi a un professionista.

**Cosa serve in più:** attenzione particolare alla **privacy** (dato sanitario, sezione 5.3). Evitare formulazioni diagnostiche o terapeutiche per non configurare un dispositivo medico software. Dipende in modo utile da 4.8 (infrastruttura di dati inseriti a mano).

**Criteri di accettazione:** posso aprire un infortunio, registrare l'andamento del dolore, vedere l'effetto sul carico e sugli allenamenti, e la previsione di gara tiene conto dello stop collegato.

---

## 4.10 Obiettivo 10 — Temi, grafica personalizzabile, modello di orologio

**Cosa vuole l'utente:** cambiare colori e temi (chiaro/scuro, grafiche diverse), disposizioni diverse in base ai modelli e ai dati disponibili, e mostrare anche il modello di orologio Garmin usato.

**Stato attuale:** un solo tema scuro "neon"; molti colori scritti nel codice (classi Tailwind e esadecimali nei grafici).

**Cosa fare:**
- Portare tutti i colori in **variabili CSS** (`--bg`, `--card`, `--testo`, `--accento-1…`) e leggerle anche da JavaScript per i grafici (`getComputedStyle`), così un tema cambia anche i grafici.
- 3–4 temi: scuro neon (attuale), chiaro, alto contrasto, sobrio; scelta salvata in `localStorage`, con preferenza di sistema (`prefers-color-scheme`) come predefinita.
- Layout: registro dei "moduli" (card/grafici) che dichiarano di quali dati hanno bisogno; la pagina mostra solo i moduli con dati disponibili e permette di riordinarli o nasconderli.
- **Modello dell'orologio**: verificare se l'API restituisce il dispositivo (le attività hanno un identificativo dispositivo; il nome potrebbe non essere disponibile con la Personal API: **da verificare**). In alternativa scelta manuale da un catalogo con le funzioni supportate (es. HRV, Body Battery, dinamica di corsa, potenza) che attiva/disattiva i moduli. Per le illustrazioni usare disegni propri (SVG), non immagini dei produttori.

**Cosa serve in più:** un catalogo dei modelli e delle loro capacità (da compilare e mantenere). Decidere se il tema è per utente (richiede un luogo di salvataggio condiviso) o per dispositivo.

**Criteri di accettazione:** cambio tema e cambiano pagina e grafici senza ricaricare; con un modello di orologio privo di una funzione la relativa card sparisce o spiega perché.

---

## 4.11 Obiettivo 11 — Bici, nuoto e triathlon/multisport

**Cosa vuole l'utente:** dare rilievo all'analisi di bici e nuoto, soprattutto per chi prepara triathlon o fa multisport.

**Stato attuale:** per bici, camminata, nuoto e altro c'è una scheda generica (numeri chiave, grafico a scelta di misure, zone). Nessuna logica specifica.

**Cosa fare (a gradini):**
- **Bici**: velocità, potenza (media, normalizzata), indice di intensità e carico stimato (equivalente del TSS), FTP stimata da prove o dai migliori 20 minuti, curva di potenza (migliori 5 s…60 min), cadenza, pendenze e VAM, indoor/outdoor.
- **Nuoto**: piscina e acque libere, passo per 100 m, SWOLF, frequenza e numero di bracciate, stile, tabella delle vasche e degli intervalli, velocità critica (CSS) da test 200/400 m.
- **Triathlon/multisport**: riconoscere attività multisport e le transizioni (T1/T2), sedute "brick" (bici + corsa ravvicinate), volume settimanale per disciplina rispetto ai target, previsioni per distanza (sprint, olimpico, 70.3, Ironman) sommando le tre frazioni, carico unico che integra le discipline.

**Cosa serve in più:** dati di dettaglio (serie di potenza, vasche, bracciate): arrivano da `dettagli/<id>.json` solo se l'API li fornisce; alternativa robusta: **importare file FIT/TCX** (vedi 4.14). Servono anche un utente di prova con questi sport e definizioni condivise (soglie, formule).

**Criteri di accettazione:** una uscita in bici con potenza mostra i numeri specifici e il carico; una nuotata in piscina mostra passo/100 m e vasche; la settimana mostra il volume per disciplina nel contesto del triathlon.

---

## 4.12 Obiettivo 12 — Funzioni Garmin di fascia alta (Forerunner 965 e simili)

**Cosa vuole l'utente:** riprodurre nel sito, come con Strava, le funzioni di qualità dei Garmin di fascia alta.

**Nota importante:** gli algoritmi di Garmin (Firstbeat) sono proprietari e molti dati non sono esposti dalla Personal API. Si possono costruire **equivalenti propri**, chiaramente etichettati come stime e con nomi diversi, senza copiare codice né presentarli come i valori dell'orologio.

**Elenco a pezzi, dal più semplice:**

| Funzione | Come farla | Diff. | Dati |
|---|---|---|---|
| Rapporto carico acuto/cronico | Dal carico già calcolato (forma/fatica): rapporto fra media a 7 e a 28 giorni | 2 | presenti |
| Focus del carico (anaerobico / aerobico alto / basso) | Distribuzione del tempo nelle zone e effetti allenanti | 2 | presenti |
| Stato di allenamento (produttivo, mantenimento, scarico, sovraccarico…) | Regole sulla tendenza del carico, del VO2 max e dell'HRV | 3 | presenti |
| Report del mattino | Riepilogo giornaliero: sonno, HRV, FC a riposo, carico, previsione della giornata | 2 | presenti |
| Prontezza all'allenamento | Indice composto (HRV, sonno, FC a riposo, carico recente, recupero) con pesi dichiarati | 3 | presenti |
| Tempo di recupero | Già abbozzato; renderlo coerente col carico | 3 | presenti |
| Condizione di performance, soglia del lattato (FC e passo) | Analisi di corse a ritmo stabile o di test; richiede serie temporali | 4 | dettagli |
| Punteggio di resistenza | Proxy da volume e lunghi recenti | 3 | presenti |
| Allenamenti suggeriti / coach adattivo | Motore di regole su piano, carico e prontezza | 5 | presenti + piano |
| Strategia di gara per percorso (stile PacePro) | Strategia dei passi su un tracciato con altimetria | 4 | tracciato |
| Acclimatamento a caldo e altitudine | Meteo (già disponibile) + quota | 4 | meteo, quota |
| Punteggio salita, stamina in tempo reale | Dipendono da dati al secondo e modelli complessi | 5 | dettagli |

**Cosa serve in più:** dati di dettaglio per le funzioni di fascia 4–5; una regola di prudenza: nessuna di queste funzioni è un'indicazione medica.

---

## 4.13 Obiettivo 13 — Nuoto artistico (sincronizzato)

**Perché è importante:** è lo sport di una persona cara al progetto e va trattato come un cittadino di prima classe, non come "altro". Gli orologi misurano poco di questo sport, quindi il valore sta nel **registro manuale ben fatto e nei progressi**.

**Da progettare insieme alla diretta interessata e, se possibile, alla sua allenatrice**, perché le metriche giuste le conoscono loro.

**Proposta di partenza:**
- **Tipi di sessione in acqua**: figure/elementi tecnici, routine libera o tecnica (solo, duo, squadra), acrobatica, tenuta del fiato/apnea, nuoto di base; **a secco**: danza/balletto, ginnastica, forza, flessibilità, preparazione atletica, corsa/cardio.
- **Dati per sessione**: durata, sforzo percepito, sensazione, luogo, note; FC se disponibile (in acqua il sensore ottico è poco affidabile: trattare come indicativa).
- **Progressi**: elenco degli elementi/figure con livello (da imparare → in apprendimento → consolidato → in gara) e percentuale di riuscita; tempi di apnea; test di flessibilità (spaccate, angoli) e di forza (trazioni, plank) con storico; carico settimanale (sforzo × durata).
- **Gare**: calendario, categoria, risultati con punteggi per componente (esecuzione, impressione artistica, difficoltà) e per prova (figure, routine tecnica, routine libera); andamento nel tempo.
- **Collegamenti**: infortuni (obiettivo 9), previsioni e obiettivi (come "punteggio obiettivo" invece del tempo), calendario.
- Link a video (solo collegamenti, niente caricamento file).

**Architettura consigliata:** introdurre un sistema di **profili sport** definiti da un file di configurazione (campi da compilare, grafici, regole di valutazione). Così tennis, forza, nuoto artistico e altri sport si descrivono senza toccare il nucleo del programma e chi non ha orologio può usarli.

**Cosa serve in più:** il glossario e le metriche dall'atleta/allenatrice; decisioni sulla riservatezza (se la persona è minorenne servono consensi dei genitori: vedi 5.3).

---

## 4.14 Obiettivo 14 — Più orologi e più fonti (Garmin diversi, Strava, Apple Watch, altre marche)

**Cosa vuole l'utente:** usare più orologi Garmin, prendere dati da Strava e valutare altre marche (Apple Watch, per esempio).

**Quadro reale (verificato con le fonti a fine 2026, da ricontrollare):**
- **Garmin Personal API**: pensata per l'uso personale di un singolo utente: la documentazione ufficiale dice che *non è pensata per applicazioni commerciali con più utenti finali*. Per più utenti serve il **Garmin Connect Developer Program** (richiesta di approvazione; accesso "Starter" con numero limitato di utenti e consegna dei dati solo in modalità *push*, e "Enterprise"; per alcuni usi commerciali è prevista una licenza a pagamento).
- **Strava**: l'API richiede di registrare un'app (OAuth). Dal novembre 2024 le condizioni vietano di mostrare i dati di un atleta ad altri utenti e di usare i dati dell'API per addestrare modelli di intelligenza artificiale/apprendimento automatico, e nel 2026 le restrizioni sono state ulteriormente inasprite: **ricontrollare i termini correnti** prima di costruire qualcosa.
- **Apple Watch**: i dati stanno in Apple Salute sul telefono; **non esiste un'API web** per leggerli da un sito. Le strade sono: app nativa iOS con HealthKit, esportazione di Apple Salute (file XML molto grande), app che esportano gli allenamenti in file FIT/Strava, oppure servizi di aggregazione a pagamento.

**Strada consigliata, a basso rischio e valida per tutte le marche:** **importare i file di allenamento (FIT, TCX, GPX)** dal browser, senza API né account.
- Lettura nel browser con una libreria di parsing FIT (da scegliere e verificare), niente invio dei dati a server.
- Un **modello dati comune** (`attività`: id, fonte, dispositivo, disciplina, date, durata, distanza, FC, zone, serie, percorso…) con un adattatore per ogni fonte (Garmin API, file FIT/TCX/GPX, Strava, manuale).
- **Deduplicazione** fra fonti (stessa attività da due canali), gestione dei fusi orari e delle unità.
- **Affidabilità del sensore**: FC da polso ≠ fascia toracica; non confrontare senza avvisi dati di dispositivi diversi (il codice già evita di mescolare orologi nelle tendenze: estendere il concetto con un campo `dispositivo`).
- Apple Watch: usare l'esportazione degli allenamenti in FIT/TCX tramite app dedicate, e mostrare istruzioni passo-passo.
- Strava: opzione facoltativa, **solo per l'utente stesso** e nel rispetto dei termini; non per mettere in comune dati.
- Servizi di aggregazione a pagamento: da valutare solo se nasce un vero progetto con più utenti (costi, privacy, contratti).

**Cosa serve in più:** decisioni su quali fonti supportare davvero, una persona con ciascun dispositivo per provare, un catalogo dei dispositivi (vedi 4.10).

---

## 4.15 Obiettivo 15 — Privacy, trattamento dati e uso aggregato

**Questo non è codice ma va deciso prima di aprire il sito ad altre persone.** Non sono consulenza legale: coinvolgere un professionista prima di un uso con persone esterne alla cerchia ristretta.

**Punti principali:**
- **Dati sanitari = categoria particolare** (GDPR, art. 9): frequenza cardiaca, sonno, HRV, infortuni e simili possono rientrarvi. Servono base giuridica (di norma **consenso esplicito**), informativa chiara, minimizzazione, limitazione delle finalità, tempi di conservazione, sicurezza, e diritti dell'utente (accesso, esportazione, correzione, cancellazione).
- **Chi è titolare del trattamento**: con "una copia per persona" (opzione 0 della sezione 5.2) ciascuno è titolare dei propri dati e il problema si riduce molto; con una piattaforma centrale il gestore diventa titolare/responsabile e gli obblighi crescono (registro dei trattamenti, valutazione d'impatto, eventuali contratti con i fornitori, trasferimenti extra-UE).
- **Minorenni**: in Italia il consenso digitale autonomo vale dai 14 anni (da verificare); sotto serve il consenso dei genitori. Rilevante per sport giovanili.
- **Termini dei fornitori di dati**: Garmin Personal API è solo personale; Strava vieta di mostrare i dati ad altri utenti e di usarli per addestrare modelli; verificare quelli di ogni fonte prima di mettere in comune dati.
- **Uso aggregato per migliorare stime ed equazioni**: finalità **separata**, solo con **consenso facoltativo** (opt-in) e revocabile. Approccio prudente: non mettere in comune i dati grezzi, ma solo parametri o statistiche aggregate calcolate localmente (per esempio l'esponente di Riegel per livello, la distribuzione del progresso mensile), con una soglia minima di persone per evitare identificazioni e, se serve, rumore statistico (privacy differenziale). Pseudonimizzare gli identificativi e separare le tabelle.
- **Sicurezza**: cifratura dei dati e dei token a riposo, accesso minimo, nessuna chiave nel browser, registri degli accessi, piano di risposta a una violazione.
- **Trasparenza e confini**: pagina "Come usiamo i tuoi dati", pulsanti "Scarica i miei dati" e "Cancella tutto", e avvisi che le valutazioni **non sono consigli medici**.

**Cosa serve in più:** una scelta di principio (opzione 0 o piattaforma), un testo di informativa e termini d'uso, un luogo di conservazione dei dati in UE se si fa una piattaforma, e un parere legale.

---

## 4.16 Obiettivo 16 — Più utenti

**Cosa vuole l'utente:** estendere il sito ad altre persone.

**Tre strade, in ordine di impegno:**

**Opzione 0 — "Una copia per persona" (consigliata per ora, nessun backend).**
Ogni persona fa una copia del repository (fork o modello), genera la **propria** chiave Garmin personale (è esattamente l'uso previsto dalla Personal API), mette la chiave nei Secrets del proprio repository e usa un proprio sito su Cloudflare Pages con Cloudflare Access. Pro: nessun problema di termini d'uso con Garmin, ciascuno resta titolare dei suoi dati, zero costi di infrastruttura. Contro: configurazione iniziale (da semplificare con una guida e uno script di avvio), nessun dato in comune. Chi non ha un orologio usa gli **allenamenti manuali** (4.8) e i **profili sport** (4.13).

**Opzione 1 — Backend leggero con account.**
Servono: autenticazione, database con isolamento per utente (es. Cloudflare Workers + D1/KV/R2, oppure Supabase con sicurezza a livello di riga), archiviazione dei dati cifrata, caricamento file FIT/TCX/GPX, esportazione e cancellazione, lavori periodici per le fonti collegate. **Con Garmin richiede il Developer Program** (non la Personal API). Attenzione ai costi, alla manutenzione e agli obblighi della sezione 4.15.

**Opzione 2 — Piattaforma completa.**
Account, abbonamenti, integrazioni multiple, supporto, conformità. Fuori portata finché non c'è un bisogno concreto.

**Cosa serve in più:** completare prima 4.15; scegliere lo stack del backend; separare nel codice il "motore" (calcoli) dai "dati" (da dove arrivano) per poter cambiare fonte senza riscrivere tutto; strumenti di test automatici per non rompere gli utenti esistenti.

---

## 5. Temi trasversali

### 5.1 Un'architettura che aiuta tutti gli obiettivi
1. **Livello dati unico**: una funzione `caricaDati()` che unisce `garmin_data.json`, attività manuali, import da file e fonti future in un unico modello `attività` (4.8, 4.14).
2. **Configurazione dell'atleta** (obiettivi, previsioni, zone cardiache, modello di orologio, tema) in un solo oggetto, con salvataggio ed esportazione (4.2, 4.3, 4.10).
3. **Profili sport** configurabili (4.13).
4. **Tema e colori** da variabili CSS (4.10).
5. Suddividere `app.js` in file per blocco **solo se** il team lo decide (ES modules senza bundler è sufficiente): oggi un file unico è più semplice da trasferire e correggere, ma cresce.

### 5.2 Dove salvare i dati inseriti dagli utenti
| Scelta | Pro | Contro |
|---|---|---|
| `localStorage` (oggi) | Semplice, privato, nessun costo | Per dispositivo; si perde se si cancellano i dati del browser |
| File nel repository (es. `manuali.json`, `config.json`) | Condiviso, versionato | Modificare a mano; scrivere dal sito richiede un token con permessi (rischioso) |
| Backend (Workers/Supabase/…) | Sincronizzazione, account | Costi, manutenzione, obblighi legali (4.15) |

Consiglio: restare su `localStorage` + esporta/importa finché non nasce un bisogno reale di sincronizzare.

### 5.3 Rischi e limiti da dichiarare nell'interfaccia
- Le valutazioni, i voti e le previsioni sono **stime a regole**, non misure né pareri medici.
- Dati di orologi diversi non sono sempre confrontabili.
- Il sito non sostituisce un allenatore o un professionista sanitario.

---

## 6. Domande aperte per il proprietario del progetto
1. Quali obiettivi hanno la precedenza assoluta per il prossimo mese? (suggerimento: dal 1 al 7)
2. Il sito resterà personale (con qualche persona vicina) o diventerà un servizio per molti? Da qui dipende 4.16.
3. Chi deve poter vedere cosa? Per esempio, l'amico che sviluppa deve vedere i dati reali o solo quelli finti?
4. Per il nuoto artistico: chi è la persona di riferimento (atleta/allenatrice) con cui definire le metriche?
5. Preferenza tra salvataggio nel browser e sincronizzazione fra dispositivi (5.2)?

---

## 7. Glossario rapido
- **TRIMP / sforzo relativo (RE)**: carico di un allenamento dai minuti trascorsi nelle zone cardiache, pesati da 1 a 5.
- **Fitness / Fatica / Forma**: medie mobili del carico a 42 e 7 giorni; Forma = Fitness − Fatica.
- **Riegel**: formula per stimare il tempo su una distanza partendo da un'altra (esponente 1,06).
- **Deriva cardiaca**: aumento dei battiti a parità di ritmo durante un allenamento.
- **PWA**: sito installabile come app.
- **RPE / session-RPE**: sforzo percepito (1–10) e carico stimato come sforzo × durata.
- **FIT / TCX / GPX**: formati dei file di allenamento degli orologi.

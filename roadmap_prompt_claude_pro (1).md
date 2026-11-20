# 🚀 Garmin Performance Hub & Sports Analytics — Roadmap & Claude Pro Prompt

> **Note per lo sviluppatore / Claude Pro:** 
> Questo documento descrive la visione integrata, le feature richieste e le fasi di implementazione per la piattaforma web *Garmin Performance Hub*. È strutturato in ordine crescente di difficoltà per guidare lo sviluppo incrementale del progetto.

---

## 📌 Istruzioni di Contesto per Claude Pro (Prompt di Avvio)

```text
Sei il Lead Full-Stack Developer e Data Engineer del progetto "Garmin Performance Hub & Multisport Analytics". 
Il progetto è una Web Application per il tracciamento dettagliato di allenamenti (corsa, tennis, nuoto, nuoto sincronizzato, bici, triathlon), valutazioni della forma fisica, calcolo degli infortuni e previsioni verso le gare.

L'obiettivo è implementare le funzionalità descritte in questa Roadmap rispettando l'ordine delle Fasi. 
Mantieni un codice pulito, modulare (se possibile single-page React/HTML5 con Tailwind CSS o componenti riutilizzabili) e predisposto alla scalabilità.
```

---

## 📊 Panoramica delle Fasi e Difficoltà

| Fase | Descrizione | Livello Difficoltà | Stack / Requisiti |
| :--- | :--- | :--- | :--- |
| **Fase 1** | Quick Wins UI & Modifiche Dati Locali | 🟢 Basso (1/5) | JavaScript Native / UI Logic |
| **Fase 2** | Funzioni Sportive Specifiche (Tennis, Nuoto Sincro), Infortuni & Impostazioni | 🟡 Medio (2/5) | LocalStorage / UI State Management |
| **Fase 3** | Analytics Avanzate Multisport & PWA | 🟧 Medio-Alto (3/5) | PWA Manifest, Service Workers, Chart.js |
| **Fase 4** | Algoritmi High-End (Garmin/Strava) & Wearables Multi-Brand | 🟥 Alto (4/5) | API Integration / Data Normalization |
| **Fase 5** | Multi-Utente, Cloud Backend, Privacy & GDPR | 🟣 Molto Alto (5/5) | Node.js/Python, Auth (OAuth2), DB, GDPR |

---

## 🟢 FASE 1: Quick Wins UI & Modifiche Dati Locali (Difficoltà: Bassa)

### 1.1 Variazione dell'Obiettivo direttamente dal Sito
* **Descrizione:** Consentire all'utente di modificare il target di gara (es. da Sub-47' a Sub-45' sui 10k) o la data della gara tramite un pannello di configurazione nell'interfaccia.
* **Cosa occorre fare in più:** 
  * Creare un form modal o dei campi input nell'header/sidebar.
  * Salvare i valori in `localStorage` per mantenere la preferenza al ricaricamento della pagina.
  * Ricalcolare al volo la baseline dei ritmi e delle zone di allenamento.

### 1.2 Inserimento Previsioni Garmin e Modifica Manuale
* **Descrizione:** Permettere di inserire o correggere manualmente i tempi previsti da Garmin (5k, 10k, Mezza, Maratona).
* **Cosa occorre fare in più:**
  * Interfaccia di override dei dati JSON.
  * Logica di fallback: se esiste una previsione manuale utente, usa quella per i grafici; altrimenti usa il dato calcolato/fetchato.

### 1.3 Pendenza della Retta delle Previsioni (Target Slope)
* **Descrizione:** Visualizzare nel grafico principale la linea di tendenza (pendenza/slope) che collega la media dei ritmi attuali al target finale della gara.
* **Cosa occorre fare in più:**
  * Calcolo matematico della regressione lineare tra la settimana corrente e la settimana dell'evento ($y = mx + q$).
  * Aggiungere un dataset secondario (linea tratteggiata) nel grafico di Chart.js/Recharts con l'indicazione visiva dell'inclinazione (progressione richiesta in sec/km a settimana).

### 1.4 Rating "Sensazione" negli Allenamenti (RPE / Feeling)
* **Descrizione:** Aggiungere una scala di sensazione (es. *Molto Male, Male, Normale, Bene, Molto Bene*) per ciascun allenamento registrato.
* **Cosa occorre fare in più:**
  * Sistema di valutazione RPE (Rate of Perceived Exertion) da 1 a 10 associato alle etichette.
  * Modificare il calcolo del "Training Load" e della "Valutazione Allenamento": una sessione a parità di passo ma con sensazione "Molto Male" incrementa la stima dello stress fisicocentrico o segnala rischio overtraining.

### 1.5 Inserimento Manuale degli Allenamenti
* **Descrizione:** Permettere agli utenti che non possiedono uno smartwatch (o per sessioni indoor/senza orologio) di registrare l'allenamento manualmente.
* **Cosa occorre fare in più:**
  * Form di inserimento con campi: Data, Sport, Durata, Distanza, Frequenza Cardieca Media (opzionale), Sensazione (RPE), Note.
  * Unificazione della struttura dati: l'array degli allenamenti deve accettare sia oggetti da API/JSON Garmin che oggetti creati manualmente (`source: "manual"`).

---

## 🟡 FASE 2: Sport Specifici, Pagina Infortuni, Impostazioni & Personalizzazione (Difficoltà: Media)

### 2.1 UI Tennis: Selezione Set Giocati e Layout Dinamico
* **Descrizione:** Ottimizzare il layout per il tennis evitando spazi vuoti se si giocano 2 o 3 set anziché 5.
* **Cosa occorre fare in più:**
  * Componente punteggio dinamico che adatta la griglia (CSS Grid / Flexbox) in base al numero dei set selezionati (es. al meglio dei 3 o al meglio dei 5).
  * Statistiche aggregate per set (durata, game vinti, intensità cardiaca media durante il set).

### 2.2 Tennis: Livello degli Avversari e Tracciamento Progressi
* **Descrizione:** Inserire il livello/classifica dell'avversario (es. NTRP, FITP o livello amatoriale 1-10) per contestualizzare la prestazione fisica e i progressi.
* **Cosa occorre fare in più:**
  * Campo "Livello Avversario" nel form di tracciamento.
  * Algoritmo di "Prestazione Relativa": pondera l'efficienza fisica e l'esito del match in base alla forza stimata dell'avversario.

### 2.3 Nuova Pagina Dedicata agli Infortuni & Pain Tracking
* **Descrizione:** Una sezione dedicata alla gestione degli infortuni, tracciamento della scala del dolore, stop programmatici e loro impatto sulle stime della gara.
* **Cosa occorre fare in più:**
  * Creazione di un registro infortuni (Data inizio, Zona anatomica, Livello dolore 1-10, Note mediche).
  * Grafico temporale sull'evoluzione del dolore.
  * **Integrazione con le previsioni:** Se c'è uno stop forzato o un infortunio attivo, l'algoritmo di stima della gara deve automaticamente appiattire la retta di progressione o posticipare l'obiettivo.

### 2.4 Personalizzazione Grafica (Temi, Colori, Modelli Garmin)
* **Descrizione:** Permettere il cambio di tema (Dark/Light mode, palette di colori personalizzabili) e mostrare un badge/icona personalizzata basata sul modello di dispositivo utilizzato (es. Forerunner 965, Fenix, Apple Watch).
* **Cosa occorre fare in più:**
  * Implementazione di variabili CSS o Tailwind `dark:` mode.
  * Mappatura dei modelli di orologio (estratte dai metadati FIT/Garmin) verso badge/icone grafiche dedicate nella dashboard.

### 2.5 Pagina Impostazioni & Filtro Sport Preferiti (Dashboard Tailored)
* **Descrizione:** Creare una pagina "Impostazioni / Informazioni Utente" dove l'utente può selezionare solo gli sport che gli interessano (es. Nuoto Sincronizzato, Tennis e Nuoto, escludendo Corsa). La Home Page e le metriche generali mostreranno **esclusivamente** le card e le statistiche rilevanti per gli sport selezionati (es. se la tua ragazza seleziona solo Sincro e Tennis, la vista iniziale nasconderà la card con i km corsi e mostrerà solo ore di sincro, vasche e partite di tennis).
* **Cosa occorre fare in più:**
  * Creare la pagina/modale `Impostazioni` in `index.html` e `app.js` con checkbox/toggle per ciascuno sport.
  * Salvare la lista degli sport d'interesse in `localStorage` (e in futuro nel profilo utente su DB).
  * Implementare la resa condizionale (conditional rendering) in `app.js` sulle widget card e sui grafici riassuntivi della Dashboard iniziale in base agli sport attivati.

---

## 🟧 FASE 3: Analytics Avanzate Multisport & PWA (Difficoltà: Media-Alta)

### 3.1 Specializzazione Nuoto Sincronizzato (Artistic Swimming)
* **Descrizione:** Creare una sezione unica e dedicata al Nuoto Sincronizzato con metriche specifiche per l'allenamento in vasca (apnea, lavoro core, routine, intensità altezze).
* **Cosa occorre fare in più:**
  * Definizione di un modello dati ad hoc (Tempo in Apnea, Tipo Routine: Tecnico/Libero, Valutazione Esecuzione, Frequenza Cardieca in vasca).
  * Dashboard grafica dedicata a questo sport per dare valore e tracciabilità ai progressi della disciplina.

### 3.2 Analisi Rilevante per Bici, Nuoto & Triathlon (Multisport)
* **Descrizione:** Sviluppare schede analitiche approfondite per il Ciclismo (Power Zones, Cadenza, Dislivello) e Nuoto (SWOLF, Passo/100m, Bracciate).
* **Cosa occorre fare in più:**
  * Parsing e gestione di dati specifici per sport:
    * **Bici:** Normalized Power (NP), Intensity Factor (IF), TSS.
    * **Nuoto:** SWOLF score, Pace al 100m, Conteggio bracciate.
  * Vista aggregata "Triathlon" che mostra la distribuzione del volume settimanale diviso tra le 3 discipline.

### 3.3 Trasformazione Web App in PWA (Progressive Web App)
* **Descrizione:** Rendere l'applicazione installabile su smartphone (iOS/Android) e Desktop (PC/Mac) come app nativa offline-ready.
* **Cosa occorre fare in più:**
  * Creazione del file `manifest.json` (icone, colori tema, display mode `standalone`).
  * Scrittura di un **Service Worker** per gestire la cache degli asset statici e consentire la consultazione della dashboard anche in assenza di rete.

---

## 🟥 FASE 4: Algoritmi High-End & Integrazione Wearables (Difficoltà: Alta)

### 4.1 Replicazione Funzionalità High-End (Garmin 965 / Strava Premium)
* **Descrizione:** Implementare algoritmi proprietari per calcolare metriche avanzate di recupero e forma fisica senza dover acquistare hardware di fascia ultra-alta.
* **Cosa occorre fare in più:**
  * **Training Readiness:** Algoritmo ponderato basato su: Qualità del Sonno + Carico Allenamento 7gg + Stato HRV + Tempo di Recupero.
  * **Fitness & Freshness (CTL/ATL/TSB):** Implementare la curva di Banister (Acute Training Load vs Chronic Training Load) per determinare la forma ideale il giorno della gara.
  * **HRV Status:** Calcolo della variabilità della frequenza cardiaca rispetto alla baseline storica dell'utente.

### 4.2 Supporto Multi-Brand (Apple Watch, Strava API, Altri Orologi)
* **Descrizione:** Estendere il recupero dati oltre a Garmin Connect, permettendo l'importazione da Strava e da Apple HealthKit (Apple Watch).
* **Cosa occorre fare in più:**
  * Integration con **Strava API v3** (OAuth2 flow per l'autorizzazione dell'utente e recupero attività unificate).
  * Per Apple Watch: Gestione dell'importazione di file `.gpx`, `.fit` o esportazione dati da Apple Salute / HealthFit app in formato JSON/FIT.
  * Normalizzatore dei Dati: Un layer software che prende dati da fonti diverse (Garmin, Strava, Apple) e li converte in un unico formato standardizzato per il sito.

---

## 🟣 FASE 5: Multi-Utente, Cloud Backend, Privacy & GDPR (Difficoltà: Molto Alta)

### 5.1 Architettura Multi-Utente e Database Cloud
* **Descrizione:** Trasformare la dashboard da applicazione "single-user" locale a una piattaforma SaaS utilizzabile da più utenti contemporaneamente.
* **Cosa occorre fare in più:**
  * **Backend Framework:** Sviluppo di un backend REST o GraphQL (Node.js/Express, Python/FastAPI, o Firebase/Supabase).
  * **Autenticazione Sicura:** Login/Register con JWT, OAuth2 (Google, Apple, Strava Login).
  * **Database Relazionale/Documentale:** (PostgreSQL o MongoDB) per separare in modo stagno i dati degli utenti (Tabelle `Users`, `Activities`, `Injuries`, `Goals`, `UserSettings`).

### 5.2 Privacy, GDPR e Trattamento Dati Biometrici
* **Descrizione:** Garantire la conformità legale ed etica sul trattamento dei dati biometrici (frequenza cardiaca, sonno, salute, posizione GPS).
* **Cosa occorre fare in più:**
  * **Privacy Policy & Terms of Service:** Documentazione sulla gestione dei dati personali sensibili (GDPR Art. 9).
  * **Consenso Esplicito:** Banner di accettazione Cookie e consenso separato al trattamento dei dati sanitari/biometrici.
  * **Crittografia dei Dati:** Encryption at rest per token e dati personali sul database.
  * **Diritto all'Oblio ed Esportazione:** Funzione per scaricare tutti i propri dati in JSON o eliminare definitivamente l'account.

### 5.3 Data Science Aggregata & Algoritmi di Machine Learning
* **Descrizione:** Utilizzare i dati aggregati e anonimizzati di tutta la base utenti per migliorare le equazioni di stima delle gare e prevenzione infortuni a beneficio di tutti.
* **Cosa occorre fare in più:**
  * **Anonymization Pipeline:** Algoritmo che rimuove dati personali identificativi (nomi, tracciati GPS esatti, IP) mantenendo solo metriche atletiche pure (età, peso, ritmi, VO2max, RPE).
  * **Modello Predittivo:** Addestrare modelli di regressione/Machine Learning (es. Scikit-Learn) per affinare le stime dei tempi gara e rilevare pattern precoci di overtraining o infortunio basati sull'esperienza collettiva della community.

---

## 🛠️ Stack Tecnologico Consigliato per Claude Pro

* **Frontend:** React / Next.js oppure Tailwind CSS + JavaScript ES6 Module (Single File/Modular Architecture).
* **Grafici:** Chart.js o Recharts (con plugin per annotazioni e linee di regressione).
* **State & Local Storage:** Redux Toolkit o Context API con sync automatico su `localStorage`.
* **Backend (Fase 5):** Supabase / Firebase per rapid prototyping (Auth + Database + Storage) oppure FastAPI (Python) per backend analitico.
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_data.py - scarica i tuoi dati dalla Garmin Personal API (sola lettura)
e scrive garmin_data.json, che la dashboard legge senza modifiche.

Come si usa (dal terminale, dentro la cartella del progetto):
    python fetch_data.py --test    prova la connessione e mostra le ultime 5 attivita
    python fetch_data.py           scarica gli ultimi 12 mesi (dalla seconda volta solo le novita)
    python fetch_data.py --tutto   scarica tutta la storia (ci vogliono alcuni minuti)

Su Mac scrivi python3 al posto di python.

La chiave sta SOLO nel file .env.local, in una riga fatta cosi:
    GARMIN_PERSONAL_API_KEY=la_tua_chiave
"""
import csv
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if sys.version_info < (3, 8):
    print("Serve Python 3.8 o piu recente. Scrivi 'python --version' per controllare quale hai.")
    sys.exit(1)

try:  # evita errori di codifica sul terminale di Windows
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ----------------------------------------------------------------------------
# IMPOSTAZIONI (se non sai cosa fare, non toccare nulla)
# ----------------------------------------------------------------------------
BASE = "https://personal.connectapi.garmin.com"
TOKEN_URL = BASE + "/personalapitoken-service/personal-api/personal-api-key/token"
UA = "garmin-dashboard/1.0"

CARTELLA = Path(__file__).resolve().parent
DATA = CARTELLA / "data"
FILE_ENV = CARTELLA / ".env.local"
FILE_TOKEN = DATA / "token.json"
FILE_STATO = DATA / "stato.json"
FILE_ATTIVITA = DATA / "attivita.json"
FILE_GIORNI = DATA / "giorni.json"
FILE_STRUTTURA = DATA / "struttura.txt"
FILE_OUT = CARTELLA / "garmin_data.json"
FILE_BACKUP = CARTELLA / "garmin_data.backup.json"
FILE_METEO = DATA / "meteo.json"
URL_METEO_ARCHIVIO = "https://archive-api.open-meteo.com/v1/archive"
URL_METEO_PREVISIONI = "https://api.open-meteo.com/v1/forecast"
VARIABILI_METEO = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,weather_code"
CARTELLA_DETTAGLI = CARTELLA / "dettagli"   # un file per ogni attività, con km per km, serie e percorso
MAX_DETTAGLI_PER_RUN = 25                   # quanti dettagli scaricare al massimo ad ogni esecuzione (i più recenti per primi)
SCHEMA_ATTIVITA = 3                         # sale quando aggiungo nuovi campi: così le attività vecchie si riscaricano una volta
FILE_STORICO_ATT = CARTELLA / "activities.csv"   # export Strava con le attivita del vecchio orologio

MESI_DEFAULT = 12          # quanti mesi scaricare la prima volta
INIZIO_STORIA = date(2015, 1, 1)
PAUSA = 0.4                # secondi di pausa tra una chiamata e l'altra
SOVRAPPOSIZIONE = 3        # giorni riscaricati ad ogni aggiornamento (per correggere dati parziali)
BODY_BATTERY = "max"       # "max" = carica massima del giorno, "min" = carica minima

# VO2 max: Garmin non lo fornisce in questa API, quindi lo scrivi tu qui (solo il numero).
# Quando il tuo orologio lo cambia, modifica il numero, salva e rilancia lo script.
# Se metti None, usa l'ultimo valore trovato nei vecchi file CSV.
VO2_MAX_MANUALE = 55

# PROSSIMO EVENTO mostrato in alto nel sito.
# Lo script prova a leggerlo dal calendario gare di Garmin. Se non ci riesce usa EVENTO_MANUALE.
# Esempio: EVENTO_MANUALE = ("Nome della gara", "2026-12-06")   (data nel formato AAAA-MM-GG)
# Se lasci None e Garmin non lo da', nel sito resta il testo che c'e' in index.html.
EVENTO_MANUALE = ("Mezza di Vercelli", "2027-02-28")
# Obiettivo da mostrare accanto all'evento, per esempio "Sub 1h30". Lascia "" per non mostrarlo.
OBIETTIVO_EVENTO = "Sub 1h30"
# Dati della gara per la pagina Record & PB (distanza in km e tempo obiettivo ore:minuti:secondi)
EVENTO_DISTANZA_KM = 21.0975
EVENTO_TEMPO_OBIETTIVO = "1:30:00"

# PREVISIONI DI GARA. Lo script prova a leggerle da Garmin. Se Garmin non le da', puoi scriverle a mano
# (dall'orologio), per esempio: {"5k": "21:30", "10k": "45:00", "mezza": "1:38:00", "maratona": "3:30:00"}
# Se lasci None, il sito le calcola dalle tue corse recenti.
# RECORD PERSONALI segnati dall'orologio. Il sito prova a ritrovarli da solo nelle tue corse (con la data):
# questi valori servono come riferimento ufficiale. Formato: "tempo" oppure ("tempo", "AAAA-MM-GG" della data).
# Distanze possibili: "1k", "5k", "10k", "15k", "mezza", "maratona".
# Se un giorno batti un record, il sito lo mostra da solo; aggiorni qui solo se vuoi allinearlo all'orologio.
RECORD_MANUALI = {
    "1k": "4:03",
    "5k": ("21:33", "2026-09-27"),
    "10k": ("43:29", "2026-09-27"),
    "mezza": ("1:40:56", "2026-10-25"),
}

PREVISIONI_MANUALI = {"5k": "19:23", "10k": "41:17", "mezza": "1:32:40", "maratona": "3:25:52"}

RE_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}")
STATO_RUN = {"chiave": None, "token": None}
CAMPIONI = {}              # primo elemento di ogni tipo di risposta (serve a file struttura.txt)


class ErroreGarmin(Exception):
    pass


class RispostaTroppoGrande(Exception):
    pass


# ----------------------------------------------------------------------------
# CHIAVE E TOKEN
# ----------------------------------------------------------------------------
def leggi_chiave():
    # Su GitHub la chiave arriva dai "Secrets" come variabile d'ambiente; sul tuo PC dal file .env.local
    chiave_ambiente = os.environ.get("GARMIN_PERSONAL_API_KEY", "").strip()
    if chiave_ambiente:
        return chiave_ambiente
    if not FILE_ENV.exists():
        raise ErroreGarmin("Non trovo il file .env.local nella cartella del progetto.")
    chiave = ""
    for riga in FILE_ENV.read_text(encoding="utf-8-sig").splitlines():
        riga = riga.strip()
        if riga.startswith("GARMIN_PERSONAL_API_KEY="):
            chiave = riga.split("=", 1)[1].strip().strip('"').strip("'").strip()
    if not chiave:
        raise ErroreGarmin("In .env.local la chiave e' vuota: incollala subito dopo il simbolo =, "
                           "senza spazi, poi salva il file.")
    return chiave


def richiedi_token():
    req = urllib.request.Request(
        TOKEN_URL, data=b"", method="POST",
        headers={"Authorization": "ApiKey " + STATO_RUN["chiave"], "User-Agent": UA, "Accept": "*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            testo = r.read().decode("utf-8", errors="replace").strip()
    except urllib.error.HTTPError as e:
        if e.code in (400, 401, 403):
            raise ErroreGarmin(
                "Garmin ha rifiutato la chiave (errore %d). La chiave e' sbagliata, copiata a meta', "
                "scaduta o eliminata. Controlla la riga in .env.local." % e.code)
        raise ErroreGarmin("Garmin ha risposto con l'errore %d alla richiesta del token." % e.code)
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise ErroreGarmin("Non riesco a collegarmi a Garmin. Controlla la connessione internet.")
    if testo.startswith("{"):  # nel caso la risposta fosse un JSON invece di testo semplice
        try:
            j = json.loads(testo)
            testo = j.get("token") or j.get("access_token") or j.get("accessToken") or ""
        except ValueError:
            pass
    testo = str(testo).strip().strip('"')
    if not testo:
        raise ErroreGarmin("Garmin ha risposto ma senza token.")
    return testo


def ottieni_token(forza=False):
    """Riusa il token salvato se ha meno di 20 ore, altrimenti ne chiede uno nuovo."""
    if not forza and FILE_TOKEN.exists():
        try:
            j = json.loads(FILE_TOKEN.read_text(encoding="utf-8"))
            if j.get("token") and time.time() - j["salvato"] < 20 * 3600:
                STATO_RUN["token"] = j["token"]
                return
        except Exception:
            pass
    token = richiedi_token()
    DATA.mkdir(exist_ok=True)
    FILE_TOKEN.write_text(json.dumps({"token": token, "salvato": time.time()}), encoding="utf-8")
    STATO_RUN["token"] = token


# ----------------------------------------------------------------------------
# CHIAMATE ALLE API
# ----------------------------------------------------------------------------
def chiama(percorso):
    """GET su Garmin. Riprova da solo se il server e' occupato."""
    rinnovato = False
    for tentativo in range(1, 6):
        time.sleep(PAUSA)
        req = urllib.request.Request(
            BASE + percorso,
            headers={"Authorization": "Bearer " + STATO_RUN["token"],
                     "Accept": "application/json", "User-Agent": UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                corpo = r.read().decode("utf-8", errors="replace")
            if not corpo.strip():
                return None
            return json.loads(corpo)
        except urllib.error.HTTPError as e:
            c = e.code
            if c == 401 and not rinnovato:
                rinnovato = True
                ottieni_token(forza=True)
                continue
            if c == 500:
                raise RispostaTroppoGrande()
            if c in (429, 502, 503):
                time.sleep(3 * tentativo)
                continue
            if c in (204, 404):
                return None
            raise ErroreGarmin("errore %d su %s" % (c, percorso.split("?")[0]))
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(3 * tentativo)
            continue
        except ValueError:
            raise ErroreGarmin("risposta non leggibile su %s" % percorso.split("?")[0])
    raise ErroreGarmin("troppi tentativi falliti su %s" % percorso.split("?")[0])


def intervallo(url_fn, a, b):
    """Scarica un intervallo di date. Se la risposta e' troppo grande lo divide a meta'."""
    try:
        return [chiama(url_fn(a, b))]
    except RispostaTroppoGrande:
        if a >= b:
            print("\n  Avviso: il giorno %s non si riesce a scaricare, lo salto." % a)
            return []
        meta = a + timedelta(days=(b - a).days // 2)
        return intervallo(url_fn, a, meta) + intervallo(url_fn, meta + timedelta(days=1), b)


def avanzamento(testo):
    print(("  " + testo).ljust(72), end="\r", flush=True)


def scarica_a_pezzi(nome, url_fn, a, b, giorni_max):
    """Ritorna (lista_risposte, tutto_ok)."""
    risposte, ok, cur = [], True, a
    while cur <= b:
        fine = min(b, cur + timedelta(days=giorni_max - 1))
        avanzamento("%s: %s -> %s" % (nome, cur, fine))
        try:
            risposte.extend(intervallo(url_fn, cur, fine))
        except ErroreGarmin as e:
            print("\n  Avviso (%s, %s -> %s): %s" % (nome, cur, fine, e))
            ok = False
        cur = fine + timedelta(days=1)
    print(" " * 72, end="\r")
    return risposte, ok


# ----------------------------------------------------------------------------
# AIUTI PER LEGGERE LE RISPOSTE
# ----------------------------------------------------------------------------
def num(v):
    if isinstance(v, dict):
        v = v.get("value")
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else round(f, 2)


def dct(x):
    return x if isinstance(x, dict) else {}


def dig(d, *percorso):
    for k in percorso:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def deep_find(obj, nomi):
    """Cerca in profondita' la prima chiave (senza badare alle maiuscole) con un numero."""
    coda = [obj]
    while coda:
        x = coda.pop(0)
        if isinstance(x, dict):
            for k, v in x.items():
                if k.lower() in nomi and num(v) is not None:
                    return num(v)
            coda.extend(x.values())
        elif isinstance(x, list):
            coda.extend(x)
    return None


def lista(risposta):
    if isinstance(risposta, list):
        return [x for x in risposta if isinstance(x, dict)]
    if isinstance(risposta, dict):
        for v in risposta.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def data_di(item):
    for k in ("calendarDate", "date", "summaryDate", "day", "sleepDate"):
        v = item.get(k)
        if isinstance(v, str) and RE_DATA.match(v):
            return v[:10]
    for v in item.values():
        if isinstance(v, str) and RE_DATA.match(v):
            return v[:10]
    return None


def forma(x):
    """Descrive la struttura di una risposta (nomi dei campi e tipi, mai i valori)."""
    if isinstance(x, dict):
        return {k: forma(v) for k, v in x.items()}
    if isinstance(x, list):
        return [forma(x[0])] if x else []
    return type(x).__name__


def ricorda(nome, item):
    if nome not in CAMPIONI and item is not None:
        CAMPIONI[nome] = forma(item)


def leggi_json(percorso, default):
    try:
        return json.loads(percorso.read_text(encoding="utf-8"))
    except Exception:
        return default


def scrivi_json(percorso, contenuto):
    DATA.mkdir(exist_ok=True)
    tmp = percorso.with_suffix(percorso.suffix + ".tmp")
    tmp.write_text(json.dumps(contenuto, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(percorso)


# ----------------------------------------------------------------------------
# TRASFORMAZIONE NEL FORMATO DELLA DASHBOARD
# ----------------------------------------------------------------------------
ESCLUDI_EXTRA = {"distance", "duration", "elapsedDuration", "movingDuration", "elevationGain", "elevationLoss", "averageSpeed", "maxSpeed", "calories",
                 "bmrCalories", "averageHR", "maxHR", "steps", "minElevation", "maxElevation", "avgElevation", "aerobicTrainingEffect",
                 "anaerobicTrainingEffect", "differenceBodyBattery", "lapCount", "waterEstimated", "minActivityLapDuration", "sportTypeId",
                 "avgGradeAdjustedSpeed", "minTemperature", "maxTemperature", "ownerId", "beginTimestamp", "maxVerticalSpeed"}


def extra_orologio(a):
    """Tutti gli altri valori numerici che l'orologio registra per attività non di corsa (tennis, forza...)."""
    out = {}
    for k, v in a.items():
        if k in ESCLUDI_EXTRA or isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        if re.search(r"(Id$|ID$|Timestamp|Latitude|Longitude|^hrTimeInZone|^powerTimeInZone|owner|Url)", k):
            continue
        out[k] = round(v, 2) if isinstance(v, float) else v
        if len(out) >= 40:
            break
    return out or None


def mappa_attivita(a):
    tipo = a.get("activityType")
    tipo = tipo.get("typeKey") if isinstance(tipo, dict) else tipo
    dist = num(a.get("distance")) or 0
    dur = num(a.get("duration")) or 0
    return {
        "id": a.get("activityId"),
        "name": a.get("activityName") or "",
        "type": tipo or "",
        "date": a.get("startTimeLocal"),
        "distance_km": round(dist / 1000, 2),
        "duration_min": round(dur / 60, 2),
        "avg_hr": num(a.get("averageHR")),
        "max_hr": num(a.get("maxHR")),
        "calories": num(a.get("calories")),
        "elevation_gain_m": num(a.get("elevationGain")),
        "training_load": num(a.get("activityTrainingLoad")),
        "aerobic_te": num(a.get("aerobicTrainingEffect")),
        "vo2_max": num(a.get("vO2MaxValue")),
        "hr_zones_sec": [num(a.get("hrTimeInZone_%d" % i)) for i in range(1, 6)],
        "event_type": (a.get("eventType") or {}).get("typeKey") if isinstance(a.get("eventType"), dict) else None,
        "moving_s": num(a.get("movingDuration")),
        "elapsed_s": num(a.get("elapsedDuration")),
        "avg_speed_ms": num(a.get("averageSpeed")),
        "max_speed_ms": num(a.get("maxSpeed")),
        "gap_speed_ms": num(a.get("avgGradeAdjustedSpeed")),
        "elevation_loss_m": num(a.get("elevationLoss")),
        "min_elev": num(a.get("minElevation")),
        "max_elev": num(a.get("maxElevation")),
        "max_cadence": num(a.get("maxRunningCadenceInStepsPerMinute")),
        "steps": num(a.get("steps")),
        "avg_power": num(a.get("avgPower")),
        "max_power": num(a.get("maxPower")),
        "norm_power": num(a.get("normPower")),
        "avg_vert_osc": num(a.get("avgVerticalOscillation")),
        "avg_gct": num(a.get("avgGroundContactTime")),
        "avg_stride": num(a.get("avgStrideLength")),
        "avg_vert_ratio": num(a.get("avgVerticalRatio")),
        "min_temp": num(a.get("minTemperature")),
        "max_temp": num(a.get("maxTemperature")),
        "anaerobic_te": num(a.get("anaerobicTrainingEffect")),
        "te_label": a.get("trainingEffectLabel"),
        "te_msg": a.get("aerobicTrainingEffectMessage"),
        "body_battery_delta": num(a.get("differenceBodyBattery")),
        "lap_count": num(a.get("lapCount")),
        "location": a.get("locationName"),
        "power_zones_sec": [num(a.get("powerTimeInZone_%d" % i)) for i in range(1, 6)],
        "split_summaries": [
            {"type": x.get("splitType"), "n": num(x.get("noOfSplits")), "d": num(x.get("distance")), "t": num(x.get("duration")),
             "v": num(x.get("averageSpeed")), "vmax": num(x.get("maxSpeed"))}
            for x in (a.get("splitSummaries") or []) if isinstance(x, dict)],
        "start_lat": round(a["startLatitude"], 2) if isinstance(a.get("startLatitude"), (int, float)) else None,
        "start_lon": round(a["startLongitude"], 2) if isinstance(a.get("startLongitude"), (int, float)) else None,
        "extra": extra_orologio(a) if "run" not in str(tipo or "").lower() else None,
        "fastest_1km_s": num(a.get("fastestSplit_1000")),
        "fastest_5km_s": num(a.get("fastestSplit_5000")),
        "avg_cadence": num(a.get("averageRunningCadenceInStepsPerMinute")),
    }


def mappa_giorno(d):
    hr, stress = dct(d.get("heartRate")), dct(d.get("stress"))
    bb, resp = dct(d.get("bodyBattery")), dct(d.get("respiration"))
    inten = dct(d.get("intensityMinutes"))
    avg_hr = None
    for k in ("avgValue", "averageValue", "avg", "average"):
        if num(hr.get(k)) is not None:
            avg_hr = num(hr.get(k))
            break
    steps = num(dig(d, "movement", "steps", "value"))
    if steps is None:
        steps = deep_find(d, {"totalsteps", "steps"})
    campo_bb = "maxValue" if BODY_BATTERY == "max" else "minValue"
    moderati, vigorosi = num(inten.get("moderate")), num(inten.get("vigorous"))
    minuti = None
    if moderati is not None or vigorosi is not None:
        minuti = (moderati or 0) + 2 * (vigorosi or 0)
    return {
        "steps": steps,
        "resting_hr": num(hr.get("restingValue")),
        "avg_hr": avg_hr,
        "calories": num(dig(d, "calories", "burnedTotal"))
        or deep_find(d, {"burnedtotal", "totalkilocalories", "totalcalories", "kilocalories"}),
        "stress_level": num(stress.get("avgLevel")),
        "body_battery": num(bb.get(campo_bb)),
        "body_battery_min": num(bb.get("minValue")),
        "respiration_rate": num(resp.get("avgValue")),
        "intensity_minutes": minuti,
    }


def mappa_sonno(s):
    tot = num(s.get("sleepTimeSeconds"))
    punteggio = num(dig(s, "sleepScores", "overall", "value"))
    if punteggio is None:
        punteggio = num(dig(s, "sleepScores", "overall"))

    def ore(chiave):
        v = num(s.get(chiave))
        return round(v / 3600, 2) if v else None

    return {
        "sleep_hours": round(tot / 3600, 2) if tot else None,
        "sleep_score": punteggio,
        "sleep_deep_h": ore("deepSleepSeconds"),
        "sleep_light_h": ore("lightSleepSeconds"),
        "sleep_rem_h": ore("remSleepSeconds"),
        "sleep_awake_h": ore("awakeSleepSeconds"),
    }


def mappa_hrv(h):
    return {
        "hrv": num(h.get("lastNightAvg")),
        "hrv_weekly_avg": num(h.get("weeklyAvg")),
        "hrv_stato": h.get("status") if isinstance(h.get("status"), str) else None,
    }


def unisci(giorni, data_str, campi):
    rec = giorni.setdefault(data_str, {})
    for k, v in campi.items():
        if v is not None:
            rec[k] = v


# ----------------------------------------------------------------------------
# I VARI SCARICAMENTI
# ----------------------------------------------------------------------------
def scarica_attivita(da_data, tutto, stato):
    noti = leggi_json(FILE_ATTIVITA, {})
    # fermarsi alla prima pagina "gia' nota" e' sicuro solo se un passaggio completo e' gia' riuscito
    gia_completo = bool(stato.get("attivita_ok")) and stato.get("schema_attivita") == SCHEMA_ATTIVITA and not tutto
    finito = False
    limite, start, nuove = 20, 0, 0
    print("Attivita...")
    for _ in range(2000):
        avanzamento("attivita: %d scaricate finora" % nuove)
        try:
            pagina = chiama("/activitylist-service/activities/search/activities?start=%d&limit=%d"
                            % (start, limite))
        except RispostaTroppoGrande:
            if limite > 5:
                limite = max(5, limite // 2)
                continue
            print("\n  Avviso: una pagina di attivita non si riesce a scaricare, mi fermo qui.")
            break
        except ErroreGarmin as e:
            print("\n  Avviso (attivita): %s" % e)
            break
        items = lista(pagina)
        if items:
            ricorda("attivita", items[0])
        tutte_vecchie, tutte_note = True, True
        for a in items:
            rec = mappa_attivita(a)
            if rec["id"] is None:
                continue
            giorno = (rec["date"] or "")[:10]
            if tutto or not giorno or giorno >= str(da_data):
                tutte_vecchie = False
            if str(rec["id"]) not in noti:
                tutte_note = False
                nuove += 1
            if tutto or not giorno or giorno >= str(da_data):
                noti[str(rec["id"])] = rec
        if len(items) < limite or (items and tutte_vecchie) or (items and tutte_note and gia_completo):
            finito = True
            break
        start += limite
    print(" " * 72, end="\r")
    scrivi_json(FILE_ATTIVITA, noti)
    if finito:
        stato["attivita_ok"] = True
        stato["schema_attivita"] = SCHEMA_ATTIVITA
    return noti, nuove


def scarica_giorni(giorni, stato, inizio_default, oggi, tutto):
    def da_dove(nome):
        if tutto or not stato.get(nome):
            return inizio_default
        ultimo = datetime.strptime(stato[nome], "%Y-%m-%d").date()
        return max(inizio_default, ultimo - timedelta(days=SOVRAPPOSIZIONE))

    # Riepiloghi giornalieri (passi, FC riposo, stress, body battery...)
    print("Riepiloghi giornalieri...")
    a = da_dove("giorni")
    risp, ok = scarica_a_pezzi(
        "giorni", lambda x, y: "/usersummary-service/v2/dailysummaries?startDate=%s&endDate=%s" % (x, y),
        a, oggi, 60)
    for r in risp:
        for item in lista(r):
            ricorda("giorni", item)
            d = data_di(item)
            if d:
                unisci(giorni, d, mappa_giorno(item))
    if ok:
        stato["giorni"] = str(oggi)

    # Sonno (massimo 31 giorni per chiamata)
    print("Sonno...")
    a = da_dove("sonno")
    risp, ok = scarica_a_pezzi(
        "sonno", lambda x, y: "/sleep-service/sleep/dailySleepSummariesByDate?startDate=%s&endDate=%s" % (x, y),
        a, oggi, 31)
    for r in risp:
        for item in lista(r):
            ricorda("sonno", item)
            d = data_di(item)
            if d:
                unisci(giorni, d, mappa_sonno(item))
    if ok:
        stato["sonno"] = str(oggi)

    # HRV
    print("HRV...")
    a = da_dove("hrv")
    risp, ok = scarica_a_pezzi(
        "hrv", lambda x, y: "/hrv-service/hrv/daily/%s/%s" % (x, y), a, oggi, 90)
    for r in risp:
        riepiloghi = r.get("hrvSummaries") if isinstance(r, dict) else None
        for item in (riepiloghi or []):
            if isinstance(item, dict):
                ricorda("hrv", item)
                d = data_di(item)
                if d:
                    unisci(giorni, d, mappa_hrv(item))
    if ok:
        stato["hrv"] = str(oggi)


def scarica_eta_fitness(oggi):
    try:
        r = chiama("/fitnessage-service/fitnessage/v2/%s" % oggi)
    except (ErroreGarmin, RispostaTroppoGrande):
        return None
    if r is None:
        return None
    ricorda("eta_fitness", r)
    v = deep_find(r, {"fitnessage", "fitness_age"})
    return round(v) if v is not None else None


def normalizza_data(testo):
    """Accetta 2027-02-28 ma anche 28/02/2027, 28-02-2027, 28.02.2027 e le riporta a AAAA-MM-GG."""
    t = str(testo or "").strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(t, formato).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def trova_prossimo_evento(oggi):
    """Tentativo: cerca nel calendario Garmin la prima gara/evento da oggi in poi (prossimi 12 mesi)."""
    migliore = None
    for passo in range(13):
        mese0 = oggi.year * 12 + (oggi.month - 1) + passo
        anno, mese = mese0 // 12, mese0 % 12  # Garmin conta i mesi da 0 a 11
        try:
            r = chiama("/calendar-service/year/%d/month/%d" % (anno, mese))
        except (ErroreGarmin, RispostaTroppoGrande):
            if passo == 0:
                return None  # il calendario non e' raggiungibile: inutile insistere
            continue
        if r is None:
            if passo == 0:
                return None
            continue
        elementi = r.get("calendarItems") if isinstance(r, dict) else None
        for it in (elementi or []):
            if not isinstance(it, dict) or str(it.get("itemType", "")).lower() not in ("event", "events", "race", "races"):
                continue
            ricorda("evento", it)
            d = data_di(it)
            titolo = it.get("title") or it.get("eventName") or it.get("name")
            if d and titolo and d >= str(oggi) and (migliore is None or d < migliore["date"]):
                migliore = {"title": str(titolo), "date": d}
        if migliore:
            break  # i mesi sono in ordine: il primo evento trovato e' il piu' vicino
    return migliore


def prova_recupero_garmin(oggi):
    """Tentativo: legge da Garmin 'prontezza all'allenamento' e 'stato allenamento' (tempo di recupero, VO2 max).
    Non so se la Personal API li offra: i valori trovati vengono solo mostrati a fine riepilogo."""
    trovati = {}
    for nome, percorso in (("prontezza", "/metrics-service/metrics/trainingreadiness/%s" % oggi),
                           ("stato_allenamento", "/metrics-service/metrics/trainingstatus/aggregated/%s" % oggi)):
        try:
            r = chiama(percorso)
        except (ErroreGarmin, RispostaTroppoGrande):
            continue
        if r is None:
            continue
        ricorda(nome, r)
        rec = deep_find(r, {"recoverytime"})
        if rec is not None and "recupero (valore grezzo)" not in trovati:
            trovati["recupero (valore grezzo)"] = rec
        vo2 = deep_find(r, {"vo2maxprecisevalue", "vo2maxvalue"})
        if vo2 is not None and "VO2 max" not in trovati:
            trovati["VO2 max"] = vo2
    return trovati


# ----------------------------------------------------------------------------
# DETTAGLI PER ATTIVITA' (km per km, serie di battiti/cadenza/..., percorso)
# ----------------------------------------------------------------------------
CHIAVI_SERIE = {
    "t": ("sumDuration",), "d": ("sumDistance",), "hr": ("directHeartRate",), "spd": ("directSpeed",),
    "cad": ("directRunCadence", "directDoubleCadence"), "el": ("directElevation",),
    "gct": ("directGroundContactTime",), "vo": ("directVerticalOscillation",), "sl": ("directStrideLength",),
    "vr": ("directVerticalRatio",), "pw": ("directPower",),
}


def mappa_laps(r):
    out = []
    if not isinstance(r, dict):
        return out
    for i, l in enumerate(r.get("lapDTOs") or [], 1):
        if not isinstance(l, dict):
            continue
        d, t = num(l.get("distance")), num(l.get("duration"))
        if not d or not t:
            continue
        out.append({
            "i": i, "d": round(d), "t": round(t, 1), "hr": num(l.get("averageHR")), "hrMax": num(l.get("maxHR")),
            "cad": num(l.get("averageRunCadence")), "pw": num(l.get("averagePower")), "gct": num(l.get("groundContactTime")),
            "vo": num(l.get("verticalOscillation")), "sl": num(l.get("strideLength")), "vr": num(l.get("verticalRatio")),
            "up": num(l.get("elevationGain")), "dn": num(l.get("elevationLoss")),
        })
    return out


def mappa_serie(r, massimo=400):
    if not isinstance(r, dict):
        return None
    righe = r.get("activityDetailMetrics") or []
    idx = {}
    for dsc in (r.get("metricDescriptors") or []):
        if isinstance(dsc, dict) and dsc.get("key") is not None and dsc.get("metricsIndex") is not None:
            idx[dsc["key"]] = dsc["metricsIndex"]
    if not righe or not idx:
        return None
    passo = max(1, -(-len(righe) // massimo))
    out = {}
    for nome, chiavi in CHIAVI_SERIE.items():
        for k in chiavi:
            if k in idx:
                i, col = idx[k], []
                for m in righe[::passo]:
                    vals = m.get("metrics") if isinstance(m, dict) else None
                    v = vals[i] if isinstance(vals, list) and i < len(vals) else None
                    col.append(round(v, 2) if isinstance(v, (int, float)) and not isinstance(v, bool) else None)
                if any(v is not None for v in col):
                    out[nome] = col
                break
    return out or None


def mappa_percorso(r, massimo=250):
    poly = dig(r, "geoPolylineDTO", "polyline") if isinstance(r, dict) else None
    if not isinstance(poly, list) or len(poly) < 2:
        return None
    passo = max(1, -(-len(poly) // massimo))
    pts = []
    for p in poly[::passo]:
        if isinstance(p, dict) and isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lon"), (int, float)):
            pts.append([round(p["lat"], 5), round(p["lon"], 5)])
    return pts if len(pts) >= 2 else None


def scarica_dettagli(attivita, da_data, tutto):
    elenco = sorted(attivita.values(), key=lambda a: a.get("date") or "", reverse=True)
    elenco = [a for a in elenco if a.get("id") and (tutto or (a.get("date") or "")[:10] >= str(da_data))]
    da_fare = [a for a in elenco if not (CARTELLA_DETTAGLI / ("%s.json" % a["id"])).exists()][:MAX_DETTAGLI_PER_RUN]
    if not da_fare:
        return 0, False
    CARTELLA_DETTAGLI.mkdir(exist_ok=True)
    nuovi, a_vuoto, errori = 0, 0, 0
    for n, a in enumerate(da_fare, 1):
        avanzamento("dettagli: %d di %d" % (n, len(da_fare)))
        r_splits = r_det = None
        try:
            r_splits = chiama("/activity-service/activity/%s/splits" % a["id"])
        except RispostaTroppoGrande:
            pass
        except ErroreGarmin:
            errori += 1
        for parametri in ("maxChartSize=400&maxPolylineSize=250", "maxChartSize=150&maxPolylineSize=100"):
            try:
                r_det = chiama("/activity-service/activity/%s/details?%s" % (a["id"], parametri))
                break
            except RispostaTroppoGrande:
                continue
            except ErroreGarmin:
                errori += 1
                break
        ricorda("dettaglio_splits", r_splits)
        ricorda("dettaglio_details", r_det)
        det = {"id": a["id"], "laps": mappa_laps(r_splits), "serie": mappa_serie(r_det), "percorso": mappa_percorso(r_det)}
        if det["laps"] or det["serie"] or det["percorso"]:
            (CARTELLA_DETTAGLI / ("%s.json" % a["id"])).write_text(json.dumps(det, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            nuovi += 1
            a_vuoto = 0
        else:
            a_vuoto += 1
            if nuovi == 0 and a_vuoto >= 3:   # nessun risultato nei primi tentativi: l'API probabilmente non li offre
                break
    print(" " * 72, end="\r")
    return nuovi, (nuovi == 0 and (errori > 0 or a_vuoto >= 3))


# ----------------------------------------------------------------------------
# METEO (Open-Meteo: gratuito, senza chiave) per luogo e ora di ogni attività
# ----------------------------------------------------------------------------
def http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def calcola_meteo(a, indice):
    try:
        inizio = datetime.strptime(str(a["date"])[:19].replace("T", " "), "%Y-%m-%d %H:%M:%S")
    except (ValueError, KeyError):
        return None
    durata = max(0.25, (a.get("duration_min") or 30) / 60.0)
    fine = inizio + timedelta(hours=durata)
    t = inizio.replace(minute=0, second=0, microsecond=0)
    nomi = ("temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation", "wind_speed_10m")
    vals, codice = {n: [] for n in nomi}, None
    while t <= fine:
        voce = indice.get(t.strftime("%Y-%m-%dT%H:00"))
        if voce:
            h, i = voce
            for n in nomi:
                serie = h.get(n) or []
                if i < len(serie) and isinstance(serie[i], (int, float)):
                    vals[n].append(serie[i])
            if codice is None:
                cs = h.get("weather_code") or []
                codice = cs[i] if i < len(cs) and isinstance(cs[i], (int, float)) else None
        t += timedelta(hours=1)
    if not vals["temperature_2m"]:
        return None

    def media(v, dec=1):
        return round(sum(v) / len(v), dec) if v else None
    pioggia = round(media(vals["precipitation"], 3) * durata, 1) if vals["precipitation"] else None
    return {"t": media(vals["temperature_2m"]), "app": media(vals["apparent_temperature"]), "um": media(vals["relative_humidity_2m"], 0),
            "vento": media(vals["wind_speed_10m"]), "pioggia": pioggia, "codice": int(codice) if codice is not None else None}


def scarica_meteo(attivita, da_data):
    """Salva in data/meteo.json il meteo di ogni attività con coordinate. Ritorna (cache, nuovi)."""
    cache = leggi_json(FILE_METEO, {})
    oggi = date.today()
    da_fare = [a for a in attivita.values() if a.get("id") and str(a["id"]) not in cache
               and a.get("start_lat") is not None and a.get("start_lon") is not None and (a.get("date") or "")[:10] >= str(da_data)]
    if not da_fare:
        return cache, 0
    gruppi = {}
    for a in da_fare:
        giorno = datetime.strptime(a["date"][:10], "%Y-%m-%d").date()
        gruppi.setdefault((a["start_lat"], a["start_lon"], (oggi - giorno).days <= 85), []).append((a, giorno))
    nuovi = 0
    for (lat, lon, recente), lista in gruppi.items():
        avanzamento("meteo: %d attività da completare" % len(da_fare))
        risposte = []
        if recente:
            giorni = max((oggi - g).days for _, g in lista)
            url = "%s?latitude=%s&longitude=%s&hourly=%s&past_days=%d&forecast_days=1&timezone=auto" % (
                URL_METEO_PREVISIONI, lat, lon, VARIABILI_METEO, min(92, giorni + 1))
            risposte.append(http_json(url))
        else:
            giorni_ord = sorted(g for _, g in lista)
            cur = giorni_ord[0]
            while cur <= giorni_ord[-1]:
                fine_pezzo = min(giorni_ord[-1], cur + timedelta(days=300))
                url = "%s?latitude=%s&longitude=%s&start_date=%s&end_date=%s&hourly=%s&timezone=auto" % (
                    URL_METEO_ARCHIVIO, lat, lon, cur, fine_pezzo, VARIABILI_METEO)
                risposte.append(http_json(url))
                cur = fine_pezzo + timedelta(days=1)
                time.sleep(0.5)
        indice = {}
        for r in risposte:
            h = r.get("hourly") or {}
            for i, tempo in enumerate(h.get("time") or []):
                indice[tempo] = (h, i)
        for a, _ in lista:
            m = calcola_meteo(a, indice)
            if m:
                cache[str(a["id"])] = m
                nuovi += 1
    print(" " * 72, end="\r")
    scrivi_json(FILE_METEO, cache)
    return cache, nuovi


def tempo_in_secondi(testo):
    """'1:30:00' -> 5400, '21:30' -> 1290. Ritorna None se il formato non e' valido."""
    try:
        parti = [float(p) for p in str(testo).strip().split(":")]
    except ValueError:
        return None
    if len(parti) == 2:
        return parti[0] * 60 + parti[1]
    if len(parti) == 3:
        return parti[0] * 3600 + parti[1] * 60 + parti[2]
    return None


def previsioni_garmin():
    """Tentativo: legge le previsioni di gara dell'orologio. Non so se la Personal API le offra."""
    try:
        profilo = chiama("/userprofile-service/socialProfile")
        nome = profilo.get("displayName") if isinstance(profilo, dict) else None
        if not nome:
            return None
        r = chiama("/metrics-service/metrics/racepredictions/latest/%s" % nome)
    except (ErroreGarmin, RispostaTroppoGrande):
        return None
    if isinstance(r, list) and r:
        r = r[0]
    if not isinstance(r, dict):
        return None
    ricorda("previsioni", r)
    mappa = {"5k": "time5K", "10k": "time10K", "mezza": "timeHalfMarathon", "maratona": "timeMarathon"}
    out = {k: num(r.get(v)) for k, v in mappa.items()}
    out = {k: v for k, v in out.items() if v}
    return out or None


def scarica_vo2(giorni, oggi):
    """Tentativo: Garmin potrebbe non offrire il VO2 max nella Personal API. Se non c'e', si va avanti."""
    try:
        r = chiama("/metrics-service/metrics/maxmet/daily/%s/%s" % (oggi - timedelta(days=90), oggi))
    except (ErroreGarmin, RispostaTroppoGrande):
        return
    for item in lista(r):
        ricorda("vo2", item)
        base = dct(item.get("generic")) or item
        d = data_di(base)
        v = deep_find(base, {"vo2maxprecisevalue", "vo2maxvalue"})
        if d and v is not None:
            unisci(giorni, d, {"vo2_max": v})


# ----------------------------------------------------------------------------
# STORICO DEL VECCHIO OROLOGIO (file CSV nella cartella del sito)
# ----------------------------------------------------------------------------
MESI_EN = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
           "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
TIPI_STRAVA = {"run": "running", "trail run": "trail_running", "walk": "walking", "ride": "cycling",
               "hike": "hiking", "swim": "lap_swimming", "weight training": "strength_training",
               "workout": "other", "tennis": "tennis_v2"}


def data_strava(testo):
    """Strava scrive le date in UTC (es. 'Sep 20, 2026, 2:12:12 PM'): le converto all'ora locale."""
    m = re.match(r"^(\w{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$", (testo or "").strip())
    if not m or m.group(1) not in MESI_EN:
        return None
    ora = int(m.group(4)) % 12 + (12 if m.group(7) == "PM" else 0)
    dt = datetime(int(m.group(3)), MESI_EN[m.group(1)], int(m.group(2)), ora,
                  int(m.group(5)), int(m.group(6)), tzinfo=timezone.utc)
    return dt.astimezone().replace(tzinfo=None)


def leggi_storico_attivita(primo_garmin):
    """Attivita del vecchio orologio, solo quelle PRIMA della prima attivita Garmin (niente doppioni)."""
    if not FILE_STORICO_ATT.exists():
        return []
    out = []
    with open(FILE_STORICO_ATT, encoding="utf-8-sig", newline="") as f:
        righe = list(csv.reader(f))
    if not righe:
        return []
    intestazione = righe[0]
    for r in righe[1:]:
        d = dict(zip(intestazione, r))  # con colonne doppie vale l'ultima (quella in metri/secondi)
        dt = data_strava(d.get("Activity Date"))
        if not dt:
            continue
        data_loc = dt.strftime("%Y-%m-%d %H:%M:%S")
        if primo_garmin and data_loc >= primo_garmin:
            continue
        id_txt = (d.get("Activity ID") or "").strip()
        tipo = (d.get("Activity Type") or "").strip().lower()
        durata = num(d.get("Moving Time")) or num(d.get("Elapsed Time")) or 0
        out.append({
            "id": int(id_txt) if id_txt.isdigit() else None,
            "name": d.get("Activity Name") or "",
            "type": TIPI_STRAVA.get(tipo, tipo.replace(" ", "_") or "other"),
            "date": data_loc,
            "distance_km": round((num(d.get("Distance")) or 0) / 1000, 2),
            "duration_min": round(durata / 60, 2),
            "avg_hr": num(d.get("Average Heart Rate")),
            "max_hr": num(d.get("Max Heart Rate")),
            "calories": num(d.get("Calories")),
            "elevation_gain_m": num(d.get("Elevation Gain")),
            "fonte": "storico",
        })
    return out


def leggi_storico_benessere():
    """Dati giornalieri del vecchio orologio (export Intervals.icu 'wellness')."""
    f = next(CARTELLA.glob("*wellness*.csv"), None)
    if f is None:
        return {}
    out = {}
    with open(f, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            d = (r.get("date") or "")[:10]
            if not RE_DATA.match(d):
                continue
            sonno = num(r.get("sleepSecs"))
            campi = {
                "steps": num(r.get("steps")),
                "resting_hr": num(r.get("restingHR")),
                "hrv": num(r.get("hrv")),
                "sleep_hours": round(sonno / 3600, 2) if sonno else None,
                "sleep_score": num(r.get("sleepScore")),
                "vo2_max": num(r.get("vo2max")),
                "respiration_rate": num(r.get("respiration")),
                "stress_level": num(r.get("stress")),
            }
            campi = {k: v for k, v in campi.items() if v is not None}
            if campi:
                out[d] = campi
    return out


# ----------------------------------------------------------------------------
# COSTRUZIONE DI garmin_data.json
# ----------------------------------------------------------------------------
def costruisci_output(attivita, giorni, eta_fitness, da_data, tutto, storico_att=(), storico_ben=None, evento=None, previsioni=None, meteo=None):
    meteo = meteo or {}
    elenco_att = sorted([dict(a, meteo=meteo[str(a.get("id"))]) if str(a.get("id")) in meteo else a for a in attivita.values()] + list(storico_att),
                        key=lambda a: a.get("date") or "", reverse=True)
    giorni_garmin = set(giorni.keys())
    giorni = {d: dict(v) for d, v in giorni.items()}
    for d, campi in (storico_ben or {}).items():
        rec = giorni.setdefault(d, {})
        for k, v in campi.items():
            if rec.get(k) is not None:
                continue
            if d in giorni_garmin and k != "vo2_max":
                continue  # nei giorni coperti da Garmin vale Garmin; dallo storico prendo solo il VO2 max
            rec[k] = v
    if not tutto:
        elenco_att = [a for a in elenco_att if (a.get("date") or "")[:10] >= str(da_data)]

    vo2_per_giorno = {}
    for a in sorted(elenco_att, key=lambda a: a.get("date") or ""):
        if a.get("vo2_max") is not None and a.get("date"):
            vo2_per_giorno[a["date"][:10]] = a["vo2_max"]

    salute = []
    for d in sorted(giorni.keys(), reverse=True):
        if not tutto and d < str(da_data):
            continue
        rec = {k: v for k, v in giorni[d].items() if v is not None}
        if not rec:
            continue
        if d in vo2_per_giorno:
            rec["vo2_max"] = vo2_per_giorno[d]
        rec["date"] = d
        salute.append(rec)
    if salute and eta_fitness is not None:
        salute[0]["fitness_age"] = eta_fitness
    if salute and VO2_MAX_MANUALE is not None:
        salute[0]["vo2_max"] = VO2_MAX_MANUALE

    out = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "activities": elenco_att,
        "daily_health": salute,
    }
    if evento is None and EVENTO_MANUALE:
        evento = {"title": EVENTO_MANUALE[0], "date": normalizza_data(EVENTO_MANUALE[1])}
    if evento:
        if OBIETTIVO_EVENTO:
            evento = dict(evento, goal=OBIETTIVO_EVENTO)
        if EVENTO_DISTANZA_KM:
            evento = dict(evento, distance_km=EVENTO_DISTANZA_KM)
        obiettivo_s = tempo_in_secondi(EVENTO_TEMPO_OBIETTIVO) if EVENTO_TEMPO_OBIETTIVO else None
        if obiettivo_s:
            evento = dict(evento, goal_time_s=round(obiettivo_s))
        out["next_event"] = evento
    if RECORD_MANUALI:
        record, date_record = {}, {}
        for k, v in RECORD_MANUALI.items():
            tempo, data_txt = (v[0], v[1]) if isinstance(v, (tuple, list)) and len(v) > 1 else (v, None)
            secondi = tempo_in_secondi(tempo)
            if secondi:
                record[k] = round(secondi)
                data_ok = normalizza_data(data_txt) if data_txt else None
                if data_ok:
                    date_record[k] = data_ok
        if record:
            out["personal_records"] = dict(record, dates=date_record, fonte="manuale")
    if previsioni:
        out["race_predictions"] = dict(previsioni, fonte="garmin")
    elif PREVISIONI_MANUALI:
        manuali = {k: tempo_in_secondi(v) for k, v in PREVISIONI_MANUALI.items()}
        manuali = {k: round(v) for k, v in manuali.items() if v}
        if manuali:
            out["race_predictions"] = dict(manuali, fonte="manuale")
    return out


def riepilogo(out):
    att, sal = out["activities"], out["daily_health"]
    print("\nFatto. Ecco cosa e' arrivato:")
    print("  Attivita:        %d" % len(att))
    print("  Giorni di dati:  %d" % len(sal))
    notti = sum(1 for g in sal if g.get("sleep_hours") is not None)
    print("  Notti di sonno:  %d" % notti)
    date_tutte = [a["date"][:10] for a in att if a.get("date")] + [g["date"] for g in sal]
    if date_tutte:
        print("  Periodo:         dal %s al %s" % (min(date_tutte), max(date_tutte)))
    print("\nCampi riempiti (giorni su %d):" % len(sal))
    etichette = [("steps", "passi"), ("resting_hr", "FC a riposo"),
                 ("calories", "calorie"), ("stress_level", "stress"), ("body_battery", "body battery"),
                 ("sleep_hours", "ore di sonno"), ("sleep_score", "punteggio sonno"), ("hrv", "HRV"),
                 ("respiration_rate", "respirazione"), ("vo2_max", "VO2 max")]
    for chiave, nome in etichette:
        n = sum(1 for g in sal if g.get(chiave) is not None)
        avviso = "" if n else "   <-- vuoto"
        print("  %-16s %d%s" % (nome, n, avviso))
    ev = out.get("next_event")
    print("\nProssimo evento: %s" % (("%s (%s)" % (ev["title"], ev.get("date") or "data non valida")) if ev else
          "non trovato nel calendario Garmin (si puo' impostare a mano in cima a fetch_data.py)"))
    if ev and not ev.get("date"):
        print("ATTENZIONE: la data dell'evento non e' valida. In EVENTO_MANUALE scrivila cosi: 2027-02-28")
    rp = out.get("race_predictions")
    if rp:
        print("Previsioni di gara: %s" % ("da Garmin" if rp.get("fonte") == "garmin" else "inserite a mano"))
    print("\nIl file garmin_data.json e' stato aggiornato.")


def test_connessione():
    print("Provo a leggere le tue ultime 5 attivita...\n")
    r = chiama("/activitylist-service/activities/search/activities?start=0&limit=5")
    items = lista(r)
    if not items:
        print("Connessione riuscita, ma Garmin non ha restituito attivita.")
        return
    for a in items:
        rec = mappa_attivita(a)
        print("  %s  %-18s %6.2f km" % ((rec["date"] or "")[:10], rec["type"], rec["distance_km"]))
    print("\nTutto funziona.")


# ----------------------------------------------------------------------------
# PROGRAMMA PRINCIPALE
# ----------------------------------------------------------------------------
def main():
    args = sys.argv[1:]
    test, tutto = "--test" in args, "--tutto" in args
    oggi = date.today()
    da_data = oggi - timedelta(days=round(MESI_DEFAULT * 30.5))
    inizio_default = INIZIO_STORIA if tutto else da_data

    try:
        STATO_RUN["chiave"] = leggi_chiave()
        print("Chiave trovata.")
        ottieni_token()
        print("Token pronto.\n")

        if test:
            test_connessione()
            return

        if FILE_OUT.exists() and not FILE_BACKUP.exists():
            shutil.copy(FILE_OUT, FILE_BACKUP)
            print("Copia di sicurezza del vecchio file: garmin_data.backup.json\n")

        stato = {} if tutto else leggi_json(FILE_STATO, {})
        giorni = leggi_json(FILE_GIORNI, {})

        attivita, _ = scarica_attivita(da_data, tutto, stato)
        dettagli_nuovi, dettagli_assenti = scarica_dettagli(attivita, da_data, tutto)
        meteo, meteo_nuovo, meteo_errore = {}, 0, None
        try:
            meteo, meteo_nuovo = scarica_meteo(attivita, da_data)
        except Exception as e:  # il meteo e' un extra: se non va, si prosegue
            meteo, meteo_errore = leggi_json(FILE_METEO, {}), str(e)[:80]
        scarica_giorni(giorni, stato, inizio_default, oggi, tutto)
        scrivi_json(FILE_GIORNI, giorni)
        scrivi_json(FILE_STATO, stato)
        eta = scarica_eta_fitness(oggi)

        primo_garmin = min((a["date"] for a in attivita.values() if a.get("date")), default=None)
        storico_att, storico_ben = [], {}
        try:
            storico_att = leggi_storico_attivita(primo_garmin)
            storico_ben = leggi_storico_benessere()
        except Exception as e:  # lo storico e' un extra: se qualcosa va storto si prosegue con i soli dati Garmin
            print("Avviso: non sono riuscito a leggere lo storico dei CSV (%s). Vado avanti senza." % e)
        if storico_att or storico_ben:
            print("Storico del vecchio orologio: %d attivita e %d giorni dai file CSV." % (len(storico_att), len(storico_ben)))

        evento = trova_prossimo_evento(oggi)
        previsioni = previsioni_garmin()
        out = costruisci_output(attivita, giorni, eta, da_data, tutto, storico_att, storico_ben, evento, previsioni, meteo)
        scrivi_json(FILE_OUT, out)
        FILE_STRUTTURA.write_text(json.dumps(CAMPIONI, indent=1, ensure_ascii=False), encoding="utf-8")
        riepilogo(out)
        if meteo_nuovo:
            print("Meteo aggiunto a %d attività." % meteo_nuovo)
        elif meteo_errore:
            print("Meteo non disponibile in questo momento (%s): riproverò al prossimo aggiornamento." % meteo_errore)
        if dettagli_nuovi:
            print("Dettagli attività scaricati (km per km, percorso): %d" % dettagli_nuovi)
        elif dettagli_assenti:
            print("Dettagli per km e percorso: non disponibili con questa API (la pagina Attività mostra i dati riassuntivi).")
    except ErroreGarmin as e:
        print("\nPROBLEMA: %s" % e)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nInterrotto. Quello che era gia' stato scaricato e' salvato: rilancia il comando per continuare.")
        sys.exit(1)


if __name__ == "__main__":
    main()

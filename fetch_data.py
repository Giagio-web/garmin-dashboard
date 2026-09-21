import csv
from datetime import datetime
import json
import os
from garminconnect import Garmin

email = os.environ.get("GARMIN_EMAIL")
password = os.environ.get("GARMIN_PASSWORD")


def parse_date(date_str):
  """Converte varie stringhe di data in oggetto date per i confronti."""
  if not date_str:
    return None
  try:
    # Formato tipico Strava CSV: "Sep 20, 2026, 8:30:00 AM" o "2026-09-20 08:30:00"
    for fmt in (
        "%b %d, %Y, %I:%M:%S %p",
        "%Y-%m-%d %H:%M:%S",
        "%b %d, %Y",
        "%Y-%m-%d",
    ):
      try:
        return datetime.strptime(date_str.split(".")[0], fmt).date()
      except ValueError:
        pass
  except Exception:
    pass
  return None


def main():
  parsed_data = []
  garmin_dates = set()

  # 1. SCARICA DATI RECENTI DA GARMIN CONNECT
  try:
    client = Garmin(email, password)
    client.login()
    garmin_activities = client.get_activities(0, 30)

    for act in garmin_activities:
      raw_date = act.get("startTimeLocal", "")
      act_date_obj = parse_date(raw_date)
      if act_date_obj:
        garmin_dates.add(act_date_obj)

      avg_speed_ms = act.get("averageSpeed", 0)
      if avg_speed_ms > 0:
        pace_sec = 1000 / avg_speed_ms
        pace_min = int(pace_sec // 60)
        pace_remainder_sec = int(pace_sec % 60)
        pace_str = f"{pace_min}'{pace_remainder_sec:02d}\""
      else:
        pace_str = "N/A"

      parsed_data.append({
          "source": "garmin",
          "id": str(act.get("activityId")),
          "name": act.get("activityName", "Corsa Garmin"),
          "date": raw_date,
          "distance_km": round(act.get("distance", 0) / 1000, 2),
          "duration_min": round(act.get("duration", 0) / 60, 2),
          "avg_pace": pace_str,
          "avg_hr": act.get("averageHR"),
          "max_hr": act.get("maxHR"),
          "avg_power": act.get("avgPower"),
          "max_power": act.get("maxPower"),
          "avg_cadence": act.get("averageRunningCadenceInStepsPerMinute"),
          "calories": act.get("calories"),
          "elevation_gain_m": act.get("elevationGain"),
      })
  except Exception as e:
    print(f"Errore caricamento Garmin: {e}")

  # 2. LEGGI LO STORICO PASSATO DA STRAVA (activities.csv)
  if os.path.exists("activities.csv"):
    try:
      with open("activities.csv", mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
          # Considera solo le corse (Run)
          type_val = row.get("Activity Type", "") or row.get("Type", "")
          if "run" not in type_val.lower():
            continue

          date_str = (
              row.get("Activity Date", "")
              or row.get("Date", "")
              or row.get("Start Time", "")
          )
          strava_date_obj = parse_date(date_str)

          # SE L'ATTIVITÀ È GIÀ PRESENTE SU GARMIN (STESSO GIORNO), IGNORA IL DOPPIONE STRAVA
          if strava_date_obj and strava_date_obj in garmin_dates:
            continue

          # Calcolo distanza
          dist_raw = float(row.get("Distance", 0) or 0)
          # Se in metri la dividiamo per 1000
          dist_km = (
              round(dist_raw / 1000, 2)
              if dist_raw > 100
              else round(dist_raw, 2)
          )

          # Calcolo durata
          dur_raw = float(row.get("Moving Time", 0) or row.get("Elapsed Time", 0) or 0)
          dur_min = round(dur_raw / 60, 2) if dur_raw > 0 else 0

          # Calcolo passo medio
          if dist_km > 0 and dur_min > 0:
            pace_sec_total = (dur_min * 60) / dist_km
            p_min = int(pace_sec_total // 60)
            p_sec = int(pace_sec_total % 60)
            pace_str = f"{p_min}'{p_sec:02d}\""
          else:
            pace_str = "N/A"

          # Cardio e Cadenza se presenti nel CSV
          avg_hr = row.get("Average Heart Rate") or row.get("Heart Rate", None)
          avg_hr = int(float(avg_hr)) if avg_hr else None

          avg_cadence = row.get("Average Cadence", None)
          avg_cadence = (
              int(float(avg_cadence) * 2)
              if avg_cadence and float(avg_cadence) < 110
              else (int(float(avg_cadence)) if avg_cadence else None)
          )

          parsed_data.append({
              "source": "strava",
              "id": row.get("Activity ID", date_str),
              "name": row.get("Activity Name", "Corsa Storica"),
              "date": date_str,
              "distance_km": dist_km,
              "duration_min": dur_min,
              "avg_pace": pace_str,
              "avg_hr": avg_hr,
              "max_hr": None,
              "avg_power": None,
              "max_power": None,
              "avg_cadence": avg_cadence,
              "calories": row.get("Calories", None),
              "elevation_gain_m": row.get("Elevation Gain", None),
          })
    except Exception as e:
      print(f"Errore lettura activities.csv: {e}")

  # 3. ORDINA TUTTE LE USCITE DALLA PIÙ RECENTE ALLA PIÙ VECCHIA
  # Salviamo il file JSON finale
  with open("garmin_data.json", "w", encoding="utf-8") as f:
    json.dump(parsed_data, f, indent=4)


if __name__ == "__main__":
  main()

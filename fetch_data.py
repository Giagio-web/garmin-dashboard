import csv
from datetime import datetime, timedelta
import json
import os
from garminconnect import Garmin

email = os.environ.get("GARMIN_EMAIL")
password = os.environ.get("GARMIN_PASSWORD")


def parse_date(date_str):
  if not date_str:
    return None
  try:
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
  parsed_activities = []
  garmin_dates = set()

  # Initialize Garmin Client
  try:
    client = Garmin(email, password)
    client.login()
  except Exception as e:
    print(f"Errore Login Garmin: {e}")
    client = None

  # 1. SCARICA ATTIVITÀ CORSA/SPORT DA GARMIN
  if client:
    try:
      garmin_activities = client.get_activities(0, 50)
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

        parsed_activities.append({
            "source": "garmin",
            "type": act.get("activityType", {}).get(
                "typeKey", "running"
            ),  # running, cycling, tennis, swimming
            "id": str(act.get("activityId")),
            "name": act.get("activityName", "Attività Garmin"),
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
      print(f"Errore attività Garmin: {e}")

  # 2. LEGGI STORICO ATTIVITÀ DA STRAVA (activities.csv)
  if os.path.exists("activities.csv"):
    try:
      with open("activities.csv", mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
          type_val = (
              row.get("Activity Type", "") or row.get("Type", "")
          ).lower()

          date_str = (
              row.get("Activity Date", "")
              or row.get("Date", "")
              or row.get("Start Time", "")
          )
          strava_date_obj = parse_date(date_str)

          # Evita duplicati con Garmin
          if strava_date_obj and strava_date_obj in garmin_dates:
            continue

          dist_raw = float(row.get("Distance", 0) or 0)
          dist_km = (
              round(dist_raw / 1000, 2)
              if dist_raw > 100
              else round(dist_raw, 2)
          )

          dur_raw = float(
              row.get("Moving Time", 0) or row.get("Elapsed Time", 0) or 0
          )
          dur_min = round(dur_raw / 60, 2) if dur_raw > 0 else 0

          if dist_km > 0 and dur_min > 0:
            pace_sec_total = (dur_min * 60) / dist_km
            p_min = int(pace_sec_total // 60)
            p_sec = int(pace_sec_total % 60)
            pace_str = f"{p_min}'{p_sec:02d}\""
          else:
            pace_str = "N/A"

          avg_hr = row.get("Average Heart Rate") or row.get("Heart Rate", None)
          avg_hr = int(float(avg_hr)) if avg_hr else None

          avg_cadence = row.get("Average Cadence", None)
          avg_cadence = (
              int(float(avg_cadence) * 2)
              if avg_cadence and float(avg_cadence) < 110
              else (int(float(avg_cadence)) if avg_cadence else None)
          )

          # Mappatura tipo sport
          sport_type = "running"
          if "tennis" in type_val:
            sport_type = "tennis"
          elif "swim" in type_val:
            sport_type = "swimming"
          elif "ride" in type_val or "cycle" in type_val:
            sport_type = "cycling"

          parsed_activities.append({
              "source": "strava",
              "type": sport_type,
              "id": row.get("Activity ID", date_str),
              "name": row.get("Activity Name", "Attività Storica"),
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

  # 3. SCARICA METRICHE GIORNALIERE DI SALUTE DA GARMIN (Ultimi 14 giorni)
  daily_health = []
  if client:
    today = datetime.now().date()
    for i in range(14):
      day = today - timedelta(days=i)
      day_str = day.strftime("%Y-%m-%d")
      try:
        # Passi
        steps_data = client.get_steps_data(day_str)
        total_steps = (
            sum(item.get("steps", 0) for item in steps_data)
            if isinstance(steps_data, list)
            else 0
        )

        # Sonno
        sleep_data = client.get_sleep_data(day_str)
        sleep_dto = (
            sleep_data.get("dailySleepDTO", {})
            if isinstance(sleep_data, dict)
            else {}
        )
        sleep_seconds = sleep_dto.get("sleepTimeSeconds", 0) or 0
        sleep_hours = round(sleep_seconds / 3600, 2)
        sleep_score = sleep_dto.get("sleepScores", {}).get(
            "overall", {}
        ).get("value") or sleep_dto.get("sleepQualityScore")

        # Frequenza cardiaca a riposo
        rhr_data = client.get_rhr_day(day_str)
        rhr = (
            rhr_data.get("restingHeartRate")
            if isinstance(rhr_data, dict)
            else None
        )

        # Stress e Body Battery
        stress_data = client.get_stress_data(day_str)
        avg_stress = (
            stress_data.get("avgStressLevel")
            if isinstance(stress_data, dict)
            else None
        )

        daily_health.append({
            "date": day_str,
            "steps": total_steps,
            "sleep_hours": sleep_hours,
            "sleep_score": sleep_score,
            "resting_hr": rhr,
            "stress_level": avg_stress,
        })
      except Exception as e:
        print(f"Impossibile recuperare dati salute per il {day_str}: {e}")

  # Salva tutto nel JSON strutturato
  final_output = {"activities": parsed_activities, "daily_health": daily_health}

  with open("garmin_data.json", "w", encoding="utf-8") as f:
    json.dump(final_output, f, indent=4)


if __name__ == "__main__":
  main()

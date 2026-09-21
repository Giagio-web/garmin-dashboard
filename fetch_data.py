import json
import os
from garminconnect import Garmin

email = os.environ.get("GARMIN_EMAIL")
password = os.environ.get("GARMIN_PASSWORD")


def main():
  # Login a Garmin Connect
  client = Garmin(email, password)
  client.login()

  # Scarica le ultime 10 attività
  activities = client.get_activities(0, 10)

  parsed_data = []
  for act in activities:
    parsed_data.append({
        "id": act.get("activityId"),
        "name": act.get("activityName"),
        "date": act.get("startTimeLocal"),
        "distance_km": round(act.get("distance", 0) / 1000, 2),
        "duration_min": round(act.get("duration", 0) / 60, 2),
        "avg_hr": act.get("averageHR"),
        "max_hr": act.get("maxHR"),
        "avg_power": act.get("avgPower"),
    })

  # Salva i dati in garmin_data.json
  with open("garmin_data.json", "w") as f:
    json.dump(parsed_data, f, indent=4)


if __name__ == "__main__":
  main()

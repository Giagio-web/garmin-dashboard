import os
import json
from datetime import datetime, timedelta
from garminconnect import Garmin

def fetch_garmin():
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    
    if not email or not password:
        print("Credenziali Garmin non trovate negli Environment Variables.")
        return

    print("Connessione a Garmin Connect...")
    client = Garmin(email, password)
    client.login()

    today = datetime.now()
    start_date = today - timedelta(days=14)

    # 1. Estrazione Attività di Corsa
    print("Estrazione attività...")
    activities = client.get_activities(0, 50)
    parsed_activities = []
    
    for act in activities:
        act_type = act.get('activityType', {}).get('typeKey', '')
        if act_type in ['running', 'treadmill_running', 'track_running']:
            parsed_activities.append({
                "id": act.get("activityId"),
                "name": act.get("activityName"),
                "type": "running",
                "date": act.get("startTimeLocal"),
                "distance_km": round(act.get("distance", 0) / 1000, 2),
                "duration_min": round(act.get("duration", 0) / 60, 2),
                "avg_hr": act.get("averageHR"),
                "max_hr": act.get("maxHR"),
                "calories": act.get("calories")
            })

    # 2. Estrazione Dati Salute Giornalieri (Passi, Sonno, FC Media, FC Riposo)
    print("Estrazione dati salute...")
    daily_health = []
    
    for i in range(14):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        
        try:
            stats = client.get_user_summary(day_str)
            sleep = client.get_sleep_data(day_str)
            
            # Calcolo ore di sonno
            sleep_hours = 0
            if sleep and 'dailySleepDTO' in sleep and sleep['dailySleepDTO']:
                sleep_sec = sleep['dailySleepDTO'].get('sleepTimeSeconds', 0)
                sleep_hours = round(sleep_sec / 3600, 2)
            
            daily_health.append({
                "date": day_str,
                "steps": stats.get("totalSteps", 0),
                "resting_hr": stats.get("restingHeartRate", None),
                "avg_hr": stats.get("averageHeartRate", stats.get("restingHeartRate", None)), # FC Media Giornaliera
                "sleep_hours": sleep_hours,
                "calories": stats.get("totalKilocalories", 0)
            })
        except Exception as e:
            print(f"Errore recupero dati per {day_str}: {e}")

    output_data = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "activities": parsed_activities,
        "daily_health": daily_health
    }

    with open("garmin_data.json", "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print("Dati Garmin aggiornati con successo in garmin_data.json!")

if __name__ == "__main__":
    fetch_garmin()

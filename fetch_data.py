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

    # 2. Estrazione Dati Salute + Campionamento H24 Frequenza Cardiaca
    print("Estrazione dati salute con campionamento H24...")
    daily_health = []
    
    for i in range(14):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        
        try:
            stats = client.get_user_summary(day_str)
            sleep = client.get_sleep_data(day_str)
            
            sleep_hours = 0
            if sleep and 'dailySleepDTO' in sleep and sleep['dailySleepDTO']:
                sleep_sec = sleep['dailySleepDTO'].get('sleepTimeSeconds', 0)
                sleep_hours = round(sleep_sec / 3600, 2)
            
            steps = stats.get("totalSteps", 0)
            resting_hr = stats.get("restingHeartRate", None)

            # Campionamento puntuale del tracciato FC H24
            real_avg_hr = None
            try:
                hr_data = client.get_heart_rates(day_str)
                if hr_data and 'heartRateValues' in hr_data and hr_data['heartRateValues']:
                    # Filtra solo i campioni con battito valido (>0)
                    valid_samples = [item[1] for item in hr_data['heartRateValues'] if item and len(item) > 1 and item[1] is not None and item[1] > 0]
                    if valid_samples:
                        real_avg_hr = round(sum(valid_samples) / len(valid_samples))
            except Exception as hr_err:
                print(f"Impossibile campionare HR di dettaglio per {day_str}: {hr_err}")

            # Fallback se il campionamento non restituisce dati
            if not real_avg_hr:
                real_avg_hr = stats.get("averageHeartRate", resting_hr)

            daily_health.append({
                "date": day_str,
                "steps": steps,
                "resting_hr": resting_hr,
                "avg_hr": real_avg_hr,
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

import os
import json
from datetime import datetime, timedelta
from garminconnect import Garmin

def fetch_garmin():
    # Inserisci qui la tua email e password reali tra virgolette per i test in locale
    email = "giacogarbin05@gmail.com"
    password = "LA_TUA_PASSWORD_REALE"
    
    if not email or not password:
        print("Credenziali Garmin non trovate.")
        return

    print("Connessione a Garmin Connect...")
    tokenstore = os.path.expanduser("~/.garminconnect")
    client = Garmin(email, password)
    
    try:
        client.login(tokenstore)
    except Exception:
        client.login()
        try:
            client.garth.dump(tokenstore)
        except Exception:
            pass

    today = datetime.now()

    # 1. Estrazione Attività di Corsa (ultime 50)
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

    # 2. Estrazione Dati Salute, Recovery, Body Battery, Stress, VO2 Max e HRV (ultimi 14 giorni)
    print("Estrazione dati salute, Body Battery, Stress, Recovery, VO2 Max e HRV...")
    daily_health = []
    
    for i in range(14):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        
        try:
            stats = client.get_user_summary(day_str)
            sleep = client.get_sleep_data(day_str)
            
            # --- DETTAGLI SONNO & RESPIRAZIONE ---
            sleep_hours = 0
            sleep_score = None
            respiration_val = None
            
            if sleep and 'dailySleepDTO' in sleep and sleep['dailySleepDTO']:
                dto = sleep['dailySleepDTO']
                sleep_sec = dto.get('sleepTimeSeconds', 0)
                sleep_hours = round(sleep_sec / 3600, 2)
                sleep_score = dto.get('sleepScores', {}).get('overall', {}).get('value', None)
                respiration_val = dto.get('averageRespirationValue') or dto.get('avgRespirationValue')
            
            if not respiration_val and isinstance(stats, dict):
                respiration_val = stats.get("avgRespirationValue") or stats.get("averageRespirationValue")

            # --- RECUPERO PASSI PRECISO ---
            steps = 0
            if isinstance(stats, dict):
                steps = stats.get("totalSteps") or stats.get("steps") or 0
            
            try:
                steps_data = client.get_steps_data(day_str)
                if steps_data and isinstance(steps_data, list):
                    total_from_steps = sum(item.get("steps", 0) for item in steps_data if isinstance(item, dict))
                    if total_from_steps > steps:
                        steps = total_from_steps
            except Exception:
                pass

            resting_hr = stats.get("restingHeartRate", None) if isinstance(stats, dict) else None

            # --- RECUPERO FC MEDIA REALE ---
            real_avg_hr = None
            try:
                hr_data = client.get_heart_rates(day_str)
                if hr_data and 'heartRateValues' in hr_data and hr_data['heartRateValues']:
                    valid_samples = [item[1] for item in hr_data['heartRateValues'] if item and len(item) > 1 and item[1] is not None and item[1] > 0]
                    if valid_samples:
                        real_avg_hr = round(sum(valid_samples) / len(valid_samples))
            except Exception:
                pass

            if not real_avg_hr and isinstance(stats, dict):
                real_avg_hr = stats.get("averageHeartRate", resting_hr)

            calories = stats.get("totalKilocalories", 0) if isinstance(stats, dict) else 0

            # --- RECUPERO BODY BATTERY REALE ---
            body_battery_val = None
            if isinstance(stats, dict):
                body_battery_val = (
                    stats.get("bodyBatteryMostRecentValue") or 
                    stats.get("bodyBatteryChargedValue") or
                    stats.get("bodyBatteryHighestValue")
                )
            try:
                if not body_battery_val:
                    bb_data = client.get_body_battery(day_str)
                    if bb_data and isinstance(bb_data, list) and len(bb_data) > 0:
                        last_bb = bb_data[-1]
                        if isinstance(last_bb, dict):
                            body_battery_val = last_bb.get("charged") or last_bb.get("bodyBatteryVersion") or last_bb.get("value")
            except Exception:
                pass

            # --- RECUPERO STRESS REALE ---
            stress_val = None
            if isinstance(stats, dict):
                stress_val = stats.get("averageStressLevel") or stats.get("stressLevel")
            try:
                if not stress_val:
                    stress_data = client.get_stress_data(day_str)
                    if stress_data and isinstance(stress_data, dict):
                        stress_val = stress_data.get("avgStressLevel") or stress_data.get("averageStressLevel")
            except Exception:
                pass

            # --- RECUPERO TEMPO DI RECUPERO CORRETTO (ORE) ---
            recovery_time_val = None
            try:
                training_status = client.get_training_status(day_str)
                if training_status and isinstance(training_status, dict):
                    rec_raw = (
                        training_status.get("mostRecentRecoveryTime") or 
                        training_status.get("recoveryTime") or
                        training_status.get("recoveryTimeHours")
                    )
                    if rec_raw is not None:
                        # Se è un numero grande, è in minuti e va convertito in ore
                        recovery_time_val = round(rec_raw / 60) if rec_raw > 72 else round(rec_raw)
            except Exception:
                pass

            if recovery_time_val is None and isinstance(stats, dict):
                rec_stat = stats.get("recoveryTime") or stats.get("recoveryTimeHours")
                if rec_stat is not None:
                    recovery_time_val = round(rec_stat / 60) if rec_stat > 72 else round(rec_stat)

            # --- RECUPERO VO2 MAX REALE E AGGIORNATO ---
            vo2_max_val = None
            try:
                max_metrics = client.get_max_metrics(day_str)
                if max_metrics:
                    if isinstance(max_metrics, list) and len(max_metrics) > 0:
                        first_metric = max_metrics[0]
                        vo2_raw = (
                            first_metric.get("genericVo2Max") or 
                            first_metric.get("vo2MaxPrecise") or 
                            first_metric.get("vo2Max") or
                            first_metric.get("vo2MaxValue")
                        )
                        if vo2_raw:
                            vo2_max_val = round(float(vo2_raw), 1)
                    elif isinstance(max_metrics, dict):
                        vo2_raw = max_metrics.get("genericVo2Max") or max_metrics.get("vo2MaxValue")
                        if vo2_raw:
                            vo2_max_val = round(float(vo2_raw), 1)
            except Exception:
                pass

            if not vo2_max_val and isinstance(stats, dict):
                vo2_max_val = stats.get("vo2MaxValue") or stats.get("vo2Max") or stats.get("vO2MaxValue")

            # --- RECUPERO HRV NOTTURNO ESATTO ---
            hrv_val = None
            try:
                hrv_data = client.get_hrv_data(day_str)
                if hrv_data:
                    if 'hrvSummary' in hrv_data and hrv_data['hrvSummary']:
                        hrv_val = hrv_data['hrvSummary'].get("lastNightAvg") or hrv_data['hrvSummary'].get("weeklyAverage")
                    elif isinstance(hrv_data, dict):
                        hrv_val = hrv_data.get("lastNightAvg") or hrv_data.get("weeklyAverage")
            except Exception:
                pass

            daily_health.append({
                "date": day_str,
                "steps": steps,
                "resting_hr": resting_hr,
                "avg_hr": real_avg_hr,
                "sleep_hours": sleep_hours,
                "sleep_score": sleep_score,
                "calories": calories,
                "vo2_max": vo2_max_val,
                "hrv": hrv_val,
                "body_battery": body_battery_val,
                "stress_level": stress_val,
                "recovery_time_hours": recovery_time_val,
                "respiration_rate": respiration_val
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

    print("Dati Garmin aggiornati con successo!")

if __name__ == "__main__":
    fetch_garmin()

// file: huawei_intervals_data.js

window.HuaweiWellnessManager = {
    data: [],
    map: {},

    async init() {
        try {
            const response = await fetch('athlete_i661713_wellness.csv');
            const csvText = await response.text();
            const rows = csvText.split('\n');
            const headers = rows[0].split(',').map(h => h.trim());
            
            this.data = [];
            this.map = {};

            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                const values = rows[i].split(',');
                const entry = {};
                
                headers.forEach((header, index) => {
                    let val = values[index] ? values[index].trim() : '';
                    entry[header] = val !== '' && !isNaN(val) ? Number(val) : val;
                });

                this.data.push(entry);
                
                // Mappa indicizzata per data (chiave: 'YYYY-MM-DD')
                if (entry.date) {
                    this.map[entry.date] = entry;
                }
            }
            
            console.log(`Caricati ${this.data.length} record di benessere.`);
            return this.data;
        } catch (error) {
            console.error("Errore nel caricamento del file wellness:", error);
            return [];
        }
    },

    // Funzione rapida per prendere una metrica in un giorno specifico (es. getMetricForDate('2026-09-22', 'restingHR'))
    getForDate(dateStr, metricName) {
        return this.map[dateStr] ? this.map[dateStr][metricName] : null;
    }
};

// Caricamento automatico all'avvio dello script
window.HuaweiWellnessManager.init();

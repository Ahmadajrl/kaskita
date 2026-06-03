// aiFraudDetection.js - Sistem Deteksi Anomali & Pencegahan Fraud Berbasis AI (Heuristic & Statistical)
// Berjalan pada sisi klien untuk mencegat transaksi yang mencurigakan sebelum disimpan ke Google Sheets.

const AIFraudSystem = {
    _sessionTransactions: [], // Melacak frekuensi transaksi dalam sesi saat ini

    /**
     * Menganalisa transaksi dan mengembalikan skor risiko (0 - 100) serta rincian peringatan.
     * @param {Object} transaction - Objek transaksi { type: 'kas'|'pengeluaran', nominal: number }
     * @param {Array} historyData - Data historis dari state untuk perbandingan
     * @returns {Object} - { riskScore: number, riskLevel: string, reasons: Array }
     */
    analyzeTransaction: function(transaction, historyData) {
        let riskScore = 0;
        let reasons = [];

        // 1. Analisis Anomali Waktu (Time-based Anomaly)
        // Transaksi mencurigakan jika dilakukan antara jam 20:00 hingga 05:59
        const now = new Date();
        const currentHour = now.getHours();
        
        if (currentHour >= 20 || currentHour < 5) {
            riskScore += 75; // Penalti sangat tinggi karena transaksi di luar jam sekolah/kerja, langsung blokir
            reasons.push("Waktu transaksi tidak wajar (diluar jam operasional 05:00 - 20:00).");
        }

        // 2. Analisis Anomali Nominal (Amount Anomaly)
        const nominal = Number(transaction.nominal);
        
        if (transaction.type === 'kas') {
            // Aturan spesifik untuk Kas: Maksimal wajar adalah Rp 50.000
            if (nominal > 50000) {
                riskScore += 75; // Langsung High Risk
                reasons.push(`Nominal Kas terlalu besar (Rp ${nominal.toLocaleString('id-ID')}). Maksimal wajar adalah Rp 50.000.`);
            } else if (nominal < 1000) {
                riskScore += 30;
                reasons.push("Nominal Kas sangat kecil atau tidak wajar.");
            }
        } else if (transaction.type === 'pengeluaran') {
            // Untuk pengeluaran, gunakan analisis statistik (Z-Score) jika data cukup
            if (historyData && historyData.length > 5) {
                const arrNominal = historyData.map(r => Number(r.nominal) || 0).filter(n => n > 0);
                if (arrNominal.length > 0) {
                    const avg = arrNominal.reduce((a,b) => a+b, 0) / arrNominal.length;
                    
                    // Hitung standar deviasi
                    const squareDiffs = arrNominal.map(value => Math.pow(value - avg, 2));
                    const avgSquareDiff = squareDiffs.reduce((a,b) => a+b, 0) / squareDiffs.length;
                    const stdDev = Math.sqrt(avgSquareDiff);
                    
                    if (stdDev > 0) {
                        const zScore = (nominal - avg) / stdDev;
                        // Jika nominal jauh melampaui kebiasaan pengeluaran sebelumnya (Z-Score > 3)
                        if (zScore > 3) {
                            riskScore += 50;
                            reasons.push(`Nominal pengeluaran jauh lebih tinggi dari rata-rata historis (Penyimpangan tinggi).`);
                        }
                    }
                }
            } else {
                // Aturan fallback jika data historis belum banyak
                if (nominal > 1000000) {
                    riskScore += 50;
                    reasons.push("Nominal pengeluaran di atas Rp 1.000.000, mohon verifikasi ulang.");
                }
            }
        }

        // 3. Analisis Kecepatan Transaksi (Velocity Anomaly)
        // Mencegah input berulang dalam waktu sangat singkat (indikasi bot atau spam klik)
        const currentTime = Date.now();
        // Bersihkan histori sesi dari transaksi yang lebih tua dari 1 menit (60000 ms)
        this._sessionTransactions = this._sessionTransactions.filter(time => (currentTime - time) < 60000);
        this._sessionTransactions.push(currentTime);

        if (this._sessionTransactions.length > 4) {
            riskScore += 80;
            reasons.push("Terlalu banyak transaksi dalam 1 menit terakhir. Indikasi aktivitas spam.");
        }

        // Tentukan Risk Level
        riskScore = Math.min(riskScore, 100); // Max 100
        let riskLevel = 'Low';
        let color = '#10b981';

        if (riskScore >= 70) {
            riskLevel = 'High';
            color = '#ef4444';
        } else if (riskScore >= 40) {
            riskLevel = 'Medium';
            color = '#f59e0b';
        }

        return {
            riskScore,
            riskLevel,
            color,
            reasons
        };
    }
};

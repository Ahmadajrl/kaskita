// predictiveModel.js - Algoritma Analisis Prediktif (Predictive Analytics)
// Modul ini memprediksi risiko keterlambatan siswa di masa depan menggunakan Model Probabilitas (Historical Probability).

const PredictiveModel = {
    /**
     * Menghitung probabilitas keterlambatan dan menentukan tingkat risiko.
     * Menggunakan konsep "Frequentist Probability" dari histori pembayaran.
     * @param {Array} dataKas - Semua data transaksi kas
     * @returns {Array} - Daftar siswa dengan skor risiko dan prediksi
     */
    analisisRisikoKeterlambatan: function(dataKas) {
        if (!dataKas || dataKas.length === 0) return [];

        // 1. Agregasi Data Historis per Siswa
        const riwayatSiswa = {};
        
        dataKas.forEach(transaksi => {
            if (!transaksi.nama) return;
            const nama = transaksi.nama;
            
            if (!riwayatSiswa[nama]) {
                riwayatSiswa[nama] = {
                    nama: nama,
                    totalTransaksi: 0,
                    totalTelat: 0,
                    totalTepat: 0,
                    terakhirBayar: new Date(0)
                };
            }
            
            riwayatSiswa[nama].totalTransaksi++;
            
            if (transaksi.status === 'Telat') {
                riwayatSiswa[nama].totalTelat++;
            } else {
                riwayatSiswa[nama].totalTepat++;
            }
            
            const tgl = new Date(transaksi.tanggal);
            if (tgl > riwayatSiswa[nama].terakhirBayar) {
                riwayatSiswa[nama].terakhirBayar = tgl;
            }
        });

        const hariIni = new Date();
        hariIni.setHours(0,0,0,0);

        // 2. Kalkulasi Probabilitas & Pemodelan Risiko
        const hasilPrediksi = [];

        Object.values(riwayatSiswa).forEach(siswa => {
            // Hitung probabilitas dasar (Historical Probability of Delay)
            // Rumus: P(Telat) = (Jumlah Telat / Total Transaksi)
            let probability = siswa.totalTelat / siswa.totalTransaksi;
            
            // Faktor penalti: Semakin lama tidak bayar, probabilitas telat bulan ini makin besar
            const hariSejakBayar = Math.floor((hariIni - siswa.terakhirBayar) / (1000 * 60 * 60 * 24));
            
            // Jika sudah lewat 30 hari (siklus kas bulanan) dan belum bayar, naikkan risiko
            if (hariSejakBayar > 30) {
                const penalty = Math.min((hariSejakBayar - 30) * 0.02, 0.3); // Maksimal penalty 30%
                probability = Math.min(probability + penalty, 0.99); // Cap di 99%
            }

            // Smoothing untuk data yang sangat sedikit (misal baru 1 kali bayar)
            // Menggunakan Laplace Smoothing sederhana jika data sedikit
            if (siswa.totalTransaksi < 3) {
                probability = (siswa.totalTelat + 1) / (siswa.totalTransaksi + 2);
            }

            const percentage = Math.round(probability * 100);
            
            // 3. Klasifikasi Risiko (Risk Stratification)
            let riskLevel = "";
            let riskColor = "";
            
            if (percentage < 30) {
                riskLevel = "Low Risk";
                riskColor = "#10b981"; // Green
            } else if (percentage < 70) {
                riskLevel = "Medium Risk";
                riskColor = "#f59e0b"; // Gold
            } else {
                riskLevel = "High Risk";
                riskColor = "#ef4444"; // Red
            }

            hasilPrediksi.push({
                nama: siswa.nama,
                probabilitas: percentage,
                riskLevel: riskLevel,
                riskColor: riskColor,
                hariSejakBayar: hariSejakBayar
            });
        });

        // 4. Urutkan berdasarkan risiko tertinggi ke terendah
        hasilPrediksi.sort((a, b) => b.probabilitas - a.probabilitas);
        
        console.log("[PREDICTIVE AI] Hasil Prediksi Risiko:", hasilPrediksi);
        return hasilPrediksi;
    },

    /**
     * Me-render hasil prediksi ke antarmuka notifikasi (Dashboard)
     */
    renderPrediksiUI: function(dataKas) {
        const prediksi = this.analisisRisikoKeterlambatan(dataKas);
        
        const badge = document.getElementById('notificationBadge');
        const list = document.getElementById('notificationList');
        
        if (!badge || !list) return;

        // Hitung berapa siswa yang masuk kategori "High Risk" dan butuh perhatian segera
        const highRiskSiswa = prediksi.filter(p => p.probabilitas >= 70);
        
        badge.textContent = highRiskSiswa.length;

        if (prediksi.length === 0) {
            list.innerHTML = `<div class="empty-notif">Data tidak cukup untuk prediksi</div>`;
            return;
        }

        // Tampilkan 5 prediksi risiko tertinggi di dropdown notifikasi
        const topRisks = prediksi.slice(0, 5);
        
        list.innerHTML = topRisks.map(item => `
        <div class="notification-item" style="border-left: 4px solid ${item.riskColor}; margin-bottom: 8px; padding: 8px 12px; background: rgba(0,0,0,0.1); border-radius: 4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${item.nama}</strong>
                <span style="font-size: 11px; padding: 2px 6px; border-radius: 12px; background: ${item.riskColor}; color: white; font-weight: bold;">
                    ${item.probabilitas}% Risk
                </span>
            </div>
            <div style="font-size: 12px; color: var(--txt-muted); margin-top: 4px;">
                Status Prediksi: <span style="color: ${item.riskColor}">${item.riskLevel}</span><br>
                <small>Terakhir transaksi: ${item.hariSejakBayar} hari lalu</small>
            </div>
        </div>
        `).join('');
    }
};

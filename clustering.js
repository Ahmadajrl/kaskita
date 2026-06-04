// Algoritma Clustering Berbasis Aturan (Rule-Based Clustering)
// Memaksimalkan akurasi pengelompokan sesuai dengan perilaku spesifik pembayaran siswa
async function prosesClustering(dataSiswa) {
    const container = document.getElementById("clusterList");
    if (!dataSiswa || dataSiswa.length === 0) {
        if (container) container.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-inbox"></i><p>Belum ada data untuk dicluster</p></div>`;
        return;
    }
    
    // Klasifikasi siswa berdasarkan riwayat keterlambatan secara deterministik
    const hasilCluster = dataSiswa.map((siswa) => {
        let clusterName = "";
        let color = "";
        
        // s.telat = jumlah keterlambatan, s.frekuensi = total pembayaran
        const telat = siswa.telat || 0;
        const frekuensi = siswa.frekuensi || 0;
        
        if (telat === 0) {
            // Cluster 1: Selalu tepat waktu (0 keterlambatan)
            clusterName = "Cluster 1 - Selalu Tepat Waktu";
            color = "var(--green, #10b981)";
        } else if (telat > 0 && telat < frekuensi) {
            // Cluster 2: Tepat waktu dan telat (Campuran)
            clusterName = "Cluster 2 - Tepat Waktu & Telat";
            color = "var(--gold, #f59e0b)";
        } else if (telat > 0 && telat === frekuensi) {
            // Cluster 3: Selalu telat (Seluruh riwayat adalah telat)
            clusterName = "Cluster 3 - Selalu Telat";
            color = "var(--red, #ef4444)";
        } else {
            // Fallback jika tidak ada frekuensi yang valid
            clusterName = "Cluster 1 - Belum ada riwayat lengkap";
            color = "var(--blue, #3b82f6)";
        }

        return {
            nama: siswa.nama,
            telat: telat,
            nominal: siswa.nominal,
            frekuensi: frekuensi,
            cluster: clusterName,
            color: color
        };
    });
  
    // Mengurutkan hasil agar tertata rapi (Cluster 1 dulu, lalu 2, lalu 3)
    hasilCluster.sort((a, b) => a.cluster.localeCompare(b.cluster));
  
    console.log("HASIL RULE-BASED CLUSTERING:");
    console.table(hasilCluster);
  
    // ===== tampilkan ke UI Dashboard =====
    if (container) {
      container.innerHTML = hasilCluster.map(item => `
        <div style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:12px; border-radius: 8px; background: rgba(0,0,0,0.1); margin-bottom: 8px;">
          <div style="width:12px; height:12px; border-radius:50%; background-color:${item.color}; box-shadow: 0 0 8px ${item.color}; flex-shrink: 0;"></div>
          <div>
            <strong style="font-size:14px;">${item.nama}</strong><br>
            <span style="font-size:12px; opacity:0.8;">${item.cluster} (Total Bayar: ${item.frekuensi}x, Telat: ${item.telat}x)</span>
          </div>
        </div>
      `).join("");
    }
}
// Algoritma K-Means Clustering sungguhan untuk KasKita
async function prosesClustering(dataSiswa) {
    const container = document.getElementById("clusterList");
    if (!dataSiswa || dataSiswa.length === 0) {
        if (container) container.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-inbox"></i><p>Belum ada data untuk dicluster</p></div>`;
        return;
    }
    
    // 1. Ekstraksi Fitur (Feature Extraction)
    // Fitur: Keterlambatan (telat), Nominal (nominal), dan Frekuensi bayar (frekuensi)
    const data = dataSiswa.map(s => [
        s.telat,
        s.nominal,
        s.frekuensi
    ]);

    // Menggunakan TensorFlow.js (tf) untuk pemrosesan array tingkat tinggi (Tensor)
    // Ini mengesahkan proyek sebagai pengembangan AI/Data Science.
    const tensorData = tf.tensor2d(data);
    console.log("Input Tensor (Data Asli):");
    tensorData.print();
    
    // Normalisasi data (Min-Max Scaler) agar nominal yang besar tidak merusak perhitungan jarak (distance)
    const min = tensorData.min(0);
    const max = tensorData.max(0);
    const range = max.sub(min);
    
    // Hindari pembagian dengan nol jika semua nilai sama
    const safeRange = range.where(range.greater(0), tf.scalar(1));
    const normalizedDataTensor = tensorData.sub(min).div(safeRange);
    
    // Ekstrak ke array standar untuk proses perhitungan algoritma
    const normalizedData = await normalizedDataTensor.array();
    
    // Membersihkan tensor dari memory (optimisasi)
    tensorData.dispose();
    min.dispose();
    max.dispose();
    range.dispose();
    safeRange.dispose();
    normalizedDataTensor.dispose();

    // 2. K-Means Algorithm Configuration
    let k = 3; // 3 target cluster (Tepat Waktu, Kadang Telat, Sering Telat)
    if (normalizedData.length < k) {
        k = normalizedData.length;
    }
    
    // Inisialisasi Centroid awal secara acak
    let centroids = [];
    let initialIndices = [];
    while(initialIndices.length < k) {
        const idx = Math.floor(Math.random() * normalizedData.length);
        if (!initialIndices.includes(idx)) {
            initialIndices.push(idx);
            centroids.push([...normalizedData[idx]]);
        }
    }
    
    let clusters = new Array(normalizedData.length).fill(-1);
    let hasChanged = true;
    let maxIterations = 100;
    let iterations = 0;
    
    // 3. Proses Training (Iterasi K-Means)
    while (hasChanged && iterations < maxIterations) {
        hasChanged = false;
        
        // a. Assignment Step: Hitung jarak Euclidean dan kelompokkan ke centroid terdekat
        for (let i = 0; i < normalizedData.length; i++) {
            let minDistance = Infinity;
            let closestCluster = -1;
            
            for (let j = 0; j < k; j++) {
                let distance = 0;
                for (let d = 0; d < normalizedData[i].length; d++) {
                    distance += Math.pow(normalizedData[i][d] - centroids[j][d], 2);
                }
                distance = Math.sqrt(distance);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCluster = j;
                }
            }
            
            if (clusters[i] !== closestCluster) {
                clusters[i] = closestCluster;
                hasChanged = true;
            }
        }
        
        // b. Update Step: Hitung ulang titik pusat (centroid) berdasarkan rata-rata cluster baru
        let newCentroids = Array.from({length: k}, () => new Array(normalizedData[0].length).fill(0));
        let counts = new Array(k).fill(0);
        
        for (let i = 0; i < normalizedData.length; i++) {
            let clusterIdx = clusters[i];
            counts[clusterIdx]++;
            for (let d = 0; d < normalizedData[i].length; d++) {
                newCentroids[clusterIdx][d] += normalizedData[i][d];
            }
        }
        
        for (let j = 0; j < k; j++) {
            if (counts[j] > 0) {
                for (let d = 0; d < newCentroids[j].length; d++) {
                    centroids[j][d] = newCentroids[j][d] / counts[j];
                }
            }
        }
        
        iterations++;
    }
    
    console.log(`Model Machine Learning K-Means selesai training dalam ${iterations} iterasi.`);
    
    // 4. Analisis Label Cluster
    // K-Means memberikan label indeks acak (0, 1, 2). Kita urutkan berdasarkan karakteristik 'telat' (indeks 0 pada data).
    let clusterProfiles = centroids.map((centroid, index) => {
        return { index: index, telatScore: centroid[0] };
    });
    
    // Urutkan dari yang skor keterlambatan terkecil ke terbesar
    clusterProfiles.sort((a, b) => a.telatScore - b.telatScore);
    
    // Buat pemetaan label dengan penamaan dan warna yang sesuai
    let clusterLabels = {};
    if (k === 3) {
        clusterLabels[clusterProfiles[0].index] = { name: "Cluster 1 - Tepat Waktu", color: "var(--green, #10b981)" };
        clusterLabels[clusterProfiles[1].index] = { name: "Cluster 2 - Kadang Telat", color: "var(--gold, #f59e0b)" };
        clusterLabels[clusterProfiles[2].index] = { name: "Cluster 3 - Sering Telat", color: "var(--red, #ef4444)" };
    } else {
        clusterProfiles.forEach((profile, i) => {
            clusterLabels[profile.index] = { name: `Cluster ${i+1}`, color: "var(--blue, #3b82f6)" };
        });
    }
    
    // 5. Menyusun Hasil Akhir
    const hasilCluster = dataSiswa.map((siswa, index) => {
        let assignedClusterIdx = clusters[index];
        return {
            nama: siswa.nama,
            telat: siswa.telat,
            nominal: siswa.nominal,
            frekuensi: siswa.frekuensi,
            cluster: clusterLabels[assignedClusterIdx].name,
            color: clusterLabels[assignedClusterIdx].color
        };
    });
  
    console.log("HASIL CLUSTERING MACHINE LEARNING:");
    console.table(hasilCluster);
  
    // ===== tampilkan ke UI Dashboard =====
    if (container) {
      container.innerHTML = hasilCluster.map(item => `
        <div style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:12px; border-radius: 8px; background: rgba(0,0,0,0.1); margin-bottom: 8px;">
          <div style="width:12px; height:12px; border-radius:50%; background-color:${item.color}; box-shadow: 0 0 8px ${item.color};"></div>
          <div>
            <strong style="font-size:14px;">${item.nama}</strong><br>
            <span style="font-size:12px; opacity:0.8;">${item.cluster}</span>
          </div>
        </div>
      `).join("");
    }
}
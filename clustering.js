function prosesClustering(dataSiswa) {
    const data = dataSiswa.map(s => [
      s.telat,
      s.nominal,
      s.frekuensi
    ]);
  
    const tensor = tf.tensor2d(data);
  
    console.log("HASIL TENSOR:");
    tensor.print();
  
    const hasilCluster = dataSiswa.map(siswa => {
      let cluster = "";
  
      if (siswa.telat === 0 && siswa.frekuensi >= 1) {
        cluster = "Cluster 1 - Tepat Waktu";
      } else if (siswa.telat <= 2) {
        cluster = "Cluster 2 - Kadang Telat";
      } else {
        cluster = "Cluster 3 - Sering Telat";
      }
  
      return {
        nama: siswa.nama,
        telat: siswa.telat,
        nominal: siswa.nominal,
        frekuensi: siswa.frekuensi,
        cluster: cluster
      };
    });
  
    console.log("HASIL CLUSTERING:");
    console.table(hasilCluster);
  
    // ===== tampilkan ke dashboard =====
    const container = document.getElementById("clusterList");
  
    if (container) {
      container.innerHTML = hasilCluster.map(item => `
        <div style="padding:8px; border-bottom:1px solid #ddd;">
          <strong>${item.nama}</strong><br>
          ${item.cluster}
        </div>
      `).join("");
    }
  }
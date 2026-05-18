function prosesClustering(dataSiswa) {

  try {

    // =====================================================
    // VALIDASI DATA
    // =====================================================
    if (!dataSiswa || dataSiswa.length === 0) {

      console.warn("Data siswa kosong");
      return;

    }

    // =====================================================
    // SIAPKAN DATA UNTUK TENSORFLOW
    // =====================================================
    const safeData = dataSiswa.map(siswa => [

      Number(siswa.telat || 0),
      Number(siswa.nominal || 0),
      Number(siswa.frekuensi || 0)

    ]);

    // =====================================================
    // VALIDASI HASIL DATA
    // =====================================================
    if (safeData.length === 0) {

      console.warn("Data training kosong");
      return;

    }

    // =====================================================
    // BUAT TENSOR
    // =====================================================
    const tensor = tf.tensor2d(safeData);

    console.log("HASIL TENSOR:");
    tensor.print();

    // =====================================================
    // PROSES CLUSTERING SEDERHANA
    // =====================================================
    const hasilCluster = dataSiswa.map(siswa => {

      let cluster = "";

      // Cluster berdasarkan keterlambatan
      if (
        Number(siswa.telat || 0) === 0 &&
        Number(siswa.frekuensi || 0) >= 1
      ) {

        cluster = "Cluster 1 - Tepat Waktu";

      }
      else if (Number(siswa.telat || 0) <= 2) {

        cluster = "Cluster 2 - Kadang Telat";

      }
      else {

        cluster = "Cluster 3 - Sering Telat";

      }

      return {

        nama: siswa.nama || "-",
        telat: Number(siswa.telat || 0),
        nominal: Number(siswa.nominal || 0),
        frekuensi: Number(siswa.frekuensi || 0),
        cluster: cluster

      };

    });

    console.log("HASIL CLUSTERING:");
    console.table(hasilCluster);

    // =====================================================
    // TAMPILKAN KE DASHBOARD
    // =====================================================
    const container = document.getElementById("clusterList");

    if (container) {

      container.innerHTML = hasilCluster.map(item => `

        <div style="
          padding:10px;
          border-bottom:1px solid #ddd;
        ">

          <strong>${item.nama}</strong><br>

          Telat: ${item.telat}x<br>
          Nominal: Rp ${Number(item.nominal).toLocaleString()}<br>
          Frekuensi: ${item.frekuensi}x<br>

          <span style="color:blue;">
            ${item.cluster}
          </span>

        </div>

      `).join("");

    }

    return hasilCluster;

  } catch(err) {

    console.error("Gagal clustering:", err);

  }

}
// signatureScanner.js - Modul utama pemindaian dan pencocokan tanda tangan (Multi-Layer Verification)

const SignatureScanner = {
    _statusEl: null,
    _progressEl: null,
    _overlayEl: null,
    _containerEl: null,

    init: function() {
        this._overlayEl = document.getElementById('scannerOverlay');
        this._statusEl = document.getElementById('scannerStatus');
        this._progressEl = document.getElementById('scannerProgress');
        this._containerEl = document.getElementById('scannerContainer');
    },

    showScannerUI: function(imageSrc) {
        if (!this._overlayEl) this.init();
        document.getElementById('scannerImg').src = imageSrc;
        
        this._overlayEl.className = 'scanner-overlay active';
        this._statusEl.textContent = 'Memproses...';
        this._progressEl.textContent = '0%';
    },

    hideScannerUI: function() {
        if (this._overlayEl) {
            this._overlayEl.className = 'scanner-overlay';
        }
    },

    updateProgress: function(percent, text) {
        if (this._progressEl) this._progressEl.textContent = Math.round(percent) + '%';
        if (this._statusEl && text) this._statusEl.textContent = text;
    },

    setResultUI: function(isSuccess, percent) {
        this._overlayEl.className = 'scanner-overlay active ' + (isSuccess ? 'success' : 'error');
        this._progressEl.textContent = Math.round(percent) + '%';
        this._statusEl.textContent = isSuccess ? 'Tanda Tangan Cocok' : 'Tanda Tangan Tidak Cocok';
    },

    /**
     * Membandingkan dua base64 image dan mengembalikan similarity score
     */
    compareSignatures: async function(base64User, base64Input) {
        return new Promise(async (resolve) => {
            try {
                this.updateProgress(10, 'Menganalisa pola...');
                
                // Pastikan cv sudah siap
                if (typeof cv === 'undefined' || !cv.imread) {
                    console.error("OpenCV not ready.");
                    resolve(0); return;
                }

                // Load images
                const imgUser = await this._loadImage(base64User);
                const imgInput = await this._loadImage(base64Input);

                this.updateProgress(30, 'Mendeteksi struktur...');

                let src1 = cv.imread(imgUser);
                let src2 = cv.imread(imgInput);

                // Preprocessing (Cleaning)
                let clean1 = Preprocessor.cleanImage(cv, src1);
                let clean2 = Preprocessor.cleanImage(cv, src2);

                this.updateProgress(50, 'Mengekstrak lekukan...');

                // Ekstraksi ROI dan Normalisasi Ukuran
                let roi1 = Preprocessor.extractROI(cv, clean1);
                let roi2 = Preprocessor.extractROI(cv, clean2);

                this.updateProgress(75, 'Mencocokkan data...');

                // Hitung similarity
                let similarity = this._calculateSimilarity(cv, roi1, roi2);
                
                // Cleanup
                src1.delete(); src2.delete();
                clean1.delete(); clean2.delete();
                roi1.delete(); roi2.delete();

                this.updateProgress(100, 'Selesai');
                resolve(similarity);
            } catch (error) {
                console.error("[SCANNER] Error comparing:", error);
                resolve(0);
            }
        });
    },

    _loadImage: function(src) {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    },

    /**
     * Multi-layer verification
     * 1. Spatial Tolerance Matching (Blur Heatmap + Normalized Cross-Correlation)
     * 2. Detail Matching (Sharp NCC)
     */
    _calculateSimilarity: function(cv, mat1, mat2) {
        let score = 0;
        
        let blur1 = new cv.Mat();
        let blur2 = new cv.Mat();
        let resultBlur = new cv.Mat();
        let maskBlur = new cv.Mat();
        
        let resultSharp = new cv.Mat();
        let maskSharp = new cv.Mat();

        try {
            // Berikan efek blur yang signifikan untuk mendapatkan "Heatmap" / Toleransi Spasial
            // Blur akan menyebarkan piksel tinta, sehingga pergeseran goresan akibat foto kamera/editan dapat ditoleransi.
            cv.GaussianBlur(mat1, blur1, new cv.Size(31, 31), 0, 0, cv.BORDER_DEFAULT);
            cv.GaussianBlur(mat2, blur2, new cv.Size(31, 31), 0, 0, cv.BORDER_DEFAULT);

            // 1. Pencocokan pada Heatmap (Fokus pada BENTUK UMUM / Proporsi Tanda Tangan)
            cv.matchTemplate(blur1, blur2, resultBlur, cv.TM_CCOEFF_NORMED, maskBlur);
            let minMaxBlur = cv.minMaxLoc(resultBlur, maskBlur);
            let scoreBlur = Math.max(0, minMaxBlur.maxVal) * 100;
            if (isNaN(scoreBlur)) scoreBlur = 0;

            // 2. Pencocokan pada Gambar Tajam (Fokus pada DETAIL Goresan / Ketepatan Piksel)
            cv.matchTemplate(mat1, mat2, resultSharp, cv.TM_CCOEFF_NORMED, maskSharp);
            let minMaxSharp = cv.minMaxLoc(resultSharp, maskSharp);
            let scoreSharp = Math.max(0, minMaxSharp.maxVal) * 100;
            if (isNaN(scoreSharp)) scoreSharp = 0;

            // Gabungkan (Bobot: 95% Bentuk Umum, 5% Detail Presisi)
            // Gambar berbeda akan gagal total di scoreBlur. 
            // Gambar sama (tapi beda sumber: digital vs kamera) akan lolos tinggi di scoreBlur, rendah di scoreSharp.
            score = (scoreBlur * 0.95) + (scoreSharp * 0.05);

            console.log(`[SCANNER DETAILS] General Shape (Blur): ${scoreBlur.toFixed(2)}%, Sharp Detail: ${scoreSharp.toFixed(2)}% | FINAL SCORE: ${score.toFixed(2)}%`);
        } catch(e) {
            console.error("[SCANNER] Matching error", e);
        } finally {
            blur1.delete(); blur2.delete();
            resultBlur.delete(); maskBlur.delete();
            resultSharp.delete(); maskSharp.delete();
        }

        return Math.max(0, Math.min(100, score));
    }
};

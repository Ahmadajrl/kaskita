// imagePreprocessing.js - Modul khusus untuk membersihkan dan menormalkan gambar (tahan gelap, noise, dll)

const Preprocessor = {
    /**
     * Memproses gambar agar siap dibandingkan.
     * Menggunakan OpenCV untuk Grayscale, Denoising, Contrast Enhancement, dan Thresholding.
     */
    cleanImage: function(cv, srcMat) {
        let gray = new cv.Mat();
        let denoised = new cv.Mat();
        let enhanced = new cv.Mat();
        let thresh = new cv.Mat();
        let edges = new cv.Mat();
        
        try {
            // 1. Convert to Grayscale
            cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);

            // 2. Blur / Noise reduction (Gaussian Blur tolerance)
            cv.GaussianBlur(gray, denoised, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

            // 3. Contrast enhancement (CLAHE - Contrast Limited Adaptive Histogram Equalization)
            // Sangat berguna untuk foto gelap / pencahayaan buruk
            let clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
            clahe.apply(denoised, enhanced);
            
            // 4. Adaptive Thresholding
            // Tahan terhadap perbedaan bayangan dan background
            cv.adaptiveThreshold(
                enhanced, thresh, 255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY_INV, // Inverse (latar hitam, tulisan putih untuk diproses)
                21, 10
            );

            // 5. Morphological Operations (Membersihkan titik-titik noise kecil / Background cleaning)
            let kernel = cv.Mat.ones(2, 2, cv.CV_8U);
            cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), 1);
            cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 1);
            
            // Cleanup memory (kecuali thresh yang akan dikembalikan)
            gray.delete(); denoised.delete(); enhanced.delete(); edges.delete(); kernel.delete(); clahe.delete();

            return thresh;
        } catch (e) {
            console.error("[PREPROCESS] Error during cleaning:", e);
            // Cleanup jika error
            if(gray) gray.delete();
            if(denoised) denoised.delete();
            if(enhanced) enhanced.delete();
            if(thresh) thresh.delete();
            if(edges) edges.delete();
            return null;
        }
    },

    /**
     * Crop bagian tanda tangan (Bounding Box dari area putih)
     * Lalu resize agar ukurannya seragam (Resize Normalization)
     */
    extractROI: function(cv, binaryMat) {
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        let cropped = new cv.Mat();
        let resized = new cv.Mat();

        try {
            // Cari semua contour
            cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            
            if (contours.size() === 0) {
                binaryMat.copyTo(resized); // fallback
                return resized;
            }

            // Gabungkan semua bounding rect
            let minX = binaryMat.cols, minY = binaryMat.rows, maxX = 0, maxY = 0;
            for (let i = 0; i < contours.size(); i++) {
                let rect = cv.boundingRect(contours.get(i));
                if (rect.width > 5 && rect.height > 5) { // Abaikan contour yang sangat kecil (noise sisa)
                    if (rect.x < minX) minX = rect.x;
                    if (rect.y < minY) minY = rect.y;
                    if (rect.x + rect.width > maxX) maxX = rect.x + rect.width;
                    if (rect.y + rect.height > maxY) maxY = rect.y + rect.height;
                }
            }
            
            // Validasi bbox
            if (maxX - minX <= 10 || maxY - minY <= 10) {
                binaryMat.copyTo(resized); // fallback jika tidak ada tulisan besar
            } else {
                let rect = new cv.Rect(minX, minY, maxX - minX, maxY - minY);
                cropped = binaryMat.roi(rect);
                
                // Aspect ratio preserving resize to 400x400
                let maxDim = Math.max(rect.width, rect.height);
                let scale = 400 / maxDim;
                let newW = Math.round(rect.width * scale);
                let newH = Math.round(rect.height * scale);

                let resizedTemp = new cv.Mat();
                cv.resize(cropped, resizedTemp, new cv.Size(newW, newH), 0, 0, cv.INTER_AREA);

                // Buat canvas hitam 400x400
                resized = cv.Mat.zeros(400, 400, cv.CV_8UC1);

                // Copy ke tengah
                let dx = Math.floor((400 - newW) / 2);
                let dy = Math.floor((400 - newH) / 2);
                let centerRoi = resized.roi(new cv.Rect(dx, dy, newW, newH));
                resizedTemp.copyTo(centerRoi);

                resizedTemp.delete();
                centerRoi.delete();
            }

            contours.delete(); hierarchy.delete(); cropped.delete();
            return resized;
        } catch(e) {
            console.error("[PREPROCESS] Error extracting ROI:", e);
            if(contours) contours.delete();
            if(hierarchy) hierarchy.delete();
            if(cropped) cropped.delete();
            if(resized) resized.delete();
            return binaryMat.clone();
        }
    }
};

/* ================================================================
   KAS KITA v3.0 — faceRecognition.js
   AI Face Recognition & Payment Prediction System
   ================================================================ */

'use strict';

const AI_STATE = {
  modelsLoaded: false,
  isScanning: false,
  stream: null,
  currentFacingMode: 'user', // 'user' or 'environment'
  faceMatcher: null,
  registeredStudents: [],
  animationFrameId: null
};

/** 
 * LAZY LOAD MODELS
 * Loads face-api models only when needed
 */
async function loadFaceApiModels() {
  if (AI_STATE.modelsLoaded) return true;
  showOverlay('Memuat Model AI...');
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    AI_STATE.modelsLoaded = true;
    hideOverlay();
    return true;
  } catch (error) {
    console.error('Error loading face-api models:', error);
    hideOverlay();
    toast('Gagal memuat model AI. Periksa koneksi internet.', 'error');
    return false;
  }
}

/** 
 * BUILD FACE MATCHER
 * Rebuilds the matcher from state.siswaData
 */
function buildFaceMatcher() {
  if (!state.siswaData || state.siswaData.length === 0) {
    AI_STATE.faceMatcher = null;
    return;
  }
  
  const labeledDescriptors = [];
  
  state.siswaData.forEach(siswa => {
    if (siswa.faceDescriptor) {
      try {
        let descArr;
        if (typeof siswa.faceDescriptor === 'string') {
          descArr = JSON.parse(siswa.faceDescriptor);
        } else {
          descArr = siswa.faceDescriptor;
        }
        
        // Ensure it's a Float32Array
        const float32Arr = new Float32Array(Object.values(descArr));
        if (float32Arr.length === 128) {
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(String(siswa.idSiswa), [float32Arr]));
        }
      } catch (e) {
        console.error(`Invalid descriptor for ${siswa.nama}:`, e);
      }
    }
  });

  if (labeledDescriptors.length > 0) {
    // 0.15 threshold is approx 85% match (1 - 0.15 = 0.85)
    AI_STATE.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.15);
  } else {
    AI_STATE.faceMatcher = null;
  }
}

/** 
 * OPEN SCANNER MODAL
 */
async function openAiScanner() {
  if (!state.currentUser) {
    return toast('Harap login untuk menggunakan AI Prediksi', 'warning');
  }

  // Load models first
  const loaded = await loadFaceApiModels();
  if (!loaded) return;

  // Build matcher
  buildFaceMatcher();
  if (!AI_STATE.faceMatcher) {
    toast('Belum ada data wajah siswa terdaftar.', 'warning');
  }

  const modal = document.getElementById('modalAiScanner');
  modal.classList.remove('hidden');
  
  startCamera(AI_STATE.currentFacingMode);
}

/** 
 * CLOSE SCANNER MODAL
 */
function closeAiScanner() {
  const modal = document.getElementById('modalAiScanner');
  modal.classList.add('hidden');
  stopCamera();
  if (AI_STATE.animationFrameId) {
    cancelAnimationFrame(AI_STATE.animationFrameId);
  }
}

/** 
 * START CAMERA
 */
async function startCamera(facingMode = 'user') {
  stopCamera();
  const video = document.getElementById('aiScannerVideo');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode }
    });
    video.srcObject = stream;
    AI_STATE.stream = stream;
    AI_STATE.currentFacingMode = facingMode;
    AI_STATE.isScanning = true;
    
    // Start holographic animation
    video.onplay = () => {
      startScannerAnimation(video);
    };
  } catch (err) {
    console.error('Kamera gagal diakses:', err);
    toast('Kamera tidak dapat diakses.', 'error');
  }
}

/** 
 * STOP CAMERA
 */
function stopCamera() {
  AI_STATE.isScanning = false;
  if (AI_STATE.stream) {
    AI_STATE.stream.getTracks().forEach(track => track.stop());
    AI_STATE.stream = null;
  }
}

/** 
 * SWITCH CAMERA
 */
function switchCamera() {
  const newMode = AI_STATE.currentFacingMode === 'user' ? 'environment' : 'user';
  startCamera(newMode);
}

/** 
 * SCANNER ANIMATION & LIVE DETECTION
 */
async function startScannerAnimation(video) {
  const canvas = document.getElementById('aiScannerCanvas');
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  const statusEl = document.getElementById('scannerStatusText');
  const scanLine = document.getElementById('scannerLine');
  
  async function detect() {
    if (!AI_STATE.isScanning) return;
    
    if (video.paused || video.ended) {
      AI_STATE.animationFrameId = requestAnimationFrame(detect);
      return;
    }

    try {
      const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detection) {
        const resizedDetection = faceapi.resizeResults(detection, displaySize);
        
        // Draw holographic detection box
        const box = resizedDetection.detection.box;
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw landmarks
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetection);

        // Position scanning line inside the box
        scanLine.style.display = 'block';
        scanLine.style.top = `${box.y}px`;
        scanLine.style.left = `${box.x}px`;
        scanLine.style.width = `${box.width}px`;
        scanLine.style.animation = `scan-y 2s linear infinite`;

        if (AI_STATE.faceMatcher) {
          const match = AI_STATE.faceMatcher.findBestMatch(detection.descriptor);
          
          if (match.label !== 'unknown') {
            const distance = match.distance;
            const confidence = Math.round((1 - distance) * 100);
            
            statusEl.innerHTML = `<span style="color:#00ff88">Wajah Cocok: ${confidence}%</span>`;
            
            // Auto Capture if > 85% and stable (for now just trigger immediately on good match)
            if (confidence >= 85) {
              AI_STATE.isScanning = false;
              stopCamera();
              processRecognitionResult(match.label, confidence);
              return; // Stop loop
            }
          } else {
            statusEl.innerHTML = `<span style="color:#ff3366">Tidak Dikenali</span>`;
          }
        } else {
          statusEl.innerHTML = `<span style="color:#ffcc00">Wajah Terdeteksi (Belum ada data DB)</span>`;
        }
      } else {
        scanLine.style.display = 'none';
        statusEl.innerHTML = 'Mencari Wajah...';
      }
    } catch (e) {
      console.error(e);
    }
    
    if (AI_STATE.isScanning) {
      AI_STATE.animationFrameId = requestAnimationFrame(detect);
    }
  }
  
  detect();
}

/**
 * PROCESS MATCH & SHOW RESULT
 */
function processRecognitionResult(idSiswa, confidence) {
  closeAiScanner();
  
  // Find siswa data
  const siswa = state.siswaData.find(s => String(s.idSiswa) === String(idSiswa));
  if (!siswa) {
    return toast('Data siswa tidak ditemukan', 'error');
  }

  // Analytics
  const kasRecords = state.kasData.filter(k => 
    String(k.nama).toLowerCase() === String(siswa.nama).toLowerCase()
  );

  let totalAmount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  
  kasRecords.forEach(r => {
    totalAmount += Number(r.nominal || 0);
    if (String(r.status).toLowerCase().includes('tepat waktu')) {
      onTimeCount++;
    } else {
      lateCount++;
    }
  });

  const totalTx = kasRecords.length;
  const discipline = totalTx > 0 ? Math.round((onTimeCount / totalTx) * 100) : 0;

  // Prediction AI
  let predictedDateStr = 'Belum ada data cukup';
  let riskLevel = 'Unknown';
  let riskColor = '#fff';

  if (totalTx >= 2) {
    // Sort records by date
    const sorted = [...kasRecords].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
    let totalInterval = 0;
    
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i-1].tanggal);
      const d2 = new Date(sorted[i].tanggal);
      totalInterval += (d2 - d1) / (1000 * 60 * 60 * 24);
    }
    const avgInterval = totalInterval / (sorted.length - 1);
    
    const lastDate = new Date(sorted[sorted.length-1].tanggal);
    const nextDate = new Date(lastDate.getTime() + (avgInterval * 24 * 60 * 60 * 1000));
    predictedDateStr = nextDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

    // Risk Level
    if (discipline >= 90) { riskLevel = 'Excellent'; riskColor = '#00ff88'; }
    else if (discipline >= 70) { riskLevel = 'Good'; riskColor = '#00f3ff'; }
    else if (discipline >= 50) { riskLevel = 'Warning'; riskColor = '#ffcc00'; }
    else { riskLevel = 'High Risk'; riskColor = '#ff3366'; }
  } else if (totalTx === 1) {
    riskLevel = 'Good'; riskColor = '#00f3ff';
    const d = new Date(kasRecords[0].tanggal);
    d.setMonth(d.getMonth() + 1); // predict next month roughly
    predictedDateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Update UI
  let confColor = '#00ff88';
  if (confidence < 85 && confidence >= 70) confColor = '#ffcc00';
  else if (confidence < 70) confColor = '#ff3366';

  document.getElementById('aiResConfidence').innerHTML = `Face Match: <span style="color:${confColor}">${confidence}%</span>`;
  document.getElementById('aiResName').textContent = siswa.nama;
  document.getElementById('aiResClass').textContent = `${siswa.kelas} - ${siswa.jurusan}`;

  document.getElementById('aiResTotalAmount').textContent = rupiah(totalAmount);
  document.getElementById('aiResTotalTx').textContent = totalTx;
  document.getElementById('aiResOnTime').textContent = onTimeCount;
  document.getElementById('aiResLate').textContent = lateCount;
  
  const disEl = document.getElementById('aiResDiscipline');
  disEl.textContent = `${discipline}%`;
  disEl.style.color = discipline >= 80 ? '#00ff88' : (discipline >= 50 ? '#ffcc00' : '#ff3366');

  document.getElementById('aiResNextDate').textContent = predictedDateStr;
  
  const riskEl = document.getElementById('aiResRisk');
  riskEl.textContent = riskLevel;
  riskEl.style.color = riskColor;

  document.getElementById('modalAiResult').classList.remove('hidden');
}

function closeAiResult() {
  document.getElementById('modalAiResult').classList.add('hidden');
}

/**
 * STUDENT FACE REGISTRATION
 */
function openFaceRegistration() {
  document.getElementById('modalFaceRegistration').classList.remove('hidden');
}

function closeFaceRegistration() {
  document.getElementById('modalFaceRegistration').classList.add('hidden');
  stopRegistrationCamera();
}

async function startRegistrationCamera() {
  const video = document.getElementById('regFaceVideo');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    window.regStream = stream;
    document.getElementById('regCamContainer').classList.remove('hidden');
    document.getElementById('regCaptureBtn').classList.remove('hidden');
  } catch (e) {
    toast('Gagal akses kamera.', 'error');
  }
}

function stopRegistrationCamera() {
  if (window.regStream) {
    window.regStream.getTracks().forEach(t => t.stop());
    window.regStream = null;
  }
  document.getElementById('regCamContainer').classList.add('hidden');
  document.getElementById('regCaptureBtn').classList.add('hidden');
}

async function captureFaceRegistration() {
  const video = document.getElementById('regFaceVideo');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  
  stopRegistrationCamera();
  await processFaceRegistration(canvas);
}

async function handleFaceUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 800;
    let w = img.width;
    let h = img.height;
    if (w > MAX_WIDTH) {
      h = Math.round(h * (MAX_WIDTH / w));
      w = MAX_WIDTH;
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    await processFaceRegistration(canvas);
  };
}

async function processFaceRegistration(canvas) {
  showOverlay('Mendeteksi Wajah...');
  await loadFaceApiModels();
  
  try {
    const detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    
    if (!detection) {
      hideOverlay();
      return toast('Wajah tidak terdeteksi atau gambar terlalu buram.', 'error');
    }

    const descriptorArr = Array.from(detection.descriptor);
    
    // Preview
    document.getElementById('regFacePreview').src = canvas.toDataURL('image/jpeg', 0.8);
    document.getElementById('regFacePreviewContainer').classList.remove('hidden');
    
    // Store temporarily
    window.tempFaceDescriptor = JSON.stringify(descriptorArr);
    
    hideOverlay();
    toast('Wajah terdeteksi! Silakan simpan data.', 'success');

  } catch (e) {
    hideOverlay();
    toast('Gagal memproses wajah.', 'error');
    console.error(e);
  }
}

async function simpanSiswaRegistration() {
  const nama = document.getElementById('regSiswaNama').value.trim();
  const kelas = document.getElementById('regSiswaKelas').value.trim();
  const jurusan = document.getElementById('regSiswaJurusan').value.trim();
  const desc = window.tempFaceDescriptor;

  if (!nama || !kelas || !jurusan) return toast('Harap lengkapi Nama, Kelas, dan Jurusan', 'warning');
  if (!desc) return toast('Harap ambil/upload foto wajah', 'warning');

  showOverlay('Menyimpan Data Siswa...');
  try {
    const newSiswa = {
      idSiswa: genId(),
      nama: nama,
      kelas: kelas,
      jurusan: jurusan,
      faceDescriptor: desc,
      createdAt: new Date().toISOString()
    };

    await gasPost({
      action: 'insert',
      table: 'siswa',
      data: newSiswa
    });
    
    // Update local state
    if (!state.siswaData) state.siswaData = [];
    state.siswaData.push(newSiswa);
    buildFaceMatcher();

    hideOverlay();
    toast('Data Siswa berhasil disimpan', 'success');
    closeFaceRegistration();

    // Reset Form
    document.getElementById('regSiswaNama').value = '';
    document.getElementById('regSiswaKelas').value = '';
    document.getElementById('regSiswaJurusan').value = '';
    document.getElementById('regFacePreviewContainer').classList.add('hidden');
    window.tempFaceDescriptor = null;

  } catch (e) {
    hideOverlay();
    toast('Gagal menyimpan data siswa: ' + e.message, 'error');
  }
}

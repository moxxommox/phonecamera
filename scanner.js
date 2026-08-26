let scanner = null;
let cameras = [];
let cameraIndex = 0;
let lastCode = '';
let lastScanAt = 0;

const statusEl = document.getElementById('status');
const lastScanEl = document.getElementById('lastScan');
const switchBtn = document.getElementById('switchBtn');
const restartBtn = document.getElementById('restartBtn');
const closeBtn = document.getElementById('closeBtn');

function setStatus(text) {
  statusEl.textContent = text;
}

function sendBarcode(code) {
  const message = { type: 'PET_ALLIANCE_BARCODE', barcode: String(code) };

  // Preferred path when opened by the Apps Script ordering window.
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(message, '*');
  }

  // Also support a parent window if this page is ever hosted in a permitted frame.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, '*');
  }

  // Store the latest value as a simple fallback/debug aid.
  try {
    localStorage.setItem('petAllianceLastBarcode', String(code));
    localStorage.setItem('petAllianceLastBarcodeAt', String(Date.now()));
  } catch (_) {}
}

function onScanSuccess(decodedText) {
  const code = String(decodedText || '').trim();
  if (!code) return;

  const now = Date.now();
  if (code === lastCode && now - lastScanAt < 1800) return;

  lastCode = code;
  lastScanAt = now;
  lastScanEl.textContent = `Last scan: ${code}`;
  setStatus('Barcode sent to ordering app. Ready for next scan.');
  sendBarcode(code);

  if (navigator.vibrate) navigator.vibrate(80);
}

function onScanFailure() {
  // Normal while the camera is searching; intentionally silent.
}

async function stopScanner() {
  if (!scanner) return;
  try {
    const state = scanner.getState ? scanner.getState() : null;
    if (state === 2 || state === 3) await scanner.stop();
  } catch (_) {}
  try { await scanner.clear(); } catch (_) {}
  scanner = null;
}

function findRearCameraIndex() {
  const rearPattern = /(back|rear|environment|world)/i;
  const rearIndex = cameras.findIndex((camera) => rearPattern.test(camera.label || ''));
  return rearIndex >= 0 ? rearIndex : 0;
}

async function startScanner(index = null) {
  await stopScanner();
  setStatus('Starting camera…');

  scanner = new Html5Qrcode('reader');

  try {
    cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) throw new Error('No camera was found.');

    let cameraChoice;
    if (index === null) {
      // Ask the browser for the rear camera on every fresh scanner launch.
      cameraIndex = findRearCameraIndex();
      cameraChoice = { facingMode: 'environment' };
    } else {
      cameraIndex = ((index % cameras.length) + cameras.length) % cameras.length;
      cameraChoice = cameras[cameraIndex].id;
    }

    await scanner.start(
      cameraChoice,
      {
        fps: 12,
        qrbox: (viewWidth, viewHeight) => {
          const width = Math.floor(Math.min(viewWidth * 0.9, 420));
          const height = Math.floor(Math.min(viewHeight * 0.35, 150));
          return { width, height };
        },
        aspectRatio: 1.777778,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ]
      },
      onScanSuccess,
      onScanFailure
    );

    setStatus('Camera ready — point it at a barcode.');
    switchBtn.disabled = cameras.length < 2;
  } catch (error) {
    console.error(error);
    const name = error && error.name ? error.name : '';
    const msg = error && error.message ? error.message : String(error || 'Unknown camera error');
    if (name === 'NotAllowedError' || /permission|notallowed/i.test(msg)) {
      setStatus('Camera permission was denied. Allow camera access for this site, then tap Restart.');
    } else {
      setStatus(`Camera could not start: ${msg}`);
    }
  }
}

switchBtn.addEventListener('click', () => startScanner(cameraIndex + 1));
restartBtn.addEventListener('click', () => startScanner(cameraIndex));
closeBtn.addEventListener('click', async () => {
  await stopScanner();
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'PET_ALLIANCE_SCANNER_CLOSED' }, '*');
    window.close();
  } else {
    setStatus('Scanner stopped. You can close this window.');
  }
});

window.addEventListener('beforeunload', () => {
  if (scanner) scanner.stop().catch(() => {});
});

window.addEventListener('load', () => startScanner());

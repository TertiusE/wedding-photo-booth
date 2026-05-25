const cameraPreview = document.querySelector("#cameraPreview");
const captureCanvas = document.querySelector("#captureCanvas");
const captureButton = document.querySelector("#captureButton");
const retakeButton = document.querySelector("#retakeButton");
const openFolderButton = document.querySelector("#openFolderButton");
const cameraSelect = document.querySelector("#cameraSelect");
const cameraStatus = document.querySelector("#cameraStatus");
const countdown = document.querySelector("#countdown");
const filenamePrefix = document.querySelector("#filenamePrefix");
const chooseFolderButton = document.querySelector("#chooseFolderButton");
const saveFolder = document.querySelector("#saveFolder");
const autoSave = document.querySelector("#autoSave");
const driveEnabled = document.querySelector("#driveEnabled");
const driveFolderId = document.querySelector("#driveFolderId");
const driveApiKey = document.querySelector("#driveApiKey");
const driveAccessToken = document.querySelector("#driveAccessToken");
const lastPhoto = document.querySelector("#lastPhoto");
const saveStatus = document.querySelector("#saveStatus");
const openSettingsButton = document.querySelector("#openSettingsButton");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const settingsPanel = document.querySelector("#settingsPanel");
const doneButton = document.querySelector("#doneButton");
const singleModeButton = document.querySelector("#singleModeButton");
const stripModeButton = document.querySelector("#stripModeButton");
const kioskMode = document.querySelector("#kioskMode");
const settingsPin = document.querySelector("#settingsPin");
const idleResetSeconds = document.querySelector("#idleResetSeconds");

const settingsFields = [
  filenamePrefix,
  saveFolder,
  autoSave,
  driveEnabled,
  driveFolderId,
  driveApiKey,
  driveAccessToken,
  kioskMode,
  settingsPin,
  idleResetSeconds
];

let currentStream;
let lastSavedDirectory;
let lastCaptureDataUrl;
const isDesktopApp = Boolean(window.photoBooth);
let selectedCameraId = "";
let captureMode = "single";
let idleResetTimer;

function getSettings() {
  return JSON.parse(localStorage.getItem("photoBoothSettings") || "{}");
}

function settingsRequirePin() {
  const saved = getSettings();
  return saved.kioskMode !== false && Boolean(saved.settingsPin || "1024");
}

function requestSettingsAccess() {
  if (!settingsRequirePin() || settingsPanel.classList.contains("is-open")) {
    return true;
  }

  const saved = getSettings();
  const expectedPin = saved.settingsPin || "1024";
  const enteredPin = window.prompt("Settings PIN");
  return enteredPin === expectedPin;
}

function openSettings() {
  if (!requestSettingsAccess()) {
    saveStatus.textContent = "Settings are locked for kiosk mode.";
    return;
  }

  settingsPanel.classList.add("is-open");
  settingsPanel.setAttribute("aria-hidden", "false");
  if (window.location.hash !== "#settings") {
    history.replaceState(null, "", "#settings");
  }
}

function closeSettings() {
  settingsPanel.classList.remove("is-open");
  settingsPanel.setAttribute("aria-hidden", "true");
  if (window.location.hash === "#settings") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function loadSettings() {
  const saved = getSettings();
  filenamePrefix.value = saved.filenamePrefix || "natasha-tertius-wedding";
  saveFolder.value = saved.saveFolder || "";
  autoSave.checked = saved.autoSave !== false;
  driveEnabled.checked = Boolean(saved.driveEnabled);
  driveFolderId.value = saved.driveFolderId || "";
  driveApiKey.value = saved.driveApiKey || "";
  driveAccessToken.value = saved.driveAccessToken || "";
  kioskMode.checked = saved.kioskMode !== false;
  settingsPin.value = saved.settingsPin || "1024";
  idleResetSeconds.value = String(saved.idleResetSeconds ?? 45);
}

function persistSettings() {
  localStorage.setItem(
    "photoBoothSettings",
    JSON.stringify({
      filenamePrefix: filenamePrefix.value,
      saveFolder: saveFolder.value,
      autoSave: autoSave.checked,
      driveEnabled: driveEnabled.checked,
      driveFolderId: driveFolderId.value,
      driveApiKey: driveApiKey.value,
      driveAccessToken: driveAccessToken.value,
      kioskMode: kioskMode.checked,
      settingsPin: settingsPin.value,
      idleResetSeconds: Number(idleResetSeconds.value) || 0
    })
  );
}

settingsFields.forEach((field) => {
  field.addEventListener("input", persistSettings);
  field.addEventListener("change", persistSettings);
});

openSettingsButton.addEventListener("click", openSettings);
closeSettingsButton.addEventListener("click", closeSettings);
doneButton.addEventListener("click", resetGuestScreen);

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName);

  if (event.key === "Escape") {
    closeSettings();
  }

  if (isTyping || settingsPanel.classList.contains("is-open")) {
    return;
  }

  if ((event.key === " " || event.key === "Enter") && !captureButton.disabled) {
    event.preventDefault();
    captureAndSave();
  }

  if (event.key.toLowerCase() === "s") {
    openSettings();
  }
});

window.addEventListener("hashchange", () => {
  if (window.location.hash === "#settings") {
    openSettings();
  } else {
    closeSettings();
  }
});

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cameraStatus.textContent = "Camera access needs Safari/Chrome over HTTPS.";
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");

  cameraSelect.innerHTML = "";

  cameras.forEach((camera, index) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    cameraSelect.appendChild(option);
  });

  if (selectedCameraId && cameras.some((camera) => camera.deviceId === selectedCameraId)) {
    cameraSelect.value = selectedCameraId;
  }

  cameraStatus.textContent = cameras.length
    ? `${cameras.length} camera input${cameras.length === 1 ? "" : "s"} available.`
    : "No camera inputs found.";
}

function stopCurrentStream() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  currentStream = null;
  cameraPreview.pause();
  cameraPreview.srcObject = null;
  cameraPreview.removeAttribute("src");
  cameraPreview.load();
}

function waitForVideoMetadata() {
  return new Promise((resolve, reject) => {
    if (cameraPreview.videoWidth && cameraPreview.videoHeight) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for camera metadata."));
    }, 5000);

    function cleanup() {
      window.clearTimeout(timeout);
      cameraPreview.removeEventListener("loadedmetadata", handleLoaded);
      cameraPreview.removeEventListener("error", handleError);
    }

    function handleLoaded() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error("Camera failed to load."));
    }

    cameraPreview.addEventListener("loadedmetadata", handleLoaded, { once: true });
    cameraPreview.addEventListener("error", handleError, { once: true });
  });
}

function applyCameraAspectRatio() {
  const width = cameraPreview.videoWidth;
  const height = cameraPreview.videoHeight;

  if (!width || !height) {
    return;
  }

  document.documentElement.style.setProperty("--camera-ratio", String(width / height));
}

async function requestCameraStream(deviceId, useFallback = false) {
  const video = useFallback
    ? {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : "user"
      }
    : {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };

  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

async function startCamera(deviceId = "") {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access needs Safari/Chrome over HTTPS.");
  }

  captureButton.disabled = true;
  selectedCameraId = deviceId;
  stopCurrentStream();

  try {
    currentStream = await requestCameraStream(deviceId);
  } catch (error) {
    currentStream = await requestCameraStream(deviceId, true);
  }

  cameraPreview.srcObject = currentStream;
  await waitForVideoMetadata();
  applyCameraAspectRatio();
  await cameraPreview.play();
  await sleep(500);
  await listCameras();
  captureButton.disabled = false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCountdown() {
  countdown.classList.add("is-visible");

  for (const value of ["3", "2", "1"]) {
    countdown.textContent = value;
    await sleep(700);
  }

  countdown.textContent = "♥";
  await sleep(300);
  countdown.classList.remove("is-visible");
  countdown.textContent = "";
}

function resetIdleTimer() {
  window.clearTimeout(idleResetTimer);

  const seconds = Number(idleResetSeconds.value) || 0;
  if (!seconds) {
    return;
  }

  idleResetTimer = window.setTimeout(resetGuestScreen, seconds * 1000);
}

function resetGuestScreen() {
  window.clearTimeout(idleResetTimer);
  lastCaptureDataUrl = null;
  lastPhoto.removeAttribute("src");
  lastPhoto.classList.remove("has-photo");
  retakeButton.disabled = true;
  saveStatus.textContent = "Ready for another photo.";
}

function renderPhotoFrame(dataUrl) {
  lastPhoto.src = dataUrl;
  lastPhoto.classList.add("has-photo");
  retakeButton.disabled = false;
}

function captureFrame() {
  const width = cameraPreview.videoWidth || 1920;
  const height = cameraPreview.videoHeight || 1080;
  const context = captureCanvas.getContext("2d");
  captureCanvas.width = width;
  captureCanvas.height = height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(cameraPreview, 0, 0, width, height);

  const pad = Math.round(Math.min(width, height) * 0.045);
  const titleSize = Math.round(Math.min(width, height) * 0.075);
  const labelSize = Math.round(Math.min(width, height) * 0.018);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.72)";
  context.shadowBlur = Math.round(Math.min(width, height) * 0.018);
  context.fillStyle = "#fffdf9";
  context.textAlign = "left";
  context.font = `${titleSize}px serif`;
  context.fillText("Natasha & Tertius", pad, pad + titleSize);
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255, 253, 249, 0.84)";
  context.font = `800 ${labelSize}px sans-serif`;
  context.letterSpacing = `${Math.max(1, Math.round(labelSize * 0.12))}px`;
  context.fillText("WEDDING PHOTO BOOTH", pad, pad + titleSize + labelSize * 1.65);
  context.restore();

  return captureCanvas.toDataURL("image/png");
}

function drawPhotoFrame(context, dataUrl, x, y, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, x, y, width, height);
      resolve();
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function captureStrip() {
  const frames = [];

  for (let index = 0; index < 3; index += 1) {
    saveStatus.textContent = `Shot ${index + 1} of 3...`;
    await runCountdown();
    frames.push(captureFrame());
    await sleep(350);
  }

  const sourceWidth = cameraPreview.videoWidth || 1920;
  const sourceHeight = cameraPreview.videoHeight || 1080;
  const stripWidth = 1400;
  const stripHeight = 2400;
  const margin = 90;
  const gap = 48;
  const labelHeight = 190;
  const photoWidth = stripWidth - margin * 2;
  const photoHeight = Math.round((stripHeight - margin * 2 - gap * 2 - labelHeight) / 3);
  const context = captureCanvas.getContext("2d");

  captureCanvas.width = stripWidth;
  captureCanvas.height = stripHeight;
  context.fillStyle = "#fffdf9";
  context.fillRect(0, 0, stripWidth, stripHeight);

  for (let index = 0; index < frames.length; index += 1) {
    const y = margin + index * (photoHeight + gap);
    context.save();
    context.beginPath();
    context.rect(margin, y, photoWidth, photoHeight);
    context.clip();

    const scale = Math.max(photoWidth / sourceWidth, photoHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    await drawPhotoFrame(context, frames[index], margin + (photoWidth - drawWidth) / 2, y + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }

  context.fillStyle = "#2d2823";
  context.textAlign = "center";
  context.font = "92px serif";
  context.fillText("Natasha & Tertius", stripWidth / 2, stripHeight - 100);
  context.fillStyle = "#756c64";
  context.font = "800 28px sans-serif";
  context.fillText("WEDDING PHOTO BOOTH", stripWidth / 2, stripHeight - 54);

  return captureCanvas.toDataURL("image/png");
}

async function saveLocally(dataUrl) {
  if (!isDesktopApp) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${filenamePrefix.value || "wedding-photo"}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
    return { path: "Downloaded to the iPad/browser downloads folder.", directory: "" };
  }

  if (saveFolder.value) {
    return window.photoBooth.savePhotoToFolder({
      dataUrl,
      folder: saveFolder.value,
      filenamePrefix: filenamePrefix.value
    });
  }

  return window.photoBooth.savePhoto({
    dataUrl,
    filenamePrefix: filenamePrefix.value
  });
}

function dataUrlToBlob(dataUrl) {
  const [metadata, base64] = dataUrl.split(",");
  const mime = metadata.match(/data:(.*);base64/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

async function uploadToDrive(dataUrl) {
  if (!driveEnabled.checked) {
    return { skipped: true, reason: "Drive upload is disabled." };
  }

  if (!driveFolderId.value || !driveAccessToken.value) {
    return { skipped: true, reason: "Drive upload needs a folder ID and OAuth access token." };
  }

  const boundary = `photo_booth_${Date.now()}`;
  const filename = `${filenamePrefix.value || "wedding-photo"}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  const metadata = {
    name: filename,
    parents: [driveFolderId.value]
  };
  const blob = dataUrlToBlob(dataUrl);
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: image/png\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${driveAccessToken.value}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive upload failed: ${detail}`);
  }

  return response.json();
}

async function captureAndSave() {
  captureButton.disabled = true;
  saveStatus.textContent = "Getting ready...";

  try {
    const dataUrl = captureMode === "strip" ? await captureStrip() : await captureSingle();
    lastCaptureDataUrl = dataUrl;
    renderPhotoFrame(dataUrl);

    const outcomes = [];

    if (autoSave.checked || !isDesktopApp) {
      const saved = await saveLocally(dataUrl);
      lastSavedDirectory = saved.directory;
      openFolderButton.disabled = !lastSavedDirectory;
      outcomes.push(`Saved locally: ${saved.path}`);
    }

    const driveResult = await uploadToDrive(dataUrl);
    if (driveResult.skipped) {
      outcomes.push(driveResult.reason);
    } else {
      outcomes.push("Uploaded to Google Drive.");
    }

    saveStatus.textContent = outcomes.join(" ");
    resetIdleTimer();
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener("click", captureAndSave);

async function captureSingle() {
  await runCountdown();
  return captureFrame();
}

function setCaptureMode(mode) {
  captureMode = mode;
  singleModeButton.classList.toggle("is-active", mode === "single");
  stripModeButton.classList.toggle("is-active", mode === "strip");
}

singleModeButton.addEventListener("click", () => setCaptureMode("single"));
stripModeButton.addEventListener("click", () => setCaptureMode("strip"));

retakeButton.addEventListener("click", resetGuestScreen);

openFolderButton.addEventListener("click", async () => {
  if (lastSavedDirectory && isDesktopApp) {
    await window.photoBooth.openPath(lastSavedDirectory);
  }
});

chooseFolderButton.addEventListener("click", async () => {
  if (!isDesktopApp) {
    saveStatus.textContent = "On iPad, photos download through the browser. Use Files or Photos to move them later.";
    return;
  }

  const folder = await window.photoBooth.chooseSaveFolder();
  if (folder) {
    saveFolder.value = folder;
    persistSettings();
  }
});

cameraSelect.addEventListener("change", async () => {
  try {
    cameraStatus.textContent = "Switching camera...";
    await startCamera(cameraSelect.value);
    cameraStatus.textContent = "Camera ready.";
  } catch (error) {
    cameraStatus.textContent = error.message;
    captureButton.disabled = false;
  }
});

window.addEventListener("resize", applyCameraAspectRatio);
window.addEventListener("orientationchange", () => {
  window.setTimeout(applyCameraAspectRatio, 250);
});

window.addEventListener("beforeunload", () => {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }
});

loadSettings();

if (window.location.hash === "#settings") {
  openSettings();
}

if (!isDesktopApp) {
  saveFolder.placeholder = "iPad/browser download location";
  chooseFolderButton.disabled = true;
  openFolderButton.textContent = "Downloads";
}

startCamera()
  .then(() => {
    cameraStatus.textContent = "Camera ready.";
  })
  .catch((error) => {
    cameraStatus.textContent = `Camera permission needed: ${error.message}`;
  });

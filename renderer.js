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

const settingsFields = [
  filenamePrefix,
  saveFolder,
  autoSave,
  driveEnabled,
  driveFolderId,
  driveApiKey,
  driveAccessToken
];

let currentStream;
let lastSavedDirectory;
let lastCaptureDataUrl;
const isDesktopApp = Boolean(window.photoBooth);
let selectedCameraId = "";

function openSettings() {
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
  const saved = JSON.parse(localStorage.getItem("photoBoothSettings") || "{}");
  filenamePrefix.value = saved.filenamePrefix || "natasha-tertius-wedding";
  saveFolder.value = saved.saveFolder || "";
  autoSave.checked = saved.autoSave !== false;
  driveEnabled.checked = Boolean(saved.driveEnabled);
  driveFolderId.value = saved.driveFolderId || "";
  driveApiKey.value = saved.driveApiKey || "";
  driveAccessToken.value = saved.driveAccessToken || "";
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
      driveAccessToken: driveAccessToken.value
    })
  );
}

settingsFields.forEach((field) => {
  field.addEventListener("input", persistSettings);
  field.addEventListener("change", persistSettings);
});

openSettingsButton.addEventListener("click", openSettings);
closeSettingsButton.addEventListener("click", closeSettings);
doneButton.addEventListener("click", openSettings);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettings();
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
    await runCountdown();
    const dataUrl = captureFrame();
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
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener("click", captureAndSave);

retakeButton.addEventListener("click", () => {
  lastCaptureDataUrl = null;
  lastPhoto.removeAttribute("src");
  lastPhoto.classList.remove("has-photo");
  retakeButton.disabled = true;
  saveStatus.textContent = "Ready for another photo.";
});

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

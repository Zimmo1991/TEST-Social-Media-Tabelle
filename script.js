const dropZone = document.querySelector("#drop-zone");
const input = document.querySelector("#file-input");
const placeholder = document.querySelector("#placeholder");
const preview = document.querySelector("#preview");
const removeButton = document.querySelector("#remove-button");
const postText = document.querySelector("#post-text");
const count = document.querySelector("#character-count");
let previewUrl;

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  preview.replaceChildren();
  preview.hidden = true;
  placeholder.hidden = false;
  removeButton.hidden = true;
  input.value = "";
}

function showFile(file) {
  if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
    alert("Bitte wähle eine Bild- oder Videodatei aus.");
    return;
  }
  clearPreview();
  previewUrl = URL.createObjectURL(file);
  const isImage = file.type.startsWith("image/");
  const media = document.createElement(isImage ? "img" : "video");
  media.src = previewUrl;
  if (isImage) media.alt = `Vorschau von ${file.name}`;
  else { media.controls = true; media.setAttribute("aria-label", `Vorschau von ${file.name}`); }
  preview.append(media);
  placeholder.hidden = true;
  preview.hidden = false;
  removeButton.hidden = false;
}

dropZone.addEventListener("click", e => { if (!(e.target instanceof HTMLVideoElement)) input.click(); });
dropZone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
});
input.addEventListener("change", () => showFile(input.files[0]));
["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, e => {
  e.preventDefault(); dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, e => {
  e.preventDefault(); dropZone.classList.remove("dragging");
}));
dropZone.addEventListener("drop", e => showFile(e.dataTransfer.files[0]));
removeButton.addEventListener("click", clearPreview);
postText.addEventListener("input", () => { count.textContent = postText.value.length; });
window.addEventListener("beforeunload", () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });

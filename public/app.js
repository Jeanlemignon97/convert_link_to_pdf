const form = document.querySelector("#convert-form");
const bulkInput = document.querySelector("#bulk-links");
const linkList = document.querySelector("#link-list");
const addLinkButton = document.querySelector("#add-link");
const forceZipCheckbox = document.querySelector("#force-zip");
const submitButton = document.querySelector("#submit-button");
const submitLabel = document.querySelector("#submit-label");
const linkCount = document.querySelector("#link-count");
const exportType = document.querySelector("#export-type");
const exportCount = document.querySelector("#export-count");
const formatNote = document.querySelector("#format-note");
const message = document.querySelector("#message");

function extractLinks(input) {
  const matches = input.match(/https?:\/\/[^\s,;"'<>]+/gi) || [];
  return [...new Set(matches.map((link) => link.replace(/[.)\]}]+$/g, "")))];
}

function currentManualLinks() {
  return [...linkList.querySelectorAll(".link-input")]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function currentLinks() {
  return [...new Set([...extractLinks(bulkInput.value), ...currentManualLinks()])];
}

function updateSummary() {
  const count = currentLinks().length;
  const forceZip = forceZipCheckbox.checked;
  const type = forceZip || count > 1 ? "ZIP" : "PDF";

  linkCount.textContent = String(count);
  exportType.textContent = type;
  exportCount.textContent = `${count} ${count > 1 ? "fichiers" : "fichier"}`;
  formatNote.textContent =
    forceZip || count > 1
      ? "La conversion produira un fichier ZIP."
      : "Un lien genere un PDF direct.";
}

function createLinkRow(value = "") {
  const row = document.createElement("div");
  row.className = "link-row";

  const input = document.createElement("input");
  input.className = "link-input";
  input.type = "url";
  input.placeholder = "https://...";
  input.value = value;
  input.addEventListener("input", updateSummary);

  const removeButton = document.createElement("button");
  removeButton.className = "icon-button";
  removeButton.type = "button";
  removeButton.title = "Retirer ce lien";
  removeButton.setAttribute("aria-label", "Retirer ce lien");
  removeButton.textContent = "x";
  removeButton.addEventListener("click", () => {
    row.remove();
    if (linkList.children.length === 0) {
      createLinkRow();
    }
    updateSummary();
  });

  row.append(input, removeButton);
  linkList.append(row);
}

function fileNameFromResponse(response) {
  const header = response.headers.get("content-disposition") || "";
  const match = header.match(/filename="?([^"]+)"?/i);
  return match?.[1] || "converted-content.pdf";
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function submitConversion(event) {
  event.preventDefault();

  const links = currentLinks();
  if (links.length === 0) {
    setMessage("Ajoute au moins un lien avant de lancer la conversion.", true);
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = "Conversion...";
  setMessage("Conversion en cours. Garde cette page ouverte pendant la generation.");

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: bulkInput.value,
        links: currentManualLinks(),
        forceZip: forceZipCheckbox.checked
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "La conversion a echoue.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileNameFromResponse(response);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);

    setMessage(links.length > 1 ? "ZIP genere et telecharge." : "PDF genere et telecharge.");
  } catch (error) {
    const text = error instanceof Error ? error.message : "Erreur inconnue.";
    setMessage(text, true);
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = "Generer";
  }
}

bulkInput.addEventListener("input", updateSummary);
forceZipCheckbox.addEventListener("change", updateSummary);
addLinkButton.addEventListener("click", () => {
  createLinkRow();
  linkList.lastElementChild?.querySelector("input")?.focus();
  updateSummary();
});
form.addEventListener("submit", submitConversion);

createLinkRow();
updateSummary();

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";

const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const imageMimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};
const maximumImageBytes = 20 * 1024 * 1024;
const maximumPdfBytes = 15 * 1024 * 1024;
const maximumCandidateImages = 6;

export function aiAgentConfiguration() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY) || process.env.AI_AGENT_DRY_RUN === "true",
    dryRun: process.env.AI_AGENT_DRY_RUN === "true",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  };
}

export function normalizeStringList(value, maximumItems = 20) {
  const values = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return [...new Set(values.map(entry => String(entry || "").trim()).filter(Boolean))].slice(0, maximumItems);
}

export function normalizeFieldMapping(value = {}) {
  const german = String(value.german || "text").trim();
  const italian = String(value.italian || "textItalian").trim();
  const validKey = key => /^(text|textItalian|custom-[a-zA-Z0-9_-]{1,80})$/.test(key);
  if (!validKey(german) || !validKey(italian)) {
    const error = new Error("Die Feldzuordnung enthält eine ungültige Zielspalte.");
    error.statusCode = 400;
    throw error;
  }
  return { german, italian };
}

export function validateCustomerAiConfiguration(input = {}) {
  const tableId = String(input.tableId || "").trim();
  const tableName = String(input.tableName || "").trim();
  const enabled = Boolean(input.enabled);
  const imageFolder = String(input.imageFolder || "").trim();
  const allowedWebsites = normalizeStringList(input.allowedWebsites, 12);
  const pdfFiles = normalizeStringList(input.pdfFiles, 12);
  const tone = String(input.tone || "").trim().slice(0, 1000);
  const forbiddenTerms = normalizeStringList(input.forbiddenTerms, 100);
  const notes = String(input.notes || "").trim().slice(0, 4000);
  const fieldMapping = normalizeFieldMapping(input.fieldMapping);

  if (!tableId || tableId.length > 150 || !tableName || tableName.length > 250) {
    const error = new Error("Die Kundentabelle ist ungültig.");
    error.statusCode = 400;
    throw error;
  }
  if (enabled && !imageFolder) {
    const error = new Error("Wähle zuerst genau einen Bildordner für diesen Kunden aus.");
    error.statusCode = 400;
    throw error;
  }
  if (imageFolder && !isAbsolute(imageFolder)) {
    const error = new Error("Der Bildordner muss als vollständiger Ordnerpfad angegeben werden.");
    error.statusCode = 400;
    throw error;
  }
  allowedWebsites.forEach(validatePublicWebsiteUrl);
  pdfFiles.forEach(filePath => {
    if (!isAbsolute(filePath) || extname(filePath).toLowerCase() !== ".pdf") {
      const error = new Error("PDF-Quellen müssen als vollständige Pfade zu einzelnen PDF-Dateien angegeben werden.");
      error.statusCode = 400;
      throw error;
    }
  });
  return { tableId, tableName, enabled, imageFolder, allowedWebsites, pdfFiles, tone, forbiddenTerms, notes, fieldMapping };
}

function safeRealDirectory(folder) {
  try {
    const absolute = resolve(folder);
    const info = lstatSync(absolute);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
    return realpathSync(absolute);
  } catch {
    const error = new Error("Der freigegebene Bildordner existiert nicht oder ist nicht zugänglich.");
    error.statusCode = 409;
    throw error;
  }
}

export function listDirectCustomerImages(folder, usedHashes = new Set()) {
  const realFolder = safeRealDirectory(folder);
  const candidates = [];
  for (const entry of readdirSync(realFolder, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (!allowedImageExtensions.has(extension)) continue;
    const candidatePath = resolve(realFolder, entry.name);
    let realCandidate;
    try {
      realCandidate = realpathSync(candidatePath);
      const info = lstatSync(candidatePath);
      if (!info.isFile() || info.isSymbolicLink() || dirname(realCandidate) !== realFolder || info.size > maximumImageBytes) continue;
    } catch {
      continue;
    }
    const file = readFileSync(realCandidate);
    const hash = createHash("sha256").update(file).digest("hex");
    if (usedHashes.has(hash)) continue;
    candidates.push({
      name: entry.name,
      path: realCandidate,
      mimeType: imageMimeTypes[extension],
      bytes: file.length,
      hash,
      data: file
    });
  }
  return candidates.sort((left, right) => left.name.localeCompare(right.name, "de")).slice(0, maximumCandidateImages);
}

function readExplicitPdfs(pdfFiles) {
  return pdfFiles.map(filePath => {
    try {
      const absolute = resolve(filePath);
      const info = lstatSync(absolute);
      if (!info.isFile() || info.isSymbolicLink() || extname(absolute).toLowerCase() !== ".pdf" || info.size > maximumPdfBytes) throw new Error();
      const realFile = realpathSync(absolute);
      const file = readFileSync(realFile);
      return { name: realFile.split(/[\\/]/).at(-1), data: file };
    } catch {
      const error = new Error(`Die freigegebene PDF-Datei „${String(filePath).split(/[\\/]/).at(-1)}“ ist nicht erreichbar oder zu groß.`);
      error.statusCode = 409;
      throw error;
    }
  });
}

function validatePublicWebsiteUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { url = null; }
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    const error = new Error(`Die Website „${value}“ ist keine erlaubte öffentliche HTTP-/HTTPS-Adresse.`);
    error.statusCode = 400;
    throw error;
  }
  return url;
}

function privateIp(address) {
  const normalized = String(address || "").toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224;
}

async function assertPublicHost(url) {
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => privateIp(record.address))) {
    const error = new Error(`Die Website „${url.hostname}“ verweist nicht auf eine öffentliche Adresse und wurde blockiert.`);
    error.statusCode = 400;
    throw error;
  }
}

async function fetchAllowedWebsite(value) {
  const url = validatePublicWebsiteUrl(value);
  await assertPublicHost(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { "User-Agent": "SocialFlow/1.0 (configured customer source)" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/(html|plain)/i.test(contentType)) throw new Error("kein lesbarer Text");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 1_000_000) throw new Error("Inhalt ist zu groß");
    const html = (await response.text()).slice(0, 1_000_000);
    const text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
    return { url: url.href, text };
  } catch (error) {
    const wrapped = new Error(`Die freigegebene Website „${url.hostname}“ konnte nicht gelesen werden: ${error.name === "AbortError" ? "Zeitüberschreitung" : error.message}`);
    wrapped.statusCode = 409;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

function codePointLength(value) {
  return Array.from(String(value || "")).length;
}

export function enforceGeneratedText(text, label, forbiddenTerms) {
  const value = String(text || "").trim();
  if (!value) {
    const error = new Error(`Die KI hat keinen ${label} erstellt.`);
    error.statusCode = 502;
    throw error;
  }
  if (codePointLength(value) > 250) {
    const error = new Error(`Der ${label} der KI ist länger als 250 Zeichen. Es wurden keine Tabellendaten verändert.`);
    error.statusCode = 502;
    throw error;
  }
  if (/(^|\s)#[\p{L}\p{N}_]+/u.test(value)) {
    const error = new Error(`Der ${label} enthält unerlaubte Hashtags. Es wurden keine Tabellendaten verändert.`);
    error.statusCode = 502;
    throw error;
  }
  const lower = value.toLocaleLowerCase("de");
  const forbidden = forbiddenTerms.find(term => lower.includes(term.toLocaleLowerCase("de")));
  if (forbidden) {
    const error = new Error(`Der KI-Entwurf enthält den verbotenen Begriff „${forbidden}“. Es wurden keine Tabellendaten verändert.`);
    error.statusCode = 502;
    throw error;
  }
  return value;
}

function outputText(responseBody) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;
  return (responseBody.output || []).flatMap(item => item.content || []).find(item => item.type === "output_text")?.text || "";
}

async function callOpenAi({ candidates, websites, pdfs, config, periodLabel }) {
  const runtime = aiAgentConfiguration();
  if (runtime.dryRun) {
    return {
      selectedImageName: candidates[0].name,
      imageDescription: "Testbild für einen Social-Media-Entwurf",
      germanText: `Ein passender Einblick für ${periodLabel}. Frisch vorbereitet und bereit zur gemeinsamen Abstimmung.`,
      italianText: `Uno sguardo adatto per ${periodLabel}. Preparato con cura e pronto per essere rivisto insieme.`
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Der KI-Agent ist noch nicht eingerichtet. Hinterlege OPENAI_API_KEY ausschließlich in der .env-Datei des Backends.");
    error.statusCode = 409;
    throw error;
  }
  const sourceText = websites.length
    ? websites.map(source => `Freigegebene Website ${source.url}:\n${source.text}`).join("\n\n")
    : "Keine Website-Fakten freigegeben.";
  const instructions = [
    "Du bereitest genau einen unveröffentlichten Social-Media-Entwurf vor.",
    `Wähle genau eines der beigefügten Kundenbilder anhand seines Dateinamens aus: ${candidates.map(item => item.name).join(", ")}.`,
    "Analysiere den sichtbaren Bildinhalt. Erfinde keine Tatsachen.",
    "Nutze für zusätzliche Fakten ausschließlich die nachfolgend gelieferten freigegebenen Website-Texte und PDF-Dateien.",
    "Erstelle einen deutschen und einen italienischen Text mit jeweils höchstens 250 Unicode-Zeichen.",
    "Keine Hashtags. Keine Veröffentlichungs- oder Planungsanweisung.",
    `Zeitraum: ${periodLabel}. Tonalität: ${config.tone || "professionell, freundlich und klar"}.`,
    config.forbiddenTerms.length ? `Verbotene Begriffe: ${config.forbiddenTerms.join(", ")}.` : "Keine zusätzlich verbotenen Begriffe.",
    config.notes ? `Zusätzliche Kundenhinweise: ${config.notes}` : "",
    sourceText
  ].filter(Boolean).join("\n\n");
  const content = [{ type: "input_text", text: instructions }];
  candidates.forEach(candidate => content.push({ type: "input_image", image_url: `data:${candidate.mimeType};base64,${candidate.data.toString("base64")}`, detail: "low" }));
  pdfs.forEach(pdf => content.push({ type: "input_file", filename: pdf.name, file_data: `data:application/pdf;base64,${pdf.data.toString("base64")}` }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtime.model,
      store: false,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "socialflow_ai_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              selectedImageName: { type: "string", enum: candidates.map(candidate => candidate.name) },
              imageDescription: { type: "string" },
              germanText: { type: "string", maxLength: 250 },
              italianText: { type: "string", maxLength: 250 }
            },
            required: ["selectedImageName", "imageDescription", "germanText", "italianText"]
          }
        }
      }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Die KI-Bildanalyse konnte nicht abgeschlossen werden.");
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  try { return JSON.parse(outputText(body)); }
  catch {
    const error = new Error("Die KI hat keine gültige Entwurfsantwort geliefert. Es wurden keine Tabellendaten verändert.");
    error.statusCode = 502;
    throw error;
  }
}

export async function prepareCustomerDraft({ configuration, usedHashes, periodLabel }) {
  const config = validateCustomerAiConfiguration(configuration);
  if (!config.enabled) {
    const error = new Error("Der KI-Agent ist für diese Kundentabelle ausgeschaltet.");
    error.statusCode = 409;
    throw error;
  }
  const candidates = listDirectCustomerImages(config.imageFolder, usedHashes);
  if (!candidates.length) {
    const error = new Error("Im freigegebenen Kundenordner wurde kein unverwendetes JPG-, JPEG-, PNG- oder WEBP-Bild gefunden. Unterordner werden absichtlich nicht gelesen.");
    error.statusCode = 409;
    throw error;
  }
  const pdfs = readExplicitPdfs(config.pdfFiles);
  const websites = [];
  for (const website of config.allowedWebsites) websites.push(await fetchAllowedWebsite(website));
  const generated = await callOpenAi({ candidates, websites, pdfs, config, periodLabel });
  const selected = candidates.find(candidate => candidate.name === generated.selectedImageName);
  if (!selected) {
    const error = new Error("Die KI hat kein Bild aus dem freigegebenen Kundenordner ausgewählt.");
    error.statusCode = 502;
    throw error;
  }
  const germanText = enforceGeneratedText(generated.germanText, "deutschen Text", config.forbiddenTerms);
  const italianText = enforceGeneratedText(generated.italianText, "italienischen Text", config.forbiddenTerms);
  const assignments = config.fieldMapping.german === config.fieldMapping.italian
    ? { [config.fieldMapping.german]: `${germanText}\n\n${italianText}` }
    : { [config.fieldMapping.german]: germanText, [config.fieldMapping.italian]: italianText };
  return {
    image: selected,
    imageDescription: String(generated.imageDescription || "").trim(),
    germanText,
    italianText,
    assignments,
    sources: { websites: config.allowedWebsites, pdfNames: pdfs.map(pdf => pdf.name) }
  };
}

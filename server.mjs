import { createServer } from "node:http";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { database, addPublicationEvent, nowIso, publicConnection, publicPublication } from "./backend/database.mjs";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchInstagramProfile,
  instagramConfiguration,
  publishToInstagram,
  refreshInstagramAccessToken
} from "./backend/instagram.mjs";
import { translateFromGerman, translationConfiguration } from "./backend/translation.mjs";
import { emailConfiguration, emailIsConfigured, passwordResetEmail, sendEmail, subadminInvitationEmail } from "./backend/email.mjs";
import { aiAgentConfiguration, prepareCustomerDraft, validateCustomerAiConfiguration } from "./backend/ai-agent.mjs";
import { proofreadText } from "./backend/proofreading.mjs";
import { recognizeImageText } from "./backend/ocr.mjs";

const projectRoot = resolve(".");
const localEnvironmentPath = resolve(process.env.ENV_FILE_PATH || ".env");
const uploadsDirectory = resolve(process.env.UPLOADS_DIR || "uploads");
const dataDirectory = resolve(process.env.DATA_DIR || "data");
const originalsArchiveDirectory = resolve(process.env.ORIGINAL_ARCHIVE_DIR || join(dataDirectory, "original-media-archive"));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 8765;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const adminKey = process.env.APP_ADMIN_KEY || "";
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "socialflow_session";
// Moderne Browser begrenzen dauerhafte Cookies üblicherweise auf rund 400 Tage.
// Der Ablauf wird bei jedem erneuten Öffnen der App wieder auf diesen Zeitraum gesetzt.
const persistentSessionDurationMs = 400 * 24 * 60 * 60_000;
const passwordResetDurationMinutes = 30;
const passwordResetDurationMs = passwordResetDurationMinutes * 60_000;
const invitationDurationDays = 7;
const invitationDurationMs = invitationDurationDays * 24 * 60 * 60_000;
const planningStartYear = 2026;
const processingPublications = new Set();
const failedLogins = new Map();
const passwordResetRequests = new Map();
const registrationRequests = new Map();
const processingAiTables = new Set();
const publicStaticFiles = new Set(["index.html", "styles.css", "script.js", "assets/planyoursocials-logo.png"]);
mkdirSync(uploadsDirectory, { recursive: true });
mkdirSync(dataDirectory, { recursive: true });
mkdirSync(originalsArchiveDirectory, { recursive: true });

function tokenEncryptionKey() {
  if (process.env.TOKEN_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY muss aus genau 32 Base64-kodierten Bytes bestehen.");
    return key;
  }
  if (isProduction) throw new Error("TOKEN_ENCRYPTION_KEY ist im Produktionsbetrieb verpflichtend.");
  const keyFile = join(dataDirectory, ".token-key");
  if (existsSync(keyFile)) return Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
  const key = randomBytes(32);
  writeFileSync(keyFile, key.toString("base64"), { mode: 0o600 });
  return key;
}

const encryptionKey = tokenEncryptionKey();

function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (version !== "v1") throw new Error("Unbekanntes Token-Format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(payload);
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
}

function openWindowsFolderPicker(initialPath = "") {
  if (process.platform !== "win32") {
    const error = new Error("Die automatische Ordnerauswahl ist auf diesem Server nicht verfügbar. Bitte trage den vollständigen Ordnerpfad ein.");
    error.statusCode = 501;
    throw error;
  }
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Lokalen, OneDrive- oder Google-Drive-Bildordner für diesen Planyoursocials-Kunden auswählen'",
    "$dialog.ShowNewFolderButton = $true",
    "if ($env:SOCIALFLOW_INITIAL_FOLDER -and (Test-Path -LiteralPath $env:SOCIALFLOW_INITIAL_FOLDER -PathType Container)) { $dialog.SelectedPath = $env:SOCIALFLOW_INITIAL_FOLDER }",
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath; exit 0 }",
    "exit 2"
  ].join("; ");
  return new Promise((resolvePicker, rejectPicker) => {
    execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-STA", "-Command", script], {
      windowsHide: true,
      timeout: 10 * 60_000,
      env: { ...process.env, SOCIALFLOW_INITIAL_FOLDER: String(initialPath || "") }
    }, (error, stdout) => {
      if (error?.code === 2) return resolvePicker("");
      if (error) {
        const wrapped = new Error("Die Windows-Ordnerauswahl konnte nicht geöffnet werden. Bitte trage den Pfad manuell ein.");
        wrapped.statusCode = 500;
        return rejectPicker(wrapped);
      }
      resolvePicker(String(stdout || "").trim());
    });
  });
}

function isLoopback(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function writeLocalEnvironmentValues(values) {
  const currentContent = existsSync(localEnvironmentPath) ? readFileSync(localEnvironmentPath, "utf8") : "";
  const lineBreak = currentContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = currentContent ? currentContent.split(/\r?\n/) : [];
  Object.entries(values).forEach(([key, value]) => {
    const lineIndex = lines.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
    const replacement = `${key}=${value}`;
    if (lineIndex >= 0) lines[lineIndex] = replacement;
    else lines.push(replacement);
  });
  while (lines.at(-1) === "") lines.pop();
  writeFileSync(localEnvironmentPath, `${lines.join(lineBreak)}${lineBreak}`, { mode: 0o600 });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(password), salt, 64);
  return `scrypt.${salt.toString("base64url")}.${derived.toString("base64url")}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [version, saltValue, hashValue] = String(storedHash).split(".");
    if (version !== "scrypt") return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = scryptSync(String(password), Buffer.from(saltValue, "base64url"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function publicUser(row) {
  if (!row) return null;
  let tableIds = [];
  try { tableIds = JSON.parse(row.table_ids_json || "[]"); }
  catch { tableIds = []; }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tableIds: row.role === "owner" ? ["*"] : tableIds,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const value = separator >= 0 ? part.slice(separator + 1) : "";
    return [decodeURIComponent(key), decodeURIComponent(value)];
  }));
}

function sessionTokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function authenticatedUser(request) {
  const token = parseCookies(request)[sessionCookieName];
  if (!token) return null;
  const tokenHash = sessionTokenHash(token);
  const row = database.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1
  `).get(tokenHash, nowIso());
  if (!row) return null;
  database.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
    .run(nowIso(), new Date(Date.now() + persistentSessionDurationMs).toISOString(), tokenHash);
  return publicUser(row);
}

function hasAdminKey(request) {
  return Boolean(adminKey) && request.headers.authorization === `Bearer ${adminKey}`;
}

function requireMainAdmin(request) {
  if (hasAdminKey(request)) return true;
  return authenticatedUser(request)?.role === "owner";
}

function sessionCookie(request, token) {
  const secure = isProduction || String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  const parts = [`${sessionCookieName}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(persistentSessionDurationMs / 1000)}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(request) {
  const secure = isProduction || String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function createLoginSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + persistentSessionDurationMs).toISOString();
  database.prepare("INSERT INTO sessions (token_hash, user_id, remember_me, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(sessionTokenHash(token), userId, 1, expiresAt, createdAt, createdAt);
  return { token, expiresAt };
}

function validateNewPassword(password) {
  if (typeof password !== "string" || password.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  if (password.length > 200) return "Das Passwort ist zu lang.";
  return "";
}

function ensureConfiguredMainAdmin() {
  const count = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").get().count);
  if (count) return;
  const name = String(process.env.MAIN_ADMIN_NAME || "").trim();
  const email = normalizeEmail(process.env.MAIN_ADMIN_EMAIL);
  const password = process.env.MAIN_ADMIN_PASSWORD || "";
  if (!name && !email && !password) return;
  if (!name || !validEmail(email) || validateNewPassword(password)) {
    throw new Error("MAIN_ADMIN_NAME, MAIN_ADMIN_EMAIL und ein Passwort mit mindestens 10 Zeichen müssen gemeinsam gültig gesetzt sein.");
  }
  const timestamp = nowIso();
  database.prepare("INSERT INTO users (id, email, name, role, password_hash, table_ids_json, active, created_at, updated_at) VALUES (?, ?, ?, 'owner', ?, '[\"*\"]', 1, ?, ?)")
    .run(randomUUID(), email, name, hashPassword(password), timestamp, timestamp);
}

ensureConfiguredMainAdmin();

async function readJson(request, maxBytes = 1_000_000) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBytes) throw new Error("Die Anfrage ist zu groß.");
  }
  return body ? JSON.parse(body) : {};
}

async function readFormData(request, requestUrl) {
  const contentLength = Number(request.headers["content-length"]) || 0;
  if (contentLength > 250 * 1024 * 1024) throw new Error("Der Upload darf insgesamt höchstens 250 MB groß sein.");
  const webRequest = new Request(requestUrl, {
    method: request.method,
    headers: request.headers,
    body: Readable.toWeb(request),
    duplex: "half"
  });
  return webRequest.formData();
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

function serveFile(response, filePath, cache = false) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  const file = readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": file.length,
    "Cache-Control": cache ? "public, max-age=86400" : "no-cache"
  });
  response.end(file);
  return true;
}

function userCanAccessTable(user, tableId) {
  return Boolean(user && tableId && (user.role === "owner" || user.tableIds.includes(tableId)));
}

function sanitizedPlannerState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.tables)) {
    const error = new Error("Die Tabellendaten sind ungültig.");
    error.statusCode = 400;
    throw error;
  }
  if (value.tables.length > 500) {
    const error = new Error("Es können höchstens 500 Kundentabellen gespeichert werden.");
    error.statusCode = 400;
    throw error;
  }
  const ids = new Set();
  const tables = value.tables.map(table => {
    if (!table || typeof table !== "object" || typeof table.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(table.id) || ids.has(table.id)) {
      const error = new Error("Mindestens eine Kundentabelle hat eine ungültige Kennung.");
      error.statusCode = 400;
      throw error;
    }
    ids.add(table.id);
    return table;
  });
  return {
    tables,
    sharedTableLayoutEnabled: Boolean(value.sharedTableLayoutEnabled),
    tableTemplateSourceId: typeof value.tableTemplateSourceId === "string" ? value.tableTemplateSourceId : "bergwerk",
    tableTemplateSchema: value.tableTemplateSchema && typeof value.tableTemplateSchema === "object" ? value.tableTemplateSchema : null,
    tableLayoutSourceId: typeof value.tableLayoutSourceId === "string" ? value.tableLayoutSourceId : "",
    tableLayoutSyncVersion: Number.isFinite(Number(value.tableLayoutSyncVersion)) ? Number(value.tableLayoutSyncVersion) : 0
  };
}

function storedPlannerState() {
  const row = database.prepare("SELECT * FROM planner_state WHERE id = 1").get();
  if (!row) return { state: null, revision: 0, updatedAt: null };
  try {
    return { state: sanitizedPlannerState(JSON.parse(row.state_json)), revision: row.revision, updatedAt: row.updated_at };
  } catch (error) {
    console.error("Gespeicherter Tabellenstand ist beschädigt.", error);
    return { state: null, revision: row.revision, updatedAt: row.updated_at };
  }
}

function preserveOwnerOnlyPlannerFields(previousWeeks, incomingWeeks) {
  Object.entries(incomingWeeks || {}).forEach(([weekKey, incomingWeek]) => {
    const previousItems = previousWeeks?.[weekKey]?.items || [];
    (incomingWeek?.items || []).forEach((incomingItem, itemIndex) => {
      const previousItem = previousItems[itemIndex];
      if (!previousItem || !incomingItem) return;
      incomingItem.completed = Boolean(previousItem.completed);
      const previousMedia = new Map((previousItem.media || []).filter(Boolean).map(media => [String(media.id || ""), media]));
      (incomingItem.media || []).forEach(media => {
        const previousRecord = media && previousMedia.get(String(media.id || ""));
        if (!previousRecord) return;
        for (const key of ["previewId", "previewName", "previewType", "previewSize", "previewUrl", "archivedOriginalId", "archivedOriginalName", "sourceReference"]) {
          if (previousRecord[key] !== undefined) media[key] = previousRecord[key];
          else delete media[key];
        }
      });
    });
  });
  return incomingWeeks;
}

function publicPlannerMedia(row) {
  return row ? {
    id: row.id,
    tableId: row.table_id,
    name: row.original_name,
    type: row.mime_type,
    size: row.byte_size,
    sourceReference: row.source_path || row.original_name,
    archived: Boolean(row.archived_at),
    createdAt: row.created_at,
    url: `/api/planner-media/${encodeURIComponent(row.id)}`
  } : null;
}

function archivePathForMedia(row) {
  const archiveName = basename(String(row?.archive_stored_name || ""));
  return archiveName ? join(originalsArchiveDirectory, archiveName) : "";
}

function ensureOriginalArchive(row) {
  if (!row || String(row.original_name || "").startsWith(".preview-")) return null;
  const archiveStoredName = basename(row.archive_stored_name || `original-${row.id}${extname(row.stored_name)}`);
  const archivePath = join(originalsArchiveDirectory, archiveStoredName);
  if (!existsSync(archivePath)) {
    const activePath = join(uploadsDirectory, basename(row.stored_name));
    if (!existsSync(activePath)) return null;
    copyFileSync(activePath, archivePath);
  }
  if (row.archive_stored_name !== archiveStoredName) {
    database.prepare("UPDATE planner_media SET archive_stored_name = ? WHERE id = ?").run(archiveStoredName, row.id);
    row.archive_stored_name = archiveStoredName;
  }
  return archivePath;
}

function deleteOriginalArchive(row) {
  const archivePath = archivePathForMedia(row);
  if (archivePath && existsSync(archivePath)) unlinkSync(archivePath);
}

function callbackPage({ ok, message }) {
  const safeMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Instagram-Verbindung</title><style>body{font-family:system-ui;display:grid;min-height:100vh;place-items:center;margin:0;background:#f5f7fb;color:#172033}.card{max-width:480px;border:1px solid #e2e6ed;border-radius:16px;padding:28px;background:#fff;box-shadow:0 20px 60px #17203322}h1{font-size:1.35rem}p{color:#657084;line-height:1.5}</style></head><body><div class="card"><h1>${ok ? "Instagram wurde verbunden" : "Verbindung nicht möglich"}</h1><p>${String(message).replace(/[&<>]/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value])}</p><p>Dieses Fenster kann geschlossen werden.</p></div><script>window.opener?.postMessage({type:${ok ? '"socialflow-instagram-connected"' : '"socialflow-instagram-error"'},message:${safeMessage}},window.location.origin);setTimeout(()=>window.close(),1200);</script></body></html>`;
}

function connectionByTable(tableId) {
  return database.prepare("SELECT * FROM instagram_connections WHERE table_id = ?").get(tableId);
}

function publicationById(id) {
  return database.prepare("SELECT * FROM publications WHERE id = ?").get(id);
}

async function usableAccessToken(connection) {
  let accessToken = decryptSecret(connection.encrypted_access_token);
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const shouldRefresh = expiresAt && expiresAt - Date.now() < 7 * 24 * 60 * 60_000;
  if (!shouldRefresh) return accessToken;
  const refreshed = await refreshInstagramAccessToken(accessToken);
  accessToken = refreshed.accessToken;
  const updatedAt = nowIso();
  const refreshedExpiry = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : connection.token_expires_at;
  database.prepare("UPDATE instagram_connections SET encrypted_access_token = ?, token_expires_at = ?, updated_at = ? WHERE table_id = ?")
    .run(encryptSecret(accessToken), refreshedExpiry, updatedAt, connection.table_id);
  return accessToken;
}

async function processPublication(id) {
  if (processingPublications.has(id)) return;
  const publication = publicationById(id);
  if (!publication || !["queued", "failed"].includes(publication.status)) return;
  processingPublications.add(id);
  const timestamp = nowIso();
  database.prepare("UPDATE publications SET status = 'publishing', attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ?")
    .run(timestamp, id);
  addPublicationEvent(id, "publishing", "Veröffentlichung an Instagram gestartet.");
  try {
    const connection = connectionByTable(publication.table_id);
    const instagram = instagramConfiguration();
    if (!connection && !instagram.dryRun) throw new Error("Für diese Kundentabelle ist kein Instagram-Konto verbunden.");
    const media = JSON.parse(publication.media_json);
    const result = await publishToInstagram({
      instagramUserId: connection?.instagram_user_id || "dry-run-account",
      accessToken: connection ? await usableAccessToken(connection) : "dry-run-token",
      media,
      contentType: publication.content_type,
      caption: publication.caption
    });
    const publishedAt = nowIso();
    database.prepare("UPDATE publications SET status = 'published', instagram_media_id = ?, published_at = ?, updated_at = ? WHERE id = ?")
      .run(String(result.id), publishedAt, publishedAt, id);
    addPublicationEvent(id, "published", `Instagram-Medien-ID: ${result.id}`);
  } catch (error) {
    const failedAt = nowIso();
    database.prepare("UPDATE publications SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
      .run(error.message, failedAt, id);
    addPublicationEvent(id, "failed", error.message);
  } finally {
    processingPublications.delete(id);
  }
}

async function processDuePublications() {
  const due = database.prepare("SELECT id FROM publications WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10").all(nowIso());
  await Promise.all(due.map(row => processPublication(row.id)));
  database.prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(nowIso());
  database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
  database.prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?").run(nowIso());
  database.prepare("DELETE FROM user_invitations WHERE expires_at < ? OR accepted_at IS NOT NULL").run(nowIso());
}

function loginAttemptKey(request, email) {
  return `${request.socket.remoteAddress || "unknown"}|${email}`;
}

function loginIsBlocked(request, email) {
  const key = loginAttemptKey(request, email);
  const recent = (failedLogins.get(key) || []).filter(timestamp => timestamp > Date.now() - 15 * 60_000);
  failedLogins.set(key, recent);
  return recent.length >= 5;
}

function recordFailedLogin(request, email) {
  const key = loginAttemptKey(request, email);
  const recent = (failedLogins.get(key) || []).filter(timestamp => timestamp > Date.now() - 15 * 60_000);
  recent.push(Date.now());
  failedLogins.set(key, recent);
}

function clearFailedLogins(request, email) {
  failedLogins.delete(loginAttemptKey(request, email));
}

function passwordResetRequestAllowed(request, email) {
  const key = loginAttemptKey(request, email);
  const recent = (passwordResetRequests.get(key) || []).filter(timestamp => timestamp > Date.now() - 15 * 60_000);
  if (recent.length >= 3) {
    passwordResetRequests.set(key, recent);
    return false;
  }
  recent.push(Date.now());
  passwordResetRequests.set(key, recent);
  return true;
}

function registrationRequestAllowed(request, email) {
  const key = loginAttemptKey(request, email);
  const recent = (registrationRequests.get(key) || []).filter(timestamp => timestamp > Date.now() - 15 * 60_000);
  if (recent.length >= 5) {
    registrationRequests.set(key, recent);
    return false;
  }
  recent.push(Date.now());
  registrationRequests.set(key, recent);
  return true;
}

function passwordResetBaseUrl() {
  if (publicBaseUrl) return publicBaseUrl;
  if (isProduction) return "";
  return `http://${host}:${port}`;
}

function parseJsonColumn(value, fallback) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function customerAiConfiguration(tableId) {
  const row = database.prepare("SELECT * FROM ai_customer_configs WHERE table_id = ?").get(tableId);
  if (!row) {
    return {
      tableId,
      tableName: "",
      enabled: false,
      imageFolder: "",
      allowedWebsites: [],
      pdfFiles: [],
      tone: "",
      forbiddenTerms: [],
      notes: "",
      fieldMapping: { german: "text", italian: "textItalian" },
      updatedAt: null
    };
  }
  return {
    tableId: row.table_id,
    tableName: row.table_name,
    enabled: Boolean(row.enabled),
    imageFolder: row.image_folder,
    allowedWebsites: parseJsonColumn(row.allowed_websites_json, []),
    pdfFiles: parseJsonColumn(row.pdf_files_json, []),
    tone: row.tone,
    forbiddenTerms: parseJsonColumn(row.forbidden_terms_json, []),
    notes: row.notes,
    fieldMapping: parseJsonColumn(row.field_mapping_json, { german: "text", italian: "textItalian" }),
    updatedAt: row.updated_at
  };
}

function storeCustomerAiConfiguration(configuration) {
  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO ai_customer_configs (table_id, table_name, enabled, image_folder, allowed_websites_json, pdf_files_json,
      tone, forbidden_terms_json, notes, field_mapping_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_id) DO UPDATE SET table_name=excluded.table_name, enabled=excluded.enabled,
      image_folder=excluded.image_folder, allowed_websites_json=excluded.allowed_websites_json,
      pdf_files_json=excluded.pdf_files_json, tone=excluded.tone, forbidden_terms_json=excluded.forbidden_terms_json,
      notes=excluded.notes, field_mapping_json=excluded.field_mapping_json, updated_at=excluded.updated_at
  `).run(configuration.tableId, configuration.tableName, configuration.enabled ? 1 : 0, configuration.imageFolder,
    JSON.stringify(configuration.allowedWebsites), JSON.stringify(configuration.pdfFiles), configuration.tone,
    JSON.stringify(configuration.forbiddenTerms), configuration.notes, JSON.stringify(configuration.fieldMapping), timestamp, timestamp);
  return customerAiConfiguration(configuration.tableId);
}

function publicAiDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    tableId: row.table_id,
    calendarYear: row.calendar_year,
    weekNumber: row.week_number,
    itemIndex: row.item_index,
    contentType: row.content_type,
    imageName: row.image_name,
    imageMimeType: row.image_mime_type,
    imageDescription: row.image_description,
    germanText: row.german_text,
    italianText: row.italian_text,
    assignments: parseJsonColumn(row.assignments_json, {}),
    sources: parseJsonColumn(row.sources_json, { websites: [], pdfNames: [] }),
    status: row.status,
    createdAt: row.created_at,
    imageUrl: `/api/ai/drafts/${encodeURIComponent(row.id)}/image`
  };
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, { ok: true, time: nowIso() });
  }
  if (pathname === "/api/auth/status" && request.method === "GET") {
    const user = authenticatedUser(request);
    const existingToken = parseCookies(request)[sessionCookieName];
    const ownerCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").get().count);
    return sendJson(response, 200, {
      authenticated: Boolean(user),
      user,
      needsSetup: ownerCount === 0,
      canSetup: ownerCount === 0 && (!isProduction || isLoopback(request.socket.remoteAddress))
    }, user && existingToken ? { "Set-Cookie": sessionCookie(request, existingToken) } : {});
  }
  if (pathname === "/api/planner-state" && request.method === "GET") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const stored = storedPlannerState();
    if (!stored.state || user.role === "owner") return sendJson(response, 200, stored);
    const allowedTableIds = new Set(user.tableIds);
    return sendJson(response, 200, {
      ...stored,
      state: { ...stored.state, tables: stored.state.tables.filter(table => allowedTableIds.has(table.id)) }
    });
  }
  if (pathname === "/api/planner-state" && request.method === "PUT") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const body = await readJson(request, 25 * 1024 * 1024);
    let incoming;
    try { incoming = sanitizedPlannerState(body.state); }
    catch (error) { return sendJson(response, error.statusCode || 400, { error: error.message }); }
    const previous = storedPlannerState();
    let next = incoming;
    if (user.role !== "owner") {
      if (!previous.state) return sendJson(response, 409, { error: "Der Hauptadmin muss die Tabellen zuerst zentral speichern." });
      const allowedTableIds = new Set(user.tableIds);
      const incomingById = new Map(incoming.tables.filter(table => allowedTableIds.has(table.id)).map(table => [table.id, table]));
      next = {
        ...previous.state,
        tables: previous.state.tables.map(table => {
          const changed = incomingById.get(table.id);
          return changed ? { ...table, weeks: changed.weeks && typeof changed.weeks === "object" ? preserveOwnerOnlyPlannerFields(table.weeks, changed.weeks) : table.weeks } : table;
        })
      };
    }
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized) > 24 * 1024 * 1024) return sendJson(response, 413, { error: "Der Tabellenstand ist zu groß." });
    const revision = previous.revision + 1;
    const updatedAt = nowIso();
    database.prepare(`
      INSERT INTO planner_state (id, state_json, revision, updated_by, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, revision = excluded.revision,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(serialized, revision, user.id, updatedAt);
    return sendJson(response, 200, { ok: true, revision, updatedAt });
  }
  if (pathname === "/api/planner-media" && request.method === "POST") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const form = await readFormData(request, url);
    const tableId = String(form.get("tableId") || "");
    const file = form.get("media");
    if (!userCanAccessTable(user, tableId)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf diese Kundentabelle." });
    if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) return sendJson(response, 400, { error: "Bitte wähle ein Bild oder Video aus." });
    const completionPreview = basename(file.name).startsWith(".preview-");
    if (completionPreview && user.role !== "owner") return sendJson(response, 403, { error: "Nur der Hauptadmin darf Abschlussvorschauen erzeugen." });
    if (completionPreview && file.size > 2 * 1024 * 1024) return sendJson(response, 413, { error: "Eine Abschlussvorschau darf höchstens 2 MB groß sein." });
    if (completionPreview && !new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return sendJson(response, 415, { error: "Abschlussvorschauen müssen Bilddateien sein." });
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"]);
    if (!allowedTypes.has(file.type)) return sendJson(response, 415, { error: "Dieses Bild- oder Videoformat wird nicht unterstützt." });
    if (file.size > 250 * 1024 * 1024) return sendJson(response, 413, { error: "Das Medium darf höchstens 250 MB groß sein." });
    const extension = ({
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm"
    })[file.type];
    const id = randomUUID();
    const storedName = `planner-${id}${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(uploadsDirectory, storedName), fileBuffer);
    const archiveStoredName = completionPreview ? "" : `original-${id}${extension}`;
    if (archiveStoredName) writeFileSync(join(originalsArchiveDirectory, archiveStoredName), fileBuffer);
    const sourceReference = String(form.get("sourcePath") || file.name || "")
      .replace(/[\0\r\n]/g, " ")
      .slice(0, 2048);
    const createdAt = nowIso();
    database.prepare(`INSERT INTO planner_media
      (id, table_id, stored_name, original_name, mime_type, byte_size, source_path, archive_stored_name, archived_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
      .run(id, tableId, storedName, basename(file.name), file.type, file.size, sourceReference, archiveStoredName, user.id, createdAt);
    return sendJson(response, 201, { media: publicPlannerMedia(database.prepare("SELECT * FROM planner_media WHERE id = ?").get(id)) });
  }
  const restorePlannerMediaRoute = pathname.match(/^\/api\/planner-media\/([^/]+)\/restore$/);
  if (restorePlannerMediaRoute && request.method === "POST") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    if (user.role !== "owner") return sendJson(response, 403, { error: "Nur der Hauptadmin darf Originaldateien wiederherstellen." });
    const mediaId = decodeURIComponent(restorePlannerMediaRoute[1]);
    const row = database.prepare("SELECT * FROM planner_media WHERE id = ?").get(mediaId);
    if (!row || String(row.original_name || "").startsWith(".preview-")) return sendJson(response, 404, { error: "Archiviertes Original nicht gefunden." });
    if (!userCanAccessTable(user, row.table_id)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf dieses Medium." });
    if (!row.archived_at) return sendJson(response, 200, { ok: true, restored: false, media: publicPlannerMedia(row) });
    const archivePath = archivePathForMedia(row);
    if (!archivePath || !existsSync(archivePath)) return sendJson(response, 410, { error: "Die Sicherung des Originals ist nicht mehr vorhanden." });
    copyFileSync(archivePath, join(uploadsDirectory, basename(row.stored_name)));
    database.prepare("UPDATE planner_media SET archived_at = NULL WHERE id = ?").run(row.id);

    const planner = storedPlannerState();
    let stateChanged = false;
    if (planner.state) {
      planner.state.tables.forEach(table => Object.values(table.weeks || {}).forEach(week => {
        (week?.items || []).forEach(item => {
          if (!Array.isArray(item.media)) return;
          item.media = item.media.map(media => {
            if (String(media?.archivedOriginalId || "") !== String(row.id)) return media;
            stateChanged = true;
            const restored = {
              ...media,
              id: row.id,
              tableId: row.table_id,
              name: row.original_name,
              type: row.mime_type,
              size: Number(row.byte_size) || 0,
              url: `/api/planner-media/${encodeURIComponent(row.id)}`,
              originalAvailable: true,
              fileState: media.previewId ? "original_and_preview" : "original_only",
              sourceReference: row.source_path || row.original_name
            };
            delete restored.archivedOriginalId;
            delete restored.archivedOriginalName;
            return restored;
          });
        });
      }));
    }
    if (stateChanged) {
      database.prepare("UPDATE planner_state SET state_json = ?, revision = ?, updated_by = ?, updated_at = ? WHERE id = 1")
        .run(JSON.stringify(planner.state), planner.revision + 1, user.id, nowIso());
    }
    const restoredRow = database.prepare("SELECT * FROM planner_media WHERE id = ?").get(row.id);
    return sendJson(response, 200, { ok: true, restored: true, media: publicPlannerMedia(restoredRow) });
  }
  const plannerMediaRoute = pathname.match(/^\/api\/planner-media\/([^/]+)$/);
  if (plannerMediaRoute && request.method === "GET") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const row = database.prepare("SELECT * FROM planner_media WHERE id = ?").get(decodeURIComponent(plannerMediaRoute[1]));
    if (!row || row.archived_at) return sendJson(response, 404, { error: "Medium nicht gefunden." });
    if (!userCanAccessTable(user, row.table_id)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf dieses Medium." });
    if (serveFile(response, join(uploadsDirectory, basename(row.stored_name)), true)) return;
    return sendJson(response, 404, { error: "Mediendatei nicht gefunden." });
  }
  if (plannerMediaRoute && request.method === "DELETE") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const row = database.prepare("SELECT * FROM planner_media WHERE id = ?").get(decodeURIComponent(plannerMediaRoute[1]));
    if (!row) return sendJson(response, 200, { ok: true });
    if (!userCanAccessTable(user, row.table_id)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf dieses Medium." });
    const originalOnly = url.searchParams.get("originalOnly") === "1";
    if (originalOnly) {
      if (user.role !== "owner") return sendJson(response, 403, { error: "Nur der Hauptadmin darf Originaldateien löschen." });
      if (String(row.original_name || "").startsWith(".preview-")) return sendJson(response, 400, { error: "Vorschaudateien können nicht gelöscht werden." });
      const previewRow = database.prepare("SELECT * FROM planner_media WHERE original_name LIKE ? ORDER BY created_at DESC LIMIT 1")
        .get(`.preview-${row.id}.%`);
      if (!previewRow) return sendJson(response, 409, { error: "Das Original kann erst gelöscht werden, wenn eine Vorschau vorhanden ist." });
      const archivePath = ensureOriginalArchive(row);
      if (!archivePath) return sendJson(response, 409, { error: "Das Original konnte nicht sicher archiviert werden und wurde deshalb nicht gelöscht." });
      const filePath = join(uploadsDirectory, basename(row.stored_name));
      const archivedAt = nowIso();
      database.prepare("UPDATE planner_media SET archived_at = ? WHERE id = ?").run(archivedAt, row.id);
      if (existsSync(filePath)) unlinkSync(filePath);

      const planner = storedPlannerState();
      let stateChanged = false;
      if (planner.state) {
        planner.state.tables.forEach(table => Object.values(table.weeks || {}).forEach(week => {
          (week?.items || []).forEach(item => {
            if (!Array.isArray(item.media)) return;
            item.media = item.media.map(media => {
              if (String(media?.id || "") !== String(row.id)) return media;
              stateChanged = true;
              return {
                ...media,
                id: "",
                url: "",
                originalAvailable: false,
                fileState: "preview_only",
                archivedOriginalId: String(row.id),
                archivedOriginalName: String(row.original_name),
                sourceReference: String(row.source_path || row.original_name),
                previewId: String(media.previewId || previewRow.id),
                previewName: String(media.previewName || previewRow.original_name),
                previewType: String(media.previewType || previewRow.mime_type),
                previewSize: Number(media.previewSize) || Number(previewRow.byte_size) || 0,
                previewUrl: `/api/planner-media/${encodeURIComponent(media.previewId || previewRow.id)}`
              };
            });
          });
        }));
      }
      if (stateChanged) {
        database.prepare("UPDATE planner_state SET state_json = ?, revision = ?, updated_by = ?, updated_at = ? WHERE id = 1")
          .run(JSON.stringify(planner.state), planner.revision + 1, user.id, nowIso());
      }
      return sendJson(response, 200, {
        ok: true,
        originalDeleted: true,
        originalArchived: true,
        archivedOriginalId: row.id,
        sourceReference: row.source_path || row.original_name,
        preview: publicPlannerMedia(previewRow)
      });
    }
    const filePath = join(uploadsDirectory, basename(row.stored_name));
    const archivedOriginalMatch = String(row.original_name || "").match(/^\.preview-(.+)\.(?:jpe?g|png|webp)$/i);
    const archivedOriginalId = archivedOriginalMatch ? String(archivedOriginalMatch[1]) : "";
    const dependentPreviewIds = new Set();
    database.prepare("DELETE FROM planner_media WHERE id = ?").run(row.id);
    if (existsSync(filePath)) unlinkSync(filePath);
    deleteOriginalArchive(row);
    const planner = storedPlannerState();
    let stateChanged = false;
    if (planner.state) {
      planner.state.tables.forEach(table => Object.values(table.weeks || {}).forEach(week => {
        (week?.items || []).forEach(item => {
          if (!Array.isArray(item.media)) return;
          item.media = item.media.map(media => {
            if (String(media?.id || "") === String(row.id)) {
              if (media?.previewId) dependentPreviewIds.add(String(media.previewId));
              stateChanged = true;
              return null;
            }
            if (String(media?.previewId || "") === String(row.id)) {
              stateChanged = true;
              if (archivedOriginalId && String(media?.archivedOriginalId || "") === archivedOriginalId) return null;
              const cleaned = { ...media };
              for (const key of ["previewId", "previewName", "previewType", "previewSize", "previewUrl"]) delete cleaned[key];
              return cleaned;
            }
            return media;
          });
        });
      }));
    }
    if (stateChanged) {
      database.prepare("UPDATE planner_state SET state_json = ?, revision = ?, updated_by = ?, updated_at = ? WHERE id = 1")
        .run(JSON.stringify(planner.state), planner.revision + 1, user.id, nowIso());
    }
    dependentPreviewIds.forEach(previewId => {
      const preview = database.prepare("SELECT * FROM planner_media WHERE id = ?").get(previewId);
      if (!preview) return;
      database.prepare("DELETE FROM planner_media WHERE id = ?").run(previewId);
      const previewPath = join(uploadsDirectory, basename(preview.stored_name));
      if (existsSync(previewPath)) unlinkSync(previewPath);
    });
    if (archivedOriginalId) {
      const archivedOriginal = database.prepare("SELECT * FROM planner_media WHERE id = ? AND archived_at IS NOT NULL").get(archivedOriginalId);
      if (archivedOriginal) {
        database.prepare("DELETE FROM planner_media WHERE id = ?").run(archivedOriginal.id);
        const archivedActivePath = join(uploadsDirectory, basename(archivedOriginal.stored_name));
        if (existsSync(archivedActivePath)) unlinkSync(archivedActivePath);
        deleteOriginalArchive(archivedOriginal);
      }
    }
    return sendJson(response, 200, { ok: true });
  }
  if (pathname === "/api/planner-history" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf den Änderungsverlauf ansehen." });
    const rows = database.prepare("SELECT * FROM planner_history ORDER BY id DESC LIMIT 1000").all();
    return sendJson(response, 200, { entries: rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.created_at).getTime(),
      tableId: row.table_id,
      tableName: row.table_name,
      userId: row.user_id,
      userName: row.user_name,
      description: row.description,
      byteSize: row.byte_size,
      snapshot: JSON.parse(row.snapshot_json)
    })) });
  }
  if (pathname === "/api/planner-history" && request.method === "POST") {
    const user = authenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Bitte melde dich an." });
    const body = await readJson(request, 25 * 1024 * 1024);
    const tableId = String(body.tableId || "");
    if (!userCanAccessTable(user, tableId)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf diese Kundentabelle." });
    if (!body.snapshot || typeof body.snapshot !== "object") return sendJson(response, 400, { error: "Der Tabellenstand ist ungültig." });
    const snapshotJson = JSON.stringify(body.snapshot);
    if (Buffer.byteLength(snapshotJson) > 24 * 1024 * 1024) return sendJson(response, 413, { error: "Der historische Tabellenstand ist zu groß." });
    database.prepare(`INSERT INTO planner_history
      (table_id, table_name, user_id, user_name, description, byte_size, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(tableId, String(body.tableName || "Kundentabelle").slice(0, 200), user.id, user.name,
        String(body.description || "Tabelleninhalt geändert").slice(0, 500), Buffer.byteLength(snapshotJson), snapshotJson, nowIso());
    database.prepare(`DELETE FROM planner_history WHERE id IN (
      SELECT id FROM planner_history ORDER BY id DESC LIMIT -1 OFFSET 1000
    )`).run();
    return sendJson(response, 201, { ok: true });
  }
  if (pathname === "/api/auth/setup" && request.method === "POST") {
    const ownerCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").get().count);
    if (ownerCount) return sendJson(response, 409, { error: "Der Hauptadmin wurde bereits eingerichtet." });
    const body = await readJson(request);
    if (isProduction && !isLoopback(request.socket.remoteAddress) && (!adminKey || body.setupKey !== adminKey)) {
      return sendJson(response, 403, { error: "Die Ersteinrichtung ist online gesperrt. Hinterlege MAIN_ADMIN_NAME, MAIN_ADMIN_EMAIL und MAIN_ADMIN_PASSWORD auf dem Server." });
    }
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const passwordError = validateNewPassword(body.password);
    if (name.length < 2) return sendJson(response, 400, { error: "Bitte gib deinen vollständigen Namen ein." });
    if (!validEmail(email)) return sendJson(response, 400, { error: "Bitte gib eine gültige E-Mail-Adresse ein." });
    if (passwordError) return sendJson(response, 400, { error: passwordError });
    const timestamp = nowIso();
    const userId = randomUUID();
    try {
      database.prepare("INSERT INTO users (id, email, name, role, password_hash, table_ids_json, active, created_at, updated_at) VALUES (?, ?, ?, 'owner', ?, '[\"*\"]', 1, ?, ?)")
        .run(userId, email, name, hashPassword(body.password), timestamp, timestamp);
    } catch (error) {
      return sendJson(response, 409, { error: "Der Hauptadmin konnte nicht eingerichtet werden." });
    }
    const session = createLoginSession(userId);
    const user = publicUser(database.prepare("SELECT * FROM users WHERE id = ?").get(userId));
    return sendJson(response, 201, { authenticated: true, user, expiresAt: session.expiresAt }, { "Set-Cookie": sessionCookie(request, session.token) });
  }
  if (pathname === "/api/auth/register" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const invitationToken = String(body.invitationToken || "");
    const passwordError = validateNewPassword(body.password);
    if (!registrationRequestAllowed(request, email)) return sendJson(response, 429, { error: "Zu viele Registrierungsversuche. Bitte warte 15 Minuten." });
    if (name.length < 2 || name.length > 100) return sendJson(response, 400, { error: "Bitte gib deinen Namen ein." });
    if (!validEmail(email) || email.length > 254) return sendJson(response, 400, { error: "Bitte gib eine gültige E-Mail-Adresse ein." });
    if (passwordError) return sendJson(response, 400, { error: passwordError });
    const ownerCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").get().count);
    if (!ownerCount) return sendJson(response, 503, { error: "Die Registrierung ist erst möglich, nachdem der Hauptadmin eingerichtet wurde." });
    if (invitationToken.length < 32 || invitationToken.length > 200) return sendJson(response, 400, { error: "Zur Registrierung benötigst du einen gültigen Einladungslink des Hauptadmins." });
    const invitation = database.prepare(`
      SELECT * FROM user_invitations
      WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?
    `).get(sessionTokenHash(invitationToken), nowIso());
    if (!invitation) return sendJson(response, 400, { error: "Der Einladungslink ist ungültig, abgelaufen oder wurde bereits verwendet." });
    if (invitation.email && normalizeEmail(invitation.email) !== email) return sendJson(response, 400, { error: "Bitte verwende die E-Mail-Adresse, an die die Einladung gesendet wurde." });
    const timestamp = nowIso();
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("INSERT INTO users (id, email, name, role, password_hash, table_ids_json, active, created_at, updated_at) VALUES (?, ?, ?, 'subadmin', ?, ?, 1, ?, ?)")
        .run(randomUUID(), email, name, hashPassword(body.password), invitation.table_ids_json, timestamp, timestamp);
      const accepted = database.prepare("UPDATE user_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").run(timestamp, invitation.id);
      if (Number(accepted.changes) !== 1) throw new Error("Einladung wurde bereits verwendet.");
      database.exec("COMMIT");
    } catch {
      try { database.exec("ROLLBACK"); } catch {}
      return sendJson(response, 409, { error: "Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück." });
    }
    return sendJson(response, 201, {
      message: "Dein Konto wurde erstellt und die freigegebenen Kundentabellen wurden übernommen. Du kannst dich jetzt anmelden."
    });
  }
  if (pathname === "/api/auth/invitation" && request.method === "GET") {
    const token = String(url.searchParams.get("token") || "");
    if (token.length < 32 || token.length > 200) return sendJson(response, 400, { error: "Der Einladungslink ist ungültig oder abgelaufen." });
    const invitation = database.prepare(`
      SELECT email, expires_at FROM user_invitations
      WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?
    `).get(sessionTokenHash(token), nowIso());
    if (!invitation) return sendJson(response, 400, { error: "Der Einladungslink ist ungültig, abgelaufen oder wurde bereits verwendet." });
    return sendJson(response, 200, { email: invitation.email, expiresAt: invitation.expires_at });
  }
  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (loginIsBlocked(request, email)) return sendJson(response, 429, { error: "Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte 15 Minuten." });
    const row = database.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1").get(email);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      recordFailedLogin(request, email);
      return sendJson(response, 401, { error: "E-Mail-Adresse oder Passwort ist nicht korrekt." });
    }
    if (row.role !== "owner" && publicUser(row).tableIds.length === 0) {
      return sendJson(response, 403, { error: "Dein Konto wartet noch auf die Freigabe einer Kundentabelle durch den Hauptadmin." });
    }
    clearFailedLogins(request, email);
    database.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").run(row.id, nowIso());
    const session = createLoginSession(row.id);
    return sendJson(response, 200, { authenticated: true, user: publicUser(row), expiresAt: session.expiresAt }, { "Set-Cookie": sessionCookie(request, session.token) });
  }
  if (pathname === "/api/auth/password-reset/request" && request.method === "POST") {
    const genericMessage = "Falls für diese E-Mail-Adresse ein aktives Konto besteht, wurde ein Link zum Zurücksetzen versendet.";
    if (!emailIsConfigured() || !passwordResetBaseUrl()) {
      return sendJson(response, 503, { error: "Der E-Mail-Versand für die Passwort-Wiederherstellung ist noch nicht eingerichtet." });
    }
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!validEmail(email) || !passwordResetRequestAllowed(request, email)) return sendJson(response, 202, { message: genericMessage });
    const row = database.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1").get(email);
    if (!row) return sendJson(response, 202, { message: genericMessage });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = sessionTokenHash(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + passwordResetDurationMs).toISOString();
    database.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").run(row.id);
    database.prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at, requested_ip) VALUES (?, ?, ?, ?, ?)")
      .run(tokenHash, row.id, expiresAt, createdAt, request.socket.remoteAddress || null);
    const resetUrl = `${passwordResetBaseUrl()}/?resetToken=${encodeURIComponent(token)}`;
    const message = passwordResetEmail({ name: row.name, resetUrl, expiresMinutes: passwordResetDurationMinutes });
    try {
      const delivery = await sendEmail({ to: row.email, ...message });
      const testToken = process.env.NODE_ENV === "test" && delivery.dryRun ? token : undefined;
      return sendJson(response, 202, { message: genericMessage, ...(testToken ? { testToken } : {}) });
    } catch (error) {
      database.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
      console.error(`Passwort-E-Mail konnte nicht versendet werden: ${error.message}`);
      return sendJson(response, 202, { message: genericMessage });
    }
  }
  if (pathname === "/api/auth/password-reset/confirm" && request.method === "POST") {
    const body = await readJson(request);
    const token = String(body.token || "");
    const passwordError = validateNewPassword(body.password);
    if (passwordError) return sendJson(response, 400, { error: passwordError });
    if (token.length < 32 || token.length > 200) return sendJson(response, 400, { error: "Der Link zum Zurücksetzen ist ungültig oder abgelaufen." });
    const reset = database.prepare(`
      SELECT password_reset_tokens.*, users.active
      FROM password_reset_tokens
      JOIN users ON users.id = password_reset_tokens.user_id
      WHERE password_reset_tokens.token_hash = ? AND password_reset_tokens.used_at IS NULL
        AND password_reset_tokens.expires_at > ? AND users.active = 1
    `).get(sessionTokenHash(token), nowIso());
    if (!reset) return sendJson(response, 400, { error: "Der Link zum Zurücksetzen ist ungültig oder abgelaufen." });
    const updatedAt = nowIso();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(hashPassword(body.password), updatedAt, reset.user_id);
      database.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id);
      database.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
        .run(updatedAt, reset.user_id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return sendJson(response, 200, { message: "Dein Passwort wurde geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden." });
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request)[sessionCookieName];
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sessionTokenHash(token));
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(request) });
  }

  const signedInUser = authenticatedUser(request);
  if (!signedInUser && !hasAdminKey(request)) return sendJson(response, 401, { error: "Bitte melde dich an, um Planyoursocials zu verwenden." });

  if (pathname === "/api/users/participants" && request.method === "GET") {
    if (!signedInUser) return sendJson(response, 401, { error: "Bitte melde dich an, um die Tabellenmitglieder zu sehen." });
    const allowedTableIds = new Set(signedInUser.tableIds || []);
    const users = database.prepare("SELECT * FROM users WHERE active = 1 ORDER BY role, name COLLATE NOCASE").all()
      .map(publicUser)
      .filter(user => user.role === "owner" || user.id === signedInUser.id || user.tableIds.some(tableId => allowedTableIds.has(tableId)))
      .map(({ id, name, role, tableIds }) => ({ id, name, role, tableIds }));
    return sendJson(response, 200, { users });
  }

  if (pathname === "/api/users" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Benutzer verwalten." });
    const users = database.prepare("SELECT * FROM users WHERE active = 1 ORDER BY role, name COLLATE NOCASE").all().map(publicUser);
    return sendJson(response, 200, { users });
  }
  if (pathname === "/api/users/invitations" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Unteradmins einladen." });
    const body = await readJson(request);
    const deliveryMode = body.delivery === "email" ? "email" : "link";
    if (!passwordResetBaseUrl()) return sendJson(response, 503, { error: "Trage zuerst PUBLIC_BASE_URL in der .env-Datei ein." });
    if (deliveryMode === "email" && !emailIsConfigured()) return sendJson(response, 503, { error: "Für den direkten E-Mail-Versand fehlen die SMTP-Daten in der .env-Datei. Du kannst stattdessen einen Link erstellen." });
    const email = normalizeEmail(body.email);
    const tableIds = [...new Set((Array.isArray(body.tableIds) ? body.tableIds : []).map(String).filter(Boolean))];
    if ((email || deliveryMode === "email") && (!validEmail(email) || email.length > 254)) return sendJson(response, 400, { error: "Bitte gib eine gültige E-Mail-Adresse ein." });
    if (!tableIds.length) return sendJson(response, 400, { error: "Wähle mindestens eine Kundentabelle aus." });
    if (email && database.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND active = 1").get(email)) {
      return sendJson(response, 409, { error: "Für diese E-Mail-Adresse besteht bereits ein Konto. Bearbeite stattdessen den vorhandenen Tabellenzugriff." });
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sessionTokenHash(token);
    const id = randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + invitationDurationMs).toISOString();
    if (email) database.prepare("DELETE FROM user_invitations WHERE email = ? COLLATE NOCASE AND accepted_at IS NULL").run(email);
    database.prepare("INSERT INTO user_invitations (id, token_hash, email, table_ids_json, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, tokenHash, email, JSON.stringify(tableIds), expiresAt, signedInUser?.id || "admin-key", createdAt);
    const inviteUrl = `${passwordResetBaseUrl()}/?invite=${encodeURIComponent(token)}`;
    if (deliveryMode === "link") return sendJson(response, 201, {
      message: `Der einmalige Einladungslink wurde erstellt und ist ${invitationDurationDays} Tage gültig.`,
      inviteUrl, expiresAt
    });
    try {
      const delivery = await sendEmail({ to: email, ...subadminInvitationEmail({ inviteUrl, expiresDays: invitationDurationDays }) });
      const testToken = process.env.NODE_ENV === "test" && delivery.dryRun ? token : undefined;
      return sendJson(response, 201, {
        message: `Die Einladung wurde an ${email} gesendet und ist ${invitationDurationDays} Tage gültig.`,
        expiresAt,
        ...(testToken ? { testToken } : {})
      });
    } catch (error) {
      database.prepare("DELETE FROM user_invitations WHERE id = ?").run(id);
      return sendJson(response, 502, { error: `Die Einladung konnte nicht versendet werden: ${error.message}` });
    }
  }
  if (pathname === "/api/users" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Unteradmins erstellen." });
    const body = await readJson(request);
    const role = body.role === "customer" ? "customer" : "subadmin";
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const tableIds = [...new Set((Array.isArray(body.tableIds) ? body.tableIds : []).map(String).filter(Boolean))];
    const passwordError = validateNewPassword(body.password);
    if (name.length < 2) return sendJson(response, 400, { error: "Bitte gib den Namen des Unteradmins ein." });
    if (!validEmail(email)) return sendJson(response, 400, { error: "Bitte gib eine gültige E-Mail-Adresse ein." });
    if (passwordError) return sendJson(response, 400, { error: passwordError });
    if (!tableIds.length) return sendJson(response, 400, { error: "Wähle mindestens eine Kundentabelle aus." });
    if (role === "customer" && tableIds.length !== 1) return sendJson(response, 400, { error: "Wähle für den Kunden genau eine Kundentabelle aus." });
    const timestamp = nowIso();
    const id = randomUUID();
    try {
      database.prepare("INSERT INTO users (id, email, name, role, password_hash, table_ids_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .run(id, email, name, role, hashPassword(body.password), JSON.stringify(tableIds), timestamp, timestamp);
    } catch {
      return sendJson(response, 409, { error: "Diese E-Mail-Adresse wird bereits verwendet." });
    }
    return sendJson(response, 201, { user: publicUser(database.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
  }
  const userRoute = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userRoute && request.method === "DELETE") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Benutzerzugänge entfernen." });
    const id = decodeURIComponent(userRoute[1]);
    const existing = database.prepare("SELECT * FROM users WHERE id = ? AND role IN ('subadmin', 'customer') AND active = 1").get(id);
    if (!existing) return sendJson(response, 404, { error: "Unteradmin- oder Kundenkonto nicht gefunden." });
    database.prepare("DELETE FROM users WHERE id = ? AND role IN ('subadmin', 'customer')").run(id);
    return sendJson(response, 200, { ok: true });
  }
  if (userRoute && request.method === "PATCH") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Benutzerzugriffe bearbeiten." });
    const id = decodeURIComponent(userRoute[1]);
    const existing = database.prepare("SELECT * FROM users WHERE id = ? AND role IN ('subadmin', 'customer') AND active = 1").get(id);
    if (!existing) return sendJson(response, 404, { error: "Benutzerkonto nicht gefunden." });
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const tableIds = [...new Set((Array.isArray(body.tableIds) ? body.tableIds : []).map(String).filter(Boolean))];
    if (name.length < 2 || !validEmail(email) || !tableIds.length) return sendJson(response, 400, { error: "Name, E-Mail-Adresse und mindestens eine Kundentabelle sind erforderlich." });
    const password = String(body.password || "");
    if (password && validateNewPassword(password)) return sendJson(response, 400, { error: validateNewPassword(password) });
    try {
      if (password) {
        database.prepare("UPDATE users SET name = ?, email = ?, table_ids_json = ?, password_hash = ?, updated_at = ? WHERE id = ?")
          .run(name, email, JSON.stringify(tableIds), hashPassword(password), nowIso(), id);
        database.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      } else {
        database.prepare("UPDATE users SET name = ?, email = ?, table_ids_json = ?, updated_at = ? WHERE id = ?")
          .run(name, email, JSON.stringify(tableIds), nowIso(), id);
      }
    } catch {
      return sendJson(response, 409, { error: "Diese E-Mail-Adresse wird bereits verwendet." });
    }
    return sendJson(response, 200, { user: publicUser(database.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
  }
  if (pathname === "/api/config" && request.method === "GET") {
    const instagram = instagramConfiguration();
    const translation = translationConfiguration();
    return sendJson(response, 200, {
      instagramConfigured: Boolean(instagram.appId && instagram.appSecret),
      instagramAppId: instagram.appId,
      instagramAppSecretConfigured: Boolean(instagram.appSecret),
      instagramRedirectUri: instagram.redirectUri,
      localInstagramConfigurationEditable: Boolean(signedInUser?.role === "owner" && !isProduction && isLoopback(request.socket.remoteAddress)),
      publicMediaConfigured: /^https:\/\//i.test(publicBaseUrl) || instagram.dryRun,
      dryRun: instagram.dryRun,
      apiVersion: instagram.apiVersion,
      translationConfigured: Boolean(translation.apiKey) || translation.dryRun,
      aiAgentConfigured: aiAgentConfiguration().configured
    });
  }
  if (pathname === "/api/proofread" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf die Rechtschreibprüfung verwenden." });
    try {
      const body = await readJson(request);
      const text = String(body.text || "");
      if (text.length > 10_000) return sendJson(response, 400, { error: "Der Text ist für eine einzelne Rechtschreibprüfung zu lang." });
      const allowedWords = Array.isArray(body.allowedWords) ? body.allowedWords : [];
      if (allowedWords.length > 500) return sendJson(response, 400, { error: "Zu viele benutzerdefinierte Wörter." });
      return sendJson(response, 200, await proofreadText(text, body.language, allowedWords));
    } catch (error) {
      return sendJson(response, 502, { error: error.message || "Die Rechtschreibprüfung konnte nicht abgeschlossen werden." });
    }
  }
  if (pathname === "/api/ocr" && request.method === "POST") {
    if (!signedInUser) return sendJson(response, 401, { error: "Bitte melde dich an." });
    try {
      const form = await readFormData(request, url);
      const tableId = String(form.get("tableId") || "");
      const image = form.get("image");
      if (!userCanAccessTable(signedInUser, tableId)) return sendJson(response, 403, { error: "Du hast keinen Zugriff auf diese Kundentabelle." });
      if (!image || typeof image.arrayBuffer !== "function" || image.size <= 0) return sendJson(response, 400, { error: "Für die Texterkennung fehlt das Bild." });
      if (!new Set(["image/jpeg", "image/png"]).has(image.type)) return sendJson(response, 415, { error: "Die Texterkennung benötigt ein JPEG- oder PNG-Bild." });
      if (image.size > 15 * 1024 * 1024) return sendJson(response, 413, { error: "Das Bild ist für die Texterkennung zu groß." });
      return sendJson(response, 200, await recognizeImageText(Buffer.from(await image.arrayBuffer())));
    } catch (error) {
      return sendJson(response, Number(error.statusCode) || 502, { error: error.message || "Der Bildtext konnte nicht erkannt werden." });
    }
  }
  if (pathname === "/api/ai/config" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf die KI-Konfiguration sehen." });
    const tableId = String(url.searchParams.get("tableId") || "").trim();
    if (!tableId) return sendJson(response, 400, { error: "Kundentabelle fehlt." });
    return sendJson(response, 200, { configuration: customerAiConfiguration(tableId), runtime: aiAgentConfiguration() });
  }
  if (pathname === "/api/ai/select-folder" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Bildordner auswählen." });
    if (isProduction || !isLoopback(request.socket.remoteAddress)) {
      return sendJson(response, 403, { error: "Die Ordnerauswahl kann aus Sicherheitsgründen nur direkt am lokalen Planyoursocials-Computer geöffnet werden." });
    }
    try {
      const body = await readJson(request);
      const selectedPath = await openWindowsFolderPicker(String(body.initialPath || ""));
      return sendJson(response, 200, { path: selectedPath, cancelled: !selectedPath });
    } catch (error) {
      return sendJson(response, Number(error.statusCode) || 500, { error: error.message });
    }
  }
  if (pathname === "/api/ai/config" && request.method === "PUT") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf die KI-Konfiguration bearbeiten." });
    try {
      const configuration = validateCustomerAiConfiguration(await readJson(request));
      return sendJson(response, 200, { configuration: storeCustomerAiConfiguration(configuration), runtime: aiAgentConfiguration() });
    } catch (error) {
      return sendJson(response, Number(error.statusCode) || 400, { error: error.message });
    }
  }
  const aiDraftImageMatch = pathname.match(/^\/api\/ai\/drafts\/([^/]+)\/image$/);
  if (aiDraftImageMatch && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf KI-Entwurfsbilder abrufen." });
    const draft = database.prepare("SELECT * FROM ai_drafts WHERE id = ?").get(decodeURIComponent(aiDraftImageMatch[1]));
    if (!draft || !serveFile(response, draft.image_path, false)) return sendJson(response, 404, { error: "Das ausgewählte Entwurfsbild ist nicht mehr verfügbar." });
    return;
  }
  if (pathname === "/api/ai/prepare-draft" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf KI-Entwürfe vorbereiten." });
    const body = await readJson(request);
    const tableId = String(body.tableId || "").trim();
    const tableName = String(body.tableName || "").trim();
    const calendarYear = Number(body.calendarYear);
    const weekNumber = Number(body.weekNumber);
    const itemIndex = Number(body.itemIndex);
    if (!tableId || !tableName || !Number.isInteger(calendarYear) || calendarYear < 2026 || calendarYear > 2031 ||
      !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53 || !Number.isInteger(itemIndex) || itemIndex < 0) {
      return sendJson(response, 400, { error: "Die ausgewählte Beitragszeile ist unvollständig." });
    }
    if (body.contentType !== "post") return sendJson(response, 400, { error: "Der KI-Agent ist in dieser Version nur für Post-Zeilen verfügbar." });
    if (body.approved || body.published || body.instagramPublicationId) {
      return sendJson(response, 409, { error: "Diese Beitragszeile ist nicht mehr offen. Bestätigte, geplante oder veröffentlichte Zeilen werden nicht verändert." });
    }
    if (processingAiTables.has(tableId)) return sendJson(response, 409, { error: "Für diese Kundentabelle wird gerade bereits ein KI-Entwurf vorbereitet." });
    const configuration = customerAiConfiguration(tableId);
    configuration.tableName = tableName;
    processingAiTables.add(tableId);
    try {
      const usedHashes = new Set(database.prepare("SELECT image_hash FROM ai_drafts WHERE table_id = ?").all(tableId).map(row => row.image_hash));
      const result = await prepareCustomerDraft({
        configuration,
        usedHashes,
        periodLabel: `${calendarYear}, KW ${String(weekNumber).padStart(2, "0")}`
      });
      const draftId = randomUUID();
      const createdAt = nowIso();
      try {
        database.prepare(`
          INSERT INTO ai_drafts (id, table_id, table_name, calendar_year, week_number, item_index, content_type,
            image_name, image_path, image_hash, image_mime_type, image_description, german_text, italian_text,
            assignments_json, config_snapshot_json, sources_json, status, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'post', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
        `).run(draftId, tableId, tableName, calendarYear, weekNumber, itemIndex, result.image.name, result.image.path,
          result.image.hash, result.image.mimeType, result.imageDescription, result.germanText, result.italianText,
          JSON.stringify(result.assignments), JSON.stringify(configuration), JSON.stringify(result.sources), signedInUser?.id || "admin-key", createdAt);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) return sendJson(response, 409, { error: "Dieses Bild wurde gerade bereits für den Kunden verwendet. Bitte starte den Entwurf erneut." });
        throw error;
      }
      return sendJson(response, 201, { draft: publicAiDraft(database.prepare("SELECT * FROM ai_drafts WHERE id = ?").get(draftId)) });
    } catch (error) {
      return sendJson(response, Number(error.statusCode) || 502, { error: error.message || "Der KI-Entwurf konnte nicht vorbereitet werden." });
    } finally {
      processingAiTables.delete(tableId);
    }
  }
  if (pathname === "/api/admin/instagram-config" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf die Meta-App einrichten." });
    if (isProduction || !isLoopback(request.socket.remoteAddress)) {
      return sendJson(response, 403, { error: "Die Zugangsdaten können aus Sicherheitsgründen nur am lokalen Computer eingetragen werden." });
    }
    const body = await readJson(request);
    const appId = String(body.appId || "").trim();
    const appSecret = String(body.appSecret || "").trim();
    const currentInstagram = instagramConfiguration();
    if (!/^\d{5,40}$/.test(appId)) return sendJson(response, 400, { error: "Bitte gib eine gültige numerische Instagram App-ID ein." });
    if (!appSecret && !currentInstagram.appSecret) return sendJson(response, 400, { error: "Bitte gib auch das Instagram App-Secret ein." });
    if (appSecret && !/^[^\s]{16,200}$/.test(appSecret)) {
      return sendJson(response, 400, { error: "Das App-Secret ist ungültig. Es darf keine Leerzeichen enthalten." });
    }
    const environmentValues = { INSTAGRAM_APP_ID: appId };
    if (appSecret) environmentValues.INSTAGRAM_APP_SECRET = appSecret;
    writeLocalEnvironmentValues(environmentValues);
    process.env.INSTAGRAM_APP_ID = appId;
    if (appSecret) process.env.INSTAGRAM_APP_SECRET = appSecret;
    const updated = instagramConfiguration();
    return sendJson(response, 200, {
      ok: true,
      instagramConfigured: Boolean(updated.appId && updated.appSecret),
      instagramAppId: updated.appId,
      instagramAppSecretConfigured: Boolean(updated.appSecret),
      message: "Instagram-Login-Zugang gespeichert. Prüfe zusätzlich die OAuth-Rückrufadresse und die Freigabe in Meta."
    });
  }
  if (pathname === "/api/translate" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Übersetzungen erstellen." });
    const body = await readJson(request);
    try {
      const result = await translateFromGerman(body.text, body.targetLanguage);
      return sendJson(response, 200, { translation: result.text, provider: result.provider });
    } catch (error) {
      return sendJson(response, Number(error.statusCode) || 502, { error: error.message });
    }
  }
  if (pathname === "/api/admin/overview" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf die Backend-Übersicht einsehen." });
    const instagram = instagramConfiguration();
    const statusRows = database.prepare("SELECT status, COUNT(*) AS count FROM publications GROUP BY status").all();
    const publicationStatuses = Object.fromEntries(statusRows.map(row => [row.status, Number(row.count)]));
    const publicationCount = Number(database.prepare("SELECT COUNT(*) AS count FROM publications").get().count);
    const connections = database.prepare("SELECT * FROM instagram_connections ORDER BY table_name COLLATE NOCASE").all().map(publicConnection);
    const recentPublications = database.prepare("SELECT * FROM publications ORDER BY created_at DESC LIMIT 20").all().map(publicPublication);
    const planner = storedPlannerState().state;
    const mediaUsage = new Map();
    const mediaLocations = new Map();
    const tableNames = new Map((planner?.tables || []).map(table => [String(table.id), String(table.name || "Kundentabelle")]));
    (planner?.tables || []).forEach(table => Object.entries(table.weeks || {}).forEach(([storageKey, week]) => {
      const storageParts = String(storageKey).split("-").map(Number);
      const calendarYear = storageParts.length > 1 ? storageParts[0] : planningStartYear;
      const weekNumber = storageParts.length > 1 ? storageParts[1] : storageParts[0];
      (week?.items || []).forEach((item, itemIndex) => (item.media || []).forEach(media => {
        if (!media?.id && !media?.previewId) return;
        const usageMediaId = String(media.id || media.previewId);
        const types = mediaUsage.get(usageMediaId) || new Set();
        types.add(item.type === "story" ? "story" : "post");
        mediaUsage.set(usageMediaId, types);
        const location = {
          tableId: String(table.id),
          tableName: String(table.name || "Kundentabelle"),
          calendarYear,
          weekNumber,
          contentType: item.type === "story" ? "story" : "post",
          itemIndex,
          rowKey: `${table.id}:${calendarYear}:${weekNumber}:${itemIndex}`
        };
        [media.id, media.previewId].filter(Boolean).forEach(mediaId => {
          const locations = mediaLocations.get(String(mediaId)) || new Map();
          locations.set(location.rowKey, location);
          mediaLocations.set(String(mediaId), locations);
        });
      }));
    }));
    const mediaRows = database.prepare("SELECT * FROM planner_media ORDER BY created_at DESC").all();
    const allOriginalRows = mediaRows.filter(row => !String(row.original_name || "").startsWith(".preview-"));
    const originalRows = allOriginalRows.filter(row => !row.archived_at);
    const archivedOriginalRows = new Map(allOriginalRows.filter(row => row.archived_at).map(row => [String(row.id), row]));
    const originalIds = new Set(originalRows.map(row => String(row.id)));
    const previewRows = new Map();
    mediaRows.forEach(row => {
      const match = String(row.original_name || "").match(/^\.preview-(.+)\.(?:jpe?g|png|webp)$/i);
      if (match) previewRows.set(String(match[1]), row);
    });
    const media = originalRows.map(row => {
      const usage = mediaUsage.get(String(row.id));
      const kind = usage?.has("story") ? "story" : String(row.mime_type || "").startsWith("video/") ? "video" : "photo";
      const previewRow = previewRows.get(String(row.id));
      return {
        ...publicPlannerMedia(row),
        tableName: tableNames.get(String(row.table_id)) || "Kundentabelle",
        kind,
        originalAvailable: true,
        previewAvailable: Boolean(previewRow),
        previewId: previewRow?.id || "",
        previewSize: Number(previewRow?.byte_size) || 0,
        previewUrl: previewRow ? `/api/planner-media/${encodeURIComponent(previewRow.id)}` : "",
        fileState: previewRow ? "original_and_preview" : "original_only",
        restorableOriginal: false,
        archivedOriginalId: "",
        locations: [...(mediaLocations.get(String(row.id))?.values() || [])].sort((a, b) => a.calendarYear - b.calendarYear || a.weekNumber - b.weekNumber || a.contentType.localeCompare(b.contentType))
      };
    });
    for (const [originalId, previewRow] of previewRows) {
      if (originalIds.has(originalId)) continue;
      const archivedOriginal = archivedOriginalRows.get(originalId);
      const archivedPath = archivedOriginal ? archivePathForMedia(archivedOriginal) : "";
      const restorableOriginal = Boolean(archivedOriginal && archivedPath && existsSync(archivedPath));
      const usage = mediaUsage.get(String(previewRow.id));
      media.push({
        ...publicPlannerMedia(previewRow),
        name: archivedOriginal?.original_name || `Vorschau ohne Original (${originalId.slice(0, 8)})`,
        type: archivedOriginal?.mime_type || previewRow.mime_type,
        size: Number(archivedOriginal?.byte_size) || Number(previewRow.byte_size) || 0,
        createdAt: archivedOriginal?.created_at || previewRow.created_at,
        sourceReference: archivedOriginal?.source_path || archivedOriginal?.original_name || previewRow.original_name,
        tableName: tableNames.get(String(previewRow.table_id)) || "Kundentabelle",
        kind: usage?.has("story") ? "story" : String(archivedOriginal?.mime_type || previewRow.mime_type || "").startsWith("video/") ? "video" : "photo",
        originalAvailable: false,
        previewAvailable: true,
        previewId: previewRow.id,
        previewSize: Number(previewRow.byte_size) || 0,
        previewUrl: `/api/planner-media/${encodeURIComponent(previewRow.id)}`,
        fileState: "preview_only",
        restorableOriginal,
        archivedOriginalId: restorableOriginal ? originalId : "",
        locations: [...(mediaLocations.get(String(previewRow.id))?.values() || [])].sort((a, b) => a.calendarYear - b.calendarYear || a.weekNumber - b.weekNumber || a.contentType.localeCompare(b.contentType))
      });
    }
    return sendJson(response, 200, {
      server: {
        online: true,
        time: nowIso(),
        uptimeSeconds: Math.round(process.uptime()),
        mode: isProduction ? "production" : "local"
      },
      instagram: {
        configured: Boolean(instagram.appId && instagram.appSecret),
        publicMediaConfigured: /^https:\/\//i.test(publicBaseUrl) || instagram.dryRun,
        dryRun: instagram.dryRun,
        apiVersion: instagram.apiVersion,
        connectionCount: connections.length
      },
      publications: {
        total: publicationCount,
        statuses: publicationStatuses,
        recent: recentPublications
      },
      media,
      connections
    });
  }
  if (pathname === "/api/instagram/status" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Instagram-Verbindungen einsehen." });
    const tableId = url.searchParams.get("tableId") || "";
    return sendJson(response, 200, { connection: publicConnection(connectionByTable(tableId)) });
  }
  if (pathname === "/api/instagram/connect" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Instagram-Konten verbinden." });
    const body = await readJson(request);
    if (!body.tableId || !body.tableName) return sendJson(response, 400, { error: "Kundentabelle fehlt." });
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    database.prepare("INSERT INTO oauth_states (state, table_id, table_name, expires_at) VALUES (?, ?, ?, ?)")
      .run(state, body.tableId, body.tableName, expiresAt);
    return sendJson(response, 200, { authorizationUrl: buildAuthorizationUrl(state) });
  }
  if (pathname === "/api/instagram/callback" && request.method === "GET") {
    const stateValue = url.searchParams.get("state") || "";
    const code = (url.searchParams.get("code") || "").replace(/#_$/, "");
    const oauthState = database.prepare("SELECT * FROM oauth_states WHERE state = ?").get(stateValue);
    if (!oauthState || oauthState.expires_at < nowIso()) return sendHtml(response, 400, callbackPage({ ok: false, message: "Die Anmeldung ist abgelaufen. Bitte starte sie erneut." }));
    database.prepare("DELETE FROM oauth_states WHERE state = ?").run(stateValue);
    if (!code) return sendHtml(response, 400, callbackPage({ ok: false, message: url.searchParams.get("error_description") || "Instagram hat keinen Anmeldecode zurückgegeben." }));
    try {
      const token = await exchangeAuthorizationCode(code);
      const profile = await fetchInstagramProfile(token.accessToken);
      const connectedAt = nowIso();
      const expiresAt = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null;
      database.prepare(`
        INSERT INTO instagram_connections (table_id, table_name, instagram_user_id, username, account_type, encrypted_access_token, token_expires_at, connected_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(table_id) DO UPDATE SET table_name=excluded.table_name, instagram_user_id=excluded.instagram_user_id,
          username=excluded.username, account_type=excluded.account_type, encrypted_access_token=excluded.encrypted_access_token,
          token_expires_at=excluded.token_expires_at, updated_at=excluded.updated_at
      `).run(oauthState.table_id, oauthState.table_name, String(profile.id || token.instagramUserId), profile.username || null,
        profile.account_type || null, encryptSecret(token.accessToken), expiresAt, connectedAt, connectedAt);
      return sendHtml(response, 200, callbackPage({ ok: true, message: `@${profile.username || "Instagram"} wurde mit ${oauthState.table_name} verbunden.` }));
    } catch (error) {
      return sendHtml(response, 502, callbackPage({ ok: false, message: error.message }));
    }
  }
  if (pathname === "/api/instagram/connection" && request.method === "DELETE") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Instagram-Verbindungen trennen." });
    const tableId = url.searchParams.get("tableId") || "";
    database.prepare("DELETE FROM instagram_connections WHERE table_id = ?").run(tableId);
    return sendJson(response, 200, { ok: true });
  }
  if (pathname === "/api/customer-data" && request.method === "DELETE") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Backend-Daten einer Kundentabelle löschen." });
    const tableId = url.searchParams.get("tableId") || "";
    const publications = database.prepare("SELECT media_json FROM publications WHERE table_id = ?").all(tableId);
    const plannerMedia = database.prepare("SELECT stored_name, archive_stored_name FROM planner_media WHERE table_id = ?").all(tableId);
    database.prepare("DELETE FROM instagram_connections WHERE table_id = ?").run(tableId);
    database.prepare("DELETE FROM publications WHERE table_id = ?").run(tableId);
    database.prepare("DELETE FROM ai_drafts WHERE table_id = ?").run(tableId);
    database.prepare("DELETE FROM ai_customer_configs WHERE table_id = ?").run(tableId);
    database.prepare("DELETE FROM planner_media WHERE table_id = ?").run(tableId);
    publications.flatMap(row => JSON.parse(row.media_json || "[]")).forEach(media => {
      const mediaPath = join(uploadsDirectory, basename(media.storedName || ""));
      if (media.storedName && existsSync(mediaPath)) unlinkSync(mediaPath);
    });
    plannerMedia.forEach(media => {
      const mediaPath = join(uploadsDirectory, basename(media.stored_name || ""));
      if (media.stored_name && existsSync(mediaPath)) unlinkSync(mediaPath);
      const archivePath = join(originalsArchiveDirectory, basename(media.archive_stored_name || ""));
      if (media.archive_stored_name && existsSync(archivePath)) unlinkSync(archivePath);
    });
    return sendJson(response, 200, { ok: true });
  }
  if (pathname === "/api/publications" && request.method === "GET") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Veröffentlichungsaufträge einsehen." });
    const tableId = url.searchParams.get("tableId") || "";
    const rows = database.prepare("SELECT * FROM publications WHERE table_id = ? ORDER BY created_at DESC LIMIT 200").all(tableId);
    return sendJson(response, 200, { publications: rows.map(publicPublication) });
  }
  if (pathname === "/api/publications" && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Veröffentlichungen planen." });
    const form = await readFormData(request, url);
    const tableId = String(form.get("tableId") || "");
    const tableName = String(form.get("tableName") || "");
    const calendarYear = Number(form.get("calendarYear") || 2026);
    const weekNumber = Number(form.get("weekNumber"));
    const itemIndex = Number(form.get("itemIndex"));
    const requestedContentType = String(form.get("contentType") || "post");
    const caption = String(form.get("caption") || "");
    const scheduledAtValue = String(form.get("scheduledAt") || "");
    const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue).toISOString() : nowIso();
    const customerApproved = String(form.get("customerApproved")) === "true";
    const mainAdminApproved = String(form.get("mainAdminApproved")) === "true";
    const files = form.getAll("media").filter(file => file && typeof file.arrayBuffer === "function" && file.size > 0);
    const hasVideo = files.some(file => file.type.startsWith("video/"));
    const contentType = requestedContentType === "story" ? "story" : hasVideo ? "reel" : "post";
    let cropSelections = [];
    try { cropSelections = JSON.parse(String(form.get("cropSelections") || "[]")); }
    catch { cropSelections = []; }
    const instagram = instagramConfiguration();
    if (!tableId || !tableName || !Number.isInteger(calendarYear) || calendarYear < 2026 || calendarYear > 2031 || !Number.isInteger(weekNumber) || !Number.isInteger(itemIndex)) return sendJson(response, 400, { error: "Die Tabellenzuordnung ist unvollständig." });
    if (!connectionByTable(tableId) && !instagram.dryRun) return sendJson(response, 409, { error: "Verbinde zuerst das Instagram-Konto dieser Kundentabelle." });
    if (!files.length) return sendJson(response, 400, { error: "Mindestens ein Bild oder Video ist erforderlich." });
    if (contentType === "story" && files.length !== 1) return sendJson(response, 400, { error: "Eine Story benötigt genau ein Bild oder Video." });
    if (contentType === "reel" && (files.length !== 1 || !files[0].type.startsWith("video/"))) return sendJson(response, 400, { error: "Ein Reel benötigt genau eine Videodatei." });
    if (!instagram.dryRun && files.some(file => file.type.startsWith("image/") && file.type !== "image/jpeg")) return sendJson(response, 400, { error: "Instagram akzeptiert in diesem Veröffentlichungsablauf Bilder als JPEG. Bitte lade eine JPG- oder JPEG-Datei hoch." });
    if (!instagram.dryRun && files.some(file => file.type.startsWith("video/") && !["video/mp4", "video/quicktime"].includes(file.type))) return sendJson(response, 400, { error: "Videos müssen für Instagram als MP4 oder MOV vorliegen." });
    if (mainAdminApproved && !customerApproved) return sendJson(response, 400, { error: "Vor der finalen Freigabe muss der Kunde bestätigt haben." });
    if (mainAdminApproved && !/^https:\/\//i.test(publicBaseUrl) && !instagram.dryRun) return sendJson(response, 409, { error: "PUBLIC_BASE_URL muss eine öffentliche HTTPS-Adresse sein, über die Meta die Medien abrufen kann." });

    const publicationId = randomUUID();
    const storedMedia = [];
    for (const [fileIndex, file] of files.entries()) {
      const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || (file.type.startsWith("video/") ? ".mp4" : ".jpg");
      const storedName = `${randomUUID()}${extension}`;
      const filePath = join(uploadsDirectory, storedName);
      writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
      storedMedia.push({
        originalName: basename(file.name),
        storedName,
        mimeType: file.type || contentTypes[extension] || "application/octet-stream",
        publicUrl: publicBaseUrl ? `${publicBaseUrl}/media/${storedName}` : `/media/${storedName}`,
        instagramCrop: cropSelections[fileIndex] || null
      });
    }
    const status = mainAdminApproved && customerApproved ? "queued" : "draft";
    const createdAt = nowIso();
    database.prepare(`
      INSERT INTO publications (id, table_id, table_name, calendar_year, week_number, item_index, content_type, caption, media_json,
        scheduled_at, customer_approved, main_admin_approved, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(publicationId, tableId, tableName, calendarYear, weekNumber, itemIndex, contentType, caption, JSON.stringify(storedMedia),
      scheduledAt, customerApproved ? 1 : 0, mainAdminApproved ? 1 : 0, status, createdAt, createdAt);
    addPublicationEvent(publicationId, "created", status === "queued" ? "Zur Veröffentlichung eingeplant." : "Als Entwurf gespeichert.");
    const result = publicPublication(publicationById(publicationId));
    if (status === "queued" && scheduledAt <= nowIso()) void processPublication(publicationId);
    return sendJson(response, 201, { publication: result });
  }

  const publicationAction = pathname.match(/^\/api\/publications\/([^/]+)\/(publish|retry|cancel)$/);
  if (publicationAction && request.method === "POST") {
    if (!requireMainAdmin(request)) return sendJson(response, 403, { error: "Nur der Hauptadmin darf Veröffentlichungen steuern." });
    const [, publicationId, action] = publicationAction;
    const publication = publicationById(publicationId);
    if (!publication) return sendJson(response, 404, { error: "Veröffentlichungsauftrag nicht gefunden." });
    if (action === "cancel") {
      database.prepare("UPDATE publications SET status = 'cancelled', updated_at = ? WHERE id = ? AND status NOT IN ('published', 'publishing')").run(nowIso(), publicationId);
      addPublicationEvent(publicationId, "cancelled", "Vom Hauptadmin abgebrochen.");
      return sendJson(response, 200, { publication: publicPublication(publicationById(publicationId)) });
    }
    database.prepare("UPDATE publications SET status = 'queued', scheduled_at = ?, main_admin_approved = 1, customer_approved = 1, last_error = NULL, updated_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), publicationId);
    await processPublication(publicationId);
    return sendJson(response, 200, { publication: publicPublication(publicationById(publicationId)) });
  }
  return sendJson(response, 404, { error: "API-Endpunkt nicht gefunden." });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    if (url.pathname.startsWith("/media/")) {
      const fileName = basename(url.pathname.slice("/media/".length));
      if (serveFile(response, join(uploadsDirectory, fileName), true)) return;
      return sendJson(response, 404, { error: "Medium nicht gefunden." });
    }
    const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!publicStaticFiles.has(requestedPath)) return sendJson(response, 404, { error: "Datei nicht gefunden." });
    if (!serveFile(response, join(projectRoot, requestedPath))) return sendJson(response, 404, { error: "Datei nicht gefunden." });
  } catch (error) {
    console.error(error);
    sendJson(response, Number(error.statusCode) || 500, { error: error.message || "Interner Serverfehler." });
  }
});

const worker = setInterval(() => void processDuePublications(), 30_000);
worker.unref();
void processDuePublications();

server.listen(port, host, () => {
  console.log(`Planyoursocials läuft unter http://${host}:${port}`);
  if (!instagramConfiguration().appId) console.log("Instagram ist vorbereitet. Trage die Meta-App-Zugangsdaten in .env ein.");
  if (!publicBaseUrl && !instagramConfiguration().dryRun) console.log("Hinweis: Für echte Veröffentlichungen wird PUBLIC_BASE_URL als öffentliche HTTPS-Adresse benötigt.");
  if (!emailIsConfigured(emailConfiguration())) console.log("Passwort-Zurücksetzung ist vorbereitet. Trage die SMTP-Zugangsdaten in .env ein.");
});

function shutdown() {
  clearInterval(worker);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const STORAGE_KEY = "social-flow-planner-v2";
const HISTORY_DATABASE_NAME = "social-flow-planner-history";
const HISTORY_STORE_NAME = "changes";
const HISTORY_LIMIT = 1000;
const CHANGE_MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000;
const PLANNING_START_YEAR = 2026;
const PLANNING_END_YEAR = 2031;
const PLANNING_YEARS = Array.from({ length: PLANNING_END_YEAR - PLANNING_START_YEAR + 1 }, (_, index) => PLANNING_START_YEAR + index);
const MONTH_WEEKS_CACHE = new Map();
const YEAR_VIEW_ROW_MIN_HEIGHT = 132;
const YEAR_VIEW_ROW_MAX_HEIGHT = 650;
const COMPLETION_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const COMPLETION_PREVIEW_MAX_EDGE = 1800;
const STANDARD_TABLE_COLUMNS = [
  { key: "week", title: "KW", className: "week-column" },
  { key: "approval", title: "OK lt. Kunde", className: "approval-column" },
  { key: "media", title: "Bild oder Video", className: "media-column" },
  { key: "text", title: "Beitragstext deutsch", className: "text-column" },
  { key: "textItalian", title: "Beitragstext ita / eng", className: "translated-text-column" },
  { key: "changes", title: "Änderungswünsche", className: "changes-column" },
  { key: "status", title: "Geplant / Veröffentlicht", className: "status-column" }
];

const defaultState = {
  currentUserId: "owner",
  currentTableId: "nordlicht",
  viewMode: "year",
  selectedYear: PLANNING_START_YEAR,
  selectedWeek: 1,
  users: [
    { id: "owner", name: "Martin Zimmerhofer", role: "owner", tableIds: ["*"] },
    { id: "lea", name: "Lea Berger", role: "subadmin", tableIds: ["nordlicht"] }
  ],
  tables: [
    { id: "nordlicht", name: "Nordlicht Café", planningCadence: "weekly", storiesPerWeek: 5, postsPerWeek: 3, storiesPerMonth: 0, postsPerMonth: 0, monthlyExtraStories: 0, monthlyExtraPosts: 0, displayStartWeek: 1, visibleYears: [...PLANNING_YEARS], fixedHashtags: "", viewMode: "year", selectedYear: PLANNING_START_YEAR, selectedWeek: 1, weeks: {} },
    { id: "bergwerk", name: "Bergwerk Fitness", planningCadence: "weekly", storiesPerWeek: 7, postsPerWeek: 4, storiesPerMonth: 0, postsPerMonth: 0, monthlyExtraStories: 0, monthlyExtraPosts: 0, displayStartWeek: 1, visibleYears: [...PLANNING_YEARS], fixedHashtags: "", viewMode: "year", selectedYear: PLANNING_START_YEAR, selectedWeek: 1, weeks: {} },
    { id: "atelier", name: "Atelier Grün", planningCadence: "weekly", storiesPerWeek: 4, postsPerWeek: 2, storiesPerMonth: 0, postsPerMonth: 0, monthlyExtraStories: 0, monthlyExtraPosts: 0, displayStartWeek: 1, visibleYears: [...PLANNING_YEARS], fixedHashtags: "", viewMode: "year", selectedYear: PLANNING_START_YEAR, selectedWeek: 1, weeks: {} }
  ]
};

let state = loadState();
const proofreadingCache = new Map();
const proofreadingTimers = new WeakMap();
let proofreadingObserver = null;

const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authEyebrow = document.querySelector("#auth-eyebrow");
const authNameWrapper = document.querySelector("#auth-name-wrapper");
const authName = document.querySelector("#auth-name");
const authEmailWrapper = document.querySelector("#auth-email-wrapper");
const authEmail = document.querySelector("#auth-email");
const authPasswordWrapper = document.querySelector("#auth-password-wrapper");
const authPassword = document.querySelector("#auth-password");
const authPasswordConfirmWrapper = document.querySelector("#auth-password-confirm-wrapper");
const authPasswordConfirm = document.querySelector("#auth-password-confirm");
const passwordToggleButtons = document.querySelectorAll(".password-toggle");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const authSetupNote = document.querySelector("#auth-setup-note");
const forgotPasswordButton = document.querySelector("#forgot-password-button");
const backToLoginButton = document.querySelector("#back-to-login-button");
const persistentLoginNote = document.querySelector("#persistent-login-note");
const logoutButton = document.querySelector("#logout-button");
const rolePreviewDialog = document.querySelector("#role-preview-dialog");
const rolePreviewForm = document.querySelector("#role-preview-form");
const rolePreviewUser = document.querySelector("#role-preview-user");
const rolePreviewBanner = document.querySelector("#role-preview-banner");
const navigation = document.querySelector("#table-navigation");
const tableBody = document.querySelector("#content-table-body");
const contentTable = document.querySelector(".content-table");
const contentTableColumns = document.querySelector("#content-table-columns");
const contentTableHead = document.querySelector("#content-table-head");
const tableTitle = document.querySelector("#table-title");
const tableSubtitle = document.querySelector("#table-subtitle");
const storiesInput = document.querySelector("#stories-per-week");
const postsInput = document.querySelector("#posts-per-week");
const subadminList = document.querySelector("#subadmin-list");
const tableDialog = document.querySelector("#table-dialog");
const tableForm = document.querySelector("#table-form");
const dialogVisibleYears = document.querySelector("#dialog-visible-years");
const visibleYearsError = document.querySelector("#visible-years-error");
const monthlyExtrasError = document.querySelector("#monthly-extras-error");
const dialogCadenceWeekly = document.querySelector("#dialog-cadence-weekly");
const dialogCadenceMonthly = document.querySelector("#dialog-cadence-monthly");
const dialogWeeklyAmounts = document.querySelector("#dialog-weekly-amounts");
const dialogMonthlyAmounts = document.querySelector("#dialog-monthly-amounts");
const monthlyPlanningHint = document.querySelector("#monthly-planning-hint");
const dialogMonthlyExtras = document.querySelector("#dialog-monthly-extras");
const dialogMonthlyExtrasHint = document.querySelector("#dialog-monthly-extras-hint");
const subadminDialog = document.querySelector("#subadmin-dialog");
const subadminForm = document.querySelector("#subadmin-form");
const subadminTables = document.querySelector("#subadmin-tables");
const subadminError = document.querySelector("#subadmin-error");
const subadminName = document.querySelector("#subadmin-name");
const subadminNameLabel = document.querySelector("#subadmin-name-label");
const subadminEmail = document.querySelector("#subadmin-email");
const subadminPassword = document.querySelector("#subadmin-password");
const subadminPasswordLabel = document.querySelector("#subadmin-password-label");
const subadminPasswordHint = document.querySelector("#subadmin-password-hint");
const mediaViewer = document.querySelector("#media-viewer");
const mediaViewerContent = document.querySelector("#media-viewer-content");
const mediaViewerCounter = document.querySelector("#media-viewer-counter");
const mediaViewerPrevious = document.querySelector("#media-viewer-previous");
const mediaViewerNext = document.querySelector("#media-viewer-next");
const mediaNoteDialog = document.querySelector("#media-note-dialog");
const mediaNoteForm = document.querySelector("#media-note-form");
const mediaNoteTitle = document.querySelector("#media-note-title");
const mediaNoteFileName = document.querySelector("#media-note-file-name");
const mediaNoteText = document.querySelector("#media-note-text");
const removeMediaNoteButton = document.querySelector("#remove-media-note");
const contentCard = document.querySelector(".content-card");
const workspace = document.querySelector(".workspace");
const tableScroll = document.querySelector(".table-scroll");
const contentTableTitle = document.querySelector("#content-table-title");
const contentTableDescription = document.querySelector("#content-table-description");
const weekPickerWrapper = document.querySelector("#week-picker-wrapper");
const weekPicker = document.querySelector("#week-picker");
const previousWeekButton = document.querySelector("#previous-week");
const nextWeekButton = document.querySelector("#next-week");
const viewModeButtons = [...document.querySelectorAll("[data-view-mode]")];
const hiddenWeeksButton = document.querySelector("#hidden-weeks-button");
const hiddenWeeksCount = document.querySelector("#hidden-weeks-count");
const hiddenWeeksDialog = document.querySelector("#hidden-weeks-dialog");
const hiddenWeeksList = document.querySelector("#hidden-weeks-list");
const restoreAllWeeksButton = document.querySelector("#restore-all-weeks");
const hideWeeksRangeForm = document.querySelector("#hide-weeks-range-form");
const hideWeeksFrom = document.querySelector("#hide-weeks-from");
const hideWeeksTo = document.querySelector("#hide-weeks-to");
const hideWeeksRangeError = document.querySelector("#hide-weeks-range-error");
const manageColumnsButton = document.querySelector("#manage-columns-button");
const fixedHashtagsButton = document.querySelector("#fixed-hashtags-button");
const fixedHashtagsDialog = document.querySelector("#fixed-hashtags-dialog");
const fixedHashtagsForm = document.querySelector("#fixed-hashtags-form");
const fixedHashtagsText = document.querySelector("#fixed-hashtags-text");
const columnsDialog = document.querySelector("#columns-dialog");
const customColumnsList = document.querySelector("#custom-columns-list");
const customColumnForm = document.querySelector("#custom-column-form");
const customColumnType = document.querySelector("#custom-column-type");
const customCheckboxLabelWrapper = document.querySelector("#custom-checkbox-label-wrapper");
const deleteTranslatedColumnDialog = document.querySelector("#delete-translated-column-dialog");
const deleteTranslatedColumnFinalDialog = document.querySelector("#delete-translated-column-final-dialog");
const continueDeleteTranslatedColumnButton = document.querySelector("#continue-delete-translated-column");
const confirmDeleteTranslatedColumnButton = document.querySelector("#confirm-delete-translated-column");
const undoButton = document.querySelector("#undo-button");
const deleteTableButton = document.querySelector("#delete-table-button");
const deleteTableDialog = document.querySelector("#delete-table-dialog");
const deleteTableFinalDialog = document.querySelector("#delete-table-final-dialog");
const deleteTableMessage = document.querySelector("#delete-table-message");
const deleteTableFinalMessage = document.querySelector("#delete-table-final-message");
const continueDeleteTableButton = document.querySelector("#continue-delete-table");
const confirmDeleteTableButton = document.querySelector("#confirm-delete-table");
const historyButton = document.querySelector("#history-button");
const historyDialog = document.querySelector("#history-dialog");
const historyList = document.querySelector("#history-list");
const historyCount = document.querySelector("#history-count");
const historyStorageSize = document.querySelector("#history-storage-size");
const historyPreviewBanner = document.querySelector("#history-preview-banner");
const historyPreviewDescription = document.querySelector("#history-preview-description");
const exitHistoryPreviewButton = document.querySelector("#exit-history-preview");
const restoreHistoryVersionButton = document.querySelector("#restore-history-version");
const instagramSettingsButton = document.querySelector("#instagram-settings-button");
const instagramDialog = document.querySelector("#instagram-dialog");
const instagramTableSelect = document.querySelector("#instagram-table-select");
const instagramAppConfigSection = document.querySelector("#instagram-app-config-section");
const instagramAppConfigForm = document.querySelector("#instagram-app-config-form");
const instagramAppId = document.querySelector("#instagram-app-id");
const instagramAppSecret = document.querySelector("#instagram-app-secret");
const instagramAppSecretHint = document.querySelector("#instagram-app-secret-hint");
const instagramConfigStatus = document.querySelector("#instagram-config-status");
const saveInstagramConfigButton = document.querySelector("#save-instagram-config-button");
const instagramProfileUrl = document.querySelector("#instagram-profile-url");
const openInstagramProfileButton = document.querySelector("#open-instagram-profile-button");
const instagramConnectionCard = document.querySelector("#instagram-connection-card");
const connectInstagramButton = document.querySelector("#connect-instagram-button");
const disconnectInstagramButton = document.querySelector("#disconnect-instagram-button");
const instagramPublicationsList = document.querySelector("#instagram-publications-list");
const instagramDialogError = document.querySelector("#instagram-dialog-error");
const backendButton = document.querySelector("#backend-button");
const backendDialog = document.querySelector("#backend-dialog");
const backendStatusCard = document.querySelector("#backend-status-card");
const backendTableCount = document.querySelector("#backend-table-count");
const backendConnectionCount = document.querySelector("#backend-connection-count");
const backendPublicationCount = document.querySelector("#backend-publication-count");
const backendOpenCount = document.querySelector("#backend-open-count");
const backendLastUpdated = document.querySelector("#backend-last-updated");
const backendSystemDetails = document.querySelector("#backend-system-details");
const backendConnectionsList = document.querySelector("#backend-connections-list");
const backendPublicationsList = document.querySelector("#backend-publications-list");
const toggleBackendMediaButton = document.querySelector("#toggle-backend-media");
const backendMediaSummary = document.querySelector("#backend-media-summary");
const backendMediaPanel = document.querySelector("#backend-media-panel");
const backendMediaSort = document.querySelector("#backend-media-sort");
const backendMediaDirection = document.querySelector("#backend-media-direction");
const backendMediaList = document.querySelector("#backend-media-list");
const openMediaLibraryButton = document.querySelector("#open-media-library");
const mediaLibraryDialog = document.querySelector("#media-library-dialog");
const mediaLibrarySummary = document.querySelector("#media-library-summary");
const mediaLibrarySort = document.querySelector("#media-library-sort");
const mediaLibraryDirection = document.querySelector("#media-library-direction");
const mediaLibraryList = document.querySelector("#media-library-list");
const deleteOriginalDialog = document.querySelector("#delete-original-dialog");
const deleteOriginalFinalDialog = document.querySelector("#delete-original-final-dialog");
const deleteOriginalMessage = document.querySelector("#delete-original-message");
const deleteOriginalFinalMessage = document.querySelector("#delete-original-final-message");
const continueDeleteOriginalButton = document.querySelector("#continue-delete-original");
const confirmDeleteOriginalButton = document.querySelector("#confirm-delete-original");
const backendDialogError = document.querySelector("#backend-dialog-error");
const refreshBackendButton = document.querySelector("#refresh-backend-button");
const publicationDialog = document.querySelector("#publication-dialog");
const publicationForm = document.querySelector("#publication-form");
const publicationContentType = document.querySelector("#publication-content-type");
const publicationScheduledAt = document.querySelector("#publication-scheduled-at");
const publicationCaption = document.querySelector("#publication-caption");
const publicationCustomerApproved = document.querySelector("#publication-customer-approved");
const publicationAdminApproved = document.querySelector("#publication-admin-approved");
const publicationError = document.querySelector("#publication-error");
const publicationMediaSummary = document.querySelector("#publication-media-summary");
const publicationCropSection = document.querySelector("#publication-crop-section");
const publicationCropList = document.querySelector("#publication-crop-list");
const savePublicationButton = document.querySelector("#save-publication-button");
const aiAgentButton = document.querySelector("#ai-agent-button");
const aiAgentDialog = document.querySelector("#ai-agent-dialog");
const aiAgentForm = document.querySelector("#ai-agent-form");
const aiAgentTableSelect = document.querySelector("#ai-agent-table-select");
const aiAgentEnabled = document.querySelector("#ai-agent-enabled");
const aiAgentRuntimeStatus = document.querySelector("#ai-agent-runtime-status");
const aiAgentImageFolder = document.querySelector("#ai-agent-image-folder");
const selectAiAgentFolderButton = document.querySelector("#select-ai-agent-folder");
const aiAgentWebsites = document.querySelector("#ai-agent-websites");
const aiAgentPdfs = document.querySelector("#ai-agent-pdfs");
const aiAgentTone = document.querySelector("#ai-agent-tone");
const aiAgentForbiddenTerms = document.querySelector("#ai-agent-forbidden-terms");
const aiAgentNotes = document.querySelector("#ai-agent-notes");
const aiAgentGermanField = document.querySelector("#ai-agent-german-field");
const aiAgentItalianField = document.querySelector("#ai-agent-italian-field");
const aiAgentError = document.querySelector("#ai-agent-error");
const saveAiAgentConfigButton = document.querySelector("#save-ai-agent-config");
const rowCutBanner = document.querySelector("#row-cut-banner");

let pendingDeleteColumnKey = null;
let pendingDeleteTableId = null;
let pendingOriginalDeletion = null;
let viewerMediaItems = [];
let viewerMediaIndex = 0;
let pendingMediaNote = null;
let historyPreview = null;
let loadedHistoryEntries = [];
let loadedBackendMedia = [];
let historyWriteQueue = Promise.resolve();
let saveStatusTimer = null;
let draggedColumnKey = null;
let draggedMediaContext = null;
let backendConfig = null;
let currentInstagramConnection = null;
let pendingPublicationContext = null;
let authenticatedAccount = null;
let plannerStateReady = false;
let plannerSaveTimer = null;
let plannerSaveQueue = Promise.resolve();
let authenticationMode = "login";
let passwordResetToken = new URLSearchParams(window.location.search).get("resetToken") || "";
let invitationToken = new URLSearchParams(window.location.search).get("invite") || "";
let changeMessageEditExpiryTimer = null;
let currentAiConfiguration = null;
let pendingRowCut = null;
let rolePreview = null;
const undoStack = [];
const UNDO_LIMIT = 20;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.tables?.length ? repairStoredMediaCounts(saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function repairStoredMediaCounts(savedState) {
  savedState.tables.forEach(table => {
    Object.values(table.weeks ?? {}).forEach(week => {
      (week?.items ?? []).forEach(item => {
        item.mediaCount = Math.max(1, Math.trunc(Number(item.mediaCount) || 1));
        item.completed = Boolean(item.completed);
        item.media = Array.isArray(item.media) ? item.media.map(record => record && (record.id || record.previewId) ? {
          id: record.id ? String(record.id) : "",
          tableId: String(record.tableId || table.id),
          name: String(record.name || "Medium"),
          type: String(record.type || "application/octet-stream"),
          size: Number(record.size) || 0,
          url: record.id ? `/api/planner-media/${encodeURIComponent(record.id)}` : "",
          originalAvailable: record.originalAvailable !== false && Boolean(record.id),
          fileState: String(record.fileState || (!record.id && record.previewId ? "preview_only" : record.previewId ? "original_and_preview" : "original_only")),
          previewId: record.previewId ? String(record.previewId) : "",
          previewName: record.previewName ? String(record.previewName) : "",
          previewType: record.previewType ? String(record.previewType) : "",
          previewSize: Number(record.previewSize) || 0,
          previewUrl: record.previewId ? `/api/planner-media/${encodeURIComponent(record.previewId)}` : "",
          archivedOriginalId: record.archivedOriginalId ? String(record.archivedOriginalId) : "",
          archivedOriginalName: record.archivedOriginalName ? String(record.archivedOriginalName) : "",
          sourceReference: record.sourceReference ? String(record.sourceReference) : ""
        } : null) : [];
        item.textItalian = String(item.textItalian ?? "");
        normalizeTranslationEntries(item);
        normalizeChangeComments(item);
      });
    });
  });
  return savedState;
}

function persistentMediaRecord(record) {
  if (!record?.id && !record?.previewId) return null;
  return {
    id: record.id || "",
    tableId: record.tableId || "",
    name: record.name || "Medium",
    type: record.type || "application/octet-stream",
    size: Number(record.size) || 0,
    url: record.id ? (record.serverUrl || `/api/planner-media/${encodeURIComponent(record.id)}`) : "",
    originalAvailable: record.originalAvailable !== false && Boolean(record.id),
    fileState: record.fileState || (!record.id && record.previewId ? "preview_only" : record.previewId ? "original_and_preview" : "original_only"),
    previewId: record.previewId || "",
    previewName: record.previewName || "",
    previewType: record.previewType || "",
    previewSize: Number(record.previewSize) || 0,
    previewUrl: record.previewId ? (record.previewServerUrl || `/api/planner-media/${encodeURIComponent(record.previewId)}`) : "",
    archivedOriginalId: record.archivedOriginalId || "",
    archivedOriginalName: record.archivedOriginalName || "",
    sourceReference: record.sourceReference || "",
    note: String(record.note ?? "").slice(0, 1000)
  };
}

function syncItemPersistentMedia(item) {
  item.media = itemMedia(item).map(persistentMediaRecord);
}

function storedWeekItems(week) {
  const items = [week?.items, week?.weeklyCadenceItems, week?.monthlyCadenceItems]
    .filter(Array.isArray)
    .flat();
  return [...new Set(items)];
}

function serializablePlannerState() {
  state.tables.forEach(table => Object.values(table.weeks ?? {}).forEach(week => {
    storedWeekItems(week).forEach(syncItemPersistentMedia);
  }));
  const copy = JSON.parse(JSON.stringify(state));
  return {
    tables: copy.tables,
    sharedTableLayoutEnabled: Boolean(copy.sharedTableLayoutEnabled),
    tableTemplateSourceId: copy.tableTemplateSourceId || "bergwerk",
    tableTemplateSchema: copy.tableTemplateSchema || null
  };
}

function setSaveStatus(stateName, label) {
  const status = document.querySelector("#save-status");
  if (!status) return;
  status.dataset.state = stateName;
  status.lastChild.textContent = ` ${label}`;
}

function queuePlannerSave() {
  if (!plannerStateReady || !authenticatedAccount || rolePreview) return;
  clearTimeout(plannerSaveTimer);
  plannerSaveTimer = setTimeout(() => {
    plannerSaveTimer = null;
    if (rolePreview) return;
    const snapshot = serializablePlannerState();
    plannerSaveQueue = plannerSaveQueue.catch(() => {}).then(async () => {
      await apiRequest("/api/planner-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: snapshot })
      });
      setSaveStatus("saved", "Sicher gespeichert");
    }).catch(error => {
      console.error("Die Tabellendaten konnten nicht im Backend gespeichert werden.", error);
      setSaveStatus("error", "Backend-Speicherung fehlgeschlagen");
    });
  }, 400);
}

function normalizeTranslationEntries(item) {
  const supportedLanguages = new Set(["it", "en", "manual"]);
  const entries = [];
  const usedLanguages = new Set();
  if (Array.isArray(item.translationEntries)) {
    item.translationEntries.forEach(entry => {
      const language = supportedLanguages.has(entry?.language) ? entry.language : "manual";
      const text = String(entry?.text ?? "").trim();
      if (!text || (language !== "manual" && usedLanguages.has(language))) return;
      entries.push({ language, text });
      if (language !== "manual") usedLanguages.add(language);
    });
  }
  const existingText = String(item.textItalian ?? "").trim();
  if (!entries.length && existingText) {
    const legacyLanguage = item.translationLanguage === "en" ? "en" : item.translationLanguage === "it" ? "it" : "manual";
    entries.push({ language: legacyLanguage, text: existingText });
  }
  item.translationEntries = entries;
  item.textItalian = entries.map(entry => entry.text).filter(Boolean).join("\n\n");
  return entries;
}

function setManualTranslationText(item, value) {
  item.textItalian = String(value ?? "");
  item.translationEntries = item.textItalian.trim()
    ? [{ language: "manual", text: item.textItalian }]
    : [];
  item.translationLanguage = "manual";
}

function saveState() {
  if (historyPreview || rolePreview) return;
  clearTimeout(saveStatusTimer);
  setSaveStatus("saving", "Speichert …");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Die optionale lokale Sicherheitskopie konnte nicht gespeichert werden.", error);
  }
  queuePlannerSave();
  if (!plannerStateReady) saveStatusTimer = setTimeout(() => setSaveStatus("saved", "Lokal gespeichert"), 180);
}

function openHistoryDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const store = database.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("tableId", "tableId");
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionFinished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
  });
}

async function storeHistoryEntry(entry) {
  if (plannerStateReady && authenticatedAccount) {
    await apiRequest("/api/planner-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    return;
  }
  const database = await openHistoryDatabase();
  try {
    const addTransaction = database.transaction(HISTORY_STORE_NAME, "readwrite");
    addTransaction.objectStore(HISTORY_STORE_NAME).add(entry);
    await transactionFinished(addTransaction);

    const count = await new Promise((resolve, reject) => {
      const request = database.transaction(HISTORY_STORE_NAME).objectStore(HISTORY_STORE_NAME).count();
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const excess = Math.max(0, count - HISTORY_LIMIT);
    if (!excess) return;

    const trimTransaction = database.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = trimTransaction.objectStore(HISTORY_STORE_NAME);
    let removed = 0;
    store.openCursor().addEventListener("success", event => {
      const cursor = event.target.result;
      if (!cursor || removed >= excess) return;
      cursor.delete();
      removed += 1;
      cursor.continue();
    });
    await transactionFinished(trimTransaction);
  } finally {
    database.close();
  }
}

function serializableTable(table) {
  return table ? JSON.parse(JSON.stringify(table)) : null;
}

function recordTableHistory(table, description = "Tabelleninhalt geändert") {
  if (!table || historyPreview || rolePreview) return;
  const snapshot = serializableTable(table);
  const serialized = JSON.stringify(snapshot);
  const user = currentUser();
  const entry = {
    timestamp: Date.now(),
    tableId: table.id,
    tableName: table.name,
    userId: user?.id ?? "unknown",
    userName: user?.name ?? "Unbekannt",
    description,
    byteSize: new Blob([serialized]).size,
    snapshot
  };
  historyWriteQueue = historyWriteQueue
    .then(() => storeHistoryEntry(entry))
    .catch(error => console.error("Der Änderungsverlauf konnte nicht gespeichert werden.", error));
}

function recordHistorySnapshot(description) {
  recordTableHistory(currentTable(), description);
}

async function getHistoryEntries() {
  await historyWriteQueue;
  if (plannerStateReady && authenticatedAccount && isOwner()) {
    const result = await apiRequest("/api/planner-history");
    return result.entries || [];
  }
  const database = await openHistoryDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const entries = [];
      const request = database.transaction(HISTORY_STORE_NAME).objectStore(HISTORY_STORE_NAME).openCursor(null, "prev");
      request.addEventListener("success", () => {
        const cursor = request.result;
        if (!cursor || entries.length >= HISTORY_LIMIT) {
          resolve(entries);
          return;
        }
        entries.push(cursor.value);
        cursor.continue();
      });
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

function itemMedia(item) {
  if (!Object.prototype.hasOwnProperty.call(item, "runtimeMedia")) {
    const storedMedia = Array.isArray(item.media) ? item.media.map(record => record ? {
      ...record,
      url: record.url || (record.id ? `/api/planner-media/${encodeURIComponent(record.id)}` : ""),
      serverUrl: record.url || (record.id ? `/api/planner-media/${encodeURIComponent(record.id)}` : "")
    } : null) : [];
    Object.defineProperty(item, "runtimeMedia", { value: storedMedia, writable: true, configurable: true, enumerable: false });
  }
  return item.runtimeMedia;
}

function captureMediaState() {
  const entries = [];
  state.tables.forEach(table => {
    Object.entries(table.weeks ?? {}).forEach(([weekNumber, week]) => {
      (week.items ?? []).forEach((item, itemIndex) => {
        const media = itemMedia(item).map(record => record ? { ...record } : null);
        if (media.some(Boolean)) entries.push({ tableId: table.id, weekNumber, itemIndex, media });
      });
    });
  });
  return entries;
}

function captureTableRuntimeMedia(table) {
  const entries = [];
  Object.entries(table?.weeks ?? {}).forEach(([weekNumber, week]) => {
    (week.items ?? []).forEach((item, itemIndex) => {
      const media = itemMedia(item).slice();
      if (media.some(Boolean)) entries.push({ weekNumber, itemIndex, media });
    });
  });
  return entries;
}

function attachTableRuntimeMedia(table, entries) {
  entries.forEach(entry => {
    const item = table?.weeks?.[entry.weekNumber]?.items?.[entry.itemIndex];
    if (!item) return;
    Object.defineProperty(item, "runtimeMedia", {
      value: entry.media.slice(),
      writable: true,
      configurable: true,
      enumerable: false
    });
  });
}

function revokeAllRuntimeMedia() {
  state.tables.forEach(table => {
    Object.values(table.weeks ?? {}).forEach(week => {
      (week.items ?? []).forEach(item => {
        (item.runtimeMedia ?? []).forEach(record => {
          if (record?.url?.startsWith("blob:")) URL.revokeObjectURL(record.url);
        });
      });
    });
  });
}

function restoreMediaState(entries) {
  entries.forEach(entry => {
    const table = state.tables.find(item => item.id === entry.tableId);
    const item = table?.weeks?.[entry.weekNumber]?.items?.[entry.itemIndex];
    if (!item) return;
    const media = entry.media.map(record => record ? {
      ...record,
      url: record.file ? URL.createObjectURL(record.file) : (record.serverUrl || record.url || (record.id ? `/api/planner-media/${encodeURIComponent(record.id)}` : ""))
    } : null);
    Object.defineProperty(item, "runtimeMedia", { value: media, writable: true, configurable: true, enumerable: false });
  });
}

function updateUndoButton() {
  undoButton.disabled = Boolean(rolePreview) || undoStack.length === 0;
  undoButton.title = undoStack.length
    ? `Letzte Änderung rückgängig machen (${undoStack.length} von ${UNDO_LIMIT})`
    : "Keine Änderung zum Rückgängigmachen";
}

function pushUndoState(description = "Tabelleninhalt geändert") {
  if (historyPreview || rolePreview) return;
  recordHistorySnapshot(description);
  undoStack.push({ state: structuredClone(state), media: captureMediaState() });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

function undoLastChange() {
  if (rolePreview) return;
  const previous = undoStack.pop();
  if (!previous) return;
  revokeAllRuntimeMedia();
  state = previous.state;
  restoreMediaState(previous.media);
  renderApp();
  updateUndoButton();
}

function currentUser() { return state.users.find(user => user.id === rolePreview?.userId) ?? state.users.find(user => user.id === state.currentUserId) ?? state.users[0]; }
function currentTable() { return state.tables.find(table => table.id === state.currentTableId); }
function isOwner() { return currentUser().role === "owner"; }
function firstName(name = "") { return String(name).trim().split(/\s+/)[0] || "Benutzer"; }
function tableParticipants(table) {
  if (!table) return [];
  const participants = state.users.filter(user => user.role === "owner" || (user.tableIds ?? []).includes(table.id));
  const signedIn = currentUser();
  if (signedIn && !participants.some(user => user.id === signedIn.id)) participants.push(signedIn);
  return participants.sort((left, right) => {
    if (left.role === "owner" && right.role !== "owner") return -1;
    if (right.role === "owner" && left.role !== "owner") return 1;
    return left.name.localeCompare(right.name, "de");
  });
}
function participantColor(participant, participantIndex) {
  if (participant.role === "owner") return { solid: "#249966", soft: "#e9f8f1", border: "#8fd5b7" };
  const hue = Math.round((214 + Math.max(0, participantIndex - 1) * 137.508) % 360);
  return { solid: `hsl(${hue} 68% 43%)`, soft: `hsl(${hue} 72% 96%)`, border: `hsl(${hue} 52% 74%)` };
}
function participantStyle(participant, participantIndex) {
  const color = participantColor(participant, participantIndex);
  return `--comment-color:${color.solid};--comment-soft:${color.soft};--comment-border:${color.border}`;
}
function normalizeChangeComments(item) {
  const comments = [];
  const seenUsers = new Set();
  if (Array.isArray(item?.changeComments)) {
    item.changeComments.forEach(comment => {
      const userId = String(comment?.userId ?? "").trim();
      if (!userId || seenUsers.has(userId)) return;
      comments.push({ userId, text: String(comment?.text ?? "") });
      seenUsers.add(userId);
    });
  }
  item.changeComments = comments;
  return comments;
}
function normalizeChangeMessages(item, participants = []) {
  if (!Array.isArray(item.changeMessages)) item.changeMessages = [];
  item.changeMessages = item.changeMessages.map((message, index) => ({
    id: String(message?.id || `legacy-message-${index}`),
    userId: String(message?.userId || ""),
    authorName: String(message?.authorName || ""),
    authorRole: message?.authorRole === "owner" ? "owner" : "subadmin",
    text: String(message?.text || ""),
    createdAt: String(message?.createdAt || ""),
    editedAt: String(message?.editedAt || "")
  })).filter(message => message.userId && message.text.trim());

  const owner = participants.find(participant => participant.role === "owner");
  const legacyComments = normalizeChangeComments(item);
  const legacyOwnerText = String(item.changes ?? "").trim();
  if (legacyOwnerText && owner) legacyComments.unshift({ userId: owner.id, text: legacyOwnerText });
  legacyComments.filter(comment => comment.text.trim()).forEach((comment, index) => {
    const participant = participants.find(candidate => candidate.id === comment.userId);
    item.changeMessages.push({
      id: `migrated-comment-${comment.userId}-${index}`,
      userId: comment.userId,
      authorName: participant?.name || (comment.userId === owner?.id ? owner.name : "Ehemaliger Benutzer"),
      authorRole: participant?.role === "owner" ? "owner" : "subadmin",
      text: comment.text,
      createdAt: "",
      editedAt: ""
    });
  });
  if (!legacyOwnerText || owner) item.changes = "";
  item.changeComments = [];
  return item.changeMessages;
}
function formatChangeMessageTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
function changeMessageEditDeadline(message) {
  const createdAt = new Date(message?.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt + CHANGE_MESSAGE_EDIT_WINDOW_MS : 0;
}
function canEditChangeMessage(message, user = currentUser()) {
  if (user?.role === "owner") return true;
  const deadline = changeMessageEditDeadline(message);
  return Boolean(user && message?.userId === user.id && deadline > Date.now());
}
function canDeleteChangeMessage(user = currentUser()) {
  return user?.role === "owner";
}
function renderChangeAuthorLegend(table) {
  return `<span class="change-author-legend">${tableParticipants(table).map((participant, index) => `<span class="change-author" style="${participantStyle(participant, index)}"><i aria-hidden="true"></i>${escapeHtml(firstName(participant.name))}</span>`).join("")}</span>`;
}
function renderChangeComments(item, table) {
  const participants = tableParticipants(table);
  const signedIn = currentUser();
  const signedInIndex = Math.max(0, participants.findIndex(participant => participant.id === signedIn?.id));
  const messages = normalizeChangeMessages(item, participants);
  const messageList = messages.length ? messages.map((message, messageIndex) => {
    const participantIndex = participants.findIndex(participant => participant.id === message.userId);
    const participant = participantIndex >= 0
      ? participants[participantIndex]
      : { id: message.userId, name: message.authorName || "Ehemaliger Benutzer", role: message.authorRole };
    const time = formatChangeMessageTime(message.createdAt);
    const canEdit = canEditChangeMessage(message, signedIn);
    const editDeadline = canEdit && signedIn?.role !== "owner" ? changeMessageEditDeadline(message) : 0;
    const editedLabel = message.editedAt ? `<small class="change-message-edited">bearbeitet</small>` : "";
    const editButton = canEdit
      ? `<button class="change-message-edit-button" type="button" data-edit-change-message aria-label="Nachricht bearbeiten" title="Diese Nachricht bearbeiten">✎</button>`
      : "";
    const deleteButton = canDeleteChangeMessage(signedIn)
      ? `<button class="change-message-delete-button" type="button" data-delete-change-message aria-label="Nachricht löschen" title="Diese Nachricht löschen">×</button>`
      : "";
    return `<article class="change-message ${message.userId === signedIn?.id ? "is-own" : ""}" data-message-id="${escapeHtml(message.id)}"${editDeadline ? ` data-edit-until="${editDeadline}"` : ""} style="${participantStyle(participant, participantIndex >= 0 ? participantIndex : participants.length + messageIndex)}"><header><span><i aria-hidden="true"></i>${escapeHtml(firstName(participant.name))}</span><span class="change-message-header-actions">${editedLabel}${time ? `<time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(time)}</time>` : ""}${editButton}${deleteButton}</span></header><p data-change-message-text>${escapeHtml(message.text)}</p></article>`;
  }).join("") : `<p class="change-chat-empty">Noch keine Änderungswünsche.</p>`;
  const expanded = Boolean(item.changeChatExpanded);
  const clearChatButton = canDeleteChangeMessage(signedIn) && messages.length
    ? `<button class="change-chat-clear-button" type="button" data-clear-change-chat aria-label="Gesamten Chat löschen" title="Gesamten Chat löschen">×</button>`
    : "";
  return `<div class="change-chat ${expanded ? "is-expanded" : ""}"><div class="change-chat-toolbar"><button class="change-chat-expand-button" type="button" data-toggle-change-chat aria-expanded="${expanded}" aria-label="${expanded ? "Chat einklappen" : "Vollständigen Chat aufklappen"}" title="${expanded ? "Chat einklappen" : "Vollständigen Chat aufklappen"}"><span aria-hidden="true">⌄</span></button>${clearChatButton}</div><div class="change-message-list" aria-label="Kommentarverlauf">${messageList}</div><div class="change-message-composer" style="${participantStyle(signedIn, signedInIndex)}"><textarea class="change-message-input" rows="2" maxlength="4000" placeholder="Als ${escapeHtml(firstName(signedIn?.name))} schreiben …" aria-label="Neuen Änderungswunsch schreiben" title="Enter: senden · Alt + Enter: neue Zeile"></textarea><button type="button" data-send-change-message title="Nachricht senden (Enter)">Senden</button></div></div>`;
}
function allowedTables() {
  const user = currentUser();
  return user.role === "owner" ? state.tables : state.tables.filter(table => (user.tableIds ?? []).includes(table.id));
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function proofreadingLanguage(item, translated = false) {
  if (!translated) return "de";
  const languages = [...new Set(normalizeTranslationEntries(item).map(entry => entry.language).filter(language => language === "it" || language === "en"))];
  return languages.length === 1 ? languages[0] : "auto";
}

function proofreadingAllowedWords() {
  const table = currentTable();
  const sources = [table?.name, ...state.users.map(user => user.name)];
  Object.values(table?.weeks || {}).forEach(week => (week?.items || []).forEach(item => {
    itemMedia(item).forEach(record => sources.push(record?.name, record?.previewName));
  }));
  const words = new Set();
  sources.filter(Boolean).forEach(source => {
    for (const match of String(source).matchAll(/[\p{L}\p{M}]{2,}/gu)) words.add(match[0]);
  });
  return [...words].slice(0, 500);
}

function proofreadingField(value, className, placeholder, language) {
  if (!isOwner()) return `<textarea class="${className}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
  return `<div class="proofreading-field" data-proofreading-language="${language}"><div class="proofreading-highlights" aria-hidden="true"></div><textarea class="${className}" placeholder="${escapeHtml(placeholder)}" lang="${language === "auto" ? "" : language}" spellcheck="true">${escapeHtml(value)}</textarea></div>`;
}

function proofreadingWarning() {
  if (!isOwner()) return "";
  return `<span class="proofreading-warning" role="img" aria-label="Möglicher Schreibfehler" title="Möglicher Schreibfehler" hidden><span aria-hidden="true">!</span></span>`;
}

function syncProofreadingScroll(textarea) {
  const highlights = textarea.closest(".proofreading-field")?.querySelector(".proofreading-highlights");
  if (!highlights) return;
  highlights.scrollTop = textarea.scrollTop;
  highlights.scrollLeft = textarea.scrollLeft;
}

function renderProofreadingIssues(textarea, issues = []) {
  if (!textarea?.isConnected) return;
  const field = textarea.closest(".proofreading-field");
  const highlights = field?.querySelector(".proofreading-highlights");
  const warning = textarea.closest("td")?.querySelector(".proofreading-warning");
  if (!field || !highlights || !warning) return;
  const text = textarea.value;
  const validIssues = issues.filter(issue => Number.isInteger(issue.offset) && issue.offset >= 0 && issue.length > 0 && issue.offset + issue.length <= text.length).sort((a, b) => a.offset - b.offset);
  let position = 0;
  let markup = "";
  for (const issue of validIssues) {
    if (issue.offset < position) continue;
    markup += escapeHtml(text.slice(position, issue.offset));
    const title = [issue.message, issue.suggestion ? `Vorschlag: ${issue.suggestion}` : ""].filter(Boolean).join(" · ");
    markup += `<mark title="${escapeHtml(title)}">${escapeHtml(text.slice(issue.offset, issue.offset + issue.length))}</mark>`;
    position = issue.offset + issue.length;
  }
  markup += escapeHtml(text.slice(position));
  highlights.innerHTML = `${markup}${text.endsWith("\n") ? " " : ""}`;
  warning.hidden = validIssues.length === 0;
  if (validIssues.length) {
    const summary = validIssues.slice(0, 3).map(issue => issue.suggestion ? `${issue.text} → ${issue.suggestion}` : issue.text).join(", ");
    const label = `${validIssues.length} mögliche ${validIssues.length === 1 ? "Fehlerstelle" : "Fehlerstellen"}: ${summary}`;
    warning.title = label;
    warning.setAttribute("aria-label", label);
  }
  field.classList.toggle("has-proofreading-issue", validIssues.length > 0);
  syncProofreadingScroll(textarea);
}

async function runProofreading(textarea) {
  if (!textarea?.isConnected || !textarea.matches(".content-text, .translated-content-text")) return;
  const text = textarea.value;
  const language = textarea.closest(".proofreading-field")?.dataset.proofreadingLanguage || "auto";
  if (text.trim().length < 2) {
    renderProofreadingIssues(textarea, []);
    return;
  }
  const cacheKey = `${language}\u0000${text}`;
  const requestId = `${Date.now()}-${Math.random()}`;
  textarea.dataset.proofreadingRequest = requestId;
  try {
    let result = proofreadingCache.get(cacheKey);
    if (!result) {
      result = await apiRequest("/api/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, allowedWords: proofreadingAllowedWords() })
      });
      proofreadingCache.set(cacheKey, result);
      if (proofreadingCache.size > 300) proofreadingCache.delete(proofreadingCache.keys().next().value);
    }
    if (textarea.isConnected && textarea.dataset.proofreadingRequest === requestId && textarea.value === text) renderProofreadingIssues(textarea, result.issues);
  } catch {
    if (textarea.isConnected && textarea.dataset.proofreadingRequest === requestId) renderProofreadingIssues(textarea, []);
  }
}

function scheduleProofreading(textarea, immediate = false) {
  clearTimeout(proofreadingTimers.get(textarea));
  renderProofreadingIssues(textarea, []);
  const timer = setTimeout(() => runProofreading(textarea), immediate ? 0 : 750);
  proofreadingTimers.set(textarea, timer);
}

function observeVisibleProofreadingFields() {
  proofreadingObserver?.disconnect();
  const textareas = tableBody.querySelectorAll(".proofreading-field textarea");
  if (!("IntersectionObserver" in window)) {
    textareas.forEach(textarea => scheduleProofreading(textarea, true));
    return;
  }
  proofreadingObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target.value.trim()) scheduleProofreading(entry.target, true);
    });
  }, { rootMargin: "120px" });
  textareas.forEach(textarea => proofreadingObserver.observe(textarea));
}

function initials(name) {
  return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function ensureCurrentTable() {
  const available = allowedTables();
  if (!available.some(table => table.id === state.currentTableId)) {
    state.currentTableId = available[0]?.id ?? null;
    const table = currentTable();
    if (table) {
      state.viewMode = table.viewMode === "week" ? "week" : "year";
      state.selectedYear = Number(table.selectedYear) || PLANNING_START_YEAR;
      state.selectedWeek = tableDisplayStartWeek(table);
    }
  }
}

function createContentItem(type) {
  return { type, approved: false, published: false, completed: false, text: "", textItalian: "", translationEntries: [], translationLanguage: "", changes: "", changeComments: [], changeMessages: [], mediaCount: 1, weekViewHeight: null };
}

function isoWeekNumber(date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil((((thursday - yearStart) / 86_400_000) + 1) / 7);
}

function weeksInIsoYear(year) {
  return isoWeekNumber(new Date(Date.UTC(year, 11, 28)));
}

function periodKey(year, weekNumber) {
  return `${year}-${weekNumber}`;
}

function weekStorageKey(year, weekNumber) {
  return year === PLANNING_START_YEAR ? String(weekNumber) : periodKey(year, weekNumber);
}

function parsePeriodKey(value) {
  const [yearValue, weekValue] = String(value).split("-").map(Number);
  return { year: yearValue, weekNumber: weekValue };
}

function tableVisibleYears(table) {
  if (!table) return [...PLANNING_YEARS];
  const visibleYears = [...new Set((table.visibleYears ?? PLANNING_YEARS).map(Number).filter(year => PLANNING_YEARS.includes(year)))].sort((a, b) => a - b);
  table.visibleYears = visibleYears.length ? visibleYears : [...PLANNING_YEARS];
  return table.visibleYears;
}

function tableFixedHashtags(table) {
  if (!table) return "";
  table.fixedHashtags = String(table.fixedHashtags ?? "");
  return table.fixedHashtags;
}

function visibleYearsLabel(years) {
  if (!years.length) return "Keine Jahre";
  if (years.length === 1) return String(years[0]);
  const consecutive = years.every((year, index) => index === 0 || year === years[index - 1] + 1);
  return consecutive ? `${years[0]}–${years.at(-1)}` : years.join(", ");
}

function planningPeriods(startWeek = 1, visibleYears = PLANNING_YEARS) {
  const periods = [];
  const years = [...new Set(visibleYears.map(Number).filter(year => PLANNING_YEARS.includes(year)))].sort((a, b) => a - b);
  const firstVisibleYear = years[0];
  for (const year of years) {
    const firstWeek = year === firstVisibleYear ? startWeek : 1;
    for (let weekNumber = firstWeek; weekNumber <= weeksInIsoYear(year); weekNumber += 1) {
      periods.push({ year, weekNumber, key: periodKey(year, weekNumber) });
    }
  }
  return periods;
}

function isoWeekThursday(year, weekNumber) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const mondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, 0, 4 - mondayOffset + ((weekNumber - 1) * 7) + 3));
}

function monthWeeks(year, month) {
  const key = `${year}-${month}`;
  if (!MONTH_WEEKS_CACHE.has(key)) {
    const weeks = [];
    for (let week = 1; week <= weeksInIsoYear(year); week += 1) {
      if (isoWeekThursday(year, week).getUTCMonth() === month) weeks.push(week);
    }
    MONTH_WEEKS_CACHE.set(key, weeks);
  }
  return MONTH_WEEKS_CACHE.get(key);
}

function tablePlanningCadence(table) {
  return table?.planningCadence === "monthly" ? "monthly" : "weekly";
}

function monthlyPlanOrdinals(table, year, weekNumber, type) {
  if (tablePlanningCadence(table) !== "monthly") return [];
  const property = type === "post" ? "postsPerMonth" : "storiesPerMonth";
  const count = Math.min(120, Math.max(0, Math.trunc(Number(table?.[property]) || 0)));
  if (!count) return [];
  const weeks = monthWeeks(year, isoWeekThursday(year, weekNumber).getUTCMonth());
  return Array.from({ length: count }, (_, index) => {
    const weekIndex = count === 1
      ? Math.floor((weeks.length - 1) / 2)
      : Math.round((index * (weeks.length - 1)) / (count - 1));
    return { ordinal: index + 1, week: weeks[weekIndex] };
  }).filter(entry => entry.week === weekNumber).map(entry => entry.ordinal);
}

function monthlyPlanOrdinal(item) {
  const ordinal = Number(item?.monthlyPlanOrdinal);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : 0;
}

function monthlyExtraOrdinals(table, year, weekNumber, type) {
  if (tablePlanningCadence(table) === "monthly") return [];
  const count = Math.min(30, Math.max(0, Math.trunc(Number(table[type === "post" ? "monthlyExtraPosts" : "monthlyExtraStories"]) || 0)));
  if (!count) return [];
  const weeks = monthWeeks(year, isoWeekThursday(year, weekNumber).getUTCMonth());
  const middleWeek = weeks[Math.min(1, weeks.length - 1)];
  const lastWeek = weeks.at(-1);
  return Array.from({ length: count }, (_, index) => index + 1)
    .filter(ordinal => weekNumber === (ordinal % 2 === 1 ? lastWeek : middleWeek));
}

function extraOrdinal(item) {
  const ordinal = Number(item?.monthlyExtraOrdinal);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : 0;
}

function weekItems(table, weekNumber, year = PLANNING_START_YEAR) {
  const storageKey = weekStorageKey(year, weekNumber);
  const storedWeek = table.weeks[storageKey];
  let items = Array.isArray(storedWeek?.items) ? storedWeek.items : [];

  if (!items.length && storedWeek && !Array.isArray(storedWeek.items)) {
    const migrated = createContentItem(table.postsPerWeek > 0 ? "post" : "story");
    Object.assign(migrated, {
      approved: Boolean(storedWeek.approved),
      published: Boolean(storedWeek.published),
      text: storedWeek.text ?? "",
      textItalian: storedWeek.textItalian ?? "",
      translationEntries: storedWeek.translationEntries ?? [],
      translationLanguage: storedWeek.translationLanguage ?? "",
      changes: storedWeek.changes ?? "",
      changeComments: storedWeek.changeComments ?? [],
      changeMessages: storedWeek.changeMessages ?? [],
      mediaCount: storedWeek.mediaCount ?? 1
    });
    items.push(migrated);
  }

  const resizeType = (type, targetCount) => {
    const existing = items.filter(item => item.type === type && !extraOrdinal(item) && !monthlyPlanOrdinal(item));
    return Array.from({ length: targetCount }, (_, index) => existing[index] ?? createContentItem(type));
  };

  const monthlyItems = type => monthlyPlanOrdinals(table, year, weekNumber, type).map(ordinal => {
    const item = items.find(candidate => candidate.type === type && monthlyPlanOrdinal(candidate) === ordinal) ?? createContentItem(type);
    item.monthlyPlanOrdinal = ordinal;
    return item;
  });

  const extraItems = type => monthlyExtraOrdinals(table, year, weekNumber, type).map(ordinal => {
    const item = items.find(candidate => candidate.type === type && extraOrdinal(candidate) === ordinal) ?? createContentItem(type);
    item.monthlyExtraOrdinal = ordinal;
    return item;
  });

  const baseItems = tablePlanningCadence(table) === "monthly"
    ? [...monthlyItems("post"), ...monthlyItems("story")]
    : [...resizeType("post", table.postsPerWeek), ...resizeType("story", table.storiesPerWeek)];
  items = [
    ...baseItems,
    ...extraItems("post"),
    ...extraItems("story")
  ];
  items.forEach(item => {
    item.mediaCount = Math.max(1, Number(item.mediaCount) || 1);
    item.text = String(item.text ?? "");
    item.textItalian = String(item.textItalian ?? "");
    normalizeTranslationEntries(item);
    normalizeChangeComments(item);
  });
  table.weeks[storageKey] = { ...(storedWeek ?? {}), items };
  return items;
}

function switchTablePlanningCadence(table, nextCadence) {
  const currentCadence = tablePlanningCadence(table);
  const normalizedNext = nextCadence === "monthly" ? "monthly" : "weekly";
  if (!table || currentCadence === normalizedNext) return;
  Object.values(table.weeks ?? {}).forEach(week => {
    const activeItems = Array.isArray(week?.items) ? week.items : [];
    week[currentCadence === "monthly" ? "monthlyCadenceItems" : "weeklyCadenceItems"] = activeItems;
    const restoredItems = week[normalizedNext === "monthly" ? "monthlyCadenceItems" : "weeklyCadenceItems"];
    week.items = Array.isArray(restoredItems) ? restoredItems : [];
  });
  table.planningCadence = normalizedNext;
}

function rowHasContent(item) {
  if (!item) return false;
  const hasText = [item.text, item.textItalian, item.changes].some(value => String(value ?? "").trim());
  const hasComments = (item.changeMessages ?? []).length > 0
    || (item.changeComments ?? []).some(comment => String(comment?.text ?? "").trim());
  const hasCustomValue = Object.values(item.customValues ?? {}).some(value => value === true
    || (typeof value === "string" && value.trim()) || (typeof value === "number" && value !== 0));
  return Boolean(hasText || hasComments || hasCustomValue || itemMedia(item).some(Boolean)
    || item.approved || item.published || item.instagramPublicationId || item.instagramStatus || item.aiDraftId);
}

function rowPosition(row) {
  return { tableId: currentTable()?.id, year: Number(row.dataset.year), week: Number(row.dataset.week), itemIndex: Number(row.dataset.itemIndex) };
}

function sameRowPosition(left, right) {
  return left && right && left.tableId === right.tableId && left.year === right.year
    && left.week === right.week && left.itemIndex === right.itemIndex;
}

function canPasteCutRow(item, position) {
  return pendingRowCut && pendingRowCut.tableId === position.tableId
    && !sameRowPosition(pendingRowCut, position) && item?.type === pendingRowCut.type
    && !item.instagramPublicationId && !item.instagramStatus
    && !itemMedia(item).some(media => media?.uploading);
}

function cancelPendingRowCut() {
  if (!pendingRowCut) return;
  pendingRowCut = null;
  rowCutBanner.hidden = true;
  tableBody.querySelectorAll("[data-paste-cut-row]").forEach(button => button.remove());
  tableBody.querySelectorAll(".row-cut-source").forEach(row => row.classList.remove("row-cut-source"));
}

function refreshRowCutControl(row) {
  const button = row?.querySelector("[data-cut-row]");
  const item = row && itemDataFromRow(row);
  if (!button || !item) return;
  button.disabled = !rowHasContent(item) || Boolean(item.instagramPublicationId || item.instagramStatus)
    || itemMedia(item).some(media => media?.uploading);
  button.title = item.instagramPublicationId || item.instagramStatus
    ? "Instagram-Aufträge können nicht verschoben werden"
    : itemMedia(item).some(media => media?.uploading) ? "Bitte zuerst den Medien-Upload abwarten"
      : rowHasContent(item) ? "Ganzen Zeileninhalt ausschneiden" : `Diese ${item.type === "story" ? "Story" : "Post"}-Zeile ist noch leer`;
}

function refreshRowCutControlsForItem(item) {
  tableBody.querySelectorAll("tr[data-week]").forEach(row => {
    if (itemDataFromRow(row) === item) refreshRowCutControl(row);
  });
}

function cutContentRow(row) {
  const item = row && itemDataFromRow(row);
  if (!isOwner() || historyPreview || !item || !["post", "story"].includes(item.type) || !rowHasContent(item)) return;
  if (item.instagramPublicationId || item.instagramStatus) {
    alert("Diese Zeile ist mit einem Instagram-Auftrag verbunden und kann nicht verschoben werden.");
    return;
  }
  if (itemMedia(item).some(media => media?.uploading)) {
    alert("Bitte warte, bis alle Medien dieser Zeile vollständig gespeichert sind.");
    return;
  }
  const position = rowPosition(row);
  if (sameRowPosition(pendingRowCut, position)) { cancelPendingRowCut(); return; }
  pendingRowCut = { ...position, type: item.type };
  rowCutBanner.hidden = false;
  renderWorkspace();
}

function pasteContentRow(row) {
  if (!isOwner() || historyPreview || !pendingRowCut || !row) return;
  const table = currentTable();
  const destination = rowPosition(row);
  if (!table || table.id !== pendingRowCut.tableId) { cancelPendingRowCut(); return; }
  const sourceItems = weekItems(table, pendingRowCut.week, pendingRowCut.year);
  const destinationItems = pendingRowCut.year === destination.year && pendingRowCut.week === destination.week
    ? sourceItems : weekItems(table, destination.week, destination.year);
  const source = sourceItems[pendingRowCut.itemIndex];
  const target = destinationItems[destination.itemIndex];
  if (!source || !["post", "story"].includes(source.type) || !rowHasContent(source) || !canPasteCutRow(target, destination)
      || target?.type !== source.type
      || source.instagramPublicationId || source.instagramStatus || itemMedia(source).some(media => media?.uploading)) {
    cancelPendingRowCut();
    alert("Verschieben oder Tauschen ist nur zwischen gleichartigen Zeilen derselben Kundentabelle ohne laufenden Upload oder Instagram-Auftrag möglich.");
    return;
  }
  const swapping = rowHasContent(target);
  const rowTypeLabel = source.type === "story" ? "Story" : "Post";
  pushUndoState(swapping ? `Inhalte zweier ${rowTypeLabel}-Zeilen getauscht` : `Inhalt einer ${rowTypeLabel}-Zeile verschoben`);
  const sourceSlot = { extra: extraOrdinal(source), monthly: monthlyPlanOrdinal(source) };
  const targetSlot = { extra: extraOrdinal(target), monthly: monthlyPlanOrdinal(target) };
  const keepSlot = (item, slot) => {
    delete item.monthlyExtraOrdinal;
    delete item.monthlyPlanOrdinal;
    if (slot.extra) item.monthlyExtraOrdinal = slot.extra;
    if (slot.monthly) item.monthlyPlanOrdinal = slot.monthly;
    return item;
  };
  sourceItems[pendingRowCut.itemIndex] = keepSlot(swapping ? target : createContentItem(source.type), sourceSlot);
  destinationItems[destination.itemIndex] = keepSlot(source, targetSlot);
  pendingRowCut = null;
  rowCutBanner.hidden = true;
  renderWorkspace();
  saveState();
}

function monthWeekLabel(year, weekNumber) {
  const thursday = isoWeekThursday(year, weekNumber);
  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${monthNames[thursday.getUTCMonth()]} ${Math.floor((thursday.getUTCDate() - 1) / 7) + 1}`;
}

function tableDisplayStartWeek(table) {
  if (!table) return 1;
  const firstVisibleYear = tableVisibleYears(table)[0] ?? PLANNING_START_YEAR;
  table.displayStartWeek = Math.min(weeksInIsoYear(firstVisibleYear), Math.max(1, Number(table.displayStartWeek) || 1));
  return table.displayStartWeek;
}

function tableWeekViewRowHeight(table) {
  if (!table) return null;
  let savedHeight = Number(table.weekViewRowHeight);
  if (!Number.isFinite(savedHeight) || savedHeight <= 0) {
    const legacyHeight = Object.values(table.weeks ?? {})
      .flatMap(week => Array.isArray(week?.items) ? week.items : [])
      .map(item => Number(item.weekViewHeight))
      .find(height => Number.isFinite(height) && height > 0);
    savedHeight = legacyHeight ?? 0;
  }
  if (savedHeight <= 0) return null;
  table.weekViewRowHeight = Math.min(650, Math.max(135, Math.round(savedHeight)));
  return table.weekViewRowHeight;
}

function tableYearViewRowHeight(table) {
  if (!table) return null;
  let savedHeight = Number(table.yearViewRowHeight);
  if (!Number.isFinite(savedHeight) || savedHeight <= 0) {
    const legacyTotalHeight = Object.values(table.yearWeekHeights ?? {})
      .map(Number)
      .find(height => Number.isFinite(height) && height > 0);
    const itemsPerWeek = Math.max(1, (Number(table.postsPerWeek) || 0) + (Number(table.storiesPerWeek) || 0));
    savedHeight = legacyTotalHeight ? legacyTotalHeight / itemsPerWeek : 0;
  }
  if (savedHeight <= 0) return null;
  table.yearViewRowHeight = Math.min(YEAR_VIEW_ROW_MAX_HEIGHT, Math.max(YEAR_VIEW_ROW_MIN_HEIGHT, Math.round(savedHeight)));
  table.yearWeekHeights = {};
  return table.yearViewRowHeight;
}

function yearWeekRows(year, weekNumber) {
  return [...tableBody.querySelectorAll(`tr[data-year="${year}"][data-week="${weekNumber}"]`)];
}

function setYearViewRowHeight(table, totalHeight, itemCount, persist = true) {
  if (!itemCount) return null;
  const rowHeight = Math.min(
    YEAR_VIEW_ROW_MAX_HEIGHT,
    Math.max(YEAR_VIEW_ROW_MIN_HEIGHT, Math.round(totalHeight / itemCount))
  );
  table.yearViewRowHeight = rowHeight;
  table.yearWeekHeights = {};
  tableBody.querySelectorAll("tr[data-year][data-week]").forEach(row => {
    row.dataset.yearWeekHeight = "custom";
    row.style.setProperty("--year-week-row-height", `${rowHeight}px`);
  });
  if (persist) saveState();
  return rowHeight * itemCount;
}

function populateStartWeekOptions(selectedWeek = 1, startYear = PLANNING_START_YEAR) {
  const select = document.querySelector("#dialog-start-week");
  const maximumWeek = weeksInIsoYear(startYear);
  const normalizedSelectedWeek = Math.min(maximumWeek, Math.max(1, Number(selectedWeek) || 1));
  select.innerHTML = Array.from({ length: maximumWeek }, (_, index) => {
    const weekNumber = index + 1;
    return `<option value="${weekNumber}" ${weekNumber === normalizedSelectedWeek ? "selected" : ""}>${monthWeekLabel(startYear, weekNumber)} · KW ${String(weekNumber).padStart(2, "0")} · ${startYear}</option>`;
  }).join("");
}

function renderVisibleYearOptions(selectedYears = PLANNING_YEARS) {
  dialogVisibleYears.innerHTML = PLANNING_YEARS.map(year => `
    <label class="permission-option">
      <input type="checkbox" name="visible-year" value="${year}" ${selectedYears.includes(year) ? "checked" : ""}>
      <span>${year}</span>
    </label>`).join("");
  visibleYearsError.hidden = true;
}

function selectedDialogYears() {
  return [...dialogVisibleYears.querySelectorAll('input[name="visible-year"]:checked')].map(input => Number(input.value)).sort((a, b) => a - b);
}

function tableHiddenWeeks(table) {
  if (!table) return [];
  const normalizedPeriods = (table.hiddenWeeks ?? []).map(value => {
    if (typeof value === "number" || /^\d+$/.test(String(value))) return periodKey(PLANNING_START_YEAR, Number(value));
    return String(value);
  }).filter(value => {
    const { year, weekNumber } = parsePeriodKey(value);
    return year >= PLANNING_START_YEAR && year <= PLANNING_END_YEAR && weekNumber >= 1 && weekNumber <= weeksInIsoYear(year);
  });
  table.hiddenWeeks = [...new Set(normalizedPeriods)].sort((a, b) => {
    const first = parsePeriodKey(a);
    const second = parsePeriodKey(b);
    return first.year - second.year || first.weekNumber - second.weekNumber;
  });
  return table.hiddenWeeks;
}

function tableCustomColumns(table) {
  if (!table) return [];
  table.customColumns = Array.isArray(table.customColumns) ? table.customColumns : [];
  return table.customColumns;
}

function tableRemovedCustomColumns(table) {
  if (!table) return [];
  table.removedCustomColumns = Array.isArray(table.removedCustomColumns) ? table.removedCustomColumns : [];
  return table.removedCustomColumns;
}

function tableRemovedStandardColumns(table) {
  if (!table) return [];
  const removableColumns = STANDARD_TABLE_COLUMNS.map(column => column.key);
  table.removedStandardColumns = Array.isArray(table.removedStandardColumns)
    ? [...new Set(table.removedStandardColumns.filter(key => removableColumns.includes(key)))]
    : [];
  return table.removedStandardColumns;
}

function sharedTableLayoutFrom(table) {
  return {
    customColumns: structuredClone(tableCustomColumns(table)),
    removedCustomColumns: structuredClone(tableRemovedCustomColumns(table)),
    removedStandardColumns: structuredClone(tableRemovedStandardColumns(table)),
    columnWidths: structuredClone(table?.columnWidths ?? {}),
    columnOrder: structuredClone(tableColumnOrder(table)),
    weekViewRowHeight: Number(table?.weekViewRowHeight) || null
  };
}

function syncSharedTableLayout(sourceTable) {
  if (!sourceTable) return;
  const layout = sharedTableLayoutFrom(sourceTable);
  state.tables.forEach(table => {
    table.customColumns = structuredClone(layout.customColumns);
    table.removedCustomColumns = structuredClone(layout.removedCustomColumns);
    table.removedStandardColumns = structuredClone(layout.removedStandardColumns);
    table.columnWidths = structuredClone(layout.columnWidths);
    table.columnOrder = structuredClone(layout.columnOrder);
    table.weekViewRowHeight = layout.weekViewRowHeight;
    if (layout.weekViewRowHeight !== null) return;
    Object.values(table.weeks ?? {}).forEach(week => {
      (week.items ?? []).forEach(item => { item.weekViewHeight = null; });
    });
  });
  state.tableTemplateSchema = {
    ...(state.tableTemplateSchema ?? {}),
    ...structuredClone(layout)
  };
  state.sharedTableLayoutEnabled = true;
}

function schemaFromTemplateTable(table) {
  return {
    planningCadence: tablePlanningCadence(table),
    storiesPerWeek: Number(table?.storiesPerWeek) || 0,
    postsPerWeek: Number(table?.postsPerWeek) || 0,
    storiesPerMonth: Number(table?.storiesPerMonth) || 0,
    postsPerMonth: Number(table?.postsPerMonth) || 0,
    monthlyExtraStories: Number(table?.monthlyExtraStories) || 0,
    monthlyExtraPosts: Number(table?.monthlyExtraPosts) || 0,
    displayStartWeek: tableDisplayStartWeek(table),
    visibleYears: structuredClone(tableVisibleYears(table)),
    fixedHashtags: tableFixedHashtags(table),
    customColumns: structuredClone(tableCustomColumns(table)),
    removedCustomColumns: structuredClone(tableRemovedCustomColumns(table)),
    removedStandardColumns: structuredClone(tableRemovedStandardColumns(table)),
    columnWidths: structuredClone(table?.columnWidths ?? {}),
    columnOrder: structuredClone(tableColumnOrder(table)),
    weekViewRowHeight: Number(table?.weekViewRowHeight) || null
  };
}

function refreshTableTemplateSchema() {
  state.tableTemplateSourceId = state.tableTemplateSourceId || "bergwerk";
  const sourceTable = state.tables.find(table => table.id === state.tableTemplateSourceId);
  if (sourceTable) state.tableTemplateSchema = schemaFromTemplateTable(sourceTable);
  if (!state.tableTemplateSchema) {
    state.tableTemplateSchema = schemaFromTemplateTable(defaultState.tables.find(table => table.id === "bergwerk"));
  }
  return structuredClone(state.tableTemplateSchema);
}

function itemCustomValues(item) {
  if (!item.customValues || typeof item.customValues !== "object") item.customValues = {};
  return item.customValues;
}

function tableColumnDefinitions(table) {
  const removedStandardColumns = tableRemovedStandardColumns(table);
  const standardColumns = STANDARD_TABLE_COLUMNS.filter(column => !removedStandardColumns.includes(column.key));
  const customColumns = tableCustomColumns(table).map(column => ({
    key: `custom-${column.id}`,
    title: column.title,
    className: "custom-column",
    customId: column.id
  }));
  return [...standardColumns, ...customColumns];
}

function tableColumnOrder(table) {
  const canonicalOrder = tableColumnDefinitions(table).map(column => column.key);
  const savedOrder = Array.isArray(table?.columnOrder) ? table.columnOrder : [];
  const normalizedOrder = savedOrder.filter((key, index) => canonicalOrder.includes(key) && savedOrder.indexOf(key) === index);
  canonicalOrder.forEach(key => {
    if (normalizedOrder.includes(key)) return;
    if (key === "textItalian" && normalizedOrder.includes("text")) {
      normalizedOrder.splice(normalizedOrder.indexOf("text") + 1, 0, key);
    } else if (key.startsWith("custom-") && normalizedOrder.includes("status")) {
      normalizedOrder.splice(normalizedOrder.indexOf("status"), 0, key);
    } else {
      normalizedOrder.push(key);
    }
  });
  if (table) table.columnOrder = normalizedOrder;
  return normalizedOrder;
}

function renderTableColumns(table) {
  const definitions = tableColumnDefinitions(table);
  const definitionsByKey = Object.fromEntries(definitions.map(column => [column.key, column]));
  const columns = tableColumnOrder(table).map(key => definitionsByKey[key]).filter(Boolean);
  contentTableColumns.innerHTML = columns.map(column => `<col data-column="${column.key}">`).join("");
  contentTableHead.innerHTML = columns.map(column => {
    const title = column.key === "changes"
      ? `<span class="column-title-with-legend"><span>${escapeHtml(column.title)}</span>${renderChangeAuthorLegend(table)}</span>`
      : escapeHtml(column.title);
    return `<th class="${column.className}${isOwner() ? " column-draggable has-delete-column" : ""}" data-column="${column.key}" title="${isOwner() ? "Spalte ziehen, um die Reihenfolge zu ändern" : ""}">${title}${isOwner() ? `<button class="delete-translated-column" type="button" data-delete-column="${column.key}" aria-label="Spalte ${escapeHtml(column.title)} entfernen" title="Spalte entfernen">×</button><span class="column-resizer" title="Spaltenbreite ziehen"></span>` : ""}</th>`;
  }).join("");
}

function updateCustomColumnTypeFields() {
  const isCheckbox = customColumnType.value === "checkbox";
  customCheckboxLabelWrapper.hidden = !isCheckbox;
  document.querySelector("#custom-checkbox-label").required = isCheckbox;
}

function resetCustomColumnForm(column = null) {
  customColumnForm.reset();
  document.querySelector("#editing-custom-column-id").value = column?.id ?? "";
  document.querySelector("#custom-column-form-title").textContent = column ? "Spalte bearbeiten" : "Neue Spalte hinzufügen";
  document.querySelector("#custom-column-title").value = column?.title ?? "";
  customColumnType.value = column?.type === "checkbox" ? "checkbox" : "text";
  document.querySelector("#custom-checkbox-label").value = column?.checkboxLabel ?? "";
  document.querySelector("#reset-custom-column-form").hidden = !column;
  updateCustomColumnTypeFields();
}

function renderCustomColumnsDialog() {
  const table = currentTable();
  const columns = tableCustomColumns(currentTable());
  const removedStandardItems = tableRemovedStandardColumns(table).map(key => {
    const column = STANDARD_TABLE_COLUMNS.find(item => item.key === key);
    if (!column) return "";
    return `
    <div class="custom-column-item">
      <strong>${escapeHtml(column.title)}</strong>
      <span class="custom-column-type">Entfernte Standardspalte</span>
      <button type="button" data-restore-standard-column="${column.key}">Wiederherstellen</button>
    </div>`;
  }).join("");
  const removedCustomItems = tableRemovedCustomColumns(table).map(column => `
    <div class="custom-column-item">
      <strong>${escapeHtml(column.title)}</strong>
      <span class="custom-column-type">Entfernte eigene Spalte</span>
      <button type="button" data-restore-custom-column="${column.id}">Wiederherstellen</button>
    </div>`).join("");
  const customColumnItems = columns.map(column => `
    <div class="custom-column-item">
      <strong>${escapeHtml(column.title)}</strong>
      <span class="custom-column-type">${column.type === "checkbox" ? `Häkchen · ${escapeHtml(column.checkboxLabel)}` : "Freier Text"}</span>
      <button type="button" data-edit-custom-column="${column.id}">Bearbeiten</button>
    </div>`).join("");
  customColumnsList.innerHTML = removedStandardItems || removedCustomItems || customColumnItems
    ? `${removedStandardItems}${removedCustomItems}${customColumnItems}`
    : `<p class="custom-column-empty">Noch keine eigenen Spalten angelegt.</p>`;
}

function renderHiddenWeeksControls(table) {
  const hiddenWeeks = tableHiddenWeeks(table);
  hiddenWeeksCount.textContent = hiddenWeeks.length;
}

function populateHiddenWeekRangeOptions() {
  const table = currentTable();
  const startWeek = tableDisplayStartWeek(table);
  const periods = planningPeriods(startWeek, tableVisibleYears(table));
  const options = periods.map(({ year, weekNumber, key }) =>
    `<option value="${key}">${monthWeekLabel(year, weekNumber)} · KW ${String(weekNumber).padStart(2, "0")} · ${year}</option>`
  ).join("");
  hideWeeksFrom.innerHTML = options;
  hideWeeksTo.innerHTML = options;
  hideWeeksFrom.value = periods[0]?.key ?? "";
  hideWeeksTo.value = periods[0]?.key ?? "";
  hideWeeksRangeError.hidden = true;
  hideWeeksRangeError.textContent = "";
}

function renderHiddenWeeksDialog() {
  const table = currentTable();
  const hiddenWeeks = tableHiddenWeeks(table);
  hiddenWeeksList.innerHTML = hiddenWeeks.length ? hiddenWeeks.map(key => {
    const { year, weekNumber } = parsePeriodKey(key);
    return `
    <div class="hidden-week-item">
      <div><strong>KW ${String(weekNumber).padStart(2, "0")} · ${year}</strong><span>${monthWeekLabel(year, weekNumber)}</span></div>
      <button type="button" data-restore-period="${key}">Wieder einblenden</button>
    </div>`;
  }).join("") : `<p class="dialog-hint">Aktuell sind keine Kalenderwochen ausgeblendet.</p>`;
  restoreAllWeeksButton.disabled = hiddenWeeks.length === 0;
}

function formatHistoryDate(timestamp) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function formatStorageSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function renderHistoryDialog() {
  historyList.innerHTML = `<p class="history-empty">Änderungsverlauf wird geladen …</p>`;
  try {
    loadedHistoryEntries = await getHistoryEntries();
    historyCount.textContent = loadedHistoryEntries.length;
    const totalBytes = loadedHistoryEntries.reduce((sum, entry) => sum + (Number(entry.byteSize) || 0), 0);
    historyStorageSize.textContent = `${formatStorageSize(totalBytes)} Tabellendaten`;
    historyList.innerHTML = loadedHistoryEntries.length ? loadedHistoryEntries.map(entry => `
      <article class="history-item">
        <div>
          <strong>${escapeHtml(entry.description || "Tabelleninhalt geändert")}</strong>
          <span>${escapeHtml(entry.tableName || "Kundentabelle")} · ${formatHistoryDate(entry.timestamp)} · ${escapeHtml(entry.userName || "Admin")} · ${formatStorageSize(Number(entry.byteSize) || 0)}</span>
        </div>
        <button type="button" data-preview-history="${entry.id}">Ansehen</button>
      </article>`).join("") : `<p class="history-empty">Noch keine Änderung vorhanden. Der erste Stand wird bei der nächsten Bearbeitung automatisch angelegt.</p>`;
  } catch (error) {
    console.error("Der Änderungsverlauf konnte nicht geladen werden.", error);
    historyList.innerHTML = `<p class="history-empty">Der Änderungsverlauf ist in diesem Browser momentan nicht verfügbar.</p>`;
  }
}

function renderHistoryPreviewBanner() {
  const active = Boolean(historyPreview);
  historyPreviewBanner.hidden = !active;
  document.body.classList.toggle("is-history-preview", active);
  if (!active) return;
  const entry = historyPreview.entry;
  historyPreviewDescription.textContent = `${entry.tableName} · Stand vom ${formatHistoryDate(entry.timestamp)}`;
}

function enterHistoryPreview(entry) {
  if (!entry?.snapshot || !isOwner() || historyPreview) return;
  const originalState = state;
  const originalTable = originalState.tables.find(table => table.id === entry.tableId);
  const runtimeMedia = captureTableRuntimeMedia(originalTable);
  const previewState = JSON.parse(JSON.stringify(state));
  const tableIndex = previewState.tables.findIndex(table => table.id === entry.tableId);
  if (tableIndex >= 0) previewState.tables[tableIndex] = serializableTable(entry.snapshot);
  else previewState.tables.push(serializableTable(entry.snapshot));
  attachTableRuntimeMedia(previewState.tables.find(table => table.id === entry.tableId), runtimeMedia);
  previewState.currentTableId = entry.tableId;
  previewState.currentUserId = previewState.users.find(user => user.role === "owner")?.id ?? previewState.currentUserId;
  state = previewState;
  historyPreview = { entry, originalState };
  historyDialog.close();
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exitHistoryPreview() {
  if (!historyPreview) return;
  state = historyPreview.originalState;
  historyPreview = null;
  renderApp();
}

function restoreHistoryVersion() {
  if (!historyPreview) return;
  const { entry, originalState } = historyPreview;
  state = originalState;
  historyPreview = null;
  const tableIndex = state.tables.findIndex(table => table.id === entry.tableId);
  if (tableIndex >= 0) {
    const runtimeMedia = captureTableRuntimeMedia(state.tables[tableIndex]);
    recordTableHistory(state.tables[tableIndex], "Stand vor Wiederherstellung");
    state.tables[tableIndex] = serializableTable(entry.snapshot);
    attachTableRuntimeMedia(state.tables[tableIndex], runtimeMedia);
  } else {
    state.tables.push(serializableTable(entry.snapshot));
  }
  state.currentTableId = entry.tableId;
  state.viewMode = state.tables.find(table => table.id === entry.tableId)?.viewMode === "week" ? "week" : "year";
  syncSharedTableLayout(state.tables.find(table => table.id === entry.tableId));
  renderApp();
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error("Das Planyoursocials-Backend ist gerade nicht erreichbar. Bitte starte es erneut und versuche es noch einmal.");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (response.status === 413) throw new Error("Die Datei überschreitet das Upload-Limit des Servers.");
    if (!response.ok) throw new Error(`Der Server konnte die Anfrage nicht verarbeiten (HTTP ${response.status}).`);
    throw new Error("Das Planyoursocials-Backend ist nicht gestartet. Bitte öffne die App über den Backend-Startbefehl.");
  }
  const body = await response.json();
  return { response, body };
}

async function apiRequest(path, options = {}) {
  const { response, body } = await requestJson(path, options);
  if (response.status === 401) {
    authenticatedAccount = null;
    showAuthentication("login");
    throw new Error(body.error || "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
  }
  if (!response.ok) throw new Error(body.error || `Backend-Fehler ${response.status}`);
  return body;
}

function authenticationSubmitLabel(mode = authenticationMode) {
  return ({ setup: "Hauptadmin einrichten", register: "Kundenkonto erstellen", forgot: "Zurücksetzungslink senden", reset: "Neues Passwort speichern" })[mode] || "Anmelden";
}

function setPasswordVisibility(button, visible) {
  const input = document.querySelector(`#${button.dataset.passwordTarget}`);
  if (!input) return;
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  button.setAttribute("aria-label", visible ? "Passwort ausblenden" : "Passwort anzeigen");
}

passwordToggleButtons.forEach(button => {
  button.addEventListener("click", () => setPasswordVisibility(button, button.getAttribute("aria-pressed") !== "true"));
});

function showAuthentication(mode = "login", message = "", messageType = "error") {
  rolePreview = null;
  document.body.classList.remove("is-role-preview");
  document.body.classList.remove("app-active");
  document.documentElement.classList.remove("app-active");
  contentCard.inert = false;
  authenticationMode = mode;
  passwordToggleButtons.forEach(button => setPasswordVisibility(button, false));
  const setup = mode === "setup";
  const register = mode === "register";
  const invitedRegistration = register && Boolean(invitationToken);
  const forgot = mode === "forgot";
  const reset = mode === "reset";
  const login = mode === "login";
  authScreen.hidden = false;
  appShell.hidden = true;
  authEyebrow.textContent = setup ? "Einmalige Ersteinrichtung" : invitedRegistration ? "Einladung" : register ? "Neues Kundenkonto" : reset || forgot ? "Passwort-Wiederherstellung" : "Sicherer Zugang";
  authTitle.textContent = setup ? "Hauptadmin einrichten" : invitedRegistration ? "Planyoursocials-Einladung annehmen" : register ? "Als Kunde registrieren" : forgot ? "Passwort vergessen?" : reset ? "Neues Passwort festlegen" : "Bei Planyoursocials anmelden";
  authDescription.textContent = setup
    ? "Lege jetzt deine E-Mail-Adresse und dein persönliches Passwort für den Hauptadmin fest."
    : invitedRegistration
      ? "Lege deinen Namen und dein persönliches Passwort fest. Deine freigegebenen Kundentabellen werden automatisch übernommen."
    : register
      ? "Erstelle dein Kundenkonto. Der Hauptadmin gibt dir anschließend deine Kundentabelle frei."
    : forgot
      ? "Gib die E-Mail-Adresse deines Kontos ein. Du erhältst anschließend einen sicheren Link zum Zurücksetzen."
      : reset
        ? "Lege ein neues Passwort mit mindestens 10 Zeichen fest."
        : "Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.";
  authNameWrapper.hidden = !(setup || register);
  authEmailWrapper.hidden = reset;
  authPasswordWrapper.hidden = forgot;
  authPasswordConfirmWrapper.hidden = !(setup || register || reset);
  authSetupNote.hidden = !setup;
  forgotPasswordButton.hidden = !login;
  backToLoginButton.hidden = !(forgot || register || reset);
  persistentLoginNote.hidden = !login;
  authSubmit.textContent = authenticationSubmitLabel(mode);
  authPassword.autocomplete = setup || register || reset ? "new-password" : "current-password";
  authName.required = setup || register;
  authEmail.required = !reset;
  authEmail.readOnly = invitedRegistration && Boolean(authEmail.dataset.invitedEmail);
  authPassword.required = !forgot;
  authPasswordConfirm.required = setup || register || reset;
  authError.textContent = message;
  authError.hidden = !message;
  authError.classList.toggle("success", messageType === "success");
  if (!(setup || register || reset)) authPasswordConfirm.value = "";
  queueMicrotask(() => (setup || register ? authName : reset ? authPassword : authEmail).focus());
}

function syncSignedInUser(user, allUsers = null) {
  authenticatedAccount = user;
  const normalizedUser = { id: user.id, email: user.email, name: user.name, role: user.role, tableIds: user.tableIds ?? [] };
  if (Array.isArray(allUsers)) {
    state.users = allUsers.map(item => ({ id: item.id, email: item.email, name: item.name, role: item.role, tableIds: item.tableIds ?? [] }));
  } else {
    state.users = [normalizedUser];
  }
  if (!state.users.some(item => item.id === normalizedUser.id)) state.users.unshift(normalizedUser);
  state.currentUserId = normalizedUser.id;
}

async function loadCentralPlannerState() {
  const localPreferences = {
    currentTableId: state.currentTableId,
    viewMode: state.viewMode,
    selectedYear: state.selectedYear,
    selectedWeek: state.selectedWeek
  };
  const localUsers = state.users;
  const currentUserId = state.currentUserId;
  const result = await apiRequest("/api/planner-state");
  if (result.state?.tables?.length) {
    state = repairStoredMediaCounts({
      ...state,
      ...result.state,
      ...localPreferences,
      users: localUsers,
      currentUserId
    });
    if (!state.tables.some(table => table.id === state.currentTableId)) state.currentTableId = state.tables[0]?.id || "";
  } else if (isOwner()) {
    await apiRequest("/api/planner-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: serializablePlannerState() })
    });
  }
  plannerStateReady = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.warn("Die optionale lokale Sicherheitskopie ist in diesem Browser nicht verfügbar.", error); }
}

async function openAuthenticatedApp(user) {
  rolePreview = null;
  let allUsers = null;
  if (user.role === "owner") {
    const result = await apiRequest("/api/users");
    allUsers = result.users;
  } else {
    const result = await apiRequest("/api/users/participants");
    allUsers = result.users;
  }
  syncSignedInUser(user, allUsers);
  await loadCentralPlannerState();
  authScreen.hidden = true;
  appShell.hidden = false;
  document.body.classList.add("app-active");
  document.documentElement.classList.add("app-active");
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  renderApp();
  updateUndoButton();
  setTimeout(() => syncPublicationStatuses(), 700);
}

async function initializeAuthentication() {
  if (passwordResetToken) {
    showAuthentication("reset");
    return;
  }
  if (invitationToken) {
    try {
      const { response, body } = await requestJson(`/api/auth/invitation?token=${encodeURIComponent(invitationToken)}`);
      if (!response.ok) throw new Error(body.error || "Die Einladung konnte nicht geprüft werden.");
      showAuthentication("register");
      authEmail.value = body.email;
      authEmail.dataset.invitedEmail = body.email || "";
      authEmail.readOnly = Boolean(body.email);
      return;
    } catch (error) {
      invitationToken = "";
      showAuthentication("login", error.message);
      return;
    }
  }
  try {
    const { response, body } = await requestJson("/api/auth/status");
    if (!response.ok) throw new Error(body.error || "Anmeldestatus konnte nicht geprüft werden.");
    if (body.authenticated && body.user) {
      await openAuthenticatedApp(body.user);
      return;
    }
    if (body.needsSetup && body.canSetup) {
      showAuthentication("setup");
      return;
    }
    if (body.needsSetup) {
      showAuthentication("login", "Der Hauptadmin muss zuerst auf dem Server eingerichtet werden. Hinterlege dazu MAIN_ADMIN_NAME, MAIN_ADMIN_EMAIL und MAIN_ADMIN_PASSWORD.");
      return;
    }
    showAuthentication("login");
  } catch (error) {
    showAuthentication("login", error.message);
  }
}

function publicationStatusLabel(status) {
  return ({
    draft: "Entwurf",
    queued: "Eingeplant",
    publishing: "Wird veröffentlicht",
    published: "Veröffentlicht",
    failed: "Fehlgeschlagen",
    cancelled: "Abgebrochen"
  })[status] || status || "Nicht geplant";
}

function publicationStatusClass(status) {
  return status === "published" ? "published" : status === "failed" ? "failed" : "";
}

function populateInstagramTableSelect(preferredTableId = currentTable()?.id) {
  instagramTableSelect.innerHTML = state.tables.map(table => `<option value="${escapeHtml(table.id)}" ${table.id === preferredTableId ? "selected" : ""}>${escapeHtml(table.name)}</option>`).join("");
  instagramTableSelect.disabled = state.tables.length === 0;
}

function selectedInstagramTable() {
  return state.tables.find(table => table.id === instagramTableSelect.value) ?? currentTable();
}

function listFromTextarea(value) {
  return [...new Set(String(value || "").split(/\r?\n/).map(entry => entry.trim()).filter(Boolean))];
}

function aiTextFields(table) {
  return tableColumnDefinitions(table).filter(column => {
    if (["text", "textItalian"].includes(column.key)) return true;
    if (!column.key.startsWith("custom-")) return false;
    return tableCustomColumns(table).find(custom => `custom-${custom.id}` === column.key)?.type === "text";
  });
}

function populateAiFieldMappings(table, mapping = { german: "text", italian: "textItalian" }) {
  const fields = aiTextFields(table);
  const options = fields.map(field => `<option value="${escapeHtml(field.key)}">${escapeHtml(field.title)}</option>`).join("");
  aiAgentGermanField.innerHTML = options;
  aiAgentItalianField.innerHTML = options;
  aiAgentGermanField.value = fields.some(field => field.key === mapping.german) ? mapping.german : fields[0]?.key || "";
  aiAgentItalianField.value = fields.some(field => field.key === mapping.italian) ? mapping.italian : (fields.find(field => field.key === "textItalian")?.key || fields[0]?.key || "");
}

function selectedAiTable() {
  return state.tables.find(table => table.id === aiAgentTableSelect.value) ?? currentTable();
}

function renderAiAgentTopStatus(configuration = currentAiConfiguration) {
  const active = Boolean(configuration?.enabled && configuration?.tableId === currentTable()?.id);
  aiAgentButton.classList.toggle("is-active", active);
  aiAgentButton.title = active ? "KI-Agent ist für diese Kundentabelle eingeschaltet" : "KI-Agent konfigurieren";
}

async function loadAiAgentConfiguration(table = selectedAiTable()) {
  if (!table || !isOwner()) return;
  aiAgentError.hidden = true;
  aiAgentRuntimeStatus.className = "ai-agent-runtime-status loading";
  aiAgentRuntimeStatus.textContent = "Konfiguration wird geladen …";
  try {
    const result = await apiRequest(`/api/ai/config?tableId=${encodeURIComponent(table.id)}`);
    const configuration = result.configuration;
    currentAiConfiguration = configuration;
    aiAgentEnabled.checked = Boolean(configuration.enabled);
    aiAgentImageFolder.value = configuration.imageFolder || "";
    aiAgentWebsites.value = (configuration.allowedWebsites || []).join("\n");
    aiAgentPdfs.value = (configuration.pdfFiles || []).join("\n");
    aiAgentTone.value = configuration.tone || "";
    aiAgentForbiddenTerms.value = (configuration.forbiddenTerms || []).join("\n");
    aiAgentNotes.value = configuration.notes || "";
    populateAiFieldMappings(table, configuration.fieldMapping);
    aiAgentRuntimeStatus.className = `ai-agent-runtime-status ${result.runtime.configured ? "ready" : "warning"}`;
    aiAgentRuntimeStatus.textContent = result.runtime.configured
      ? `KI-Dienst ist bereit (${result.runtime.dryRun ? "lokaler Testmodus" : result.runtime.model}).`
      : "Für echte Bildanalyse fehlt noch OPENAI_API_KEY in der .env-Datei des Backends.";
    renderAiAgentTopStatus(configuration);
  } catch (error) {
    aiAgentRuntimeStatus.className = "ai-agent-runtime-status error";
    aiAgentRuntimeStatus.textContent = "Konfiguration konnte nicht geladen werden.";
    aiAgentError.textContent = error.message;
    aiAgentError.hidden = false;
  }
}

function openAiAgentDialog() {
  if (!isOwner()) return;
  const table = currentTable();
  aiAgentTableSelect.innerHTML = state.tables.map(candidate => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === table?.id ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("");
  aiAgentTableSelect.disabled = !state.tables.length;
  aiAgentDialog.showModal();
  void loadAiAgentConfiguration(table);
}

function assignAiDraftValue(item, key, value) {
  if (key === "text") item.text = String(value || "");
  else if (key === "textItalian") {
    item.textItalian = String(value || "");
    item.translationEntries = item.textItalian ? [{ language: "it", text: item.textItalian }] : [];
    item.translationLanguage = item.textItalian ? "it" : "";
  } else if (key.startsWith("custom-")) {
    itemCustomValues(item)[key.slice("custom-".length)] = String(value || "");
  }
}

async function prepareAiDraftForRow(row, button) {
  const table = currentTable();
  const item = row ? itemDataFromRow(row) : null;
  if (!table || !item || !isOwner()) return;
  if (item.type !== "post" || item.approved || item.published || item.instagramPublicationId) {
    window.alert("Der KI-Agent kann nur eine offene, noch nicht geplante Post-Zeile vorbereiten.");
    return;
  }
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.classList.add("is-loading");
  button.innerHTML = `<span aria-hidden="true">…</span>`;
  try {
    const result = await apiRequest("/api/ai/prepare-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: table.id,
        tableName: table.name,
        calendarYear: Number(row.dataset.year),
        weekNumber: Number(row.dataset.week),
        itemIndex: Number(row.dataset.itemIndex),
        contentType: item.type,
        approved: Boolean(item.approved),
        published: Boolean(item.published),
        instagramPublicationId: item.instagramPublicationId || ""
      })
    });
    const imageResponse = await fetch(result.draft.imageUrl, { credentials: "same-origin", cache: "no-store" });
    if (!imageResponse.ok) {
      const errorBody = await imageResponse.json().catch(() => ({}));
      throw new Error(errorBody.error || "Das ausgewählte Bild konnte nicht geladen werden.");
    }
    const blob = await imageResponse.blob();
    const file = new File([blob], result.draft.imageName, { type: result.draft.imageMimeType || blob.type || "image/jpeg" });
    pushUndoState("KI-Entwurf vorbereitet");
    Object.entries(result.draft.assignments || {}).forEach(([key, value]) => assignAiDraftValue(item, key, value));
    item.aiDraftId = result.draft.id;
    item.aiImageDescription = result.draft.imageDescription;
    item.aiDraftCreatedAt = result.draft.createdAt;
    const firstZone = row.querySelector(".media-slot .drop-zone");
    if (!firstZone || !showMedia(file, firstZone, false)) throw new Error("Das ausgewählte Bild konnte nicht in die Zeile eingefügt werden.");
    saveState();
    renderWorkspace();
  } catch (error) {
    window.alert(error.message);
    button.disabled = false;
    button.classList.remove("is-loading");
    button.innerHTML = originalLabel;
  }
}

function normalizedInstagramProfileUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  let username = input.replace(/^@/, "");
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return null;
      username = url.pathname.split("/").filter(Boolean)[0] || "";
    } catch {
      return null;
    }
  }
  username = username.replace(/\/$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
  return `https://www.instagram.com/${username}/`;
}

function updateInstagramProfileField(table) {
  const savedProfile = String(table?.instagramProfileUrl || "");
  instagramProfileUrl.value = savedProfile || (currentInstagramConnection?.username ? `https://www.instagram.com/${currentInstagramConnection.username}/` : "");
}

async function refreshInstagramDialog() {
  const table = selectedInstagramTable();
  if (!table || !isOwner()) return;
  instagramDialogError.hidden = true;
  instagramConnectionCard.className = "instagram-connection-card";
  instagramConnectionCard.innerHTML = "<p>Verbindung wird geprüft …</p>";
  instagramPublicationsList.innerHTML = `<p class="instagram-publications-empty">Aufträge werden geladen …</p>`;
  try {
    const [configResult, statusResult, publicationsResult] = await Promise.all([
      apiRequest("/api/config"),
      apiRequest(`/api/instagram/status?tableId=${encodeURIComponent(table.id)}`),
      apiRequest(`/api/publications?tableId=${encodeURIComponent(table.id)}`)
    ]);
    backendConfig = configResult;
    currentInstagramConnection = statusResult.connection;
    document.querySelector("#instagram-redirect-uri").textContent = backendConfig.instagramRedirectUri || "(noch nicht konfiguriert)";
    instagramAppConfigSection.hidden = !backendConfig.localInstagramConfigurationEditable;
    instagramAppId.value = backendConfig.instagramAppId || "";
    instagramAppSecret.value = "";
    instagramAppSecret.required = !backendConfig.instagramAppSecretConfigured;
    instagramAppSecret.placeholder = backendConfig.instagramAppSecretConfigured ? "Bereits sicher hinterlegt" : "App-Secret einfügen";
    instagramAppSecretHint.textContent = backendConfig.instagramAppSecretConfigured
      ? "Bereits sicher hinterlegt. Nur zum Ersetzen erneut eingeben."
      : "Wird nur auf diesem Computer in der .env-Datei gespeichert.";
    updateInstagramProfileField(table);
    if (currentInstagramConnection) {
      instagramConnectionCard.classList.add("connected");
      instagramConnectionCard.innerHTML = `<strong>@${escapeHtml(currentInstagramConnection.username || "Instagram")}</strong><span>${escapeHtml(currentInstagramConnection.accountType || "Professionelle Instagram-Seite")} · ausschließlich verbunden mit ${escapeHtml(table.name)}</span>`;
    } else if (backendConfig.dryRun) {
      instagramConnectionCard.classList.add("warning");
      instagramConnectionCard.innerHTML = `<strong>Lokaler Testmodus aktiv</strong><span>Veröffentlichungen werden vollständig simuliert und nicht an Instagram übertragen.</span>`;
    } else if (!backendConfig.instagramConfigured) {
      instagramConnectionCard.classList.add("warning");
      instagramConnectionCard.innerHTML = backendConfig.localInstagramConfigurationEditable
        ? `<strong>Meta-Zugangsdaten fehlen noch</strong><span>Trage oben deine Instagram App-ID und das App-Secret ein. Danach kannst du die Kundenseite über Meta verbinden.</span>`
        : `<strong>Meta-Zugangsdaten fehlen noch</strong><span>Trage INSTAGRAM_APP_ID und INSTAGRAM_APP_SECRET in der Serverkonfiguration ein.</span>`;
    } else {
      instagramConnectionCard.innerHTML = `<strong>${escapeHtml(table.name)} ist noch nicht verbunden</strong><span>Prüfe zuerst die Instagram-Login-App-ID und die Rückrufadresse oben. Melde dich im folgenden Fenster mit dem professionellen Instagram-Konto genau dieses Kunden an. Andere Kundenverbindungen bleiben davon unberührt.</span>`;
    }
    connectInstagramButton.hidden = Boolean(currentInstagramConnection) || backendConfig.dryRun;
    connectInstagramButton.disabled = !backendConfig.instagramConfigured;
    disconnectInstagramButton.hidden = !currentInstagramConnection;
    const publications = publicationsResult.publications || [];
    instagramPublicationsList.innerHTML = publications.length ? publications.slice(0, 25).map(publication => `
      <div class="instagram-publication-item">
        <div><strong>KW ${String(publication.weekNumber).padStart(2, "0")} · ${publication.calendarYear || PLANNING_START_YEAR} · ${publication.contentType === "story" ? "Story" : publication.contentType === "reel" ? "Reel" : "Beitrag"}</strong><span>${publication.scheduledAt ? new Date(publication.scheduledAt).toLocaleString("de-DE") : "Ohne Termin"}${publication.lastError ? ` · ${escapeHtml(publication.lastError)}` : ""}</span></div>
        <span class="publication-state ${publicationStatusClass(publication.status)}">${publicationStatusLabel(publication.status)}</span>
      </div>`).join("") : `<p class="instagram-publications-empty">Noch keine Veröffentlichung eingeplant.</p>`;
  } catch (error) {
    instagramAppConfigSection.hidden = true;
    instagramConnectionCard.classList.add("warning");
    instagramConnectionCard.innerHTML = `<strong>Backend nicht erreichbar</strong><span>Starte Planyoursocials über „npm start“ und öffne anschließend die dort angezeigte Adresse.</span>`;
    instagramPublicationsList.innerHTML = `<p class="instagram-publications-empty">Keine Backend-Daten verfügbar.</p>`;
    instagramDialogError.textContent = error.message;
    instagramDialogError.hidden = false;
    connectInstagramButton.hidden = true;
    disconnectInstagramButton.hidden = true;
  }
}

function formatBackendUptime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} Std. ${minutes} Min.`;
  return `${minutes} Min.`;
}

function backendMediaKindLabel(kind) {
  return kind === "story" ? "Story" : kind === "video" ? "Video" : "Foto";
}

function plannerMediaRelations() {
  const relations = new Map();
  const relationFor = mediaId => {
    const key = String(mediaId || "");
    if (!relations.has(key)) relations.set(key, { previewId: "", previewName: "", previewType: "", previewSize: 0, previewUrl: "", locations: [] });
    return relations.get(key);
  };
  state.tables.forEach(table => Object.entries(table.weeks || {}).forEach(([storageKey, week]) => {
    const storageParts = String(storageKey).split("-").map(Number);
    const calendarYear = storageParts.length > 1 ? storageParts[0] : PLANNING_START_YEAR;
    const weekNumber = storageParts.length > 1 ? storageParts[1] : storageParts[0];
    (week?.items || []).forEach((item, itemIndex) => (item.media || []).forEach(record => {
      if (!record?.id) return;
      const location = {
        tableId: String(table.id),
        tableName: String(table.name || "Kundentabelle"),
        calendarYear,
        weekNumber,
        contentType: item.type === "story" ? "story" : "post",
        itemIndex,
        rowKey: `${table.id}:${calendarYear}:${weekNumber}:${itemIndex}`
      };
      const relation = relationFor(record.id);
      Object.assign(relation, {
        previewId: record.previewId || relation.previewId,
        previewName: record.previewName || relation.previewName,
        previewType: record.previewType || relation.previewType,
        previewSize: Number(record.previewSize) || relation.previewSize,
        previewUrl: record.previewUrl || relation.previewUrl || (record.previewId ? `/api/planner-media/${encodeURIComponent(record.previewId)}` : "")
      });
      [record.id, record.previewId].filter(Boolean).forEach(mediaId => {
        const locations = relationFor(mediaId).locations;
        const locationKey = location.rowKey;
        if (!locations.some(entry => entry.rowKey === locationKey)) locations.push(location);
      });
    }));
  }));
  return relations;
}

function normalizeBackendMedia(mediaItems) {
  const relations = plannerMediaRelations();
  return mediaItems.filter(media => !String(media.name || "").startsWith(".preview-") || media.fileState === "preview_only").map(media => {
    const relation = relations.get(String(media.id)) || {};
    const originalAvailable = media.originalAvailable !== false && media.fileState !== "preview_only";
    const previewAvailable = Boolean(media.previewAvailable || media.preview?.id || media.previewId || relation.previewId || media.fileState === "preview_only");
    const previewUrl = media.previewUrl || media.preview?.url || relation.previewUrl || (!originalAvailable ? media.url : "");
    const fileState = !originalAvailable ? "preview_only" : previewAvailable ? "original_and_preview" : "original_only";
    const locationMap = new Map();
    [...(Array.isArray(media.locations) ? media.locations : []), ...(Array.isArray(relation.locations) ? relation.locations : [])].forEach(location => {
      const itemIndex = Number.isInteger(Number(location.itemIndex)) ? Number(location.itemIndex) : null;
      const normalized = {
        tableId: String(location.tableId || media.tableId || ""),
        tableName: String(location.tableName || media.tableName || "Kundentabelle"),
        calendarYear: Number(location.calendarYear) || PLANNING_START_YEAR,
        weekNumber: Number(location.weekNumber) || 0,
        contentType: location.contentType === "story" ? "story" : "post",
        itemIndex,
        rowKey: String(location.rowKey || (itemIndex === null ? "" : `${location.tableId || media.tableId || ""}:${Number(location.calendarYear) || PLANNING_START_YEAR}:${Number(location.weekNumber) || 0}:${itemIndex}`))
      };
      locationMap.set(normalized.rowKey || `${normalized.tableId}:${normalized.calendarYear}:${normalized.weekNumber}:${normalized.contentType}`, normalized);
    });
    return {
      ...media,
      originalAvailable,
      previewAvailable,
      previewId: media.previewId || media.preview?.id || relation.previewId || "",
      previewSize: Number(media.previewSize ?? media.preview?.size ?? relation.previewSize) || 0,
      previewUrl,
      fileState,
      locations: [...locationMap.values()].sort((a, b) => a.calendarYear - b.calendarYear || a.weekNumber - b.weekNumber || a.contentType.localeCompare(b.contentType))
    };
  });
}

function backendMediaFileStateMarkup(media) {
  if (media.fileState === "preview_only") {
    const detail = media.restorableOriginal
      ? "Original gesichert · wiederherstellbar"
      : "Original nicht vorhanden";
    return `<span class="backend-media-file-state preview-only${media.restorableOriginal ? " restorable" : ""}" role="cell">Nur Vorschau<small>${detail}</small></span>`;
  }
  if (media.previewAvailable) {
    return `<span class="backend-media-file-state with-preview" role="cell">Original + Vorschau<small>Beide Dateien vorhanden</small></span>`;
  }
  return `<span class="backend-media-file-state" role="cell">Nur Original<small>Vorschau noch nicht erstellt</small></span>`;
}

function backendMediaSizeMarkup(media) {
  const originalAvailable = media.originalAvailable !== false && media.fileState !== "preview_only";
  const previewAvailable = Boolean(media.previewAvailable || media.previewId || media.fileState === "preview_only");
  const originalSize = originalAvailable ? formatStorageSize(Number(media.size) || 0) : "Nicht vorhanden";
  const previewSize = previewAvailable
    ? (media.previewSize ? formatStorageSize(Number(media.previewSize)) : "Vorhanden")
    : "Nicht vorhanden";
  return `<span class="backend-media-size" role="cell">
    <span class="original${originalAvailable ? "" : " missing"}"><strong>Original</strong><small>${originalSize}</small></span>
    <span class="preview${previewAvailable ? "" : " missing"}"><strong>Vorschau</strong><small>${previewSize}</small></span>
  </span>`;
}

function backendMediaAvailabilityMarkup(media) {
  const originalAvailable = media.originalAvailable !== false && media.fileState !== "preview_only";
  const previewAvailable = Boolean(media.previewAvailable || media.previewId || media.fileState === "preview_only");
  const labels = [
    originalAvailable ? "Original vorhanden" : "",
    previewAvailable ? "Vorschau vorhanden" : ""
  ].filter(Boolean);
  return `<span class="backend-media-availability" role="cell" aria-label="${escapeHtml(labels.join(" und ") || "Keine Datei vorhanden")}">
    ${originalAvailable ? '<span class="backend-media-availability-check original" title="Original vorhanden" aria-label="Original vorhanden">✓</span>' : ""}
    ${previewAvailable ? '<span class="backend-media-availability-check preview" title="Vorschau vorhanden" aria-label="Vorschau vorhanden">✓</span>' : ""}
  </span>`;
}

function backendMediaLocationsMarkup(media) {
  const locations = Array.isArray(media.locations) ? media.locations : [];
  if (!locations.length) return `<span class="backend-media-locations empty" role="cell">Nicht zugeordnet</span>`;
  return `<span class="backend-media-locations" role="cell">${locations.map(location => `<span title="${escapeHtml(location.tableName || media.tableName || "Kundentabelle")}"><strong>${location.calendarYear}</strong> · KW ${String(location.weekNumber).padStart(2, "0")}<small>${location.contentType === "story" ? "Story" : "Beitrag"}</small></span>`).join("")}</span>`;
}

function backendMediaRowsMarkup(mediaItems) {
  if (!mediaItems.length) return `<p class="backend-empty backend-media-empty">Noch keine Fotos, Videos oder Story-Medien hochgeladen.</p>`;
  const rowMemberships = new Map();
  mediaItems.forEach(media => {
    const mediaId = String(media.id || "");
    new Set((media.locations || []).map(location => location.rowKey).filter(Boolean)).forEach(rowKey => {
      if (!rowMemberships.has(rowKey)) rowMemberships.set(rowKey, new Set());
      rowMemberships.get(rowKey).add(mediaId);
    });
  });
  const groupedMedia = mediaItems.map(media => {
    const sharedRows = [...new Set((media.locations || []).map(location => location.rowKey).filter(Boolean))]
      .map(rowKey => ({ rowKey, count: rowMemberships.get(rowKey)?.size || 0 }))
      .filter(group => group.count > 1)
      .sort((a, b) => b.count - a.count || a.rowKey.localeCompare(b.rowKey));
    return { media, sharedRowKey: sharedRows[0]?.rowKey || "", sharedCount: sharedRows[0]?.count || 0 };
  });
  return groupedMedia.map((entry, index) => {
    const { media, sharedRowKey, sharedCount } = entry;
    const continuesPrevious = Boolean(sharedRowKey && groupedMedia[index - 1]?.sharedRowKey === sharedRowKey);
    const continuesNext = Boolean(sharedRowKey && groupedMedia[index + 1]?.sharedRowKey === sharedRowKey);
    let sharedClass = "";
    if (sharedRowKey) {
      const positionClass = continuesPrevious && continuesNext
        ? " shared-row-group-middle"
        : continuesPrevious
          ? " shared-row-group-end"
          : continuesNext
            ? " shared-row-group-start"
            : " shared-row-group-single";
      sharedClass = ` same-row-media${positionClass}`;
    }
    const sharedHint = sharedCount ? `<em class="backend-media-row-group-label">Gemeinsame Zeile · ${sharedCount} Medien</em>` : "";
    return `
    <div class="backend-media-row${sharedClass}" role="row"${sharedCount ? ` title="${sharedCount} Medien stammen aus derselben Tabellenzeile."` : ""}>
      <span class="backend-media-kind ${escapeHtml(media.kind || "photo")}" role="cell">${backendMediaKindLabel(media.kind)}</span>
      <span class="backend-media-name" role="cell"><strong title="${escapeHtml(media.name || "Medium")}">${escapeHtml(media.name || "Medium")}</strong><small>${escapeHtml(media.tableName || "Kundentabelle")}</small>${sharedHint}</span>
      ${backendMediaLocationsMarkup(media)}
      ${backendMediaSizeMarkup(media)}
      ${backendMediaAvailabilityMarkup(media)}
      ${backendMediaFileStateMarkup(media)}
      <span class="backend-media-actions" role="cell"><button class="backend-media-open" type="button" data-open-backend-media="${escapeHtml(media.id)}">Öffnen</button>${media.originalAvailable === false ? (media.restorableOriginal ? `<button class="backend-media-original restore" type="button" data-restore-backend-media="${escapeHtml(media.archivedOriginalId)}">Original wiederherstellen</button>` : "") : `<button class="backend-media-original delete" type="button" data-delete-backend-media="${escapeHtml(media.id)}"${media.previewAvailable ? "" : ' disabled title="Erst möglich, sobald eine Vorschau vorhanden ist."'}>Original löschen</button>`}</span>
    </div>`;
  }).join("");
}

function renderBackendMedia() {
  const field = backendMediaSort.value;
  const direction = backendMediaDirection.value === "asc" ? 1 : -1;
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  const sorted = [...loadedBackendMedia].sort((a, b) => {
    let comparison = 0;
    if (field === "size") comparison = (Number(a.size) || 0) - (Number(b.size) || 0);
    else if (field === "yearWeek") {
      const aLocation = a.locations?.[0];
      const bLocation = b.locations?.[0];
      const aValue = aLocation ? (Number(aLocation.calendarYear) * 100) + Number(aLocation.weekNumber) : Number.MAX_SAFE_INTEGER;
      const bValue = bLocation ? (Number(bLocation.calendarYear) * 100) + Number(bLocation.weekNumber) : Number.MAX_SAFE_INTEGER;
      comparison = aValue - bValue;
    } else if (field === "fileState") {
      const order = { original_only: 0, original_and_preview: 1, preview_only: 2 };
      comparison = (order[a.fileState] ?? 3) - (order[b.fileState] ?? 3);
    } else if (field === "action") comparison = Number(a.originalAvailable === false) - Number(b.originalAvailable === false);
    else comparison = collator.compare(a.name || "", b.name || "");
    return comparison ? comparison * direction : collator.compare(a.name || "", b.name || "");
  });
  const summary = `${sorted.length} ${sorted.length === 1 ? "Medium" : "Medien"} gespeichert`;
  const markup = backendMediaRowsMarkup(sorted);
  backendMediaSummary.textContent = summary;
  mediaLibrarySummary.textContent = summary;
  backendMediaList.innerHTML = markup;
  mediaLibraryList.innerHTML = markup;
  document.querySelectorAll("[data-media-sort]").forEach(button => {
    const active = button.dataset.mediaSort === field;
    const columnHeader = button.closest('[role="columnheader"]');
    button.classList.toggle("active", active);
    button.querySelector(".backend-media-sort-arrow").textContent = active ? (direction === 1 ? "↑" : "↓") : "";
    const label = button.firstChild?.textContent?.trim() || "Spalte";
    button.setAttribute("aria-label", `${label} sortieren${active ? `, aktuell ${direction === 1 ? "aufsteigend" : "absteigend"}` : ""}`);
    columnHeader?.setAttribute("aria-sort", active ? (direction === 1 ? "ascending" : "descending") : "none");
  });
}

function sortBackendMediaByHeader(field) {
  if (backendMediaSort.value === field) backendMediaDirection.value = backendMediaDirection.value === "asc" ? "desc" : "asc";
  else {
    backendMediaSort.value = field;
    backendMediaDirection.value = "asc";
  }
  mediaLibrarySort.value = backendMediaSort.value;
  mediaLibraryDirection.value = backendMediaDirection.value;
  renderBackendMedia();
}

function openBackendMedia(mediaId) {
  const media = loadedBackendMedia.find(entry => entry.id === mediaId);
  if (!media) return;
  const url = media.originalAvailable === false ? media.previewUrl || media.url : media.url || media.previewUrl;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function retainPreviewAfterOriginalDeletion(mediaId, media) {
  state.tables.forEach(table => Object.values(table.weeks || {}).forEach(week => {
    (week?.items || []).forEach(item => {
      if (!Array.isArray(item.media)) return;
      item.media = item.media.map(record => {
        if (record?.id !== mediaId) return record;
        if (record.url?.startsWith("blob:")) URL.revokeObjectURL(record.url);
        return {
          ...record,
          id: "",
          file: null,
          url: "",
          serverUrl: "",
          originalAvailable: false,
          fileState: "preview_only",
          archivedOriginalId: mediaId,
          archivedOriginalName: record.name || media.name || "Original",
          sourceReference: record.sourceReference || media.sourceReference || record.name || media.name || "",
          previewId: record.previewId || media.previewId,
          previewName: record.previewName || media.previewName || "Vorschau.jpg",
          previewType: record.previewType || media.previewType || "image/jpeg",
          previewSize: Number(record.previewSize) || Number(media.previewSize) || 0,
          previewUrl: record.previewUrl || media.previewUrl,
          previewServerUrl: record.previewServerUrl || media.previewUrl
        };
      });
    });
  }));
}

function requestBackendMediaDeletion(mediaId, button) {
  const media = loadedBackendMedia.find(entry => String(entry.id) === String(mediaId));
  if (!media || media.originalAvailable === false) return;
  if (!media.previewAvailable) {
    backendDialogError.textContent = "Das Original kann erst gelöscht werden, wenn eine Vorschau vorhanden ist.";
    backendDialogError.hidden = false;
    return;
  }
  pendingOriginalDeletion = { mediaId: String(media.id), media, button };
  deleteOriginalMessage.textContent = `Möchtest du die Originaldatei „${media.name}“ aus der Tabelle entfernen?`;
  deleteOriginalFinalMessage.textContent = `Das Original von „${media.name}“ wird jetzt archiviert und aus der aktiven Tabelle entfernt.`;
  deleteOriginalDialog.showModal();
}

async function deleteBackendMedia(mediaId, media, button) {
  button.disabled = true;
  button.textContent = "Original wird gelöscht …";
  try {
    await apiRequest(`/api/planner-media/${encodeURIComponent(mediaId)}?originalOnly=1`, { method: "DELETE" });
    retainPreviewAfterOriginalDeletion(mediaId, media);
    renderWorkspace();
    saveState();
    await refreshBackendOverview();
  } catch (error) {
    backendDialogError.textContent = error.message;
    backendDialogError.hidden = false;
    button.disabled = false;
    button.textContent = "Original löschen";
  }
}

function restoreArchivedOriginalInState(archivedOriginalId, restoredMedia) {
  state.tables.forEach(table => Object.values(table.weeks || {}).forEach(week => {
    (week?.items || []).forEach(item => {
      if (!Array.isArray(item.media)) return;
      item.media = item.media.map(record => {
        if (String(record?.archivedOriginalId || "") !== String(archivedOriginalId)) return record;
        const restored = {
          ...record,
          id: restoredMedia.id,
          tableId: restoredMedia.tableId,
          name: restoredMedia.name,
          type: restoredMedia.type,
          size: Number(restoredMedia.size) || 0,
          url: restoredMedia.url,
          serverUrl: restoredMedia.url,
          originalAvailable: true,
          fileState: record.previewId ? "original_and_preview" : "original_only",
          sourceReference: restoredMedia.sourceReference || record.sourceReference || restoredMedia.name
        };
        delete restored.archivedOriginalId;
        delete restored.archivedOriginalName;
        return restored;
      });
    });
  }));
}

async function restoreBackendMedia(archivedOriginalId, button) {
  if (!archivedOriginalId || !isOwner()) return;
  button.disabled = true;
  button.textContent = "Wird wiederhergestellt …";
  backendDialogError.hidden = true;
  try {
    const result = await apiRequest(`/api/planner-media/${encodeURIComponent(archivedOriginalId)}/restore`, { method: "POST" });
    restoreArchivedOriginalInState(archivedOriginalId, result.media);
    renderWorkspace();
    saveState();
    await refreshBackendOverview();
  } catch (error) {
    backendDialogError.textContent = error.message;
    backendDialogError.hidden = false;
    button.disabled = false;
    button.textContent = "Original wiederherstellen";
  }
}

async function refreshBackendOverview() {
  if (!isOwner()) return;
  backendDialogError.hidden = true;
  refreshBackendButton.disabled = true;
  refreshBackendButton.textContent = "Wird geladen …";
  backendStatusCard.className = "backend-status-card";
  backendStatusCard.innerHTML = `<span class="backend-status-dot"></span><div><strong>Backend wird geprüft …</strong><small>Verbindung zur Datenverwaltung</small></div>`;
  try {
    const overview = await apiRequest("/api/admin/overview");
    const statuses = overview.publications?.statuses ?? {};
    const openCount = ["draft", "queued", "publishing", "failed"].reduce((sum, status) => sum + Number(statuses[status] || 0), 0);
    backendStatusCard.classList.add("online");
    backendStatusCard.innerHTML = `<span class="backend-status-dot"></span><div><strong>Backend ist erreichbar</strong><small>${overview.server.mode === "production" ? "Produktionsbetrieb" : "Lokaler Betrieb"} · Datenbank und API antworten</small></div>`;
    backendTableCount.textContent = state.tables.length;
    backendConnectionCount.textContent = overview.instagram.connectionCount;
    backendPublicationCount.textContent = overview.publications.total;
    backendOpenCount.textContent = openCount;
    backendLastUpdated.textContent = `Aktualisiert ${new Date(overview.server.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    backendSystemDetails.innerHTML = `
      <div><span>Betriebsart</span><strong>${overview.instagram.dryRun ? "Instagram-Testmodus" : overview.server.mode === "production" ? "Produktion" : "Lokal"}</strong></div>
      <div><span>Laufzeit</span><strong>${formatBackendUptime(overview.server.uptimeSeconds)}</strong></div>
      <div><span>Instagram API</span><strong>${escapeHtml(overview.instagram.apiVersion || "–")}</strong></div>
      <div><span>Öffentliche Medien</span><strong>${overview.instagram.publicMediaConfigured ? "Bereit" : "Noch nicht eingerichtet"}</strong></div>`;
    backendConnectionsList.innerHTML = overview.connections.length ? overview.connections.map(connection => `
      <article class="backend-list-item">
        <div><strong>${escapeHtml(connection.tableName)}</strong><span>@${escapeHtml(connection.username || "Instagram")} · ${escapeHtml(connection.accountType || "Professionelles Konto")}</span></div>
        <span class="publication-state published">Verbunden</span>
      </article>`).join("") : `<p class="backend-empty">Noch keine Kundentabelle ist mit Instagram verbunden.</p>`;
    backendPublicationsList.innerHTML = overview.publications.recent.length ? overview.publications.recent.map(publication => `
      <article class="backend-list-item">
        <div><strong>${escapeHtml(publication.tableName)} · KW ${String(publication.weekNumber).padStart(2, "0")} / ${publication.calendarYear || PLANNING_START_YEAR}</strong><span>${publication.contentType === "story" ? "Story" : publication.contentType === "reel" ? "Reel" : "Beitrag"} · ${publication.scheduledAt ? new Date(publication.scheduledAt).toLocaleString("de-DE") : "Ohne Termin"}</span></div>
        <span class="publication-state ${publicationStatusClass(publication.status)}">${publicationStatusLabel(publication.status)}</span>
      </article>`).join("") : `<p class="backend-empty">Noch keine Veröffentlichungsaufträge vorhanden.</p>`;
    loadedBackendMedia = normalizeBackendMedia(Array.isArray(overview.media) ? overview.media : []);
    renderBackendMedia();
  } catch (error) {
    backendStatusCard.classList.add("error");
    backendStatusCard.innerHTML = `<span class="backend-status-dot"></span><div><strong>Backend nicht erreichbar</strong><small>Starte Planyoursocials über „npm start“ und versuche es erneut.</small></div>`;
    backendDialogError.textContent = error.message;
    backendDialogError.hidden = false;
    backendSystemDetails.innerHTML = "";
    backendConnectionsList.innerHTML = `<p class="backend-empty">Keine Backend-Daten verfügbar.</p>`;
    backendPublicationsList.innerHTML = `<p class="backend-empty">Keine Backend-Daten verfügbar.</p>`;
    loadedBackendMedia = [];
    renderBackendMedia();
  } finally {
    refreshBackendButton.disabled = false;
    refreshBackendButton.textContent = "Neu laden";
  }
}

function localDateTimeValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function detectedPublicationType(item, media) {
  if (item.type === "story") return "story";
  return media.some(record => record.type.startsWith("video/")) ? "reel" : "post";
}

function publicationTypeLabel(type, mediaCount) {
  if (type === "story") return "Story";
  if (type === "reel") return "Reel";
  return mediaCount > 1 ? "Foto-Karussell" : "Foto-Beitrag";
}

function publicationMediaIssue(type, media) {
  if (type === "story" && media.length !== 1) return "Für eine Story darf genau ein Bild oder Video verwendet werden.";
  if (type === "reel" && (media.length !== 1 || !media[0].type.startsWith("video/"))) {
    return "Ein Reel benötigt genau ein Video. Entferne bitte weitere Bilder oder Videos aus dieser Zeile.";
  }
  return "";
}

async function imageDimensions(record) {
  const file = await mediaFile(record);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`„${record.name}“ konnte nicht für den Zuschnitt geladen werden.`));
    image.src = record.url;
  });
}

async function mediaFile(record) {
  if (record.file) return record.file;
  const response = await fetch(record.serverUrl || record.url);
  if (!response.ok) throw new Error(`„${record.name}“ konnte nicht aus dem sicheren Speicher geladen werden.`);
  const blob = await response.blob();
  record.file = new File([blob], record.name || "Medium", { type: record.type || blob.type });
  return record.file;
}

async function preparePublicationCropOptions(context) {
  publicationCropList.replaceChildren();
  publicationCropSection.hidden = true;
  context.cropSettings = new Map();
  if (context.contentType !== "post") return;

  const imageEntries = context.media
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.type.startsWith("image/"));
  const candidates = [];
  for (const entry of imageEntries) {
    try {
      const dimensions = await imageDimensions(entry.record);
      if (dimensions.width / dimensions.height < 4 / 5 - 0.001) candidates.push({ ...entry, ...dimensions });
    } catch (error) {
      console.warn(error);
    }
  }
  if (!candidates.length) return;

  candidates.forEach(({ record, index, width, height }) => {
    const setting = { position: 50, sourceWidth: width, sourceHeight: height, cropHeight: width * 5 / 4 };
    context.cropSettings.set(index, setting);
    const item = document.createElement("article");
    item.className = "publication-crop-item";
    item.innerHTML = `<div class="publication-crop-item-header"><strong>Bild ${index + 1}</strong><span>${escapeHtml(record.name)}</span></div><div class="publication-crop-preview"><img alt="Gewählter Instagram-Ausschnitt"></div><label class="publication-crop-control">Bild nach oben oder unten verschieben<input type="range" min="0" max="100" value="50" step="1" aria-label="Bildausschnitt für Bild ${index + 1}"></label>`;
    const preview = item.querySelector("img");
    const slider = item.querySelector("input");
    preview.src = record.url;
    slider.addEventListener("input", () => {
      setting.position = Number(slider.value);
      preview.style.objectPosition = `50% ${setting.position}%`;
    });
    publicationCropList.append(item);
  });
  publicationCropSection.hidden = false;
}

async function cropImageForInstagram(record, setting) {
  const file = await mediaFile(record);
  if (!setting) return { file, name: record.name, crop: null };
  const bitmap = await createImageBitmap(file);
  const cropHeight = Math.min(bitmap.height, setting.cropHeight);
  const cropTop = Math.max(0, (bitmap.height - cropHeight) * (setting.position / 100));
  const outputWidth = Math.min(1080, bitmap.width);
  const outputHeight = Math.round(outputWidth * 5 / 4);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, cropTop, bitmap.width, cropHeight, 0, 0, outputWidth, outputHeight);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Der Bildausschnitt konnte nicht erstellt werden.")), "image/jpeg", 0.92));
  const baseName = record.name.replace(/\.[^.]+$/, "") || "instagram-bild";
  const name = `${baseName}-instagram-4x5.jpg`;
  return {
    file: new File([blob], name, { type: "image/jpeg" }),
    name,
    crop: { format: "4:5", verticalPosition: setting.position }
  };
}

async function openPublicationDialog(row) {
  if (!isOwner()) return;
  const item = itemDataFromRow(row);
  const media = item ? itemMedia(item).filter(Boolean) : [];
  if (!item || !media.length) {
    alert("Lade zuerst mindestens ein Bild oder Video in dieser Zeile hoch.");
    return;
  }
  try {
    backendConfig = await apiRequest("/api/config");
  } catch (error) {
    alert(error.message);
    return;
  }
  const contentType = detectedPublicationType(item, media);
  pendingPublicationContext = {
    tableId: currentTable().id,
    calendarYear: Number(row.dataset.year) || PLANNING_START_YEAR,
    weekNumber: Number(row.dataset.week),
    itemIndex: Number(row.dataset.itemIndex),
    item,
    media,
    contentType,
    mediaIssue: publicationMediaIssue(contentType, media),
    cropSettings: new Map()
  };
  document.querySelector("#publication-week").value = pendingPublicationContext.weekNumber;
  document.querySelector("#publication-item-index").value = pendingPublicationContext.itemIndex;
  publicationContentType.value = contentType;
  const nextHour = new Date(Date.now() + 60 * 60_000);
  nextHour.setMinutes(0, 0, 0);
  publicationScheduledAt.value = localDateTimeValue(nextHour);
  publicationCaption.value = item.type === "post" ? textWithFixedEnding(item.text, currentTable()) : (item.text || "");
  publicationCustomerApproved.checked = Boolean(item.approved);
  publicationAdminApproved.checked = false;
  publicationError.hidden = true;
  publicationMediaSummary.classList.toggle("warning", Boolean(pendingPublicationContext.mediaIssue));
  publicationMediaSummary.innerHTML = pendingPublicationContext.mediaIssue
    ? `<strong>!</strong><span>${escapeHtml(pendingPublicationContext.mediaIssue)}</span>`
    : `<strong>${media.some(record => record.type.startsWith("video/")) ? "▶" : media.length}</strong><span><b>${publicationTypeLabel(contentType, media.length)}</b> automatisch erkannt · ${media.length === 1 ? "ein Medium" : `${media.length} Medien`}</span>`;
  await preparePublicationCropOptions(pendingPublicationContext);
  publicationDialog.showModal();
}

async function syncPublicationStatuses(render = true) {
  if (!authenticatedAccount || !isOwner()) return;
  const table = currentTable();
  if (!table) return;
  try {
    const result = await apiRequest(`/api/publications?tableId=${encodeURIComponent(table.id)}`, {}, false);
    if (rolePreview) return;
    const latestByItem = new Map();
    (result.publications || []).forEach(publication => {
      const key = `${publication.calendarYear || PLANNING_START_YEAR}:${publication.weekNumber}:${publication.itemIndex}`;
      if (!latestByItem.has(key)) latestByItem.set(key, publication);
    });
    let changed = false;
    latestByItem.forEach(publication => {
      const item = table.weeks?.[weekStorageKey(publication.calendarYear || PLANNING_START_YEAR, publication.weekNumber)]?.items?.[publication.itemIndex];
      if (!item) return;
      if (item.instagramPublicationId !== publication.id || item.instagramStatus !== publication.status) changed = true;
      item.instagramPublicationId = publication.id;
      item.instagramStatus = publication.status;
      item.instagramScheduledAt = publication.scheduledAt;
      item.instagramError = publication.lastError;
      if (publication.status === "published") item.published = true;
    });
    if (changed) {
      saveState();
      if (render) renderWorkspace();
    }
  } catch {
    // Die reine Offline-Oberfläche bleibt ohne laufendes Backend vollständig nutzbar.
  }
}

function hideWeek(year, weekNumber) {
  const table = currentTable();
  if (!table || !isOwner()) return;
  const hiddenWeeks = tableHiddenWeeks(table);
  const key = periodKey(year, weekNumber);
  pushUndoState("Kalenderwoche ausgeblendet");
  if (!hiddenWeeks.includes(key)) table.hiddenWeeks.push(key);
  renderWorkspace();
  saveState();
}

function restoreWeek(year, weekNumber) {
  const table = currentTable();
  if (!table || !isOwner()) return;
  const key = periodKey(year, weekNumber);
  pushUndoState("Kalenderwoche wieder eingeblendet");
  table.hiddenWeeks = tableHiddenWeeks(table).filter(hiddenWeek => hiddenWeek !== key);
  renderWorkspace();
  renderHiddenWeeksDialog();
  saveState();
}

function hideWeekRange(startKey, endKey) {
  const table = currentTable();
  if (!table || !isOwner()) return;
  const periods = planningPeriods(tableDisplayStartWeek(table), tableVisibleYears(table));
  const startIndex = periods.findIndex(period => period.key === startKey);
  const endIndex = periods.findIndex(period => period.key === endKey);
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    hideWeeksRangeError.textContent = "Bitte wähle einen gültigen Zeitraum. Die Von-Angabe muss vor der Bis-Angabe liegen.";
    hideWeeksRangeError.hidden = false;
    return;
  }
  const weeksInRange = periods.slice(startIndex, endIndex + 1).map(period => period.key);
  const hiddenWeeks = tableHiddenWeeks(table);
  const newlyHiddenWeeks = weeksInRange.filter(key => !hiddenWeeks.includes(key));
  if (!newlyHiddenWeeks.length) {
    hideWeeksRangeError.textContent = "Dieser Zeitraum ist bereits vollständig ausgeblendet.";
    hideWeeksRangeError.hidden = false;
    return;
  }
  const startPeriod = periods[startIndex];
  const endPeriod = periods[endIndex];
  pushUndoState(`Zeitraum ${monthWeekLabel(startPeriod.year, startPeriod.weekNumber)} ${startPeriod.year} bis ${monthWeekLabel(endPeriod.year, endPeriod.weekNumber)} ${endPeriod.year} ausgeblendet`);
  table.hiddenWeeks = [...new Set([...hiddenWeeks, ...weeksInRange])];
  tableHiddenWeeks(table);
  hideWeeksRangeError.hidden = true;
  renderWorkspace();
  renderHiddenWeeksDialog();
  saveState();
}

function renderApp(persist = true) {
  refreshTableTemplateSchema();
  ensureCurrentTable();
  renderHistoryPreviewBanner();
  renderUserControls();
  renderNavigation();
  renderSubadmins();
  renderWorkspace();
  if (persist) saveState();
}

function renderUserControls() {
  const user = currentUser();
  document.querySelector("#account-name").textContent = user.name;
  document.querySelector("#account-role").textContent = ({ owner: "Hauptadmin", subadmin: "Unteradmin", customer: "Kunde" })[user.role] || "Benutzer";
  document.querySelector("#account-avatar").textContent = initials(user.name);
  document.querySelectorAll(".admin-only").forEach(element => element.classList.toggle("is-hidden", !isOwner()));
  const previewing = Boolean(rolePreview);
  document.querySelector("#exit-role-preview").hidden = !previewing;
  rolePreviewBanner.hidden = !previewing;
  if (previewing) document.querySelector("#role-preview-description").textContent = `Vorschau: ${user.name} (${user.role === "customer" ? "Kunde" : "Unteradmin"}) · nur ansehen`;
  document.body.classList.toggle("is-role-preview", previewing);
  contentCard.inert = previewing;
  updateUndoButton();
}

function openRolePreviewDialog() {
  if (!authenticatedAccount || authenticatedAccount.role !== "owner" || rolePreview) return;
  const accounts = state.users.filter(user => user.role === "subadmin" || user.role === "customer");
  rolePreviewUser.replaceChildren(...accounts.map(user => {
    const role = user.role === "customer" ? "Kunde" : "Unteradmin";
    const tableCount = (user.tableIds ?? []).length;
    return new Option(`${user.name} · ${role} · ${tableCount} ${tableCount === 1 ? "Tabelle" : "Tabellen"}`, user.id);
  }));
  document.querySelector("#role-preview-empty").hidden = accounts.length > 0;
  document.querySelector("#start-role-preview").disabled = accounts.length === 0;
  rolePreviewUser.disabled = accounts.length === 0;
  rolePreviewDialog.showModal();
}

async function startRolePreview(userId) {
  const user = state.users.find(item => item.id === userId && ["subadmin", "customer"].includes(item.role));
  if (!user || authenticatedAccount?.role !== "owner" || rolePreview) return;
  if (plannerSaveTimer) await new Promise(resolve => setTimeout(resolve, 450));
  await plannerSaveQueue.catch(() => {});
  const previousState = state;
  const previousMedia = captureMediaState();
  state = structuredClone(state);
  restoreMediaState(previousMedia);
  rolePreview = { userId, previousState };
  rolePreviewDialog.close();
  cancelPendingRowCut();
  renderApp(false);
}

function exitRolePreview() {
  if (!rolePreview) return;
  revokeAllRuntimeMedia();
  state = rolePreview.previousState;
  rolePreview = null;
  renderApp(false);
}

function renderNavigation() {
  navigation.innerHTML = allowedTables().map(table => `
    <button class="nav-item ${table.id === state.currentTableId ? "active" : ""}" type="button" data-table-id="${table.id}">
      <span class="nav-badge">${escapeHtml(initials(table.name))}</span><span>${escapeHtml(table.name)}</span>
    </button>`).join("");
}

function renderSubadmins() {
  const subadmins = state.users.filter(user => user.role === "subadmin" || user.role === "customer");
  subadminList.innerHTML = subadmins.length ? subadmins.map(user => {
    const tables = state.tables.filter(table => (user.tableIds ?? []).includes(table.id));
    const tableNames = tables.map(table => table.name).join(", ");
    const accessSummary = tables.length > 1 ? `${tables.length} Tabellen · ${tableNames}` : (tableNames || "Keine Tabelle");
    return `<div class="subadmin-item"><span class="avatar">${initials(user.name)}</span><div><strong>${escapeHtml(user.name)}${user.role === "customer" ? " · Kunde" : ""}</strong><small title="${escapeHtml(tableNames)}">${escapeHtml(accessSummary)}</small></div><button class="edit-access-button" type="button" data-edit-subadmin="${user.id}" aria-label="Tabellenzugriff für ${escapeHtml(user.name)} bearbeiten" title="Tabellenzugriff bearbeiten">✎</button></div>`;
  }).join("") : `<p class="dialog-hint">Noch keine Unteradmins angelegt.</p>`;
}

function renderSubadminTableOptions(selectedTableIds = []) {
  subadminTables.innerHTML = state.tables.length ? state.tables.map(table => `
    <label class="permission-option">
      <input type="checkbox" name="subadmin-table" value="${table.id}" ${selectedTableIds.includes(table.id) ? "checked" : ""}>
      <span>${escapeHtml(table.name)}</span>
    </label>`).join("") : `<p class="permission-empty">Lege zuerst eine Kundentabelle an.</p>`;
}

let pendingCustomerCredentials = "";
function openSubadminDialog(user = null) {
  const customer = user?.role === "customer";
  subadminForm.reset();
  document.querySelector("#invitation-result").hidden = true;
  document.querySelector("#invitation-link").value = "";
  document.querySelector("#customer-registration-result").hidden = true;
  document.querySelector("#customer-credentials").value = "";
  document.querySelector("#new-customer-name").value = "";
  document.querySelector("#new-customer-email").value = "";
  document.querySelector("#new-customer-password").value = "";
  document.querySelector("#new-customer-name").required = !user;
  document.querySelector("#new-customer-email").required = !user;
  document.querySelector("#new-customer-password").required = !user;
  pendingCustomerCredentials = "";
  document.querySelector("#invitation-delivery").hidden = Boolean(user);
  subadminDialog.dataset.accountRole = customer ? "customer" : "subadmin";
  document.querySelector("#editing-subadmin-id").value = user?.id ?? "";
  document.querySelector("#subadmin-dialog-title").textContent = customer ? "Kundenkonto zuordnen" : user ? "Tabellenzugriff bearbeiten" : "Zugang vergeben";
  subadminName.value = user?.name ?? "";
  subadminEmail.value = user?.email ?? "";
  document.querySelector("#subadmin-email-label").hidden = !user;
  subadminEmail.required = Boolean(user);
  subadminNameLabel.hidden = !user;
  subadminName.required = Boolean(user);
  subadminPasswordLabel.hidden = !user;
  subadminPassword.required = false;
  subadminPasswordLabel.firstChild.textContent = "Neues Passwort (optional)";
  subadminPasswordHint.textContent = user
    ? customer
      ? "Der Kunde hat sein Passwort selbst festgelegt. Lass dieses Feld leer, wenn es unverändert bleiben soll."
      : "Lass das Passwort leer, wenn es unverändert bleiben soll. Bei einem neuen Passwort wird der Unteradmin auf anderen Geräten abgemeldet."
    : "Wähle unten einen der beiden Wege. Der Link ist 7 Tage gültig; bei direkter Kundenanlage vergibst du das Passwort selbst.";
  document.querySelector("#subadmin-save-button").hidden = !user;
  document.querySelector("#subadmin-save-button").textContent = customer ? "Kundenzugriff speichern" : "Änderungen speichern";
  renderSubadminTableOptions(user?.tableIds ?? []);
  subadminError.textContent = customer ? "Bitte wähle genau eine Kundentabelle aus." : "Bitte wähle mindestens eine Kundentabelle aus.";
  subadminError.hidden = true;
  subadminDialog.showModal();
}

function renderWorkspace() {
  const table = currentTable();
  renderAiAgentTopStatus();
  renderTableColumns(table);
  renderHiddenWeeksControls(table);
  const tableColumnCount = Math.max(1, tableColumnDefinitions(table).length);
  const startWeek = tableDisplayStartWeek(table);
  const visibleYears = tableVisibleYears(table);
  const periods = planningPeriods(startWeek, visibleYears);
  const storedViewMode = table?.viewMode ?? state.viewMode;
  const storedSelectedYear = table?.selectedYear ?? state.selectedYear;
  const storedSelectedWeek = table?.selectedWeek ?? state.selectedWeek;
  const viewMode = storedViewMode === "week" ? "week" : "year";
  const requestedPeriodKey = periodKey(Number(storedSelectedYear) || PLANNING_START_YEAR, Number(storedSelectedWeek) || startWeek);
  const selectedPeriodIndex = Math.max(0, periods.findIndex(period => period.key === requestedPeriodKey));
  const selectedPeriod = periods[selectedPeriodIndex] ?? { year: PLANNING_START_YEAR, weekNumber: startWeek, key: periodKey(PLANNING_START_YEAR, startWeek) };
  const finalPeriod = periods.at(-1) ?? selectedPeriod;
  const yearsLabel = visibleYearsLabel(visibleYears);
  state.viewMode = viewMode;
  state.selectedYear = selectedPeriod.year;
  state.selectedWeek = selectedPeriod.weekNumber;
  if (table) {
    table.viewMode = viewMode;
    table.selectedYear = state.selectedYear;
    table.selectedWeek = state.selectedWeek;
  }
  viewModeButtons.forEach(button => button.classList.toggle("active", button.dataset.viewMode === viewMode));
  weekPickerWrapper.hidden = viewMode !== "week";
  previousWeekButton.hidden = viewMode !== "week";
  nextWeekButton.hidden = viewMode !== "week";
  previousWeekButton.disabled = selectedPeriodIndex <= 0;
  nextWeekButton.disabled = selectedPeriodIndex >= periods.length - 1;
  weekPicker.innerHTML = periods.map(({ year, weekNumber, key }) =>
    `<option value="${key}" ${key === selectedPeriod.key ? "selected" : ""}>${year} · ${monthWeekLabel(year, weekNumber)} · ${String(weekNumber).padStart(2, "0")}</option>`
  ).join("");
  contentCard.classList.toggle("week-view", viewMode === "week");
  const weekViewRowHeight = tableWeekViewRowHeight(table);
  if (weekViewRowHeight) contentCard.style.setProperty("--week-row-height", `${weekViewRowHeight}px`);
  else contentCard.style.removeProperty("--week-row-height");
  contentTableTitle.textContent = viewMode === "week" ? `Content-Planung · KW ${String(state.selectedWeek).padStart(2, "0")} · ${state.selectedYear}` : `Content-Jahresplanung ${yearsLabel}`;
  contentTableDescription.textContent = viewMode === "week"
    ? "Eine Kalenderwoche mit maximalem Arbeitsbereich"
    : `${monthWeekLabel(selectedPeriod.year, selectedPeriod.weekNumber)} ${selectedPeriod.year} bis ${monthWeekLabel(finalPeriod.year, finalPeriod.weekNumber)} ${finalPeriod.year}`;

  if (!table) {
    tableTitle.textContent = "Keine Kundentabelle verfügbar";
    tableSubtitle.textContent = "Bitte wende dich an den Hauptadmin.";
    tableBody.innerHTML = `<tr><td class="empty-state" colspan="${tableColumnCount}">Für diesen Benutzer wurde noch keine Tabelle freigegeben.</td></tr>`;
    scheduleChangeMessageEditExpiry();
    return;
  }

  tableTitle.textContent = table.name;
  tableSubtitle.textContent = `${viewMode === "week" ? `KW ${String(state.selectedWeek).padStart(2, "0")} · ${state.selectedYear}` : yearsLabel} · ${isOwner() ? "Hauptadmin-Ansicht" : "Persönlicher Tabellenzugriff"}`;
  storiesInput.value = table.storiesPerWeek;
  postsInput.value = table.postsPerWeek;
  storiesInput.disabled = !isOwner();
  postsInput.disabled = !isOwner();
  fixedHashtagsButton.classList.toggle("has-value", Boolean(tableFixedHashtags(table).trim()));
  fixedHashtagsButton.title = tableFixedHashtags(table).trim() ? "Fester Beitragstext ist hinterlegt" : "Festen Beitragstext hinterlegen";
  const hiddenWeeks = tableHiddenWeeks(table);
  const periodsToRender = viewMode === "week"
    ? (hiddenWeeks.includes(selectedPeriod.key) ? [] : [selectedPeriod])
    : periods.filter(period => !hiddenWeeks.includes(period.key));
  const emptyHeading = viewMode === "week"
    ? `KW ${String(state.selectedWeek).padStart(2, "0")} · ${state.selectedYear} ist ausgeblendet`
    : "Alle Kalenderwochen sind ausgeblendet";
  const emptyAction = viewMode === "week"
    ? `<button class="secondary-button" type="button" data-restore-period="${selectedPeriod.key}">Kalenderwoche einblenden</button>`
    : `<button class="secondary-button" type="button" data-show-hidden-weeks>Ausgeblendete Wochen anzeigen</button>`;
  if (periodsToRender.length) {
    tableBody.innerHTML = periodsToRender.map(({ year, weekNumber }) => renderWeekRows(table, year, weekNumber)).join("");
  } else {
    tableBody.innerHTML = `<tr><td class="hidden-week-empty" colspan="${tableColumnCount}"><strong>${emptyHeading}</strong><span>Alle gespeicherten Inhalte bleiben erhalten.</span>${isOwner() ? emptyAction : ""}</td></tr>`;
  }
  restoreVisibleMedia();
  scrollChangeChatsToBottom();
  scheduleChangeMessageEditExpiry();
  applyColumnWidths();
  observeVisibleProofreadingFields();
}

function renderWeekRows(table, year, weekNumber) {
  const items = weekItems(table, weekNumber, year);
  if (!items.length) return "";
  const customRowHeight = state.viewMode === "year" ? tableYearViewRowHeight(table) : null;

  return items.map((item, itemIndex) => {
    const isStory = item.type === "story";
    const mediaCount = Math.max(1, Math.trunc(Number(item.mediaCount) || 1));
    item.mediaCount = mediaCount;
    const customValues = itemCustomValues(item);
    const weekCell = itemIndex === 0 ? `<td class="week-cell" rowspan="${items.length}">KW ${String(weekNumber).padStart(2, "0")}<small>${year}</small><span class="month-week">${monthWeekLabel(year, weekNumber)}</span>${isOwner() ? `<button class="hide-week-button" type="button" data-hide-year="${year}" data-hide-week="${weekNumber}" aria-label="KW ${String(weekNumber).padStart(2, "0")} ${year} ausblenden" title="Kalenderwoche ausblenden"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg></button>` : ""}</td>` : "";
    const periodLabel = monthWeekLabel(year, weekNumber);
    const contentTypeLabel = isStory ? "Story" : "Post";
    const extraLabel = extraOrdinal(item) ? `Zusatz${isStory ? "story" : "post"} ${extraOrdinal(item)}` : "";
    const textCell = `${proofreadingField(item.text, "content-text", `Beitragstext für ${contentTypeLabel} ${periodLabel}`, "de")}<div class="text-cell-footer">${proofreadingWarning()}<small class="character-count">${item.text.length} Zeichen</small><button class="copy-contribution-button" type="button" aria-label="Deutschen und übersetzten Beitragstext mit festem Ende kopieren" title="Deutsch, Übersetzung und feste Hashtags kopieren"><span aria-hidden="true">⧉</span></button></div>`;
    const translatedLanguages = new Set(normalizeTranslationEntries(item).map(entry => entry.language));
    const translationControls = isOwner() ? `<span class="translation-language-switch" role="group" aria-label="Deutschen Beitragstext übersetzen"><button class="translation-language-button ${translatedLanguages.has("it") ? "active" : ""}" type="button" data-translate-language="IT" aria-label="Ins Italienische übersetzen" title="Deutsch → Italienisch"><span aria-hidden="true">🇮🇹</span></button><button class="translation-language-button ${translatedLanguages.has("en") ? "active" : ""}" type="button" data-translate-language="EN-GB" aria-label="Ins Englische übersetzen" title="Deutsch → Englisch"><span aria-hidden="true">🇬🇧</span></button></span>` : "";
    const translatedTextCell = `${proofreadingField(item.textItalian, "translated-content-text", `Beitragstext italienisch / englisch für ${contentTypeLabel} ${periodLabel}`, proofreadingLanguage(item, true))}<div class="text-cell-footer"><span class="translation-feedback" aria-live="polite" hidden></span>${proofreadingWarning()}<small class="character-count">${item.textItalian.length} Zeichen</small>${translationControls}<button class="copy-contribution-button" type="button" aria-label="Deutschen und übersetzten Beitragstext mit festem Ende kopieren" title="Deutsch, Übersetzung und feste Hashtags kopieren"><span aria-hidden="true">⧉</span></button></div>`;
    const customCells = Object.fromEntries(tableCustomColumns(table).map(column => {
      if (column.type === "checkbox") {
        return [`custom-${column.id}`, `<td class="check-cell custom-cell"><label class="check-control"><input class="custom-check" data-custom-column="${column.id}" type="checkbox" ${customValues[column.id] ? "checked" : ""}><span class="check-box">✓</span></label><span class="status-label">${escapeHtml(column.checkboxLabel)}</span></td>`];
      }
      const value = String(customValues[column.id] ?? "");
      return [`custom-${column.id}`, `<td class="custom-cell"><textarea class="custom-text change-request" data-custom-column="${column.id}" placeholder="${escapeHtml(column.title)} eintragen …">${escapeHtml(value)}</textarea><small class="character-count">${value.length} Zeichen</small></td>`];
    }));
    const instagramStatusMarkup = item.instagramStatus
      ? `<span class="instagram-row-status ${publicationStatusClass(item.instagramStatus)}" title="${escapeHtml(item.instagramError || "")}">${publicationStatusLabel(item.instagramStatus)}</span>`
      : "";
    const instagramPlanButton = isOwner() ? `<button class="instagram-plan-button" type="button" data-plan-instagram>Auf Instagram planen</button>` : "";
    const completedControl = isOwner() ? `<div class="completed-control"><label class="check-control completed-check" title="Beim Abschließen wird je Originalmedium eine Vorschau mit maximal 2 MB erzeugt und das Original automatisch aus der aktiven Tabelle entfernt."><input class="completed-input" type="checkbox" ${item.completed ? "checked" : ""}><span class="check-box">✓</span></label><span class="status-label completed-status-label">${item.completed ? "Abgeschlossen" : "Abschließen"}</span><small>Vorschau max. 2 MB · Original automatisch entfernt</small></div>` : "";
    const aiDraftButton = !isStory && isOwner()
      ? `<button class="ai-row-button" type="button" data-prepare-ai-draft aria-label="KI-Entwurf für ${periodLabel} vorbereiten" title="${item.approved || item.published || item.instagramPublicationId ? "Nur offene, ungeplante Post-Zeilen können vorbereitet werden" : "KI-Entwurf vorbereiten"}" ${item.approved || item.published || item.instagramPublicationId ? "disabled" : ""}><span aria-hidden="true">✦</span></button>`
      : "";
    const position = { tableId: table.id, year, week: weekNumber, itemIndex };
    const isCutSource = sameRowPosition(pendingRowCut, position);
    const cutDisabled = !rowHasContent(item) || item.instagramPublicationId || item.instagramStatus || itemMedia(item).some(media => media?.uploading);
    const rowCutButton = isOwner()
      ? `<button class="row-cut-button" type="button" data-cut-row aria-label="Inhalt dieser ${contentTypeLabel}-Zeile ausschneiden" title="${item.instagramPublicationId || item.instagramStatus ? "Instagram-Aufträge können nicht verschoben werden" : cutDisabled ? `Diese ${contentTypeLabel}-Zeile ist noch leer oder ein Medium wird hochgeladen` : "Ganzen Zeileninhalt ausschneiden"}" ${cutDisabled ? "disabled" : ""}><span aria-hidden="true">✂</span></button>`
      : "";
    const rowPasteButton = isOwner() && canPasteCutRow(item, position)
      ? rowHasContent(item)
        ? `<button class="row-paste-button" type="button" data-paste-cut-row aria-label="Inhalt mit dieser ${contentTypeLabel}-Zeile tauschen" title="Inhalte dieser beiden ${contentTypeLabel}-Zeilen tauschen">Tauschen</button>`
        : `<button class="row-paste-button" type="button" data-paste-cut-row aria-label="Ausgeschnittenen Inhalt hier einfügen" title="In diese freie ${contentTypeLabel}-Zeile einfügen">Einfügen</button>`
      : "";

    const cells = {
      week: weekCell,
      approval: `<td class="check-cell"><label class="check-control"><input class="approved-input" type="checkbox" ${item.approved ? "checked" : ""}><span class="check-box">✓</span></label><span class="status-label">${item.approved ? "Bestätigt" : "Offen"}</span><span class="content-type ${item.type}">${extraLabel || contentTypeLabel}</span>${aiDraftButton}${rowCutButton}${rowPasteButton}</td>`,
      media: `<td class="media-cell"><div class="media-list"><div class="media-slots">${Array.from({ length: mediaCount }, (_, mediaIndex) => mediaSlotHtml(mediaIndex, mediaCount > 1)).join("")}</div>${additionalMediaUploadHtml()}</div></td>`,
      text: `<td>${textCell}</td>`,
      textItalian: `<td>${translatedTextCell}</td>`,
      changes: `<td class="change-comments-cell">${renderChangeComments(item, table)}</td>`,
      ...customCells,
      status: `<td class="check-cell status-cell"><div class="publication-control"><label class="check-control status-check"><input class="published-input" type="checkbox" ${item.published ? "checked" : ""}><span class="check-box">✓</span></label><span class="status-label">${item.published ? "Veröffentlicht" : "Geplant"}</span></div>${completedControl}${instagramStatusMarkup}${instagramPlanButton}</td>`
    };
    const orderedCells = tableColumnOrder(table).map(key => cells[key] ?? "").join("");

    return `<tr class="${isStory ? "story-row" : "post-row"} ${itemIndex === items.length - 1 ? "week-end" : ""} ${isCutSource ? "row-cut-source" : ""}" data-year="${year}" data-week="${weekNumber}" data-item-index="${itemIndex}"${customRowHeight ? ` data-year-week-height="custom" style="--year-week-row-height: ${customRowHeight}px"` : ""}>
      ${orderedCells}
    </tr>`;
  }).join("");
}

function mediaSlotHtml(index, canRemove = false) {
  return `<div class="media-slot" data-media-index="${index}"><div class="drop-zone" role="button" tabindex="0" aria-label="Bild oder Video auswählen"><input type="file" accept="image/*,video/*" hidden><div class="drop-placeholder"><span aria-hidden="true">↑</span><strong>Medium auswählen</strong><small>Bild oder Video</small></div><div class="preview" hidden></div></div><button class="remove-media" type="button" aria-label="Medienfeld entfernen" ${canRemove ? "" : "hidden"}>×</button></div>`;
}

function additionalMediaUploadHtml() {
  return `<div class="add-media-button" role="button" tabindex="0" aria-label="Weiteres Bild oder Video hochladen"><input type="file" accept="image/*,video/*" hidden><strong>+</strong><span>Weiteres Medium</span><small>Bild oder Video</small></div>`;
}

function itemDataFromRow(row) {
  const table = currentTable();
  if (!table) return null;
  return weekItems(table, Number(row.dataset.week), Number(row.dataset.year) || PLANNING_START_YEAR)[Number(row.dataset.itemIndex)];
}

function updateItemFromRow(row, changes) {
  const item = itemDataFromRow(row);
  if (!item) return;
  Object.assign(item, changes);
  refreshRowCutControl(row);
  saveState();
}

function sendChangeMessage(row) {
  const input = row?.querySelector(".change-message-input");
  const text = String(input?.value || "").trim();
  const item = itemDataFromRow(row);
  const user = currentUser();
  const table = currentTable();
  if (!input || !text || !item || !user || !table) return;
  const rowPosition = {
    year: row.dataset.year,
    week: row.dataset.week,
    itemIndex: row.dataset.itemIndex
  };
  pushUndoState("Änderungswunsch gesendet");
  normalizeChangeMessages(item, tableParticipants(table)).push({
    id: crypto.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user.id,
    authorName: user.name,
    authorRole: user.role,
    text,
    createdAt: new Date().toISOString(),
    editedAt: ""
  });
  saveState();
  renderWorkspace();
  window.requestAnimationFrame(() => {
    const updatedRow = tableBody.querySelector(`tr[data-year="${rowPosition.year}"][data-week="${rowPosition.week}"][data-item-index="${rowPosition.itemIndex}"]`);
    const updatedInput = updatedRow?.querySelector(".change-message-input");
    if (!updatedInput) return;
    updatedInput.focus({ preventScroll: true });
    updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
  });
}

function changeMessageFromArticle(row, article) {
  const item = itemDataFromRow(row);
  if (!item || !article) return null;
  return normalizeChangeMessages(item, tableParticipants(currentTable()))
    .find(message => message.id === article.dataset.messageId) ?? null;
}

function closeChangeMessageEditor(article) {
  if (!article) return;
  article.querySelector("[data-change-message-text]")?.removeAttribute("hidden");
  article.querySelector(".change-message-editor")?.remove();
  article.classList.remove("is-editing");
}

function startChangeMessageEdit(row, article) {
  const message = changeMessageFromArticle(row, article);
  if (!message || !canEditChangeMessage(message)) return;
  tableBody.querySelectorAll(".change-message.is-editing").forEach(openArticle => closeChangeMessageEditor(openArticle));
  const messageText = article.querySelector("[data-change-message-text]");
  if (!messageText) return;
  messageText.hidden = true;
  article.classList.add("is-editing");
  const editor = document.createElement("div");
  editor.className = "change-message-editor";
  editor.innerHTML = `<textarea class="change-message-edit-input" maxlength="4000" aria-label="Nachricht bearbeiten" title="Enter: speichern · Alt + Enter: neue Zeile"></textarea><div class="change-message-edit-actions"><button type="button" data-cancel-change-message>Abbrechen</button><button type="button" data-save-change-message>Speichern</button></div>`;
  editor.querySelector("textarea").value = message.text;
  article.append(editor);
  editor.querySelector("textarea").focus();
}

function saveChangeMessageEdit(row, article) {
  const message = changeMessageFromArticle(row, article);
  const input = article?.querySelector(".change-message-edit-input");
  if (!message || !input) return;
  if (!canEditChangeMessage(message)) {
    closeChangeMessageEditor(article);
    window.alert("Die Bearbeitungszeit von 10 Minuten ist abgelaufen.");
    expireChangeMessageEditControls();
    return;
  }
  const text = String(input.value || "").trim();
  if (!text) {
    input.setCustomValidity("Bitte gib eine Nachricht ein.");
    input.reportValidity();
    input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
    return;
  }
  if (text === message.text) {
    closeChangeMessageEditor(article);
    return;
  }
  pushUndoState("Änderungswunsch bearbeitet");
  message.text = text;
  message.editedAt = new Date().toISOString();
  saveState();
  renderWorkspace();
}

function deleteChangeMessage(row, article) {
  const item = itemDataFromRow(row);
  const message = changeMessageFromArticle(row, article);
  if (!item || !message || !canDeleteChangeMessage()) return;
  if (!window.confirm("Möchtest du diese Nachricht wirklich löschen?")) return;
  pushUndoState("Änderungswunsch gelöscht");
  item.changeMessages = normalizeChangeMessages(item, tableParticipants(currentTable()))
    .filter(candidate => candidate.id !== message.id);
  saveState();
  renderWorkspace();
}

function clearChangeChat(row) {
  const item = itemDataFromRow(row);
  if (!item || !canDeleteChangeMessage()) return;
  const messages = normalizeChangeMessages(item, tableParticipants(currentTable()));
  if (!messages.length) return;
  if (!window.confirm("Möchtest du wirklich den gesamten Chat dieser Zeile löschen?")) return;
  pushUndoState("Gesamter Änderungswünsche-Chat gelöscht");
  item.changeMessages = [];
  item.changeComments = [];
  item.changes = "";
  saveState();
  renderWorkspace();
}

function expireChangeMessageEditControls() {
  const now = Date.now();
  tableBody.querySelectorAll(".change-message[data-edit-until]").forEach(article => {
    if (Number(article.dataset.editUntil) > now) return;
    closeChangeMessageEditor(article);
    article.querySelector("[data-edit-change-message]")?.remove();
    article.removeAttribute("data-edit-until");
  });
}

function scheduleChangeMessageEditExpiry() {
  window.clearTimeout(changeMessageEditExpiryTimer);
  changeMessageEditExpiryTimer = null;
  expireChangeMessageEditControls();
  const deadlines = [...tableBody.querySelectorAll(".change-message[data-edit-until]")]
    .map(article => Number(article.dataset.editUntil))
    .filter(deadline => Number.isFinite(deadline) && deadline > Date.now());
  if (!deadlines.length) return;
  const nextDeadline = Math.min(...deadlines);
  changeMessageEditExpiryTimer = window.setTimeout(scheduleChangeMessageEditExpiry, Math.max(50, nextDeadline - Date.now() + 25));
}

function scrollChangeChatsToBottom() {
  tableBody.querySelectorAll(".change-message-list").forEach(messageList => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

function combinedContributionText(item, table) {
  const germanText = String(item?.text ?? "").trim();
  const translatedText = String(item?.textItalian ?? "").trim();
  const fixedEnding = tableFixedHashtags(table).trim();
  return [germanText, translatedText, fixedEnding].filter(Boolean).join("\n\n");
}

function textWithFixedEnding(text, table) {
  const contributionText = String(text ?? "").trimEnd();
  const fixedEnding = tableFixedHashtags(table).trim();
  return [contributionText, fixedEnding].filter(Boolean).join("\n\n");
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) throw new Error("Der Text konnte nicht in die Zwischenablage kopiert werden.");
}

async function copyContributionText(row, button) {
  const item = itemDataFromRow(row);
  const table = currentTable();
  if (!item || !table) return;
  try {
    await writeTextToClipboard(combinedContributionText(item, table));
    button.classList.add("copied");
    button.querySelector("span").textContent = "✓";
    button.title = "In die Zwischenablage kopiert";
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("copied");
      button.querySelector("span").textContent = "⧉";
      button.title = "Deutsch, Übersetzung und feste Hashtags kopieren";
    }, 1600);
  } catch (error) {
    alert(error.message);
  }
}

async function translateContributionText(row, button) {
  if (!isOwner()) return;
  const item = itemDataFromRow(row);
  if (!item) return;
  const sourceText = String(item.text ?? "").trim();
  const cell = button.closest("td");
  const feedback = cell.querySelector(".translation-feedback");
  const languageButtons = [...cell.querySelectorAll("[data-translate-language]")];
  if (!sourceText) {
    feedback.textContent = "Zuerst deutschen Text eingeben";
    feedback.classList.add("error");
    feedback.hidden = false;
    return;
  }
  const targetLanguage = button.dataset.translateLanguage;
  languageButtons.forEach(control => { control.disabled = true; });
  feedback.textContent = "Wird übersetzt …";
  feedback.classList.remove("error");
  feedback.hidden = false;
  try {
    const result = await apiRequest("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sourceText, targetLanguage })
    }, false);
    pushUndoState(targetLanguage === "IT" ? "Beitragstext ins Italienische übersetzt" : "Beitragstext ins Englische übersetzt");
    const language = targetLanguage === "IT" ? "it" : "en";
    const translatedText = String(result.translation ?? "").trim();
    const entries = normalizeTranslationEntries(item);
    const existingEntry = entries.find(entry => entry.language === language);
    if (existingEntry) existingEntry.text = translatedText;
    else entries.push({ language, text: translatedText });
    item.translationEntries = entries;
    item.translationLanguage = language;
    item.textItalian = entries.map(entry => entry.text.trim()).filter(Boolean).join("\n\n");
    saveState();
    const textarea = cell.querySelector(".translated-content-text");
    textarea.value = item.textItalian;
    cell.querySelector(".character-count").textContent = `${item.textItalian.length} Zeichen`;
    languageButtons.forEach(control => {
      const controlLanguage = control.dataset.translateLanguage === "IT" ? "it" : "en";
      control.classList.toggle("active", entries.some(entry => entry.language === controlLanguage));
    });
    feedback.textContent = language === "it" ? "Italienisch eingefügt" : "Englisch eingefügt";
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add("error");
  } finally {
    languageButtons.forEach(control => { control.disabled = false; });
  }
}

function setWeekRowHeight(table, height, persist = true) {
  const normalizedHeight = Math.min(650, Math.max(135, Math.round(height)));
  table.weekViewRowHeight = normalizedHeight;
  contentCard.style.setProperty("--week-row-height", `${normalizedHeight}px`);
  if (persist) {
    syncSharedTableLayout(table);
    saveState();
  }
  return normalizedHeight;
}

function mediaContext(zone) {
  const row = zone.closest("tr[data-week]");
  const item = row ? itemDataFromRow(row) : null;
  const index = Number(zone.closest(".media-slot")?.dataset.mediaIndex);
  return { row, item, index };
}

function safeMediaFileName(name = "Medium") {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function handleMediaCopyDragStart(event) {
  const media = event.target.closest(".preview img, .preview video, .media-viewer-content img, .media-viewer-content video");
  if (!media || !event.dataTransfer) return;
  const mediaType = media.dataset.copyType || (media instanceof HTMLVideoElement ? "video/mp4" : "image/jpeg");
  const mediaName = safeMediaFileName(media.dataset.copyName || "Medium");
  const slot = media.closest(".media-slot");
  const row = slot?.closest("tr[data-week]");
  const item = row ? itemDataFromRow(row) : null;
  const index = Number(slot?.dataset.mediaIndex);
  const record = item && Number.isInteger(index) ? itemMedia(item)[index] : null;
  // Auch wenn in einer abgeschlossenen Zeile nur die kleine Vorschau sichtbar ist,
  // wird beim Ziehen/Kopieren immer die unveränderte Originaldatei angeboten.
  const mediaUrl = record?.serverUrl || record?.url || media.dataset.copyOriginalUrl || media.currentSrc || media.src;
  draggedMediaContext = item && Number.isInteger(index) ? { row, item, index, media } : null;
  event.dataTransfer.effectAllowed = draggedMediaContext ? "copyMove" : "copy";
  if (draggedMediaContext) event.dataTransfer.setData("application/x-socialflow-media", String(index));
  event.dataTransfer.setData("DownloadURL", `${mediaType}:${mediaName}:${mediaUrl}`);
  event.dataTransfer.setData("text/uri-list", mediaUrl);
  event.dataTransfer.setData("text/plain", mediaName);
  media.classList.add("media-copy-dragging");
}

function handleMediaCopyDragEnd(event) {
  event.target.closest(".preview img, .preview video, .media-viewer-content img, .media-viewer-content video")?.classList.remove("media-copy-dragging");
  clearMediaDropState();
}

function clearMediaDropState() {
  tableBody.querySelectorAll(".media-drop-before, .media-drop-after").forEach(slot => {
    slot.classList.remove("media-drop-before", "media-drop-after");
  });
  tableBody.querySelectorAll(".media-copy-dragging").forEach(media => media.classList.remove("media-copy-dragging"));
  draggedMediaContext = null;
}

function mediaDropPosition(slot, clientX) {
  const bounds = slot.getBoundingClientRect();
  return clientX >= bounds.left + bounds.width / 2 ? "after" : "before";
}

function reorderMediaWithinRow(targetSlot, clientX) {
  if (!draggedMediaContext || !targetSlot) return false;
  const targetRow = targetSlot.closest("tr[data-week]");
  const targetItem = targetRow ? itemDataFromRow(targetRow) : null;
  if (targetRow !== draggedMediaContext.row || targetItem !== draggedMediaContext.item) return false;

  const records = itemMedia(targetItem);
  const sourceIndex = draggedMediaContext.index;
  const targetIndex = Number(targetSlot.dataset.mediaIndex);
  if (!Number.isInteger(targetIndex) || !records[sourceIndex]) return false;

  let insertIndex = targetIndex + (mediaDropPosition(targetSlot, clientX) === "after" ? 1 : 0);
  if (sourceIndex < insertIndex) insertIndex -= 1;
  if (insertIndex === sourceIndex) {
    clearMediaDropState();
    return true;
  }

  pushUndoState("Medienreihenfolge geändert");
  const [movedRecord] = records.splice(sourceIndex, 1);
  records.splice(insertIndex, 0, movedRecord);
  syncItemPersistentMedia(targetItem);
  clearMediaDropState();
  renderWorkspace();
  saveState();
  return true;
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Die Vorschau konnte nicht erstellt werden.")), "image/jpeg", quality);
  });
}

function fittedPreviewSize(width, height, maxEdge = COMPLETION_PREVIEW_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width || 1, height || 1));
  return {
    width: Math.max(1, Math.round((width || 1) * scale)),
    height: Math.max(1, Math.round((height || 1) * scale))
  };
}

async function previewBlobFromDrawable(drawable, sourceWidth, sourceHeight) {
  let dimensions = fittedPreviewSize(sourceWidth, sourceHeight);
  let quality = 0.86;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, quality);
    if (blob.size <= COMPLETION_PREVIEW_MAX_BYTES) return blob;
    if (quality > 0.46) quality -= 0.1;
    else {
      quality = 0.76;
      dimensions = {
        width: Math.max(1, Math.round(dimensions.width * 0.78)),
        height: Math.max(1, Math.round(dimensions.height * 0.78))
      };
    }
  }
  throw new Error("Die Vorschau konnte nicht unter 2 MB verkleinert werden.");
}

async function loadImageDrawable(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createCompletionPreview(record) {
  const source = record.file || await fetch(record.serverUrl || record.url, { credentials: "same-origin" }).then(response => {
    if (!response.ok) throw new Error("Die Originaldatei konnte nicht für die Vorschau geladen werden.");
    return response.blob();
  });
  if (record.type.startsWith("image/")) {
    const image = await loadImageDrawable(source);
    try {
      return await previewBlobFromDrawable(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
    } finally {
      image.close?.();
    }
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = objectUrl;
    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Aus dem Video konnte keine Vorschau gelesen werden.")), { once: true });
    });
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      video.currentTime = Math.min(0.5, Math.max(0, video.duration / 10));
      await new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }));
    }
    return await previewBlobFromDrawable(video, video.videoWidth, video.videoHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function ensureCompletionPreview(record, tableId) {
  if (!record?.id || record.previewId) return;
  const previewBlob = await createCompletionPreview(record);
  if (previewBlob.size > COMPLETION_PREVIEW_MAX_BYTES) throw new Error("Die erzeugte Vorschau ist größer als 2 MB.");
  const form = new FormData();
  form.append("tableId", tableId);
  form.append("media", previewBlob, `.preview-${record.id}.jpg`);
  const result = await apiRequest("/api/planner-media", { method: "POST", body: form });
  Object.assign(record, {
    previewId: result.media.id,
    previewName: result.media.name,
    previewType: result.media.type,
    previewSize: result.media.size,
    previewUrl: result.media.url,
    previewServerUrl: result.media.url
  });
}

async function archiveOriginalAfterCompletion(record) {
  if (!record?.id || record.originalAvailable === false || record.fileState === "preview_only") return;
  const mediaId = String(record.id);
  await apiRequest(`/api/planner-media/${encodeURIComponent(mediaId)}?originalOnly=1`, { method: "DELETE" });
  retainPreviewAfterOriginalDeletion(mediaId, record);
}

async function setItemCompleted(row, checked) {
  if (!isOwner()) return;
  const item = itemDataFromRow(row);
  const table = currentTable();
  if (!item || !table) return;
  const records = itemMedia(item).filter(Boolean);
  if (checked && records.some(record => record.uploading)) {
    alert("Bitte warte, bis alle Originaldateien vollständig hochgeladen wurden.");
    renderWorkspace();
    return;
  }
  if (!checked) {
    pushUndoState("Zeile wieder geöffnet");
    item.completed = false;
    renderWorkspace();
    saveState();
    return;
  }

  item.completed = true;
  const checkbox = row.querySelector(".completed-input");
  const label = row.querySelector(".completed-status-label");
  if (checkbox) checkbox.disabled = true;
  if (label) label.textContent = records.length ? "Vorschau wird erstellt …" : "Abgeschlossen";
  try {
    for (const record of records) await ensureCompletionPreview(record, table.id);
    const originals = [...new Map(records
      .filter(record => record?.id && record.originalAvailable !== false && record.fileState !== "preview_only")
      .map(record => [String(record.id), record])).values()];
    if (label && originals.length) label.textContent = originals.length === 1 ? "Original wird archiviert …" : "Originale werden archiviert …";
    for (const record of originals) {
      try {
        await archiveOriginalAfterCompletion(record);
      } catch (error) {
        throw new Error(`Das Original „${record.name || "Medium"}“ konnte nicht automatisch entfernt werden: ${error.message}`);
      }
    }
    syncItemPersistentMedia(item);
    saveState();
  } catch (error) {
    item.completed = false;
    syncItemPersistentMedia(item);
    saveState();
    alert(`Abschließen nicht möglich: ${error.message}`);
  }
  renderWorkspace();
}

function renderMediaNoteControls(record, zone) {
  const slot = zone.closest(".media-slot");
  if (!slot) return;
  slot.querySelectorAll(".media-note-button, .media-note-tooltip").forEach(element => element.remove());
  const note = String(record?.note ?? "").trim();
  if (!historyPreview && !rolePreview) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `media-note-button${note ? " has-note" : ""}`;
    button.setAttribute("aria-label", note ? "Bemerkung zu diesem Medium bearbeiten" : "Bemerkung zu diesem Medium hinzufügen");
    button.title = note ? "Bemerkung bearbeiten" : "Bemerkung hinzufügen";
    button.innerHTML = '<span aria-hidden="true">✎</span>';
    slot.append(button);
  }
  if (note) {
    const tooltip = document.createElement("div");
    tooltip.className = "media-note-tooltip";
    tooltip.setAttribute("role", "note");
    const heading = document.createElement("strong");
    heading.textContent = "Bemerkung";
    const text = document.createElement("span");
    text.textContent = note;
    tooltip.append(heading, text);
    slot.append(tooltip);
  }
}

function openMediaNoteDialog(button) {
  const slot = button.closest(".media-slot");
  const row = slot?.closest("tr[data-week]");
  const item = row ? itemDataFromRow(row) : null;
  const index = Number(slot?.dataset.mediaIndex);
  const record = item && Number.isInteger(index) ? itemMedia(item)[index] : null;
  if (!slot || !item || !record) return;
  pendingMediaNote = { slot, item, index, record };
  mediaNoteTitle.textContent = String(record.note ?? "").trim() ? "Bemerkung bearbeiten" : "Bemerkung hinzufügen";
  mediaNoteFileName.textContent = record.name || "Medium";
  mediaNoteText.value = String(record.note ?? "");
  removeMediaNoteButton.hidden = !mediaNoteText.value.trim();
  mediaNoteDialog.showModal();
  mediaNoteText.focus();
}

function savePendingMediaNote(note) {
  if (!pendingMediaNote) return;
  const { slot, item, record } = pendingMediaNote;
  const normalizedNote = String(note ?? "").trim().slice(0, 1000);
  if (String(record.note ?? "") === normalizedNote) return;
  pushUndoState(normalizedNote ? "Medienbemerkung gespeichert" : "Medienbemerkung entfernt");
  record.note = normalizedNote;
  syncItemPersistentMedia(item);
  saveState();
  renderMediaRecord(record, slot.querySelector(".drop-zone"), Boolean(item.completed));
}

function renderMediaRecord(record, zone, useCompletionPreview = false) {
  if (!record) return;
  const originalAvailable = record.fileState !== "preview_only" && record.originalAvailable !== false && Boolean(record.id || record.file || record.url);
  const previewAvailable = Boolean(record.previewId || record.previewUrl || record.fileState === "preview_only");
  const fileState = !originalAvailable && previewAvailable ? "preview_only" : originalAvailable && previewAvailable ? "original_and_preview" : "original_only";
  const usePreviewSource = previewAvailable && (useCompletionPreview || !originalAvailable);
  const sourceUrl = usePreviewSource ? record.previewUrl : record.url;
  if (!sourceUrl) return;
  const sourceType = usePreviewSource ? (record.previewType || "image/jpeg") : (record.type || "image/jpeg");
  const stateClasses = ["media-file-state-original-only", "media-file-state-original-and-preview", "media-file-state-preview-only"];
  zone.classList.remove(...stateClasses);
  zone.classList.add("has-media");
  if (isOwner()) zone.dataset.fileState = fileState;
  else delete zone.dataset.fileState;
  zone.dataset.objectUrl = originalAvailable ? record.url : sourceUrl;
  const isImage = sourceType.startsWith("image/");
  const media = document.createElement(isImage ? "img" : "video");
  media.src = sourceUrl;
  media.draggable = true;
  media.dataset.copyName = record.name;
  media.dataset.copyType = record.type;
  media.dataset.copyOriginalUrl = originalAvailable ? (record.serverUrl || record.url) : sourceUrl;
  media.classList.toggle("completion-preview-media", usePreviewSource);
  const stateLabel = fileState === "preview_only" ? "Nur Vorschaudatei vorhanden" : fileState === "original_and_preview" ? "Originale und Vorschaudatei vorhanden" : "Nur originale Datei vorhanden";
  const usageHint = usePreviewSource && originalAvailable ? "Optimierte Vorschau (maximal 2 MB) · Beim Kopieren wird die Originaldatei verwendet" : "Anklicken zum Öffnen, innerhalb der Zeile sortieren oder in einen Ordner kopieren";
  media.title = isOwner() ? `${stateLabel} · ${usageHint}` : usageHint;
  zone.setAttribute("aria-label", isOwner() ? `${record.name || "Medium"} · ${stateLabel}` : (record.name || "Medium"));
  if (isImage) media.alt = `Vorschau von ${record.name}`;
  else { media.controls = true; media.setAttribute("aria-label", `Vorschau von ${record.name}`); }
  const preview = zone.querySelector(".preview");
  if (isOwner()) {
    const indicator = document.createElement("span");
    indicator.className = "media-file-state-indicator";
    indicator.setAttribute("role", "img");
    indicator.setAttribute("aria-label", stateLabel);
    indicator.title = stateLabel;
    if (originalAvailable) indicator.insertAdjacentHTML("beforeend", '<i class="media-file-state-dot original" aria-hidden="true"></i>');
    if (previewAvailable) indicator.insertAdjacentHTML("beforeend", '<i class="media-file-state-dot preview" aria-hidden="true"></i>');
    preview.replaceChildren(media, indicator);
  } else {
    preview.replaceChildren(media);
  }
  preview.hidden = false;
  zone.querySelector(".drop-placeholder").hidden = true;
  zone.closest(".media-slot")?.querySelector(".remove-media")?.removeAttribute("hidden");
  renderMediaNoteControls(record, zone);
}

function restoreVisibleMedia() {
  tableBody.querySelectorAll("tr[data-week]").forEach(row => {
    const item = itemDataFromRow(row);
    if (!item) return;
    row.querySelectorAll(".media-slot").forEach(slot => {
      const record = itemMedia(item)[Number(slot.dataset.mediaIndex)];
      if (record) renderMediaRecord(record, slot.querySelector(".drop-zone"), Boolean(item.completed));
    });
  });
}

function showMedia(file, zone, recordUndo = true) {
  if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
    alert("Bitte wähle eine Bild- oder Videodatei aus.");
    return false;
  }
  const { item, index } = mediaContext(zone);
  if (!item || !Number.isInteger(index)) return false;
  if (recordUndo) pushUndoState("Medium ersetzt");
  item.completed = false;
  clearMedia(zone);
  const url = URL.createObjectURL(file);
  const record = { file, type: file.type, name: file.name, size: file.size, url, sourceReference: file.webkitRelativePath || file.name, uploading: true };
  itemMedia(item)[index] = record;
  refreshRowCutControl(zone.closest("tr[data-week]"));
  renderMediaRecord(record, zone);
  void uploadPlannerMedia(file, item, index, record);
  return true;
}

async function uploadPlannerMedia(file, item, index, localRecord) {
  const tableId = currentTable()?.id;
  if (!tableId || !authenticatedAccount) return;
  const form = new FormData();
  form.append("tableId", tableId);
  form.append("sourcePath", file.webkitRelativePath || file.name);
  form.append("media", file, file.name);
  try {
    const result = await apiRequest("/api/planner-media", { method: "POST", body: form });
    if (itemMedia(item)[index] !== localRecord) {
      await apiRequest(`/api/planner-media/${encodeURIComponent(result.media.id)}`, { method: "DELETE" });
      return;
    }
    Object.assign(localRecord, result.media, {
      file,
      url: localRecord.url,
      serverUrl: result.media.url,
      uploading: false
    });
    syncItemPersistentMedia(item);
    refreshRowCutControlsForItem(item);
    saveState();
  } catch (error) {
    if (itemMedia(item)[index] === localRecord) {
      if (localRecord.url?.startsWith("blob:")) URL.revokeObjectURL(localRecord.url);
      itemMedia(item)[index] = null;
      syncItemPersistentMedia(item);
      renderWorkspace();
      saveState();
    }
    alert(`Das Medium konnte nicht sicher gespeichert werden: ${error.message}`);
  }
}

function clearMedia(zone, deleteRemote = true) {
  const { item, index } = mediaContext(zone);
  const record = item && Number.isInteger(index) ? itemMedia(item)[index] : null;
  if (record?.url?.startsWith("blob:")) URL.revokeObjectURL(record.url);
  if (deleteRemote && record?.previewId) {
    void apiRequest(`/api/planner-media/${encodeURIComponent(record.previewId)}`, { method: "DELETE" })
      .catch(error => console.error("Die Vorschau konnte nicht vom Server entfernt werden.", error));
  }
  if (deleteRemote && record?.id) {
    void apiRequest(`/api/planner-media/${encodeURIComponent(record.id)}`, { method: "DELETE" })
      .catch(error => console.error("Das Medium konnte nicht vom Server entfernt werden.", error));
  }
  if (item && Number.isInteger(index)) {
    item.completed = false;
    itemMedia(item)[index] = null;
    syncItemPersistentMedia(item);
    refreshRowCutControl(zone.closest("tr[data-week]"));
  }
  delete zone.dataset.objectUrl;
  delete zone.dataset.fileState;
  zone.classList.remove("has-media");
  zone.classList.remove("media-file-state-original-only", "media-file-state-original-and-preview", "media-file-state-preview-only");
  zone.setAttribute("aria-label", "Bild oder Video auswählen");
  zone.querySelector(".preview").replaceChildren();
  zone.querySelector(".preview").hidden = true;
  zone.querySelector(".drop-placeholder").hidden = false;
  zone.querySelector("input").value = "";
  const slot = zone.closest(".media-slot");
  slot?.querySelectorAll(".media-note-button, .media-note-tooltip").forEach(element => element.remove());
  const slotCount = slot?.closest("tr[data-week]")?.querySelectorAll(".media-slot").length ?? 1;
  if (slot) slot.querySelector(".remove-media").hidden = slotCount <= 1;
}

function refreshMediaSlots(row, item) {
  const slotsContainer = row.querySelector(".media-slots");
  if (slotsContainer && !slotsContainer.querySelector(".media-slot")) {
    slotsContainer.insertAdjacentHTML("afterbegin", mediaSlotHtml(0));
  }
  const slots = [...row.querySelectorAll(".media-slot")];
  slots.forEach((slot, index) => {
    slot.dataset.mediaIndex = index;
    const hasUploadedMedia = Boolean(slot.querySelector(".preview img, .preview video"));
    slot.querySelector(".remove-media").hidden = slots.length <= 1 && !hasUploadedMedia;
  });
  item.mediaCount = slots.length;
  syncItemPersistentMedia(item);
}

function addAdditionalMedia(control, file) {
  if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
    alert("Bitte wähle eine Bild- oder Videodatei aus.");
    return;
  }
  const row = control.closest("tr[data-week]");
  if (!row) return;
  const item = itemDataFromRow(row);
  if (!item) return;
  pushUndoState("Weiteres Medium hinzugefügt");
  const slotsContainer = row.querySelector(".media-slots");
  const mediaIndex = slotsContainer.querySelectorAll(".media-slot").length;
  slotsContainer.insertAdjacentHTML("beforeend", mediaSlotHtml(mediaIndex, true));
  const newSlot = slotsContainer.lastElementChild;
  showMedia(file, newSlot.querySelector(".drop-zone"), false);
  refreshMediaSlots(row, item);
  control.querySelector('input[type="file"]').value = "";
  saveState();
}

function renderMediaViewerItem() {
  const media = viewerMediaItems[viewerMediaIndex];
  if (!media) return;
  const enlargedMedia = media.cloneNode(true);
  if (enlargedMedia instanceof HTMLVideoElement) {
    enlargedMedia.controls = true;
    enlargedMedia.currentTime = media.currentTime;
  }
  mediaViewerContent.replaceChildren(enlargedMedia);
  const hasMultipleMedia = viewerMediaItems.length > 1;
  mediaViewerCounter.textContent = `${viewerMediaIndex + 1} / ${viewerMediaItems.length}`;
  mediaViewerPrevious.hidden = !hasMultipleMedia;
  mediaViewerNext.hidden = !hasMultipleMedia;
  mediaViewerPrevious.disabled = viewerMediaIndex === 0;
  mediaViewerNext.disabled = viewerMediaIndex === viewerMediaItems.length - 1;
}

function openMediaViewer(media) {
  const row = media.closest("tr[data-week]");
  viewerMediaItems = row ? [...row.querySelectorAll(".preview img, .preview video")] : [media];
  viewerMediaIndex = Math.max(0, viewerMediaItems.indexOf(media));
  renderMediaViewerItem();
  mediaViewer.showModal();
}

function showAdjacentMedia(direction) {
  const nextIndex = viewerMediaIndex + direction;
  if (nextIndex < 0 || nextIndex >= viewerMediaItems.length) return;
  viewerMediaIndex = nextIndex;
  renderMediaViewerItem();
}

function captureColumnWidths() {
  const table = currentTable();
  if (!table) return;
  table.columnWidths = {};
  contentTable.querySelectorAll("thead th[data-column]").forEach(header => {
    table.columnWidths[header.dataset.column] = Math.round(header.getBoundingClientRect().width);
  });
}

function minimumColumnWidth(columnName) {
  const minimumWidths = { week: 58, approval: 70, media: 320, text: 130, textItalian: 130, changes: 130, status: 105 };
  return minimumWidths[columnName] ?? 100;
}

function applyColumnWidths() {
  contentTable.style.removeProperty("table-layout");
  contentTable.style.removeProperty("width");
  contentTable.style.removeProperty("min-width");
  const table = currentTable();
  if (!table) return;
  if (!table.columnWidths && state.columnWidths) table.columnWidths = { ...state.columnWidths };
  if (!table.columnWidths) return;
  const columns = [...contentTable.querySelectorAll("col[data-column]")];
  const columnSettings = columns.map(column => {
    const columnName = column.dataset.column;
    const defaultWidths = { week: 58, approval: 92, media: 380, text: 300, textItalian: 300, changes: 300, status: 155 };
    const storedWidth = Number(table.columnWidths[columnName]);
    const width = Number.isFinite(storedWidth) && storedWidth > 0
      ? storedWidth
      : (columnName.startsWith("custom-") ? 180 : defaultWidths[columnName]);
    const minimum = minimumColumnWidth(columnName);
    return { column, columnName, width: Math.max(minimum, width), minimum };
  });
  const viewportWidth = Math.max(1, contentTable.closest(".table-scroll")?.clientWidth ?? contentTable.clientWidth);
  const minimumTotal = columnSettings.reduce((sum, setting) => sum + setting.minimum, 0);
  const desiredTotal = columnSettings.reduce((sum, setting) => sum + setting.width, 0);
  const renderedTableWidth = Math.max(viewportWidth, minimumTotal);
  let fittedWidths;
  if (desiredTotal > renderedTableWidth) {
    const desiredExtra = desiredTotal - minimumTotal;
    const availableExtra = renderedTableWidth - minimumTotal;
    fittedWidths = columnSettings.map(setting => setting.minimum + ((setting.width - setting.minimum) * availableExtra / desiredExtra));
  } else {
    const extra = renderedTableWidth - desiredTotal;
    fittedWidths = columnSettings.map(setting => setting.width + (extra * setting.width / desiredTotal));
  }
  columnSettings.forEach((setting, index) => {
    setting.column.style.width = `${fittedWidths[index]}px`;
  });
  contentTable.style.tableLayout = "fixed";
  contentTable.style.width = `${renderedTableWidth}px`;
  contentTable.style.minWidth = `${renderedTableWidth}px`;
}

function clearColumnDragState() {
  draggedColumnKey = null;
  document.body.classList.remove("is-dragging-columns");
  contentTableHead.querySelectorAll(".column-dragging, .column-drop-before, .column-drop-after").forEach(header => {
    header.classList.remove("column-dragging", "column-drop-before", "column-drop-after");
  });
}

contentTableHead.addEventListener("mousedown", event => {
  const header = event.target.closest("th[data-column]");
  if (!header || event.button !== 0 || !isOwner() || event.target.closest(".column-resizer, button")) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  draggedColumnKey = header.dataset.column;
  let dragActive = false;
  let targetHeader = null;
  let placeAfter = false;

  const move = moveEvent => {
    if (!dragActive && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
    if (!dragActive) {
      dragActive = true;
      header.classList.add("column-dragging");
      document.body.classList.add("is-dragging-columns");
    }
    const headers = [...contentTableHead.querySelectorAll("th[data-column]")];
    targetHeader = headers.find(item => {
      const rectangle = item.getBoundingClientRect();
      return moveEvent.clientX >= rectangle.left && moveEvent.clientX <= rectangle.right;
    }) ?? null;
    headers.forEach(item => item.classList.remove("column-drop-before", "column-drop-after"));
    if (!targetHeader || targetHeader.dataset.column === draggedColumnKey) return;
    const targetRectangle = targetHeader.getBoundingClientRect();
    placeAfter = moveEvent.clientX > targetRectangle.left + (targetRectangle.width / 2);
    targetHeader.classList.add(placeAfter ? "column-drop-after" : "column-drop-before");
  };

  const stop = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", stop);
    const sourceKey = draggedColumnKey;
    const targetKey = targetHeader?.dataset.column;
    const table = currentTable();
    clearColumnDragState();
    if (!dragActive || !table || !sourceKey || !targetKey || sourceKey === targetKey || !isOwner()) return;
    const nextOrder = tableColumnOrder(table).filter(key => key !== sourceKey);
    const targetIndex = nextOrder.indexOf(targetKey);
    nextOrder.splice(targetIndex + (placeAfter ? 1 : 0), 0, sourceKey);
    pushUndoState("Spaltenreihenfolge geändert");
    table.columnOrder = nextOrder;
    syncSharedTableLayout(table);
    renderWorkspace();
    saveState();
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", stop);
});

contentTable.addEventListener("mousedown", event => {
  const handle = event.target.closest(".column-resizer");
  if (!handle || event.button !== 0 || !isOwner()) return;
  event.preventDefault();
  pushUndoState("Spaltenbreite geändert");

  const table = currentTable();
  if (!table) return;
  captureColumnWidths();
  const header = handle.closest("th");
  const columnName = header.dataset.column;
  const headers = [...contentTable.querySelectorAll("thead th[data-column]")];
  const headerIndex = headers.indexOf(header);
  const adjacentHeader = headers[headerIndex + 1] ?? headers[headerIndex - 1];
  if (!adjacentHeader) return;
  const adjacentColumnName = adjacentHeader.dataset.column;
  const startX = event.clientX;
  const storedWidth = Number(table.columnWidths[columnName]);
  const startWidth = Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : Math.round(header.getBoundingClientRect().width);
  const storedAdjacentWidth = Number(table.columnWidths[adjacentColumnName]);
  const startAdjacentWidth = Number.isFinite(storedAdjacentWidth) && storedAdjacentWidth > 0
    ? storedAdjacentWidth
    : Math.round(adjacentHeader.getBoundingClientRect().width);
  table.columnWidths[columnName] = startWidth;
  table.columnWidths[adjacentColumnName] = startAdjacentWidth;
  document.body.classList.add("is-resizing-columns");

  const move = moveEvent => {
    const requestedDelta = moveEvent.clientX - startX;
    const minimumDelta = minimumColumnWidth(columnName) - startWidth;
    const maximumDelta = startAdjacentWidth - minimumColumnWidth(adjacentColumnName);
    const delta = Math.min(maximumDelta, Math.max(minimumDelta, requestedDelta));
    table.columnWidths[columnName] = startWidth + delta;
    table.columnWidths[adjacentColumnName] = startAdjacentWidth - delta;
    applyColumnWidths();
  };
  const stop = () => {
    document.body.classList.remove("is-resizing-columns");
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", stop);
    syncSharedTableLayout(table);
    saveState();
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", stop);
});

navigation.addEventListener("click", event => {
  const button = event.target.closest("[data-table-id]");
  if (!button) return;
  state.currentTableId = button.dataset.tableId;
  const table = currentTable();
  if (table) {
    const startWeek = tableDisplayStartWeek(table);
    state.viewMode = table.viewMode === "week" ? "week" : "year";
    state.selectedYear = Number(table.selectedYear) || PLANNING_START_YEAR;
    state.selectedWeek = Number(table.selectedWeek) || startWeek;
  }
  renderApp();
});

viewModeButtons.forEach(button => button.addEventListener("click", () => {
  state.viewMode = button.dataset.viewMode;
  if (currentTable()) currentTable().viewMode = state.viewMode;
  renderWorkspace();
  saveState();
}));

weekPicker.addEventListener("change", () => {
  const selected = parsePeriodKey(weekPicker.value);
  state.selectedYear = selected.year;
  state.selectedWeek = selected.weekNumber;
  if (currentTable()) {
    currentTable().selectedYear = state.selectedYear;
    currentTable().selectedWeek = state.selectedWeek;
  }
  renderWorkspace();
  saveState();
});

previousWeekButton.addEventListener("click", () => {
  const table = currentTable();
  const periods = planningPeriods(tableDisplayStartWeek(table), tableVisibleYears(table));
  const currentIndex = periods.findIndex(period => period.year === state.selectedYear && period.weekNumber === state.selectedWeek);
  if (currentIndex <= 0) return;
  const previousPeriod = periods[currentIndex - 1];
  state.selectedYear = previousPeriod.year;
  state.selectedWeek = previousPeriod.weekNumber;
  if (table) {
    table.selectedYear = state.selectedYear;
    table.selectedWeek = state.selectedWeek;
  }
  renderWorkspace();
  saveState();
});

nextWeekButton.addEventListener("click", () => {
  const table = currentTable();
  const periods = planningPeriods(tableDisplayStartWeek(table), tableVisibleYears(table));
  const currentIndex = periods.findIndex(period => period.year === state.selectedYear && period.weekNumber === state.selectedWeek);
  if (currentIndex < 0 || currentIndex >= periods.length - 1) return;
  const nextPeriod = periods[currentIndex + 1];
  state.selectedYear = nextPeriod.year;
  state.selectedWeek = nextPeriod.weekNumber;
  if (table) {
    table.selectedYear = state.selectedYear;
    table.selectedWeek = state.selectedWeek;
  }
  renderWorkspace();
  saveState();
});

hiddenWeeksButton.addEventListener("click", () => {
  if (!isOwner()) return;
  populateHiddenWeekRangeOptions();
  renderHiddenWeeksDialog();
  hiddenWeeksDialog.showModal();
});

hideWeeksRangeForm.addEventListener("submit", event => {
  event.preventDefault();
  hideWeekRange(hideWeeksFrom.value, hideWeeksTo.value);
});

hiddenWeeksList.addEventListener("click", event => {
  const button = event.target.closest("[data-restore-period]");
  if (button) {
    const period = parsePeriodKey(button.dataset.restorePeriod);
    restoreWeek(period.year, period.weekNumber);
  }
});

restoreAllWeeksButton.addEventListener("click", () => {
  const table = currentTable();
  if (!table || !isOwner()) return;
  pushUndoState("Alle Kalenderwochen eingeblendet");
  table.hiddenWeeks = [];
  renderWorkspace();
  renderHiddenWeeksDialog();
  saveState();
});

manageColumnsButton.addEventListener("click", () => {
  if (!currentTable() || !isOwner()) return;
  resetCustomColumnForm();
  renderCustomColumnsDialog();
  columnsDialog.showModal();
});

fixedHashtagsButton.addEventListener("click", () => {
  const table = currentTable();
  if (!table || !isOwner()) return;
  fixedHashtagsText.value = tableFixedHashtags(table);
  fixedHashtagsDialog.showModal();
});

fixedHashtagsForm.addEventListener("submit", event => {
  event.preventDefault();
  const table = currentTable();
  if (!table || !isOwner()) return;
  const nextValue = fixedHashtagsText.value.trim();
  if (nextValue !== tableFixedHashtags(table)) {
    pushUndoState("Feste Hashtags geändert");
    table.fixedHashtags = nextValue;
    saveState();
  }
  fixedHashtagsDialog.close();
  renderWorkspace();
});

contentTableHead.addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete-column]");
  if (deleteButton && isOwner()) {
    const table = currentTable();
    const columnKey = deleteButton.dataset.deleteColumn;
    const column = tableColumnDefinitions(table).find(item => item.key === columnKey);
    if (!column) return;
    pendingDeleteColumnKey = columnKey;
    document.querySelector("#delete-standard-column-message").textContent = `Möchtest du die Spalte „${column.title}“ wirklich aus allen Kundentabellen entfernen?`;
    document.querySelector("#delete-standard-column-final-message").textContent = `Die Spalte „${column.title}“ wird aus allen bestehenden Kundentabellen und aus der Vorlage für neue Tabellen entfernt.`;
    deleteTranslatedColumnDialog.returnValue = "";
    deleteTranslatedColumnDialog.showModal();
    return;
  }
});

continueDeleteTranslatedColumnButton.addEventListener("click", () => {
  if (!pendingDeleteColumnKey || !currentTable() || !isOwner()) return;
  deleteTranslatedColumnDialog.close("continue");
  deleteTranslatedColumnFinalDialog.returnValue = "";
  deleteTranslatedColumnFinalDialog.showModal();
});

confirmDeleteTranslatedColumnButton.addEventListener("click", () => {
  const table = currentTable();
  if (!table || !pendingDeleteColumnKey || !isOwner()) return;
  const columnKey = pendingDeleteColumnKey;
  const customColumnId = columnKey.startsWith("custom-") ? columnKey.slice("custom-".length) : null;
  const customColumn = customColumnId ? tableCustomColumns(table).find(column => column.id === customColumnId) : null;
  const standardColumn = STANDARD_TABLE_COLUMNS.find(column => column.key === columnKey);
  const columnTitle = customColumn?.title ?? standardColumn?.title ?? "Spalte";
  pushUndoState(`Spalte ${columnTitle} entfernt`);
  if (customColumn) {
    table.customColumns = tableCustomColumns(table).filter(column => column.id !== customColumnId);
    table.removedCustomColumns = [...tableRemovedCustomColumns(table).filter(column => column.id !== customColumnId), structuredClone(customColumn)];
  } else if (standardColumn) {
    table.removedStandardColumns = [...new Set([...tableRemovedStandardColumns(table), columnKey])];
  } else return;
  table.columnOrder = tableColumnOrder(table).filter(key => key !== columnKey);
  syncSharedTableLayout(table);
  pendingDeleteColumnKey = null;
  deleteTranslatedColumnFinalDialog.close("removed");
  renderWorkspace();
  saveState();
});

deleteTranslatedColumnDialog.addEventListener("close", () => {
  if (deleteTranslatedColumnDialog.returnValue !== "continue") pendingDeleteColumnKey = null;
});
deleteTranslatedColumnFinalDialog.addEventListener("close", () => {
  if (deleteTranslatedColumnFinalDialog.returnValue !== "removed") pendingDeleteColumnKey = null;
});

customColumnType.addEventListener("change", updateCustomColumnTypeFields);

customColumnsList.addEventListener("click", event => {
  const restoreButton = event.target.closest("[data-restore-standard-column]");
  if (restoreButton && isOwner()) {
    const table = currentTable();
    if (!table) return;
    const columnKey = restoreButton.dataset.restoreStandardColumn;
    const column = STANDARD_TABLE_COLUMNS.find(item => item.key === columnKey);
    if (!column) return;
    pushUndoState(`Spalte ${column.title} wiederhergestellt`);
    table.removedStandardColumns = tableRemovedStandardColumns(table).filter(key => key !== columnKey);
    syncSharedTableLayout(table);
    renderCustomColumnsDialog();
    renderWorkspace();
    saveState();
    return;
  }
  const restoreCustomButton = event.target.closest("[data-restore-custom-column]");
  if (restoreCustomButton && isOwner()) {
    const table = currentTable();
    if (!table) return;
    const columnId = restoreCustomButton.dataset.restoreCustomColumn;
    const column = tableRemovedCustomColumns(table).find(item => item.id === columnId);
    if (!column) return;
    pushUndoState(`Spalte ${column.title} wiederhergestellt`);
    table.removedCustomColumns = tableRemovedCustomColumns(table).filter(item => item.id !== columnId);
    table.customColumns = [...tableCustomColumns(table), structuredClone(column)];
    syncSharedTableLayout(table);
    renderCustomColumnsDialog();
    renderWorkspace();
    saveState();
    return;
  }
  const button = event.target.closest("[data-edit-custom-column]");
  if (!button) return;
  const column = tableCustomColumns(currentTable()).find(item => item.id === button.dataset.editCustomColumn);
  if (column) resetCustomColumnForm(column);
});

document.querySelector("#reset-custom-column-form").addEventListener("click", () => resetCustomColumnForm());

customColumnForm.addEventListener("submit", event => {
  event.preventDefault();
  const table = currentTable();
  if (!table || !isOwner()) return;
  const editingId = document.querySelector("#editing-custom-column-id").value;
  const title = document.querySelector("#custom-column-title").value.trim();
  const type = customColumnType.value === "checkbox" ? "checkbox" : "text";
  const checkboxLabel = type === "checkbox" ? document.querySelector("#custom-checkbox-label").value.trim() : "";
  if (!title || (type === "checkbox" && !checkboxLabel)) return;
  pushUndoState(editingId ? "Zusatzspalte bearbeitet" : "Zusatzspalte hinzugefügt");
  if (editingId) {
    const column = tableCustomColumns(table).find(item => item.id === editingId);
    if (column) Object.assign(column, { title, type, checkboxLabel });
  } else {
    tableCustomColumns(table).push({ id: `column-${Date.now()}`, title, type, checkboxLabel });
  }
  syncSharedTableLayout(table);
  resetCustomColumnForm();
  renderCustomColumnsDialog();
  renderWorkspace();
  saveState();
});

[storiesInput, postsInput].forEach(input => input.addEventListener("input", () => {
  if (!isOwner() || !currentTable()) return;
  if (!input.dataset.undoCaptured) {
    pushUndoState("Wochenumfang geändert");
    input.dataset.undoCaptured = "true";
  }
  currentTable()[input === storiesInput ? "storiesPerWeek" : "postsPerWeek"] = Number(input.value);
  renderWorkspace();
  saveState();
}));
[storiesInput, postsInput].forEach(input => input.addEventListener("focusout", () => delete input.dataset.undoCaptured));

let highlightedResizeRow = null;

function rowAtResizeLine(event) {
  let row = event.target.closest("tr[data-week]");
  if (!row) return null;
  if (state.viewMode === "year") {
    const weekCell = event.target.closest(".week-cell");
    if (weekCell) {
      const cellDistanceFromBottom = weekCell.getBoundingClientRect().bottom - event.clientY;
      if (cellDistanceFromBottom < -1 || cellDistanceFromBottom > 9) return null;
      row = yearWeekRows(Number(row.dataset.year), Number(row.dataset.week)).at(-1) ?? row;
    } else if (!row.classList.contains("week-end")) return null;
  }
  const resizeRect = state.viewMode === "year" && event.target.closest(".week-cell")
    ? event.target.closest(".week-cell").getBoundingClientRect()
    : row.getBoundingClientRect();
  const distanceFromBottom = resizeRect.bottom - event.clientY;
  return distanceFromBottom >= -1 && distanceFromBottom <= 9 ? row : null;
}

function toggleResizeHighlight(row, enabled) {
  row?.classList.toggle("row-resize-target", enabled);
  if (!row || state.viewMode !== "year") return;
  yearWeekRows(Number(row.dataset.year), Number(row.dataset.week))[0]
    ?.querySelector(".week-cell")
    ?.classList.toggle("row-resize-target", enabled);
}

tableBody.addEventListener("mousemove", event => {
  if (document.body.classList.contains("is-resizing-rows")) return;
  const nextRow = rowAtResizeLine(event);
  if (highlightedResizeRow === nextRow) return;
  toggleResizeHighlight(highlightedResizeRow, false);
  highlightedResizeRow = nextRow;
  toggleResizeHighlight(highlightedResizeRow, true);
});

tableBody.addEventListener("mouseleave", () => {
  if (document.body.classList.contains("is-resizing-rows")) return;
  toggleResizeHighlight(highlightedResizeRow, false);
  highlightedResizeRow = null;
});

tableBody.addEventListener("mousedown", event => {
  const row = rowAtResizeLine(event);
  if (!row || event.button !== 0) return;
  const table = currentTable();
  if (!table) return;
  event.preventDefault();
  pushUndoState("Zeilenhöhe geändert");

  const resizeMode = state.viewMode;
  const year = Number(row.dataset.year);
  const weekNumber = Number(row.dataset.week);
  const rows = resizeMode === "year" ? yearWeekRows(year, weekNumber) : [row];
  const startY = event.clientY;
  const startHeight = rows.reduce((height, currentRow) => height + currentRow.getBoundingClientRect().height, 0);
  let currentHeight = startHeight;
  document.body.classList.add("is-resizing-rows");

  const move = moveEvent => {
    currentHeight = resizeMode === "year"
      ? setYearViewRowHeight(table, startHeight + moveEvent.clientY - startY, rows.length, false)
      : setWeekRowHeight(table, startHeight + moveEvent.clientY - startY, false);
  };
  const stop = () => {
    document.body.classList.remove("is-resizing-rows");
    toggleResizeHighlight(row, false);
    highlightedResizeRow = null;
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", stop);
    if (resizeMode === "year") setYearViewRowHeight(table, currentHeight, rows.length);
    else setWeekRowHeight(table, currentHeight);
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", stop);
});

tableBody.addEventListener("dblclick", event => {
  const row = rowAtResizeLine(event);
  if (!row) return;
  const table = currentTable();
  if (!table) return;
  pushUndoState("Zeilenhöhe zurückgesetzt");
  if (state.viewMode === "year") {
    table.yearViewRowHeight = null;
    table.yearWeekHeights = {};
    renderWorkspace();
    saveState();
    return;
  }
  table.weekViewRowHeight = null;
  Object.values(table.weeks ?? {}).forEach(week => {
    if (!Array.isArray(week?.items)) return;
    week.items.forEach(item => { item.weekViewHeight = null; });
  });
  syncSharedTableLayout(table);
  contentCard.style.removeProperty("--week-row-height");
  saveState();
});

tableBody.addEventListener("input", event => {
  const row = event.target.closest("tr[data-week]");
  if (!row) return;
  if (event.target.matches(".change-message-input")) return;
  if (!event.target.dataset.undoCaptured) {
    const description = event.target.matches(".content-text")
      ? "Deutschen Beitragstext bearbeitet"
      : event.target.matches(".translated-content-text")
        ? "Übersetzten Beitragstext bearbeitet"
      : event.target.matches(".change-request")
        ? "Änderungswunsch bearbeitet"
        : "Text in Zusatzspalte bearbeitet";
    pushUndoState(description);
    event.target.dataset.undoCaptured = "true";
  }
  if (event.target.matches(".content-text")) updateItemFromRow(row, { text: event.target.value });
  else if (event.target.matches(".translated-content-text")) {
    const item = itemDataFromRow(row);
    if (!item) return;
    setManualTranslationText(item, event.target.value);
    event.target.closest("td")?.querySelectorAll("[data-translate-language]").forEach(button => button.classList.remove("active"));
    saveState();
  }
  else if (event.target.matches(".custom-text")) {
    const item = itemDataFromRow(row);
    itemCustomValues(item)[event.target.dataset.customColumn] = event.target.value;
    saveState();
  }
  else if (event.target.matches(".change-request")) updateItemFromRow(row, { changes: event.target.value });
  else return;
  const characterCount = event.target.closest("td")?.querySelector(".character-count");
  if (characterCount) characterCount.textContent = `${event.target.value.length} Zeichen`;
  if (event.target.matches(".content-text, .translated-content-text")) scheduleProofreading(event.target);
  refreshRowCutControl(row);
});

tableBody.addEventListener("focusout", event => {
  if (event.target.matches(".content-text, .translated-content-text, .custom-text, .change-request")) delete event.target.dataset.undoCaptured;
  if (event.target.matches(".content-text, .translated-content-text")) scheduleProofreading(event.target, true);
});

tableBody.addEventListener("scroll", event => {
  if (event.target.matches?.(".content-text, .translated-content-text")) syncProofreadingScroll(event.target);
}, true);

tableBody.addEventListener("change", event => {
  const row = event.target.closest("tr[data-week]");
  if (!row) return;
  if (event.target.matches(".approved-input")) {
    pushUndoState("Kundenfreigabe geändert");
    updateItemFromRow(row, { approved: event.target.checked });
    event.target.closest("td").querySelector(".status-label").textContent = event.target.checked ? "Bestätigt" : "Offen";
  }
  if (event.target.matches(".published-input")) {
    pushUndoState("Veröffentlichungsstatus geändert");
    updateItemFromRow(row, { published: event.target.checked });
    event.target.closest("td").querySelector(".status-label").textContent = event.target.checked ? "Veröffentlicht" : "Geplant";
  }
  if (event.target.matches(".completed-input")) {
    void setItemCompleted(row, event.target.checked);
  }
  if (event.target.matches(".custom-check")) {
    pushUndoState("Häkchen in Zusatzspalte geändert");
    const item = itemDataFromRow(row);
    itemCustomValues(item)[event.target.dataset.customColumn] = event.target.checked;
    saveState();
  }
  if (event.target.matches('.drop-zone input[type="file"]')) showMedia(event.target.files[0], event.target.closest(".drop-zone"));
  if (event.target.matches('.add-media-button input[type="file"]')) addAdditionalMedia(event.target.closest(".add-media-button"), event.target.files[0]);
  refreshRowCutControl(row);
});

document.addEventListener("click", event => {
  if (!pendingRowCut || event.target.closest("[data-paste-cut-row]")) return;
  if (event.target.closest("[data-cut-row]")) {
    cancelPendingRowCut();
    event.stopPropagation();
    return;
  }
  cancelPendingRowCut();
}, true);

document.addEventListener("keydown", event => {
  if (pendingRowCut && event.key === "Escape") cancelPendingRowCut();
});

tableBody.addEventListener("click", event => {
  const cutRowButton = event.target.closest("[data-cut-row]");
  if (cutRowButton) {
    event.preventDefault();
    event.stopPropagation();
    cutContentRow(cutRowButton.closest("tr[data-week]"));
    return;
  }
  const pasteRowButton = event.target.closest("[data-paste-cut-row]");
  if (pasteRowButton) {
    event.preventDefault();
    event.stopPropagation();
    pasteContentRow(pasteRowButton.closest("tr[data-week]"));
    return;
  }
  const toggleChangeChatButton = event.target.closest("[data-toggle-change-chat]");
  if (toggleChangeChatButton) {
    event.preventDefault();
    event.stopPropagation();
    const row = toggleChangeChatButton.closest("tr[data-week]");
    const item = row ? itemDataFromRow(row) : null;
    const chat = toggleChangeChatButton.closest(".change-chat");
    if (!item || !chat) return;
    item.changeChatExpanded = !chat.classList.contains("is-expanded");
    chat.classList.toggle("is-expanded", item.changeChatExpanded);
    toggleChangeChatButton.setAttribute("aria-expanded", String(item.changeChatExpanded));
    toggleChangeChatButton.setAttribute("aria-label", item.changeChatExpanded ? "Chat einklappen" : "Vollständigen Chat aufklappen");
    toggleChangeChatButton.title = item.changeChatExpanded ? "Chat einklappen" : "Vollständigen Chat aufklappen";
    toggleChangeChatButton.querySelector("span").textContent = "⌄";
    const messageList = chat.querySelector(".change-message-list");
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
    saveState();
    return;
  }
  const clearChangeChatButton = event.target.closest("[data-clear-change-chat]");
  if (clearChangeChatButton) {
    event.preventDefault();
    event.stopPropagation();
    clearChangeChat(clearChangeChatButton.closest("tr[data-week]"));
    return;
  }
  const prepareAiDraftButton = event.target.closest("[data-prepare-ai-draft]");
  if (prepareAiDraftButton) {
    event.preventDefault();
    event.stopPropagation();
    void prepareAiDraftForRow(prepareAiDraftButton.closest("tr[data-week]"), prepareAiDraftButton);
    return;
  }
  const editChangeMessageButton = event.target.closest("[data-edit-change-message]");
  if (editChangeMessageButton) {
    event.preventDefault();
    event.stopPropagation();
    const article = editChangeMessageButton.closest(".change-message");
    startChangeMessageEdit(editChangeMessageButton.closest("tr[data-week]"), article);
    return;
  }
  const deleteChangeMessageButton = event.target.closest("[data-delete-change-message]");
  if (deleteChangeMessageButton) {
    event.preventDefault();
    event.stopPropagation();
    const article = deleteChangeMessageButton.closest(".change-message");
    deleteChangeMessage(deleteChangeMessageButton.closest("tr[data-week]"), article);
    return;
  }
  const saveChangeMessageButton = event.target.closest("[data-save-change-message]");
  if (saveChangeMessageButton) {
    event.preventDefault();
    event.stopPropagation();
    const article = saveChangeMessageButton.closest(".change-message");
    saveChangeMessageEdit(saveChangeMessageButton.closest("tr[data-week]"), article);
    return;
  }
  const cancelChangeMessageButton = event.target.closest("[data-cancel-change-message]");
  if (cancelChangeMessageButton) {
    event.preventDefault();
    event.stopPropagation();
    closeChangeMessageEditor(cancelChangeMessageButton.closest(".change-message"));
    return;
  }
  const sendChangeMessageButton = event.target.closest("[data-send-change-message]");
  if (sendChangeMessageButton) {
    event.preventDefault();
    event.stopPropagation();
    sendChangeMessage(sendChangeMessageButton.closest("tr[data-week]"));
    return;
  }
  const translateButton = event.target.closest("[data-translate-language]");
  if (translateButton) {
    event.preventDefault();
    event.stopPropagation();
    void translateContributionText(translateButton.closest("tr[data-week]"), translateButton);
    return;
  }
  const copyContributionButton = event.target.closest(".copy-contribution-button");
  if (copyContributionButton) {
    event.preventDefault();
    event.stopPropagation();
    void copyContributionText(copyContributionButton.closest("tr[data-week]"), copyContributionButton);
    return;
  }
  const instagramPlanButton = event.target.closest("[data-plan-instagram]");
  if (instagramPlanButton) {
    event.stopPropagation();
    openPublicationDialog(instagramPlanButton.closest("tr[data-week]"));
    return;
  }
  const hideButton = event.target.closest("[data-hide-week]");
  if (hideButton) {
    hideWeek(Number(hideButton.dataset.hideYear), Number(hideButton.dataset.hideWeek));
    return;
  }
  const restoreButton = event.target.closest("[data-restore-period]");
  if (restoreButton) {
    const period = parsePeriodKey(restoreButton.dataset.restorePeriod);
    restoreWeek(period.year, period.weekNumber);
    return;
  }
  const showHiddenButton = event.target.closest("[data-show-hidden-weeks]");
  if (showHiddenButton) {
    renderHiddenWeeksDialog();
    hiddenWeeksDialog.showModal();
    return;
  }
  const mediaNoteButton = event.target.closest(".media-note-button");
  if (mediaNoteButton) {
    event.preventDefault();
    event.stopPropagation();
    openMediaNoteDialog(mediaNoteButton);
    return;
  }
  const uploadedMedia = event.target.closest(".preview img, .preview video");
  if (uploadedMedia) {
    event.stopPropagation();
    openMediaViewer(uploadedMedia);
    return;
  }
  const zone = event.target.closest(".drop-zone");
  if (zone && !event.target.matches('input[type="file"]')) zone.querySelector("input").click();
  const removeButton = event.target.closest(".remove-media");
  if (removeButton) {
    event.stopPropagation();
    const row = removeButton.closest("tr[data-week]");
    const item = itemDataFromRow(row);
    const slot = removeButton.closest(".media-slot");
    const zone = slot.querySelector(".drop-zone");
    pushUndoState("Medium entfernt");
    const mediaIndex = Number(slot.dataset.mediaIndex);
    const slotCount = row.querySelectorAll(".media-slot").length;
    clearMedia(zone);
    if (slotCount > 1) {
      itemMedia(item).splice(mediaIndex, 1);
      slot.remove();
    }
    refreshMediaSlots(row, item);
    saveState();
  }
  const addButton = event.target.closest(".add-media-button");
  if (addButton && !event.target.matches('input[type="file"]')) addButton.querySelector('input[type="file"]').click();
});

tableBody.addEventListener("keydown", event => {
  if (event.target.matches(".change-message-input") && event.key === "Enter" && !event.altKey && !event.isComposing) {
    event.preventDefault();
    sendChangeMessage(event.target.closest("tr[data-week]"));
    return;
  }
  if (event.target.matches(".change-message-edit-input") && event.key === "Enter" && !event.altKey && !event.isComposing) {
    event.preventDefault();
    const article = event.target.closest(".change-message");
    saveChangeMessageEdit(event.target.closest("tr[data-week]"), article);
    return;
  }
  if (event.target.matches(".drop-zone") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault(); event.target.querySelector("input").click();
  }
  if (event.target.matches(".add-media-button") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault(); event.target.querySelector("input").click();
  }
});

tableBody.addEventListener("dragstart", handleMediaCopyDragStart);
tableBody.addEventListener("dragend", handleMediaCopyDragEnd);
mediaViewerContent.addEventListener("dragstart", handleMediaCopyDragStart);
mediaViewerContent.addEventListener("dragend", handleMediaCopyDragEnd);

tableBody.addEventListener("dragover", event => {
  if (draggedMediaContext) {
    const targetSlot = event.target.closest(".media-slot");
    if (targetSlot?.closest("tr[data-week]") === draggedMediaContext.row) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      tableBody.querySelectorAll(".media-drop-before, .media-drop-after").forEach(slot => {
        slot.classList.remove("media-drop-before", "media-drop-after");
      });
      targetSlot.classList.add(mediaDropPosition(targetSlot, event.clientX) === "after" ? "media-drop-after" : "media-drop-before");
    }
    return;
  }
  const uploadTarget = event.target.closest(".drop-zone, .add-media-button");
  if (uploadTarget) { event.preventDefault(); uploadTarget.classList.add("dragging"); }
});
tableBody.addEventListener("dragleave", event => {
  if (draggedMediaContext) return;
  event.target.closest(".drop-zone, .add-media-button")?.classList.remove("dragging");
});
tableBody.addEventListener("drop", event => {
  if (draggedMediaContext) {
    const targetSlot = event.target.closest(".media-slot");
    if (targetSlot?.closest("tr[data-week]") === draggedMediaContext.row) {
      event.preventDefault();
      reorderMediaWithinRow(targetSlot, event.clientX);
    } else {
      clearMediaDropState();
    }
    return;
  }
  const uploadTarget = event.target.closest(".drop-zone, .add-media-button");
  if (!uploadTarget) return;
  event.preventDefault();
  uploadTarget.classList.remove("dragging");
  if (uploadTarget.matches(".add-media-button")) addAdditionalMedia(uploadTarget, event.dataTransfer.files[0]);
  else showMedia(event.dataTransfer.files[0], uploadTarget);
});

function setDialogPlanningCadence(cadence) {
  const monthly = cadence === "monthly";
  dialogCadenceMonthly.checked = monthly;
  dialogCadenceWeekly.checked = !monthly;
  dialogWeeklyAmounts.hidden = monthly;
  dialogMonthlyAmounts.hidden = !monthly;
  monthlyPlanningHint.hidden = !monthly;
  dialogMonthlyExtras.hidden = monthly;
  dialogMonthlyExtrasHint.hidden = monthly;
  dialogWeeklyAmounts.querySelectorAll("input").forEach(input => { input.disabled = monthly; });
  dialogMonthlyAmounts.querySelectorAll("input").forEach(input => { input.disabled = !monthly; });
  dialogMonthlyExtras.querySelectorAll("input").forEach(input => { input.disabled = monthly; });
}

function populateDialogPlanning(table) {
  document.querySelector("#dialog-stories").value = Number(table?.storiesPerWeek) || 0;
  document.querySelector("#dialog-posts").value = Number(table?.postsPerWeek) || 0;
  document.querySelector("#dialog-stories-month").value = Number(table?.storiesPerMonth) || 0;
  document.querySelector("#dialog-posts-month").value = Number(table?.postsPerMonth) || 0;
  document.querySelector("#dialog-monthly-stories").value = Number(table?.monthlyExtraStories) || 0;
  document.querySelector("#dialog-monthly-posts").value = Number(table?.monthlyExtraPosts) || 0;
  setDialogPlanningCadence(tablePlanningCadence(table));
}

[dialogCadenceWeekly, dialogCadenceMonthly].forEach(input => input.addEventListener("change", () => {
  setDialogPlanningCadence(dialogCadenceMonthly.checked ? "monthly" : "weekly");
  monthlyExtrasError.hidden = true;
}));

document.querySelector("#new-table-button").addEventListener("click", () => {
  const template = refreshTableTemplateSchema();
  tableForm.reset();
  document.querySelector("#editing-table-id").value = "";
  document.querySelector("#table-dialog-title").textContent = "Neue Kundentabelle";
  populateDialogPlanning(template);
  monthlyExtrasError.hidden = true;
  renderVisibleYearOptions(template.visibleYears);
  populateStartWeekOptions(template.displayStartWeek, template.visibleYears[0] ?? PLANNING_START_YEAR);
  deleteTableButton.hidden = true;
  tableDialog.showModal();
});

document.querySelector("#table-settings-button").addEventListener("click", () => {
  const table = currentTable();
  if (!table) return;
  document.querySelector("#editing-table-id").value = table.id;
  document.querySelector("#table-dialog-title").textContent = "Tabelle verwalten";
  document.querySelector("#client-name").value = table.name;
  populateDialogPlanning(table);
  monthlyExtrasError.hidden = true;
  const visibleYears = tableVisibleYears(table);
  renderVisibleYearOptions(visibleYears);
  populateStartWeekOptions(tableDisplayStartWeek(table), visibleYears[0] ?? PLANNING_START_YEAR);
  deleteTableButton.hidden = false;
  tableDialog.showModal();
});

dialogVisibleYears.addEventListener("change", () => {
  const selectedYears = selectedDialogYears();
  visibleYearsError.hidden = selectedYears.length > 0;
  const currentStartWeek = Number(document.querySelector("#dialog-start-week").value) || 1;
  populateStartWeekOptions(currentStartWeek, selectedYears[0] ?? PLANNING_START_YEAR);
});

function configurationWouldRemoveContent(table, values) {
  return Object.values(table.weeks ?? {}).some(week => {
    const items = Array.isArray(week?.items) ? week.items : [];
    return items.some(item => {
      const extra = extraOrdinal(item);
      if (extra) {
        const extraLimit = item.type === "post" ? values.monthlyExtraPosts : values.monthlyExtraStories;
        return extra > extraLimit && rowHasContent(item);
      }
      if (tablePlanningCadence(table) !== values.planningCadence) return false;
      if (values.planningCadence === "monthly") {
        const limit = item.type === "post" ? values.postsPerMonth : values.storiesPerMonth;
        return monthlyPlanOrdinal(item) > limit && rowHasContent(item);
      }
      const typeItems = items.filter(candidate => candidate.type === item.type
        && !extraOrdinal(candidate) && !monthlyPlanOrdinal(candidate));
      const limit = item.type === "post" ? values.postsPerWeek : values.storiesPerWeek;
      return typeItems.indexOf(item) >= limit && rowHasContent(item);
    });
  });
}

tableForm.addEventListener("submit", event => {
  event.preventDefault();
  const editingId = document.querySelector("#editing-table-id").value;
  const visibleYears = selectedDialogYears();
  if (!visibleYears.length) {
    visibleYearsError.hidden = false;
    return;
  }
  const values = {
    name: document.querySelector("#client-name").value.trim(),
    planningCadence: dialogCadenceMonthly.checked ? "monthly" : "weekly",
    storiesPerWeek: Number(document.querySelector("#dialog-stories").value),
    postsPerWeek: Number(document.querySelector("#dialog-posts").value),
    storiesPerMonth: Number(document.querySelector("#dialog-stories-month").value),
    postsPerMonth: Number(document.querySelector("#dialog-posts-month").value),
    monthlyExtraStories: Number(document.querySelector("#dialog-monthly-stories").value),
    monthlyExtraPosts: Number(document.querySelector("#dialog-monthly-posts").value),
    displayStartWeek: Number(document.querySelector("#dialog-start-week").value),
    visibleYears
  };
  if (!values.name) return;
  if (editingId) {
    const table = state.tables.find(item => item.id === editingId);
    const removingContent = configurationWouldRemoveContent(table, values);
    monthlyExtrasError.hidden = !removingContent;
    if (removingContent) return;
  }
  pushUndoState(editingId ? "Tabelleneinstellungen geändert" : "Neue Kundentabelle angelegt");
  if (editingId) {
    const table = state.tables.find(item => item.id === editingId);
    switchTablePlanningCadence(table, values.planningCadence);
    Object.assign(table, values);
    table.selectedYear = visibleYears.includes(Number(table.selectedYear)) ? Number(table.selectedYear) : visibleYears[0];
    const maximumWeek = weeksInIsoYear(table.selectedYear);
    const minimumWeek = table.selectedYear === PLANNING_START_YEAR ? table.displayStartWeek : 1;
    table.selectedWeek = Math.min(maximumWeek, Math.max(minimumWeek, Number(table.selectedWeek) || minimumWeek));
    if (table.id === state.currentTableId) {
      state.selectedYear = table.selectedYear;
      state.selectedWeek = table.selectedWeek;
    }
  }
  else {
    const template = refreshTableTemplateSchema();
    const table = {
      id: `table-${Date.now()}`,
      ...values,
      viewMode: "year",
      selectedYear: visibleYears[0],
      selectedWeek: values.displayStartWeek,
      fixedHashtags: template.fixedHashtags,
      customColumns: structuredClone(template.customColumns),
      removedCustomColumns: structuredClone(template.removedCustomColumns ?? []),
      removedStandardColumns: structuredClone(template.removedStandardColumns ?? []),
      columnWidths: structuredClone(template.columnWidths),
      columnOrder: structuredClone(template.columnOrder),
      weekViewRowHeight: template.weekViewRowHeight,
      yearViewRowHeight: null,
      hiddenWeeks: [],
      weeks: {}
    };
    state.tables.push(table); state.currentTableId = table.id;
    state.viewMode = table.viewMode;
    state.selectedYear = table.selectedYear;
    state.selectedWeek = table.selectedWeek;
  }
  tableDialog.close(); renderApp();
});

document.querySelector("#new-subadmin-button").addEventListener("click", () => {
  openSubadminDialog();
});

subadminList.addEventListener("click", event => {
  const button = event.target.closest("[data-edit-subadmin]");
  if (!button) return;
  const user = state.users.find(item => item.id === button.dataset.editSubadmin);
  if (user) openSubadminDialog(user);
});

subadminTables.addEventListener("change", event => {
  const customer = subadminDialog.dataset.accountRole === "customer";
  if (customer && event.target.matches('input[name="subadmin-table"]') && event.target.checked) {
    subadminTables.querySelectorAll('input[name="subadmin-table"]').forEach(input => {
      if (input !== event.target) input.checked = false;
    });
  }
  const selectedCount = subadminTables.querySelectorAll('input[name="subadmin-table"]:checked').length;
  subadminError.hidden = customer ? selectedCount === 1 : selectedCount > 0;
});

subadminDialog.addEventListener("close", () => {
  pendingCustomerCredentials = "";
  document.querySelector("#new-customer-password").value = "";
  document.querySelector("#customer-registration-result").hidden = true;
  document.querySelector("#customer-credentials").value = "";
});

async function createAccountAccess(mode) {
  const tableIds = [...subadminTables.querySelectorAll('input[name="subadmin-table"]:checked')].map(input => input.value);
  if (!tableIds.length || (mode === "customer" && tableIds.length !== 1)) {
    subadminError.textContent = mode === "customer" ? "Bitte wähle für den Kunden genau eine Kundentabelle aus." : "Bitte wähle mindestens eine Kundentabelle aus.";
    subadminError.hidden = false;
    return;
  }
  const customerName = document.querySelector("#new-customer-name");
  const customerEmail = document.querySelector("#new-customer-email");
  const customerPassword = document.querySelector("#new-customer-password");
  if (mode === "customer" && (!customerName.reportValidity() || !customerEmail.reportValidity() || !customerPassword.reportValidity() || customerName.value.trim().length < 2)) {
    if (customerName.value.trim().length < 2) {
      customerName.setCustomValidity("Bitte gib den Namen des Kunden ein.");
      customerName.reportValidity();
      customerName.setCustomValidity("");
    }
    return;
  }
  const action = document.querySelector(mode === "customer" ? "#register-customer" : "#create-invitation-link");
  action.disabled = true;
  subadminError.hidden = true;
  try {
    const email = mode === "customer" ? customerEmail.value.trim() : "";
    const result = await apiRequest(mode === "customer" ? "/api/users" : "/api/users/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "customer"
        ? { role: "customer", name: customerName.value.trim(), email, password: customerPassword.value, tableIds }
        : { email, tableIds, delivery: "link" })
    });
    if (mode === "customer") {
      pendingCustomerCredentials = `Planyoursocials\nE-Mail: ${email}\nPasswort: ${customerPassword.value}`;
      document.querySelector("#customer-credentials").value = pendingCustomerCredentials;
      customerPassword.value = "";
      document.querySelector("#invitation-result").hidden = true;
      document.querySelector("#customer-registration-status").textContent = `Das Kundenkonto für ${email} wurde angelegt. Kopiere die Zugangsdaten und gib sie sicher weiter.`;
      document.querySelector("#copy-customer-credentials").textContent = "Zugangsdaten kopieren";
      document.querySelector("#customer-registration-result").hidden = false;
    } else {
      const field = document.querySelector("#invitation-link");
      field.value = result.inviteUrl;
      document.querySelector("#customer-registration-result").hidden = true;
      document.querySelector("#invitation-result").hidden = false;
      document.querySelector("#copy-invitation-link").textContent = "Link kopieren";
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        document.querySelector("#invitation-copy-status").textContent = "Link automatisch kopiert ✓ · Er ist 7 Tage gültig und nur einmal verwendbar.";
      } catch {
        document.querySelector("#invitation-copy-status").textContent = "Automatisches Kopieren wurde vom Browser verweigert. Nutze „Link kopieren“ oder markiere den Link manuell.";
      }
    }
    try {
      const usersResult = await apiRequest("/api/users");
      syncSignedInUser(authenticatedAccount, usersResult.users);
      renderApp();
    } catch (refreshError) {
      console.warn("Der Zugang wurde angelegt, aber die Benutzerliste konnte nicht aktualisiert werden.", refreshError);
    }
  } catch (error) {
    subadminError.textContent = error.message;
    subadminError.hidden = false;
  } finally {
    action.disabled = false;
  }
}

document.querySelector("#create-invitation-link").addEventListener("click", () => createAccountAccess("link"));
document.querySelector("#register-customer").addEventListener("click", () => createAccountAccess("customer"));
document.querySelector("#copy-customer-credentials").addEventListener("click", async () => {
  if (!pendingCustomerCredentials) return;
  try {
    await navigator.clipboard.writeText(pendingCustomerCredentials);
    document.querySelector("#copy-customer-credentials").textContent = "Kopiert ✓";
  } catch {
    const field = document.querySelector("#customer-credentials");
    field.focus();
    field.select();
    document.querySelector("#customer-registration-status").textContent = "Der Browser hat das Kopieren verweigert. Die Zugangsdaten sind markiert – drücke Strg+C.";
  }
});

subadminForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = subadminName.value.trim();
  const email = subadminEmail.value.trim();
  const password = subadminPassword.value;
  const editingId = document.querySelector("#editing-subadmin-id").value;
  if (!editingId) return;
  const tableIds = [...subadminTables.querySelectorAll('input[name="subadmin-table"]:checked')].map(input => input.value);
  const customer = subadminDialog.dataset.accountRole === "customer";
  if (editingId && !name) return;
  if (!tableIds.length || (customer && tableIds.length !== 1)) {
    subadminError.textContent = customer ? "Bitte wähle genau eine Kundentabelle aus." : "Bitte wähle mindestens eine Kundentabelle aus.";
    subadminError.hidden = false;
    return;
  }
  const saveButton = document.querySelector("#subadmin-save-button");
  saveButton.disabled = true;
  saveButton.textContent = "Wird gespeichert …";
  subadminError.hidden = true;
  try {
    await apiRequest(`/api/users/${encodeURIComponent(editingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, tableIds })
    });
    const usersResult = await apiRequest("/api/users");
    syncSignedInUser(authenticatedAccount, usersResult.users);
    renderApp();
    subadminDialog.close();
  } catch (error) {
    subadminError.textContent = error.message;
    subadminError.hidden = false;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = customer ? "Kundenzugriff speichern" : "Änderungen speichern";
  }
});

document.querySelector("#copy-invitation-link").addEventListener("click", async () => {
  const field = document.querySelector("#invitation-link");
  try {
    await navigator.clipboard.writeText(field.value);
    document.querySelector("#copy-invitation-link").textContent = "Kopiert ✓";
  } catch {
    field.focus();
    field.select();
    document.querySelector("#copy-invitation-link").textContent = "Link markiert – Strg+C drücken";
  }
});

deleteTableButton.addEventListener("click", () => {
  const table = currentTable();
  if (!table || !isOwner()) return;
  pendingDeleteTableId = table.id;
  deleteTableMessage.textContent = `Möchtest du die Kundentabelle „${table.name}“ wirklich löschen?`;
  deleteTableDialog.returnValue = "";
  tableDialog.close();
  deleteTableDialog.showModal();
});

continueDeleteTableButton.addEventListener("click", () => {
  const table = state.tables.find(item => item.id === pendingDeleteTableId);
  if (!table || !isOwner()) return;
  deleteTableFinalMessage.textContent = `Bitte bestätige ein zweites Mal, dass „${table.name}“ vollständig gelöscht werden soll.`;
  deleteTableDialog.close("continue");
  deleteTableFinalDialog.returnValue = "";
  deleteTableFinalDialog.showModal();
});

confirmDeleteTableButton.addEventListener("click", async () => {
  const table = state.tables.find(item => item.id === pendingDeleteTableId);
  if (!table || !isOwner()) return;
  try {
    await apiRequest(`/api/customer-data?tableId=${encodeURIComponent(table.id)}`, { method: "DELETE" });
  } catch (error) {
    console.warn("Die browserlokale Kundentabelle wird gelöscht; das Backend war für die Bereinigung nicht erreichbar.", error);
  }
  refreshTableTemplateSchema();
  pushUndoState("Kundentabelle gelöscht");
  Object.values(table.weeks ?? {}).forEach(week => {
    (week.items ?? []).forEach(item => {
      (item.runtimeMedia ?? []).forEach(record => {
        if (record?.url) URL.revokeObjectURL(record.url);
      });
    });
  });
  state.tables = state.tables.filter(item => item.id !== table.id);
  state.users.forEach(user => {
    if (Array.isArray(user.tableIds)) user.tableIds = user.tableIds.filter(tableId => tableId !== table.id);
  });
  if (state.currentTableId === table.id) state.currentTableId = state.tables[0]?.id ?? null;
  const nextTable = currentTable();
  state.viewMode = nextTable?.viewMode === "week" ? "week" : "year";
  state.selectedYear = nextTable ? Number(nextTable.selectedYear) || PLANNING_START_YEAR : PLANNING_START_YEAR;
  state.selectedWeek = nextTable ? Math.max(tableDisplayStartWeek(nextTable), Number(nextTable.selectedWeek) || 1) : 1;
  deleteTableFinalDialog.close("deleted");
  pendingDeleteTableId = null;
  renderApp();
});

deleteTableDialog.addEventListener("close", () => {
  if (deleteTableDialog.returnValue !== "continue") pendingDeleteTableId = null;
});
deleteTableFinalDialog.addEventListener("close", () => {
  if (deleteTableFinalDialog.returnValue !== "deleted") pendingDeleteTableId = null;
});

historyButton.addEventListener("click", async () => {
  if (!isOwner() || historyPreview) return;
  historyDialog.showModal();
  await renderHistoryDialog();
});

aiAgentButton.addEventListener("click", openAiAgentDialog);

selectAiAgentFolderButton.addEventListener("click", async () => {
  if (!isOwner()) return;
  const originalLabel = selectAiAgentFolderButton.textContent;
  selectAiAgentFolderButton.disabled = true;
  selectAiAgentFolderButton.textContent = "Ordnerauswahl geöffnet …";
  aiAgentError.hidden = true;
  try {
    const result = await apiRequest("/api/ai/select-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialPath: aiAgentImageFolder.value.trim() })
    });
    if (Array.isArray(result.choices)) {
      if (!result.choices.length) throw new Error("Im freigegebenen Serverordner sind noch keine Kundenordner vorhanden.");
      const selection = window.prompt("Kundenordner auf dem Server auswählen:\n" + result.choices.map((choice, index) => `${index + 1}. ${choice.name}`).join("\n") + "\n\nBitte die Nummer eingeben:");
      if (selection === null) return;
      const selectedIndex = Number(selection) - 1;
      if (!Number.isInteger(selectedIndex) || !result.choices[selectedIndex]) throw new Error("Bitte eine gültige Ordnernummer auswählen.");
      result.path = result.choices[selectedIndex].path;
    }
    if (result.path) {
      aiAgentImageFolder.value = result.path;
      aiAgentImageFolder.dispatchEvent(new Event("input", { bubbles: true }));
      aiAgentImageFolder.focus();
    }
  } catch (error) {
    aiAgentError.textContent = error.message;
    aiAgentError.hidden = false;
  } finally {
    selectAiAgentFolderButton.disabled = false;
    selectAiAgentFolderButton.textContent = originalLabel;
  }
});

aiAgentTableSelect.addEventListener("change", () => {
  void loadAiAgentConfiguration(selectedAiTable());
});

aiAgentForm.addEventListener("submit", async event => {
  event.preventDefault();
  const table = selectedAiTable();
  if (!table || !isOwner()) return;
  saveAiAgentConfigButton.disabled = true;
  saveAiAgentConfigButton.textContent = "Wird gespeichert …";
  aiAgentError.hidden = true;
  try {
    const result = await apiRequest("/api/ai/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: table.id,
        tableName: table.name,
        enabled: aiAgentEnabled.checked,
        imageFolder: aiAgentImageFolder.value.trim(),
        allowedWebsites: listFromTextarea(aiAgentWebsites.value),
        pdfFiles: listFromTextarea(aiAgentPdfs.value),
        tone: aiAgentTone.value.trim(),
        forbiddenTerms: listFromTextarea(aiAgentForbiddenTerms.value),
        notes: aiAgentNotes.value.trim(),
        fieldMapping: { german: aiAgentGermanField.value, italian: aiAgentItalianField.value }
      })
    });
    currentAiConfiguration = result.configuration;
    renderAiAgentTopStatus(result.configuration);
    aiAgentRuntimeStatus.className = `ai-agent-runtime-status ${result.runtime.configured ? "ready" : "warning"}`;
    aiAgentRuntimeStatus.textContent = result.runtime.configured
      ? "Konfiguration sicher im Backend gespeichert."
      : "Konfiguration gespeichert; für echte KI-Entwürfe fehlt noch OPENAI_API_KEY in der .env-Datei.";
  } catch (error) {
    aiAgentError.textContent = error.message;
    aiAgentError.hidden = false;
  } finally {
    saveAiAgentConfigButton.disabled = false;
    saveAiAgentConfigButton.textContent = "Konfiguration speichern";
  }
});

backendButton.addEventListener("click", async () => {
  if (!isOwner()) return;
  backendDialog.showModal();
  await refreshBackendOverview();
});

refreshBackendButton.addEventListener("click", refreshBackendOverview);
toggleBackendMediaButton.addEventListener("click", () => {
  const expanded = toggleBackendMediaButton.getAttribute("aria-expanded") !== "true";
  toggleBackendMediaButton.setAttribute("aria-expanded", String(expanded));
  backendMediaPanel.hidden = !expanded;
});
backendMediaSort.addEventListener("change", renderBackendMedia);
backendMediaDirection.addEventListener("change", renderBackendMedia);
openMediaLibraryButton.addEventListener("click", () => {
  mediaLibrarySort.value = backendMediaSort.value;
  mediaLibraryDirection.value = backendMediaDirection.value;
  renderBackendMedia();
  mediaLibraryDialog.showModal();
});
mediaLibrarySort.addEventListener("change", () => {
  backendMediaSort.value = mediaLibrarySort.value;
  renderBackendMedia();
});
mediaLibraryDirection.addEventListener("change", () => {
  backendMediaDirection.value = mediaLibraryDirection.value;
  renderBackendMedia();
});
continueDeleteOriginalButton.addEventListener("click", () => {
  if (!pendingOriginalDeletion) return;
  deleteOriginalDialog.close();
  deleteOriginalFinalDialog.showModal();
});
confirmDeleteOriginalButton.addEventListener("click", () => {
  if (!pendingOriginalDeletion) return;
  const deletion = pendingOriginalDeletion;
  pendingOriginalDeletion = null;
  deleteOriginalFinalDialog.close();
  void deleteBackendMedia(deletion.mediaId, deletion.media, deletion.button);
});
document.querySelectorAll(".backend-media-head").forEach(header => header.addEventListener("click", event => {
  const button = event.target.closest("[data-media-sort]");
  if (button) sortBackendMediaByHeader(button.dataset.mediaSort);
}));
function handleBackendMediaAction(event) {
  const openButton = event.target.closest("[data-open-backend-media]");
  if (openButton) {
    openBackendMedia(openButton.dataset.openBackendMedia);
    return;
  }
  const restoreButton = event.target.closest("[data-restore-backend-media]");
  if (restoreButton) {
    void restoreBackendMedia(restoreButton.dataset.restoreBackendMedia, restoreButton);
    return;
  }
  const button = event.target.closest("[data-delete-backend-media]");
  if (button) requestBackendMediaDeletion(button.dataset.deleteBackendMedia, button);
}
backendMediaList.addEventListener("click", handleBackendMediaAction);
mediaLibraryList.addEventListener("click", handleBackendMediaAction);

instagramSettingsButton.addEventListener("click", async () => {
  if (!isOwner() || !currentTable()) return;
  populateInstagramTableSelect(currentTable().id);
  instagramDialog.showModal();
  await refreshInstagramDialog();
});

instagramTableSelect.addEventListener("change", () => {
  instagramConfigStatus.textContent = "";
  void refreshInstagramDialog();
});

instagramAppConfigForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isOwner()) return;
  saveInstagramConfigButton.disabled = true;
  saveInstagramConfigButton.textContent = "Wird gespeichert …";
  instagramConfigStatus.className = "";
  instagramConfigStatus.textContent = "";
  instagramDialogError.hidden = true;
  try {
    const result = await apiRequest("/api/admin/instagram-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: instagramAppId.value.trim(), appSecret: instagramAppSecret.value.trim() })
    });
    await refreshInstagramDialog();
    instagramConfigStatus.className = "success";
    instagramConfigStatus.textContent = result.message;
  } catch (error) {
    instagramConfigStatus.className = "error";
    instagramConfigStatus.textContent = error.message;
  } finally {
    instagramAppSecret.value = "";
    saveInstagramConfigButton.disabled = false;
    saveInstagramConfigButton.textContent = "Meta-Zugang speichern";
  }
});

instagramProfileUrl.addEventListener("change", () => {
  const table = selectedInstagramTable();
  if (!table || !isOwner()) return;
  const normalized = normalizedInstagramProfileUrl(instagramProfileUrl.value);
  if (normalized === null) {
    instagramDialogError.textContent = "Bitte gib einen Instagram-Benutzernamen oder eine gültige Instagram-Profil-URL ein.";
    instagramDialogError.hidden = false;
    return;
  }
  table.instagramProfileUrl = normalized;
  instagramProfileUrl.value = normalized;
  instagramDialogError.hidden = true;
  saveState();
});

openInstagramProfileButton.addEventListener("click", () => {
  const table = selectedInstagramTable();
  if (!table || !isOwner()) return;
  const normalized = normalizedInstagramProfileUrl(instagramProfileUrl.value);
  if (normalized === null) {
    instagramDialogError.textContent = "Bitte gib einen Instagram-Benutzernamen oder eine gültige Instagram-Profil-URL ein.";
    instagramDialogError.hidden = false;
    return;
  }
  if (normalized) {
    table.instagramProfileUrl = normalized;
    instagramProfileUrl.value = normalized;
    saveState();
  }
  instagramDialogError.hidden = true;
  window.open(normalized || "https://www.instagram.com/", "_blank", "noopener,noreferrer");
});

connectInstagramButton.addEventListener("click", async () => {
  const table = selectedInstagramTable();
  if (!table || !isOwner()) return;
  connectInstagramButton.disabled = true;
  instagramDialogError.hidden = true;
  try {
    const result = await apiRequest("/api/instagram/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId: table.id, tableName: table.name })
    });
    window.open(result.authorizationUrl, "socialflow-instagram-connect", "popup,width=620,height=760");
  } catch (error) {
    instagramDialogError.textContent = error.message;
    instagramDialogError.hidden = false;
  } finally {
    connectInstagramButton.disabled = false;
  }
});

disconnectInstagramButton.addEventListener("click", async () => {
  const table = selectedInstagramTable();
  if (!table || !isOwner() || !confirm(`Möchtest du die Instagram-Verbindung für „${table.name}“ wirklich trennen? Bestehende Aufträge und Tabelleninhalte bleiben erhalten.`)) return;
  try {
    await apiRequest(`/api/instagram/connection?tableId=${encodeURIComponent(table.id)}`, { method: "DELETE" });
    await refreshInstagramDialog();
  } catch (error) {
    instagramDialogError.textContent = error.message;
    instagramDialogError.hidden = false;
  }
});

window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || !String(event.data?.type || "").startsWith("socialflow-instagram-")) return;
  if (event.data.type === "socialflow-instagram-connected") refreshInstagramDialog();
  else {
    instagramDialogError.textContent = event.data.message || "Instagram konnte nicht verbunden werden.";
    instagramDialogError.hidden = false;
  }
});

publicationForm.addEventListener("submit", async event => {
  event.preventDefault();
  const context = pendingPublicationContext;
  const table = currentTable();
  if (!context || !table || !isOwner()) return;
  if (context.mediaIssue) {
    publicationError.textContent = context.mediaIssue;
    publicationError.hidden = false;
    return;
  }
  if (publicationAdminApproved.checked && !publicationCustomerApproved.checked) {
    publicationError.textContent = "Vor der finalen Hauptadmin-Freigabe muss „Vom Kunden bestätigt“ aktiviert sein.";
    publicationError.hidden = false;
    return;
  }
  let uploadMedia;
  try {
    uploadMedia = await Promise.all(context.media.map((record, index) => cropImageForInstagram(record, context.cropSettings.get(index))));
  } catch (error) {
    publicationError.textContent = error.message;
    publicationError.hidden = false;
    return;
  }
  const form = new FormData();
  form.set("tableId", table.id);
  form.set("tableName", table.name);
  form.set("calendarYear", String(context.calendarYear));
  form.set("weekNumber", String(context.weekNumber));
  form.set("itemIndex", String(context.itemIndex));
  form.set("contentType", context.contentType);
  form.set("caption", publicationCaption.value);
  form.set("scheduledAt", new Date(publicationScheduledAt.value).toISOString());
  form.set("customerApproved", String(publicationCustomerApproved.checked));
  form.set("mainAdminApproved", String(publicationAdminApproved.checked));
  form.set("cropSelections", JSON.stringify(uploadMedia.map(entry => entry.crop)));
  uploadMedia.forEach(entry => form.append("media", entry.file, entry.name));
  savePublicationButton.disabled = true;
  savePublicationButton.textContent = "Wird gespeichert …";
  publicationError.hidden = true;
  try {
    const result = await apiRequest("/api/publications", { method: "POST", body: form });
    pushUndoState("Instagram-Veröffentlichung geplant");
    context.item.instagramPublicationId = result.publication.id;
    context.item.instagramStatus = result.publication.status;
    context.item.instagramScheduledAt = result.publication.scheduledAt;
    context.item.instagramError = result.publication.lastError;
    saveState();
    publicationDialog.close();
    pendingPublicationContext = null;
    renderWorkspace();
  } catch (error) {
    publicationError.textContent = error.message;
    publicationError.hidden = false;
  } finally {
    savePublicationButton.disabled = false;
    savePublicationButton.textContent = "Veröffentlichung einplanen";
  }
});

publicationDialog.addEventListener("close", () => {
  pendingPublicationContext = null;
  publicationError.hidden = true;
  publicationCropList.replaceChildren();
  publicationCropSection.hidden = true;
  publicationMediaSummary.classList.remove("warning");
});

historyList.addEventListener("click", event => {
  const button = event.target.closest("[data-preview-history]");
  if (!button) return;
  const entry = loadedHistoryEntries.find(item => String(item.id) === button.dataset.previewHistory);
  if (entry) enterHistoryPreview(entry);
});

exitHistoryPreviewButton.addEventListener("click", exitHistoryPreview);
restoreHistoryVersionButton.addEventListener("click", () => {
  if (!historyPreview) return;
  if (confirm(`Möchtest du den Stand vom ${formatHistoryDate(historyPreview.entry.timestamp)} wirklich wiederherstellen? Der aktuelle Stand bleibt im Änderungsverlauf erhalten.`)) {
    restoreHistoryVersion();
  }
});

document.querySelectorAll("[data-close-dialog]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

forgotPasswordButton.addEventListener("click", () => {
  authPassword.value = "";
  showAuthentication("forgot");
});

backToLoginButton.addEventListener("click", () => {
  passwordResetToken = "";
  invitationToken = "";
  if (new URLSearchParams(window.location.search).has("resetToken") || new URLSearchParams(window.location.search).has("invite")) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("resetToken");
    cleanUrl.searchParams.delete("invite");
    window.history.replaceState({}, "", cleanUrl);
  }
  authPassword.value = "";
  authPasswordConfirm.value = "";
  showAuthentication("login");
});

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  authError.hidden = true;
  authError.classList.remove("success");
  if (["setup", "register", "reset"].includes(authenticationMode) && authPassword.value !== authPasswordConfirm.value) {
    authError.textContent = "Die beiden Passwörter stimmen nicht überein.";
    authError.hidden = false;
    return;
  }
  authSubmit.disabled = true;
  authSubmit.textContent = authenticationMode === "forgot"
    ? "E-Mail wird vorbereitet …"
    : authenticationMode === "reset"
      ? "Passwort wird gespeichert …"
      : authenticationMode === "register"
        ? "Konto wird erstellt …"
        : authenticationMode === "setup" ? "Wird eingerichtet …" : "Wird angemeldet …";
  try {
    if (authenticationMode === "forgot") {
      const { response, body } = await requestJson("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.value.trim() })
      });
      if (!response.ok) throw new Error(body.error || "Die E-Mail konnte nicht angefordert werden.");
      showAuthentication("login", body.message, "success");
      return;
    }
    if (authenticationMode === "reset") {
      const { response, body } = await requestJson("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: passwordResetToken, password: authPassword.value })
      });
      if (!response.ok) throw new Error(body.error || "Das Passwort konnte nicht geändert werden.");
      passwordResetToken = "";
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("resetToken");
      window.history.replaceState({}, "", cleanUrl);
      authPassword.value = "";
      authPasswordConfirm.value = "";
      showAuthentication("login", body.message, "success");
      return;
    }
    if (authenticationMode === "register") {
      const { response, body } = await requestJson("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: authName.value.trim(), email: authEmail.value.trim(), password: authPassword.value, invitationToken })
      });
      if (!response.ok) throw new Error(body.error || "Das Kundenkonto konnte nicht erstellt werden.");
      if (invitationToken) {
        invitationToken = "";
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("invite");
        window.history.replaceState({}, "", cleanUrl);
      }
      authForm.reset();
      showAuthentication("login", body.message, "success");
      return;
    }
    const path = authenticationMode === "setup" ? "/api/auth/setup" : "/api/auth/login";
    const payload = {
      email: authEmail.value.trim(),
      password: authPassword.value
    };
    if (authenticationMode === "setup") payload.name = authName.value.trim();
    const { response, body } = await requestJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(body.error || "Die Anmeldung ist fehlgeschlagen.");
    authPassword.value = "";
    authPasswordConfirm.value = "";
    await openAuthenticatedApp(body.user);
  } catch (error) {
    authError.textContent = error.message;
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authenticationSubmitLabel();
  }
});

document.querySelector("#open-role-preview").addEventListener("click", openRolePreviewDialog);
rolePreviewForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = document.querySelector("#start-role-preview");
  button.disabled = true;
  try { await startRolePreview(rolePreviewUser.value); }
  finally { button.disabled = false; }
});
document.querySelector("#exit-role-preview").addEventListener("click", exitRolePreview);
document.querySelector("#exit-role-preview-banner").addEventListener("click", exitRolePreview);

workspace.addEventListener("wheel", event => {
  if (event.defaultPrevented || event.target.closest(".table-scroll, textarea, select") || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (tableScroll.scrollHeight <= tableScroll.clientHeight) return;
  event.preventDefault();
  const distance = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 24
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * tableScroll.clientHeight
      : event.deltaY;
  tableScroll.scrollTop += distance;
}, { passive: false });

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
  } finally {
    authenticatedAccount = null;
    authForm.reset();
    showAuthentication("login");
    logoutButton.disabled = false;
  }
});

undoButton.addEventListener("click", undoLastChange);

mediaNoteForm.addEventListener("submit", event => {
  event.preventDefault();
  savePendingMediaNote(mediaNoteText.value);
  mediaNoteDialog.close("saved");
});

removeMediaNoteButton.addEventListener("click", () => {
  savePendingMediaNote("");
  mediaNoteDialog.close("removed");
});

mediaNoteDialog.addEventListener("close", () => {
  pendingMediaNote = null;
  mediaNoteText.value = "";
  mediaNoteFileName.textContent = "";
});

mediaViewerPrevious.addEventListener("click", () => showAdjacentMedia(-1));
mediaViewerNext.addEventListener("click", () => showAdjacentMedia(1));
mediaViewer.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showAdjacentMedia(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showAdjacentMedia(1);
  }
});
mediaViewer.addEventListener("close", () => {
  mediaViewerContent.replaceChildren();
  viewerMediaItems = [];
  viewerMediaIndex = 0;
});

window.addEventListener("beforeunload", () => {
  revokeAllRuntimeMedia();
});
window.addEventListener("resize", applyColumnWidths);

if (!state.sharedTableLayoutEnabled) {
  syncSharedTableLayout(currentTable() ?? state.tables[0]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

initializeAuthentication();
setInterval(() => syncPublicationStatuses(), 30_000);

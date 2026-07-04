/* ============================================================
   SECTION 2: PERSISTENCE LAYER
   All state lives in one JSON document. saveState()/loadState()
   are the ONLY two functions that touch localStorage.
   A2: validateState() guards all critical field types.
   A1: migrateState() handles schema upgrades automatically.
   D3: seenInfoIds now lives inside AppState (not a separate key).
   ============================================================ */

/**
 * Returns a fresh, empty data document. Called on first launch.
 * D3: Added seenInfoIds field (replaces standalone localStorage key).
 * @returns {Object} default AppState shape
 */
function defaultState() {
  return {
    version: 1,
    profile: null,             // UserProfile, null until onboarding completes
    machineCalibration: {},    // { [catalogId]: { increment, plateWeight, barWeight } }
    customExercises: [],       // user-added CatalogItem-shaped entries
    templates: [],             // [{id, name, exerciseIds:[]}]
    activeSplit: null,         // {type, templateIds:[]}
    sessions: [],              // [{id, dateISO, exerciseId, sets, soreness, notes, rpe, templateId} | cardio]
    bodyweightLog: [],         // [{dateISO, kg}]
    injuryFlags: {},           // { [catalogId]: { until: dateISO|null, note } }
    lastWeeklyExport: null,    // ISO date of last auto txt dump
    lastSessionByExercise: {}, // { [catalogId]: dateISO } quick lookup
    seenInfoIds: []            // D3: IDs whose info modal has been seen (merged from legacy key)
  };
}

/**
 * A1: Runs structural migrations to bring state up to SCHEMA_VERSION.
 * Fall-through is intentional: v1→v3 runs v1→v2 then v2→v3 automatically.
 * @param {Object} state - the parsed raw state object (mutated in place)
 * @param {number} from  - the version number found in storage
 * @returns {Object}
 */
function migrateState(state, from) {
  try {
    switch (from) {
      case 0:
      // v0→v1: no-op placeholder. Future: reshape v0-specific fields here.
      // fall through
      default:
        break;
    }
    state.version = SCHEMA_VERSION;
  } catch (e) {
    console.error("migrateState failed, continuing with partial state.", e);
  }
  return state;
}

/**
 * A2: Validates and sanitises a raw parsed state object, replacing any
 * field that has the wrong type with a safe default. Never throws.
 * @param {Object} state - result of Object.assign(defaultState(), parsed)
 * @returns {Object} the cleaned state (same reference, mutated)
 */
function validateState(state) {
  try {
    if (!Array.isArray(state.sessions)) {
      console.warn("validateState: sessions was not an Array — resetting to [].");
      state.sessions = [];
    }
    if (!Array.isArray(state.bodyweightLog)) {
      console.warn("validateState: bodyweightLog was not an Array — resetting to [].");
      state.bodyweightLog = [];
    }
    if (!Array.isArray(state.templates)) {
      console.warn("validateState: templates was not an Array — resetting to [].");
      state.templates = [];
    }
    if (!Array.isArray(state.customExercises)) {
      console.warn("validateState: customExercises was not an Array — resetting to [].");
      state.customExercises = [];
    }
    if (!Array.isArray(state.seenInfoIds)) {
      state.seenInfoIds = [];
    }
    if (state.profile !== null) {
      const REQUIRED = ["age", "sex", "heightCm", "weightKg", "activity", "goal"];
      const valid = (
        state.profile !== null &&
        typeof state.profile === "object" &&
        !Array.isArray(state.profile) &&
        REQUIRED.every(f => state.profile[f] !== undefined && state.profile[f] !== null)
      );
      if (!valid) {
        console.warn("validateState: profile was malformed — setting to null (re-onboarding required).");
        state.profile = null;
      }
    }
    if (state.injuryFlags === null || typeof state.injuryFlags !== "object" || Array.isArray(state.injuryFlags)) {
      console.warn("validateState: injuryFlags was not a plain object — resetting to {}.");
      state.injuryFlags = {};
    }
    if (state.machineCalibration === null || typeof state.machineCalibration !== "object" || Array.isArray(state.machineCalibration)) {
      console.warn("validateState: machineCalibration was not a plain object — resetting to {}.");
      state.machineCalibration = {};
    }
  } catch (e) {
    console.error("validateState threw unexpectedly — returning state as-is.", e);
  }
  return state;
}

/**
 * Loads AppState from localStorage. Falls back to a fresh default
 * document if nothing is stored or the JSON is corrupt — never
 * throws, since a corrupt-state crash-loop would brick the app.
 * A1: runs schema migration if version mismatch found.
 * A2: runs validateState() on the merged result.
 * D3: migrates legacy "ironlog_seen_info" key into AppState.seenInfoIds.
 * @returns {Object}
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    // A1: schema migration guard
    const fromVersion = (typeof parsed.version === "number") ? parsed.version : 0;
    if (fromVersion < SCHEMA_VERSION) {
      migrateState(parsed, fromVersion);
    }

    // A2: deep validation
    const clean = validateState(Object.assign(defaultState(), parsed));

    // D3: migrate legacy seenInfoIds key
    try {
      const legacySeen = localStorage.getItem("ironlog_seen_info");
      if (legacySeen) {
        const legacy = JSON.parse(legacySeen);
        if (Array.isArray(legacy)) {
          clean.seenInfoIds = Array.from(new Set([...(clean.seenInfoIds || []), ...legacy]));
        }
        localStorage.removeItem("ironlog_seen_info");
      }
    } catch (_) { /* malformed legacy key — ignore */ }

    return clean;
  } catch (e) {
    console.error("State load failed, resetting.", e);
    return defaultState();
  }
}

/**
 * Persists AppState. Writes to a temp key first, then swaps —
 * approximates atomic write semantics inside localStorage so a
 * mid-write crash can't leave a half-written, unparseable blob.
 * P5: Guards against null AppState.
 * A5: On quota error, prunes data older than 365 days and retries once.
 */
function saveState() {
  // P5: guard against null AppState
  if (!AppState) return;

  try {
    const json = JSON.stringify(AppState);
    localStorage.setItem(STORAGE_KEY + "_tmp", json);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.removeItem(STORAGE_KEY + "_tmp");
  } catch (e) {
    console.error("State save failed (first attempt).", e);

    // A5: quota recovery — prune data older than 365 days then retry
    try {
      const cutoff = Date.now() - 365 * 86400000;
      const sessionsBefore = AppState.sessions.length;
      AppState.sessions = AppState.sessions.filter(s => {
        try { return new Date(s.dateISO).getTime() >= cutoff; } catch (_) { return true; }
      });
      const bwBefore = AppState.bodyweightLog.length;
      AppState.bodyweightLog = AppState.bodyweightLog.filter(b => {
        try { return new Date(b.dateISO).getTime() >= cutoff; } catch (_) { return true; }
      });
      console.warn(`Storage cleanup: pruned ${sessionsBefore - AppState.sessions.length} sessions, ${bwBefore - AppState.bodyweightLog.length} bodyweight entries older than 365 days.`);

      const retryJson = JSON.stringify(AppState);
      localStorage.setItem(STORAGE_KEY + "_tmp", retryJson);
      localStorage.setItem(STORAGE_KEY, retryJson);
      localStorage.removeItem(STORAGE_KEY + "_tmp");
      toast("Storage was nearly full — old data pruned. Save succeeded.");
    } catch (e2) {
      console.error("State save failed even after cleanup.", e2);
      toast("Storage full even after cleanup. Export a backup and consider resetting.");
    }
  }
}

/** Full catalog = presets + user-added custom exercises. */
function fullCatalog() { return CATALOG.concat(AppState.customExercises); }

/**
 * Look up a catalog item by id. Always use this — never access CATALOG directly
 * or custom exercises will silently break in every screen.
 * @param {string} id
 * @returns {CatalogItem|undefined}
 */
function getCatalogItem(id) { return fullCatalog().find(c => c.id === id); }

// Initialise global AppState (called after functions are defined)
let AppState = loadState();

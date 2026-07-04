/* ============================================================
   SECTION 3: METABOLIC / CALCULATION ENGINE
   ============================================================ */

/**
 * Mifflin-St Jeor BMR — chosen over Harris-Benedict for better
 * accuracy in modern populations.
 */
function calcBMR(sex, kg, cm, age) {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

const ACTIVITY_MULTIPLIERS = {sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9};

/** @returns {number} estimated TDEE (kcal) */
function calcTDEE(bmr, activityLevel) { return bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.375); }

/**
 * Calorie target derived from goal. Deliberately conservative
 * (10-20% surplus/deficit) — aggressive swings aren't appropriate
 * defaults for a beginner with no coaching supervision.
 */
function calcCalorieTarget(tdee, goal) {
  if (goal === "lose_fat") return Math.round(tdee * 0.82);
  if (goal === "build_muscle") return Math.round(tdee * 1.12);
  return Math.round(tdee);
}

/** Protein target in grams, scaled by goal within the evidence-backed 1.6-2.2g/kg band. */
function calcProteinTarget(kg, goal) {
  const perKg = goal === "build_muscle" ? 2.0 : goal === "lose_fat" ? 2.2 : 1.8;
  return Math.round(kg * perKg);
}

/**
 * Estimated 1-rep max, averaging Epley and Brzycki so no single
 * formula's bias dominates the trend line. Only meaningful for reps <= ~12.
 */
function estimate1RM(weight, reps) {
  if (reps <= 1) return weight;
  const epley = weight * (1 + reps / 30);
  const brzycki = weight * (36 / (37 - reps));
  return Math.round(((epley + brzycki) / 2) * 10) / 10;
}

/* ============================================================
   A10: LOCAL TIMEZONE DATE HELPER
   Replaces the UTC-biased Date.now() - new Date(dateISO) pattern.
   new Date('YYYY-MM-DD') parses as UTC midnight; users in UTC+
   timezones see daysSince=1 when it should be 0 late at night.
   ============================================================ */

/**
 * Returns the number of whole local calendar days between a YYYY-MM-DD
 * dateISO string and today, using the device's local timezone for both sides.
 * @param {string} dateISO - 'YYYY-MM-DD'
 * @returns {number} whole days, >= 0
 */
function localDaysSince(dateISO) {
  try {
    const [y, m, d] = dateISO.split('-').map(Number);
    const then = new Date(y, m - 1, d);   // local midnight on that date
    const now = new Date();
    now.setHours(0, 0, 0, 0);             // local midnight today
    return Math.max(0, Math.floor((now - then) / 86400000));
  } catch (e) {
    console.error('localDaysSince: invalid dateISO', dateISO, e);
    return 0;
  }
}

/* ============================================================
   SECTION 4: PROGRESSION ENGINE
   Implements the double-progression decision tree: stay at a
   weight until every set hits the TOP of the rep range for two
   sessions running, then step up and reset to the bottom.
   ============================================================ */

/**
 * Returns the calibrated increment (kg) for a catalog item,
 * preferring a user override over the catalog default.
 */
function getIncrement(catalogId) {
  const override = AppState.machineCalibration[catalogId];
  if (override && override.increment) return override.increment;
  const item = getCatalogItem(catalogId);
  return item ? item.defaultIncrement : 2.5;
}

/**
 * Core progression decision. Returns a suggestion object the UI
 * renders after every log-save.
 * PR1: excludes sessions with zero sets (would cause crash + vacuous truths).
 * PR2: deduplicates same-date sessions in the prev slot (same-day logs
 *      should not count as two separate training sessions for progression).
 * @param {string} catalogId
 * @returns {{action:"increase"|"hold"|"deload"|"baseline", message:string, suggestedWeight:number|null}|null}
 */
function getProgressionSuggestion(catalogId) {
  const item = getCatalogItem(catalogId);
  if (!item || item.loadType === "cardio" || !item.repRange) return null;

  // PR1: exclude empty sets arrays — .every([]) is vacuously true, causing false increase signals
  const history = AppState.sessions
    .filter(s => s.exerciseId === catalogId && s.sets && s.sets.length > 0)
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));

  if (history.length === 0) return {action:"baseline", message:"First time on this machine — log today as your baseline.", suggestedWeight:null};

  const [lo, hi] = item.repRange;
  const hitTop       = s => s.sets.every(set => set.reps >= hi);
  const missedBottom = s => s.sets.some(set  => set.reps < lo);

  // PR1: sets.length > 0 guaranteed by filter above — safe to access [0]
  const lastWeight = history[0].sets[0].weight;
  const inc = getIncrement(catalogId);
  const last = history[0];

  // PR2: same-date dedup — if history[0] and history[1] share a dateISO they
  // are from the same workout session. Skip to history[2] for the true "prev".
  let prev = history[1];
  if (prev && prev.dateISO === last.dateISO) {
    prev = history[2];
  }

  if (hitTop(last) && prev && hitTop(prev)) {
    return {action:"increase", message:`Two sessions at the top of your rep range (${hi}). Bump up next time.`, suggestedWeight: Math.round((lastWeight + inc) * 10) / 10};
  }
  if (missedBottom(last) && prev && missedBottom(prev)) {
    return {action:"deload", message:`Missed the bottom of your rep range (${lo}) twice in a row — consider dropping ~10% and rebuilding.`, suggestedWeight: Math.round((lastWeight * 0.9) * 10) / 10};
  }
  if (hitTop(last)) {
    return {action:"hold", message:`Hit the top of your range — do it once more next session to earn a weight increase.`, suggestedWeight: lastWeight};
  }
  return {action:"hold", message:`In range, still building reps. Keep the same weight.`, suggestedWeight: lastWeight};
}

/* ============================================================
   SECTION 5: RECOVERY / FATIGUE ENGINE
   Combines per-muscle-group soreness, days rested, and e1RM
   trend to output train / caution / rest per muscle group.
   ============================================================ */

/**
 * A10: Uses localDaysSince() instead of Date.now() subtraction.
 * R1: Null-guards getCatalogItem() in the session filter.
 * B2: Uses ?? instead of || for soreness (null ≠ 0).
 * B3: Skips e1RM trend comparison if both sessions share a dateISO.
 * @param {string} muscle - one of MUSCLE_GROUPS
 * @returns {{status:"train"|"caution"|"rest", reason:string}}
 */
function getMuscleRecoveryStatus(muscle) {
  const relevantSessions = AppState.sessions
    .filter(s => {
      // R1: null-guard the catalog lookup; also guard muscles array itself
      const it = getCatalogItem(s.exerciseId);
      return s.sets && it && it.muscles && it.muscles.includes(muscle);
    })
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));

  if (relevantSessions.length === 0) return {status:"train", reason:"No history yet — fresh."};

  const last = relevantSessions[0];
  const daysSince = localDaysSince(last.dateISO); // A10: local-timezone fix

  // B2: nullish coalescing — null/undefined soreness → 0 (no signal), not falsy 0
  const soreness = last.soreness ?? 0;

  // e1RM trend across last two sessions on the primary lift for this muscle
  let trendFlat = false;
  if (relevantSessions.length >= 2) {
    // B3: same-dateISO means same workout session — trend comparison is meaningless
    if (relevantSessions[0].dateISO === relevantSessions[1].dateISO) {
      trendFlat = false;
    } else {
      const e1 = relevantSessions[0].sets.reduce((m, s) => Math.max(m, estimate1RM(s.weight, s.reps)), 0);
      const e0 = relevantSessions[1].sets.reduce((m, s) => Math.max(m, estimate1RM(s.weight, s.reps)), 0);
      trendFlat = e1 <= e0;
    }
  }

  if (soreness >= 4 && daysSince < 2) return {status:"rest", reason:`High soreness (${soreness}/5) reported, only ${daysSince}d rest.`};
  if ((soreness >= 3 || trendFlat) && daysSince < 3) return {status:"caution", reason: trendFlat ? "Strength trend flat last 2 sessions — go light or swap." : `Moderate soreness (${soreness}/5).`};
  return {status:"train", reason:"Rested and trending fine."};
}

/** @returns {boolean} true when 3+ muscle groups are simultaneously rest-flagged */
function shouldSuggestFullDeload() {
  const restCount = MUSCLE_GROUPS.filter(m => m !== "conditioning").filter(m => getMuscleRecoveryStatus(m).status === "rest").length;
  return restCount >= 3;
}

/* ============================================================
   C6: STREAK COUNTER
   Consecutive training days ending at today or yesterday.
   Streak only breaks when 2+ days pass without any session.
   ============================================================ */

/**
 * @returns {number} current training streak in days
 */
function getCurrentStreak() {
  try {
    const uniqueDates = [...new Set(AppState.sessions.map(s => s.dateISO))]
      .sort((a, b) => new Date(b) - new Date(a));

    if (uniqueDates.length === 0) return 0;

    const todayISO     = new Date().toISOString().slice(0, 10);
    const yesterdayISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Streak only starts counting if the most recent session is today or yesterday
    if (uniqueDates[0] !== todayISO && uniqueDates[0] !== yesterdayISO) return 0;

    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.round((prev - curr) / 86400000);
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  } catch (err) {
    console.error('getCurrentStreak failed', err);
    return 0;
  }
}

/* ============================================================
   SECTION 6: VOLUME TRACKING (weekly, per muscle group)
   ============================================================ */

/** Beginner-safe volume bands (sets/week) — coarse (low/good/high). */
const VOLUME_BANDS = {low:8, high:20};

function weeklySetsForMuscle(muscle) {
  const weekAgo = Date.now() - 7 * 86400000;
  return AppState.sessions
    .filter(s => s.sets && new Date(s.dateISO).getTime() >= weekAgo)
    .filter(s => { const it = getCatalogItem(s.exerciseId); return it && it.muscles.includes(muscle); })
    .reduce((sum, s) => sum + s.sets.length, 0);
}

function volumeStatus(sets) {
  if (sets < VOLUME_BANDS.low) return "low";
  if (sets > VOLUME_BANDS.high) return "high";
  return "good";
}

/* ============================================================
   SECTION 7: PB TRACKING (auto-derived, never manually entered)
   ============================================================ */

/** @returns {{weight:number, reps:number, e1rm:number, dateISO:string}|null} best-ever e1RM set */
function getPB(catalogId) {
  const sets = AppState.sessions.filter(s => s.exerciseId === catalogId && s.sets)
    .flatMap(s => s.sets.map(set => ({...set, dateISO: s.dateISO})));
  if (sets.length === 0) return null;
  return sets.reduce((best, cur) => {
    const e = estimate1RM(cur.weight, cur.reps);
    return (!best || e > best.e1rm) ? {weight:cur.weight, reps:cur.reps, e1rm:e, dateISO:cur.dateISO} : best;
  }, null);
}

/**
 * Called right after saving a session — checks whether the just-
 * logged sets beat the previous PB (computed BEFORE this session
 * was added, hence the excludeLatest pass).
 */
function checkForNewPB(catalogId, justLoggedSets) {
  const priorSessions = AppState.sessions.filter(s => s.exerciseId === catalogId && s.sets).slice(0, -1);
  const priorBestE1RM = priorSessions.flatMap(s => s.sets).reduce((m, s) => Math.max(m, estimate1RM(s.weight, s.reps)), 0);
  const newBest = justLoggedSets.reduce((m, s) => Math.max(m, estimate1RM(s.weight, s.reps)), 0);
  return newBest > priorBestE1RM && priorSessions.length > 0;
}

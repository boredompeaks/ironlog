/* ============================================================
   SECTION 8: WEEKLY REPORT GENERATOR (.txt dump)
   Plain, copy-paste-friendly text — designed to be pasted
   straight into a separate AI chat for bespoke analysis.
   C7: Raw session log lines now include RPE and notes fields.
   D4: copyReportToClipboard() added for Capacitor compatibility.
   ============================================================ */

/**
 * Builds the full weekly report as a plain string.
 * @returns {string}
 */
function generateWeeklyReport() {
  const p = AppState.profile;
  const weekAgo = Date.now() - 7 * 86400000;
  const weekSessions = AppState.sessions.filter(s => new Date(s.dateISO).getTime() >= weekAgo);
  const lines = [];
  lines.push(`IRONLOG WEEKLY REPORT — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("=".repeat(50));
  lines.push("");
  lines.push("PROFILE SNAPSHOT");
  if (p) {
    lines.push(`Age ${p.age} | ${p.sex} | ${p.heightCm}cm | ${p.weightKg}kg | Goal: ${p.goal} | Training age: ${p.trainingAge}`);
    lines.push(`BMR: ${Math.round(p.bmr)} kcal | TDEE: ${Math.round(p.tdee)} kcal | Calorie target: ${p.calorieTarget} kcal | Protein target: ${p.proteinTarget}g`);
  } else {
    lines.push("No profile — onboarding not yet complete.");
  }
  lines.push("");
  lines.push("BODYWEIGHT TREND (7-day)");
  const bw = AppState.bodyweightLog.slice(-7);
  lines.push(bw.length ? bw.map(b => `${b.dateISO}: ${b.kg}kg`).join(" | ") : "No entries this week.");
  lines.push("");
  lines.push("WEEKLY VOLUME PER MUSCLE GROUP (sets, vs low/good/high band)");
  MUSCLE_GROUPS.filter(m => m !== "conditioning").forEach(m => {
    const sets = weeklySetsForMuscle(m);
    lines.push(`  ${m.padEnd(12)} ${sets} sets — ${volumeStatus(sets)}`);
  });
  lines.push("");
  lines.push("PBs HIT THIS WEEK");
  let anyPB = false;
  fullCatalog().forEach(item => {
    const pb = getPB(item.id);
    if (pb && new Date(pb.dateISO).getTime() >= weekAgo) {
      lines.push(`  ${item.name}: ${pb.weight}kg x ${pb.reps} (est 1RM ${pb.e1rm}kg)`);
      anyPB = true;
    }
  });
  if (!anyPB) lines.push("  None this week.");
  lines.push("");
  lines.push("FLAGS");
  const flags = Object.entries(AppState.injuryFlags).filter(([id, f]) => !f.until || new Date(f.until) >= new Date());
  if (flags.length) flags.forEach(([id, f]) => lines.push(`  ${getCatalogItem(id)?.name || id}: ${f.note || "flagged"}`));
  if (shouldSuggestFullDeload()) lines.push("  Whole-body deload suggested — 3+ muscle groups showing high fatigue.");
  if (!flags.length && !shouldSuggestFullDeload()) lines.push("  None.");
  lines.push("");
  lines.push("RAW SESSION LOG (this week)");
  weekSessions.forEach(s => {
    const item = getCatalogItem(s.exerciseId);
    if (s.sets) {
      // C7: include RPE and notes when present
      const rpeStr  = s.rpe  != null ? ` | RPE: ${s.rpe}/10`  : '';
      const noteStr = s.notes         ? ` | Notes: ${s.notes}` : '';
      lines.push(`  ${s.dateISO} | ${item?.name || s.exerciseId} | ${s.sets.map(x => `${x.weight}kg x${x.reps}`).join(", ")} | soreness next-day: ${s.soreness != null ? s.soreness : "n/a"}${rpeStr}${noteStr}`);
    } else if (s.cardio) {
      lines.push(`  ${s.dateISO} | ${item?.name || s.exerciseId} (cardio) | ${s.cardio.minutes}min, ${s.cardio.distance || "-"}km, level ${s.cardio.level || "-"}`);
    }
  });
  return lines.join("\n");
}

/**
 * A4: Exports the weekly report in the best way the current runtime allows.
 *
 * Priority order:
 *   1. Capacitor runtime detected  → clipboard copy + optional Web Share
 *   2. Web Share API available     → navigator.share() (mobile browser)
 *   3. Browser fallback            → Blob download (desktop / no share support)
 *
 * Always updates AppState.lastWeeklyExport and calls saveState().
 */
async function exportWeeklyReport() {
  const text = generateWeeklyReport();
  const filename = `ironlog_weekly_${new Date().toISOString().slice(0, 10)}.txt`;

  // Always stamp the export date first, regardless of path taken.
  AppState.lastWeeklyExport = new Date().toISOString();
  saveState();

  // ── Path 1: Capacitor runtime ──────────────────────────────────────────
  if (typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform()) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Report copied to clipboard — paste into your AI chat.");
    } catch (clipErr) {
      console.warn("A4: clipboard.writeText failed", clipErr);
    }

    // Also try the Share plugin if installed (Share.share from @capacitor/share)
    try {
      if (typeof window.Capacitor.Plugins !== "undefined" && window.Capacitor.Plugins.Share) {
        await window.Capacitor.Plugins.Share.share({
          title: "IronLog Weekly Report",
          text,
          dialogTitle: "Share your IronLog report"
        });
      } else if (typeof navigator.share === "function") {
        await navigator.share({ title: "IronLog Weekly Report", text });
      }
    } catch (shareErr) {
      if (shareErr.name !== "AbortError") {
        console.warn("A4: share failed", shareErr);
      }
    }
    return;
  }

  // ── Path 2: Web Share (mobile browser without Capacitor) ──────────────
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "IronLog Weekly Report", text });
      toast("Report shared.");
      return;
    } catch (shareErr) {
      if (shareErr.name === "AbortError") { return; }
      console.warn("A4: navigator.share failed, falling back to download", shareErr);
    }
  }

  // ── Path 3: Browser blob download (desktop / fallback) ────────────────
  try {
    const blob = new Blob([text], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Weekly report exported.");
  } catch (dlErr) {
    console.error("A4: download failed", dlErr);
    toast("Export failed — check browser permissions.");
  }
}

/**
 * D4: Copy weekly report to system clipboard (always available fallback).
 * Shown alongside Export button in the Dashboard.
 */
function copyReportToClipboard() {
  try {
    const text = generateWeeklyReport();
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      toast("Clipboard not available on this device.");
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => toast("Report copied to clipboard ✓"))
      .catch(err => {
        console.error("Clipboard write failed", err);
        toast("Clipboard copy failed — try Export instead.");
      });
  } catch (err) {
    console.error("copyReportToClipboard failed", err);
    toast("Could not copy report.");
  }
}

/** Called on every app boot — auto-dumps if 7+ days have passed since the last export. */
function maybeAutoExport() {
  if (!AppState.lastWeeklyExport) { AppState.lastWeeklyExport = new Date().toISOString(); saveState(); return; }
  const daysSince = (Date.now() - new Date(AppState.lastWeeklyExport).getTime()) / 86400000;
  if (daysSince >= 7) exportWeeklyReport();
}

/* ============================================================
   SECTION 10: ONBOARDING SCREEN
   O1-O4: field-level validation error highlights.
   O5: onboardDraft persisted across reloads in sessionStorage.
   ============================================================ */

const _OB_DEFAULTS = {age:null, sex:null, heightCm:null, weightKg:null, activity:null, goal:null, daysPerWeek:null, trainingAge:null};
let onboardDraft = (()=>{
  try {
    const stored = sessionStorage.getItem('ironlog_onboard_draft');
    return stored ? Object.assign({..._OB_DEFAULTS}, JSON.parse(stored)) : {..._OB_DEFAULTS};
  } catch(e) { return {..._OB_DEFAULTS}; }
})();

function renderOnboarding(){
  return `
    <div style="padding:16px;">
      <h1 style="margin-top:0">Welcome to IronLog</h1>
      <p class="sub">Set up your profile to calibrate the engines.</p>
      
      <div class="card tight">
        <div class="field">
          <label>Age</label>
          <input type="number" id="ob_age" placeholder="Years" value="${onboardDraft.age||''}" oninput="onboardDraft.age=this.value">
        </div>
        <div class="field">
          <label>Sex (for BMR)</label>
          <select id="ob_sex" onchange="onboardDraft.sex=this.value">
            <option value="">Select...</option>
            <option value="male" ${onboardDraft.sex==="male"?"selected":""}>Male</option>
            <option value="female" ${onboardDraft.sex==="female"?"selected":""}>Female</option>
          </select>
        </div>
        <div class="field">
          <label>Height (cm)</label>
          <input type="number" id="ob_height" placeholder="cm" value="${onboardDraft.heightCm||''}" oninput="onboardDraft.heightCm=this.value">
        </div>
        <div class="field">
          <label>Weight (kg)</label>
          <input type="number" id="ob_weight" placeholder="kg" value="${onboardDraft.weightKg||''}" oninput="onboardDraft.weightKg=this.value">
        </div>
      </div>
      
      <h3>Activity level (outside gym)</h3>
      <div class="choice-grid">
        ${Object.keys(ACTIVITY_MULTIPLIERS).map(k=>`<div class="choice ${onboardDraft.activity===k?'selected':''}" onclick="selectOb('activity','${k}')">${k.replace("_"," ")}</div>`).join("")}
      </div>
      
      <h3>Goal</h3>
      <div class="choice-grid">
        ${["build_muscle","lose_fat","maintain"].map(k=>`<div class="choice ${onboardDraft.goal===k?'selected':''}" onclick="selectOb('goal','${k}')">${k.replace("_"," ")}</div>`).join("")}
      </div>

      <h3>Training days per week</h3>
      <div class="choice-grid">
        ${[2,3,4,5,6].map(k=>`<div class="choice ${onboardDraft.daysPerWeek===k?'selected':''}" onclick="selectOb('daysPerWeek',${k})">${k} days</div>`).join("")}
      </div>

      <h3>Experience level</h3>
      <div class="choice-grid">
        ${["beginner","intermediate","advanced"].map(k=>`<div class="choice ${onboardDraft.trainingAge===k?'selected':''}" onclick="selectOb('trainingAge','${k}')">${k}</div>`).join("")}
      </div>

      <button class="btn" style="margin-top:24px" onclick="completeOnboarding()">Complete Setup</button>
    </div>`;
}

function selectOb(key, val){
  onboardDraft[key]=val;
  try { sessionStorage.setItem('ironlog_onboard_draft', JSON.stringify(onboardDraft)); } catch(e){}
  render();
}

function completeOnboarding(){
  const ageRaw = document.getElementById("ob_age").value.trim();
  const sexRaw = document.getElementById("ob_sex").value;
  const heightRaw = document.getElementById("ob_height").value.trim();
  const weightRaw = document.getElementById("ob_weight").value.trim();

  const age = parseInt(ageRaw, 10);
  const sex = sexRaw;
  const heightCm = parseFloat(heightRaw);
  const weightKg = parseFloat(weightRaw);

  ["ob_age","ob_sex","ob_height","ob_weight"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove("error");
  });

  const invalidFields = [];

  if(!ageRaw || !Number.isInteger(age) || age < 10 || age > 100){
    const el = document.getElementById("ob_age");
    if(el) el.classList.add("error");
    invalidFields.push("Age (10–100)");
  }
  if(!sex){
    const el = document.getElementById("ob_sex");
    if(el) el.classList.add("error");
    invalidFields.push("Sex");
  }
  if(!heightRaw || isNaN(heightCm) || heightCm < 100 || heightCm > 250){
    const el = document.getElementById("ob_height");
    if(el) el.classList.add("error");
    invalidFields.push("Height (100–250 cm)");
  }
  if(!weightRaw || isNaN(weightKg) || weightKg < 30 || weightKg > 300){
    const el = document.getElementById("ob_weight");
    if(el) el.classList.add("error");
    invalidFields.push("Weight (30–300 kg)");
  }

  if(!onboardDraft.activity) invalidFields.push("Activity level");
  if(!onboardDraft.goal) invalidFields.push("Goal");
  if(!onboardDraft.daysPerWeek) invalidFields.push("Training days");
  if(!onboardDraft.trainingAge) invalidFields.push("Experience level");

  if(invalidFields.length > 0){
    toast("Please fix: " + invalidFields.join(", "));
    return;
  }

  const bmr = calcBMR(sex, weightKg, heightCm, age);
  const tdee = calcTDEE(bmr, onboardDraft.activity);
  AppState.profile = {
    age, sex, heightCm, weightKg,
    activity:onboardDraft.activity, goal:onboardDraft.goal,
    daysPerWeek:onboardDraft.daysPerWeek, trainingAge:onboardDraft.trainingAge,
    bmr, tdee,
    calorieTarget: calcCalorieTarget(tdee, onboardDraft.goal),
    proteinTarget: calcProteinTarget(weightKg, onboardDraft.goal)
  };
  AppState.bodyweightLog.push({dateISO:new Date().toISOString().slice(0,10), kg:weightKg});
  try { sessionStorage.removeItem('ironlog_onboard_draft'); } catch(e){}
  saveState();
  setRoute("today");
}

/* ============================================================
   SECTION 11: TODAY SCREEN
   C6: Streak counter with badge.
   C1: Added manual start Rest Timer button at the top.
   ============================================================ */

function renderToday(){
  if(!AppState.activeSplit) return `
    <div style="padding:16px;">
      ${(function() {
        const streak = getCurrentStreak();
        const badge = streak >= 2 ? `<span class="badge good" style="font-size:13px; padding:3px 10px;">🔥 ${streak} day streak</span>` : '';
        return `<p class="sub" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">${new Date().toDateString()} ${badge}</p>`;
      })()}
      <h1 style="margin-top:0">Today</h1>
      <div class="card" style="text-align:center; padding:40px 16px;">
        <span class="icon" style="font-size:40px">📋</span>
        <h3 style="margin-bottom:8px">No split selected</h3>
        <p class="sub" style="margin-top:0; margin-bottom:20px">Go to the Plans tab to generate a training split.</p>
        <button class="btn" onclick="setRoute('templates')">Go to Plans</button>
      </div>
    </div>`;

  const today = new Date().toISOString().slice(0,10);
  const t = AppState.templates.find(x=>x.id===AppState.activeSplit.templateIds[0]);

  return `
    <div style="padding:16px;">
      ${(function() {
        const streak = getCurrentStreak();
        const badge = streak >= 2 ? `<span class="badge good" style="font-size:13px; padding:3px 10px;">🔥 ${streak} day streak</span>` : '';
        return `<p class="sub" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">${new Date().toDateString()} ${badge}</p>`;
      })()}
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h1 style="margin-top:0">${t?t.name:"Rest Day"}</h1>
        <button class="btn secondary small" onclick="startRestTimer(90)">⏱ 90s Rest</button>
      </div>
      
      <p class="sub" style="margin-top:-10px; margin-bottom:20px">Log your sets as you complete them.</p>

      ${t ? t.exerciseIds.map(eid => renderTodayExerciseRow(eid)).join("") : '<p>Take the day off to recover.</p>'}
      
      <div style="margin-top:30px; display:flex; justify-content:space-between;">
        <button class="btn ghost small" onclick="cycleSplit(-1)">← Prev workout</button>
        <button class="btn secondary small" onclick="cycleSplit(1)">Next workout →</button>
      </div>
    </div>`;
}

function renderTodayExerciseRow(catalogId){
  const item = getCatalogItem(catalogId);
  if(!item) return "";
  const today = new Date().toISOString().slice(0,10);
  const session = AppState.sessions.find(s=>s.exerciseId===catalogId && s.dateISO===today);
  const isCardio = item.loadType==="cardio";
  const doneBadge = session ? `<span class="badge good">Done</span>` : "";
  
  let recoveryBadge = "";
  if(!session && !isCardio){
    // Don't show recovery badge if already flagged as injured
    const flag = AppState.injuryFlags[catalogId];
    const isFlagged = flag && (!flag.until || new Date(flag.until)>=new Date());
    if(isFlagged) {
      recoveryBadge = `<span class="badge bad">Flagged</span>`;
    } else {
      const topMuscle = item.muscles[0];
      const rec = getMuscleRecoveryStatus(topMuscle);
      if(rec.status!=="train") recoveryBadge = `<span class="badge ${rec.status==='caution'?'neutral':'bad'}">${rec.status.toUpperCase()}</span>`;
    }
  }

  return `
    <div class="card tight" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; ${session?'border-color:var(--good)':''}">
      <div>
        <div style="display:flex; gap:8px; align-items:center;">
          <strong style="font-size:16px">${item.name}</strong>
          ${doneBadge}
          ${recoveryBadge}
        </div>
        <p class="muscle-tag">${isCardio ? "Cardio" : item.muscles.join(", ")}</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn ghost" style="padding:8px" onclick="showInfoModal('${catalogId}')">ℹ</button>
        <button class="btn" style="padding:8px 16px" onclick="openLogModal('${catalogId}')">${session?'Edit':'Log'}</button>
      </div>
    </div>`;
}

function cycleSplit(dir){
  const s = AppState.activeSplit; if(!s || s.templateIds.length<2) return;
  const current = s.templateIds.shift();
  if(dir===1) s.templateIds.push(current);
  else s.templateIds.unshift(s.templateIds.pop(), current);
  s.templateIds = [...new Set(s.templateIds)];
  saveState(); render();
}

/* ============================================================
   SECTION 12: LOGGING MODAL
   C2: Quick fill. C3: History detail. C7: Notes + RPE.
   A6: Null-guard on item loadType. A7: Cardio dedup. B2: Soreness.
   ============================================================ */

let logDraft = null;

function openLogModal(catalogId){
  const item = getCatalogItem(catalogId);
  if(!item){ toast("Exercise not found — it may have been deleted."); return; }

  const today = new Date().toISOString().slice(0,10);
  const existing = AppState.sessions.find(s=>s.exerciseId===catalogId && s.dateISO===today);
  
  if(existing){
    logDraft = JSON.parse(JSON.stringify(existing)); // deep clone
    logDraft.catalogId = catalogId;
    logDraft.type = existing.sets ? "strength" : "cardio";
    logDraft.suggestion = getProgressionSuggestion(catalogId);
    if(logDraft.type==="strength"){
      logDraft.hasPrevSession = false;
      logDraft.prevSets = null;
    }
    modalStack.push("log"); render();
    return;
  }

  const suggestion = getProgressionSuggestion(catalogId);
  if(item.loadType==="cardio"){
    logDraft = {catalogId, type:"cardio", minutes:"", distance:"", level:""};
  } else {
    const suggestedWeight = suggestion && suggestion.suggestedWeight ? suggestion.suggestedWeight : "";
    logDraft = {
      catalogId, type:"strength",
      sets:[{weight:suggestedWeight, reps:""},{weight:suggestedWeight, reps:""},{weight:suggestedWeight, reps:""}],
      soreness:null, suggestion,
      hasPrevSession:false, prevSets:null,
      notes:"", rpe:null
    };
    try {
      const prevSession = AppState.sessions
        .filter(s => s.exerciseId === catalogId && s.sets && s.dateISO !== today)
        .sort((a,b)=> new Date(b.dateISO) - new Date(a.dateISO))[0];
      if(prevSession && prevSession.sets && prevSession.sets.length > 0){
        logDraft.hasPrevSession = true;
        logDraft.prevSets = prevSession.sets.map(s => ({weight:s.weight, reps:s.reps}));
      }
    } catch(err){}
  }
  modalStack.push("log"); render();
}

function renderLogModal(){
  const item = getCatalogItem(logDraft.catalogId);
  if(logDraft.type==="cardio"){
    return `
    <div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
      <div class="handle"></div>
      <h2 style="margin-top:0">${item.name}</h2>
      <div class="field"><label>Minutes</label><input type="number" value="${logDraft.minutes}" oninput="logDraft.minutes=this.value"></div>
      <div class="field"><label>Distance (km, optional)</label><input type="number" step="0.1" value="${logDraft.distance||''}" oninput="logDraft.distance=this.value"></div>
      <div class="field"><label>Level/Resistance (optional)</label><input type="number" value="${logDraft.level||''}" oninput="logDraft.level=this.value"></div>
      <button class="btn" onclick="saveCardioLog()">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div></div>`;
  }

  const sugg = logDraft.suggestion;
  const prevWeightLabel = logDraft.hasPrevSession && logDraft.prevSets && logDraft.prevSets[0] ? `${logDraft.prevSets[0].weight}kg` : '';

  return `
  <div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div>
    <h2 style="margin-top:0">${item.name}</h2>
    ${sugg ? `<div class="card tight" style="border-color:var(--accent-dim)"><span class="badge ${sugg.action==='increase'?'good':sugg.action==='deload'?'bad':'neutral'}">${sugg.action}</span><p class="sub" style="margin:6px 0 0">${sugg.message}</p></div>` : ""}

    ${_renderHistoryDetails(logDraft.catalogId)}

    <p class="sub">Target rep range: ${item.repRange ? item.repRange.join("-") : "n/a"}</p>

    ${logDraft.hasPrevSession ? `<div style="margin-bottom:10px"><button class="btn secondary small" onclick="quickFillPrev()">↩ Fill from last session (${prevWeightLabel})</button></div>` : ""}

    <div id="setsContainer">${logDraft.sets.map((s,i) => renderSetRow(s,i)).join("")}</div>
    <button class="btn ghost" onclick="addSetRow()">+ Add set</button>

    <div class="field" style="margin-top:14px"><label>Soreness next day (rate after your last session on this — 1 low, 5 high)</label>
      <div class="stepper">
        <button onclick="adjustSoreness(-1)">-</button>
        <input readonly value="${logDraft.soreness === null ? '—' : logDraft.soreness}" placeholder="Not rated">
        <button onclick="adjustSoreness(1)">+</button>
      </div>
    </div>

    <div class="field">
      <label>RPE — effort level (1 easy → 10 max, optional)</label>
      <div class="stepper">
        <button onclick="adjustRpe(-1)">-</button>
        <input readonly value="${logDraft.rpe !== null ? logDraft.rpe : '—'}">
        <button onclick="adjustRpe(1)">+</button>
      </div>
    </div>

    <div class="field">
      <label>Session notes (optional)</label>
      <textarea rows="2" placeholder="Felt strong, poor sleep, etc."
        style="width:100%; padding:11px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); font-size:14px; resize:vertical; color:var(--text);"
        oninput="logDraft.notes=this.value">${logDraft.notes || ''}</textarea>
    </div>

    <button class="btn" onclick="saveStrengthLog()">Save</button>
    <button class="btn ghost" onclick="closeModal()">Cancel</button>
  </div></div>`;
}

function _renderHistoryDetails(catalogId) {
  try {
    const history = AppState.sessions
      .filter(s => s.exerciseId === catalogId && s.sets)
      .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
      .slice(0, 3);
    if (history.length === 0) return '';
    const rows = history.map(s => {
      const setsStr = s.sets.map(x => `${x.weight}kg×${x.reps}`).join(', ');
      return `<div class="list-item" style="padding:6px 0; font-size:12px;"><span style="color:var(--text-faint)">${s.dateISO}</span><span>${setsStr}</span></div>`;
    }).join('');
    return `
      <details style="margin-bottom:10px;">
        <summary style="font-size:12px; color:var(--text-dim); cursor:pointer; list-style:none; padding:4px 0;">▸ Last ${history.length} session${history.length > 1 ? 's' : ''}</summary>
        <div style="margin-top:4px; border-left:2px solid var(--border); padding-left:10px;">${rows}</div>
      </details>`;
  } catch (err) { return ''; }
}

function renderSetRow(s, i){
  return `
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <div class="field" style="flex:1; margin-bottom:0">
        <label style="font-size:11px">Weight (kg)</label>
        <input type="number" step="0.5" id="log_w_${i}" value="${s.weight}" oninput="updateSet(${i}, 'weight', this.value)">
      </div>
      <div class="field" style="flex:1; margin-bottom:0">
        <label style="font-size:11px">Reps</label>
        <input type="number" id="log_r_${i}" value="${s.reps}" oninput="updateSet(${i}, 'reps', this.value)">
      </div>
      <button class="btn ghost" style="padding:0 12px; align-self:flex-end; height:42px" onclick="removeSetRow(${i})">✕</button>
    </div>`;
}

function updateSet(idx, key, val){ logDraft.sets[idx][key]=val; render(); }
function addSetRow(){ logDraft.sets.push({weight:"", reps:""}); render(); }
function removeSetRow(idx){ logDraft.sets.splice(idx,1); render(); }
function adjustSoreness(d){
  if(d > 0){ logDraft.soreness = logDraft.soreness === null ? 1 : Math.min(5, logDraft.soreness + 1); } 
  else { if(logDraft.soreness === null) return; logDraft.soreness = logDraft.soreness <= 1 ? null : logDraft.soreness - 1; }
  render();
}
function adjustRpe(d){
  if(logDraft.rpe === null){ logDraft.rpe = d > 0 ? 5 : null; } 
  else { logDraft.rpe = Math.max(1, Math.min(10, logDraft.rpe + d)); }
  render();
}
function quickFillPrev() {
  if (!logDraft || !logDraft.prevSets) return;
  logDraft.sets = logDraft.prevSets.map(s => ({ weight: s.weight, reps: s.reps }));
  render();
}

function saveStrengthLog(){
  const sets = logDraft.sets.filter(s=>s.weight!=="" && s.reps!=="").map(s=>({weight:parseFloat(s.weight), reps:parseInt(s.reps,10)}));
  if(sets.length===0){ toast("Enter at least one valid set."); return; }

  if (!logDraft.confirmOutlier) {
    const outlier = isOutlierWeight(logDraft.catalogId, sets);
    if (outlier) {
      logDraft.confirmOutlier = true;
      toast("Weight seems unusual compared to history. Tap Save again to confirm.");
      return;
    }
  }

  const today = new Date().toISOString().slice(0,10);
  const isPB = checkForNewPB(logDraft.catalogId, sets);
  
  const existingIdx = AppState.sessions.findIndex(s=>s.exerciseId===logDraft.catalogId && s.dateISO===today && s.sets);
  const session = {
    id: existingIdx>=0 ? AppState.sessions[existingIdx].id : cryptoId(), 
    dateISO:today, exerciseId:logDraft.catalogId, sets, 
    soreness:logDraft.soreness, 
    templateId: (AppState.templates.find(t=>t.exerciseIds.includes(logDraft.catalogId))||{}).id,
    notes: logDraft.notes || null,
    rpe: (logDraft.rpe !== undefined) ? logDraft.rpe : null
  };
  
  if(existingIdx>=0) AppState.sessions[existingIdx]=session; else AppState.sessions.push(session);
  saveState(); closeModal();
  
  if(isPB){
    const pbItem = getCatalogItem(logDraft.catalogId);
    toast(`New PB on ${pbItem ? pbItem.name : logDraft.catalogId}! 🎉`);
  } else toast("Logged.");
}

function isOutlierWeight(catalogId, sets) {
  const history = AppState.sessions.filter(s => s.exerciseId === catalogId && s.sets);
  if (history.length < 3) return false;
  
  let totalW = 0, count = 0;
  history.forEach(s => s.sets.forEach(x => { totalW += x.weight; count++; }));
  if (count === 0) return false;
  
  const avgWeight = totalW / count;
  const maxLogged = Math.max(...sets.map(s => s.weight));
  const minLogged = Math.min(...sets.map(s => s.weight));
  
  return (maxLogged > avgWeight * 2) || (minLogged < avgWeight * 0.4);
}

function saveCardioLog(){
  if(!logDraft.minutes){ toast("Enter at least minutes."); return; }
  const today = new Date().toISOString().slice(0,10);
  const existingIdx = AppState.sessions.findIndex(s => s.exerciseId === logDraft.catalogId && s.dateISO === today && s.cardio);
  const session = {
    id: existingIdx>=0 ? AppState.sessions[existingIdx].id : cryptoId(),
    dateISO:today, exerciseId:logDraft.catalogId,
    cardio:{minutes:parseFloat(logDraft.minutes), distance:parseFloat(logDraft.distance)||null, level:parseFloat(logDraft.level)||null}
  };
  if(existingIdx>=0) AppState.sessions[existingIdx]=session; else AppState.sessions.push(session);
  saveState(); closeModal(); toast("Cardio logged.");
}

/* ============================================================
   SECTION 13: INFO / SUBSTITUTION MODAL
   A6: Fallback UI. D3: AppState.seenInfoIds.
   ============================================================ */

function showInfoModal(catalogId){
  modalStack.push("info"); logDraft = {infoId:catalogId}; render();
  if (!Array.isArray(AppState.seenInfoIds)) AppState.seenInfoIds = [];
  if (!AppState.seenInfoIds.includes(catalogId)) {
    AppState.seenInfoIds.push(catalogId);
    saveState();
  }
}

function renderInfoModal(){
  const item = getCatalogItem(logDraft.infoId);
  if (!item) {
    return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
      <div class="handle"></div><h2 style="margin-top:0">Exercise not found</h2>
      <p class="sub">This exercise may have been removed from the catalog.</p>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div></div>`;
  }
  return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div>
    <h2 style="margin-top:0">${item.name}</h2>
    <p class="muscle-tag">${item.muscles ? item.muscles.join(" · ") : "—"}</p>
    <p style="margin-top:12px; line-height:1.5">${item.info || "No guidance available for this exercise."}</p>
    <button class="btn secondary" onclick="closeModal()">Got it</button>
  </div></div>`;
}

/* ============================================================
   SECTION 15: TEMPLATES SCREEN
   ============================================================ */

let templateDraft = null;

function renderTemplates(){
  if(templateDraft) return renderTemplateEditor();
  const splits = Object.keys(SPLIT_PRESETS).map(k=>`<option value="${k}" ${AppState.activeSplit&&AppState.activeSplit.type===k?'selected':''}>${SPLIT_PRESETS[k].label}</option>`).join("");
  const activePlanUI = AppState.activeSplit ? `<div class="card tight" style="margin-bottom:24px"><p class="sub" style="margin:0">Active plan: <strong>${SPLIT_PRESETS[AppState.activeSplit.type].label}</strong></p></div>` : "";
  
  return `
    <div style="padding:16px;">
      <h1 style="margin-top:0">Training Plans</h1>
      ${activePlanUI}
      <div class="field">
        <label>Generate a preset plan</label>
        <div style="display:flex; gap:8px;">
          <select id="presetSplitSelect" style="flex:1"><option value="">Select...</option>${splits}</select>
          <button class="btn secondary" style="width:auto; padding:0 16px" onclick="generateSplit()">Go</button>
        </div>
      </div>
      <hr style="margin:24px 0; border:none; border-top:1px solid var(--border)">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="margin:0">Your Templates</h2>
        <button class="btn secondary small" onclick="startNewTemplate()">+ New</button>
      </div>
      ${AppState.templates.map(t=>`
        <div class="card tight list-item" onclick="editTemplate('${t.id}')">
          <strong>${t.name}</strong><span style="color:var(--text-dim); font-size:20px">›</span>
        </div>`).join("")}
      ${AppState.templates.length===0?'<p class="sub">No templates created.</p>':''}
    </div>`;
}

function generateSplit(){
  const type = document.getElementById("presetSplitSelect").value;
  if(!type) return;
  const days = SPLIT_PRESETS[type].days;
  const newTemplateIds = [];
  days.forEach((dayName,i) => {
    const id = cryptoId();
    let ex = [];
    if(type==="full_body") ex = i===0 ? ["leg_press","chest_press","seated_row"] : i===1 ? ["smith_squat","lat_pulldown","shoulder_press_m"] : ["leg_press","pec_deck","cable_row_low"];
    else if(type==="upper_lower") ex = i===0 ? ["chest_press","lat_pulldown","shoulder_press_m","seated_row","cable_bicep","tricep_pushdown"] : ["leg_press","leg_curl","leg_extension","calf_raise_m","ab_crunch_m"];
    else if(type==="ppl") ex = i===0 ? ["chest_press","shoulder_press_m","pec_deck","tricep_pushdown"] : i===1 ? ["lat_pulldown","seated_row","cable_row_low","cable_bicep"] : ["leg_press","leg_curl","leg_extension","calf_raise_m"];
    AppState.templates.push({id, name:dayName, exerciseIds:ex});
    newTemplateIds.push(id);
  });
  AppState.activeSplit = {type, templateIds:newTemplateIds};
  saveState(); render(); toast(`Generated ${type.replace("_"," ")} plan.`);
}

function startNewTemplate(){ templateDraft = {id:cryptoId(), name:"", exerciseIds:[]}; render(); window.scrollTo(0,0); }
function editTemplate(id){ templateDraft = JSON.parse(JSON.stringify(AppState.templates.find(t=>t.id===id))); render(); window.scrollTo(0,0); }

function renderTemplateEditor(){
  const hasExercises = templateDraft.exerciseIds.length>0;
  return `
    <div style="padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0">${AppState.templates.find(t=>t.id===templateDraft.id)?'Edit Template':'New Template'}</h2>
        <button class="btn ghost small" onclick="templateDraft=null;render()">Cancel</button>
      </div>
      <div class="field" style="margin-top:16px;">
        <label>Template Name</label>
        <input type="text" id="tpl_name" value="${templateDraft.name}" placeholder="e.g. Upper Body A" oninput="templateDraft.name=this.value">
      </div>
      <h3>Exercises</h3>
      <div id="tpl_exercises" style="margin-bottom:16px">
        ${templateDraft.exerciseIds.map((eid, idx) => {
          const item = getCatalogItem(eid);
          return `<div class="card tight list-item" style="margin-bottom:8px;">
            <span>${item?item.name:eid}</span>
            <div style="display:flex; gap:4px">
              <button class="btn ghost small" style="padding:0 8px" onclick="moveExerciseInTemplate(${idx}, -1)" ${idx===0?'disabled':''}>↑</button>
              <button class="btn ghost small" style="padding:0 8px" onclick="moveExerciseInTemplate(${idx}, 1)" ${idx===templateDraft.exerciseIds.length-1?'disabled':''}>↓</button>
              <button class="btn ghost small" style="padding:0 8px; color:var(--bad)" onclick="removeExerciseFromTemplate('${eid}')">✕</button>
            </div>
          </div>`;
        }).join("")}
        ${!hasExercises?'<p class="sub">No exercises added yet.</p>':''}
      </div>
      <div class="field" style="margin-top:24px">
        <label>Add Exercise from Catalog</label>
        <div style="display:flex; gap:8px;">
          <select id="tpl_add_ex" style="flex:1">
            <option value="">Select...</option>
            ${fullCatalog().map(c=>`<option value="${c.id}">${c.name} (${c.muscles[0]})</option>`).join("")}
          </select>
          <button class="btn secondary" style="width:auto; padding:0 16px" onclick="addExerciseToTemplate()">Add</button>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:32px;">
        <button class="btn" onclick="saveTemplate()">Save Template</button>
        ${AppState.templates.find(t=>t.id===templateDraft.id)?`<button class="btn danger" onclick="deleteTemplate()">Delete</button>`:''}
      </div>
    </div>`;
}

function moveExerciseInTemplate(idx, dir){
  if(idx+dir < 0 || idx+dir >= templateDraft.exerciseIds.length) return;
  const temp = templateDraft.exerciseIds[idx];
  templateDraft.exerciseIds[idx] = templateDraft.exerciseIds[idx+dir];
  templateDraft.exerciseIds[idx+dir] = temp;
  render();
}

function addExerciseToTemplate(){
  const select = document.getElementById("tpl_add_ex");
  if(select.value && !templateDraft.exerciseIds.includes(select.value)){ templateDraft.exerciseIds.push(select.value); render(); }
}
function removeExerciseFromTemplate(eid){ templateDraft.exerciseIds = templateDraft.exerciseIds.filter(id=>id!==eid); render(); }
function saveTemplate(){
  if(!templateDraft.name){ toast("Name required."); return; }
  const idx = AppState.templates.findIndex(t=>t.id===templateDraft.id);
  if(idx>=0) AppState.templates[idx]=templateDraft; else AppState.templates.push(templateDraft);
  
  if(!AppState.activeSplit){
    AppState.activeSplit = {type:"custom", templateIds:[templateDraft.id]};
  } else if(!AppState.activeSplit.templateIds.includes(templateDraft.id)){
    AppState.activeSplit.templateIds.push(templateDraft.id);
  }
  saveState(); templateDraft=null; render(); toast("Template saved.");
}
function deleteTemplate(){
  AppState.templates = AppState.templates.filter(t=>t.id!==templateDraft.id);
  if(AppState.activeSplit) AppState.activeSplit.templateIds = AppState.activeSplit.templateIds.filter(id=>id!==templateDraft.id);
  saveState(); templateDraft=null; render(); toast("Template deleted.");
}

/* ============================================================
   SECTION 16: CATALOG SCREEN
   A3: promptCustomExercise mapped to modal sheet.
   C4: toggleInjuryFlag mapped to modal sheet.
   ============================================================ */

function renderCatalog(){
  let html = `<div style="padding:16px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
      <h1 style="margin:0">Exercise Catalog</h1>
      <button class="btn secondary small" onclick="promptCustomExercise()">+ Custom</button>
    </div>`;
  MUSCLE_GROUPS.forEach(m => {
    const items = fullCatalog().filter(c=>c.muscles.includes(m));
    if(items.length===0) return;
    html += `<h3>${m.toUpperCase()}</h3>`;
    items.forEach(c => {
      const flag = AppState.injuryFlags[c.id];
      const isFlagged = flag && (!flag.until || new Date(flag.until)>=new Date());
      html += `
      <div class="card tight list-item" style="margin-bottom:8px">
        <div>
          <strong>${c.name}</strong> ${isFlagged?`<span class="badge bad" style="margin-left:4px">Flagged</span>`:''}
          <p class="muscle-tag" style="margin-top:4px">${c.loadType}</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn ghost small" style="padding:0 12px; color:var(--bad)" onclick="toggleInjuryFlag('${c.id}')">${isFlagged?'Unflag':'Flag'}</button>
        </div>
      </div>`;
    });
  });
  html += `</div>`;
  return html;
}

let customExDraft = { name: "", muscle: "", loadType: "plate" };
function promptCustomExercise(){ customExDraft = {name:"", muscle:"", loadType:"plate"}; modalStack.push("customExercise"); render(); }
function saveCustomExercise(){
  const name = customExDraft.name.trim(); if(!name){ toast("Enter an exercise name."); return; }
  const muscle = customExDraft.muscle; if(!MUSCLE_GROUPS.includes(muscle)){ toast("Select a valid muscle group."); return; }
  const loadType = customExDraft.loadType || "plate";
  AppState.customExercises.push({id:"custom_"+cryptoId(), name, muscles:[muscle], loadType, defaultIncrement:2.5, repRange:loadType==="cardio"?null:[8,12], info:"Custom exercise — no preset guidance available."});
  saveState(); closeModal(); toast("Custom exercise added.");
}
function renderCustomExerciseModal(){
  const muscleOptions = MUSCLE_GROUPS.map(m => `<option value="${m}" ${customExDraft.muscle===m?"selected":""}>${m}</option>`).join("");
  const loadOptions = ["pin","plate","fixed","cardio"].map(lt => `<option value="${lt}" ${customExDraft.loadType===lt?"selected":""}>${lt}</option>`).join("");
  return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div><h2 style="margin-top:0">Add custom exercise</h2>
    <div class="field"><label>Exercise / machine name</label><input type="text" id="cex_name" placeholder="e.g. Cable fly" value="${customExDraft.name}" oninput="customExDraft.name=this.value"></div>
    <div class="field"><label>Primary muscle group</label><select id="cex_muscle" onchange="customExDraft.muscle=this.value"><option value="">Select...</option>${muscleOptions}</select></div>
    <div class="field"><label>Load type</label><select id="cex_loadtype" onchange="customExDraft.loadType=this.value">${loadOptions}</select></div>
    <button class="btn" onclick="saveCustomExercise()">Add exercise</button>
    <button class="btn ghost" onclick="closeModal()">Cancel</button>
  </div></div>`;
}

function toggleInjuryFlag(id) {
  try {
    const flag = AppState.injuryFlags[id];
    const flagged = flag && (!flag.until || new Date(flag.until) >= new Date());
    if (flagged) { delete AppState.injuryFlags[id]; saveState(); render(); }
    else { logDraft = { injuryFlagId: id }; modalStack.push('injuryFlag'); render(); }
  } catch(err) { toast('Could not update injury flag.'); }
}
function renderInjuryFlagModal() {
  const id = logDraft.injuryFlagId; const item = getCatalogItem(id); const todayISO = new Date().toISOString().slice(0, 10);
  return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div><h2 style="margin-top:0">Flag injury — ${item ? item.name : id}</h2>
    <p class="sub">This will mark the exercise as flagged and skip recovery suggestions until the rest date passes.</p>
    <div class="field"><label>Note</label><input type="text" id="injuryNoteInput" value="Pain/discomfort" placeholder="Pain/discomfort"></div>
    <div class="field"><label>Rest until (optional — leave blank to flag indefinitely)</label><input type="date" id="injuryUntilInput" min="${todayISO}"></div>
    <button class="btn" onclick="saveInjuryFlag()">Save flag</button>
    <button class="btn ghost" onclick="closeModal()">Cancel</button>
  </div></div>`;
}
function saveInjuryFlag() {
  const id = logDraft.injuryFlagId;
  const noteEl = document.getElementById('injuryNoteInput');
  const untilEl = document.getElementById('injuryUntilInput');
  AppState.injuryFlags[id] = { until: (untilEl && untilEl.value) || null, note: (noteEl && noteEl.value.trim()) || 'Pain/discomfort' };
  saveState(); closeModal(); toast('Exercise flagged.');
}

/* ============================================================
   SECTION 17: DASHBOARD SCREEN
   C8: Bodyweight Sparkline
   ============================================================ */

function buildSparklineSVG(data, width, height) {
  try {
    if (!data || data.length < 2) return '';
    const vals = data.map(d => d.kg); const min = Math.min(...vals); const max = Math.max(...vals);
    const range = max - min || 1; const pad = 4;
    const points = vals.map((v, i) => { const x = (i / (vals.length - 1)) * width; const y = pad + ((1 - (v - min) / range) * (height - pad * 2)); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
    const lastX = width; const lastY = pad + ((1 - (vals[vals.length - 1] - min) / range) * (height - pad * 2));
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:inline-block; vertical-align:middle; overflow:visible;"><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="var(--accent)"/></svg>`;
  } catch (err) { return ''; }
}

function renderDashboard(){
  const p = AppState.profile;
  const bw = AppState.bodyweightLog.slice(-7);
  const avgBw = bw.length ? Math.round((bw.reduce((s,b)=>s+b.kg,0)/bw.length)*10)/10 : p.weightKg;
  
  const sparkData = AppState.bodyweightLog.slice(-14);
  const sparkSVG = buildSparklineSVG(sparkData, 200, 40);

  return `
    <div style="padding:16px;">
      <h1 style="margin-top:0">Dashboard</h1>
      
      <h2 style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">Bodyweight (7-day avg: ${avgBw}kg) ${sparkSVG}</h2>
      <div class="card tight" style="display:flex; gap:8px">
        <input type="number" id="quick_bw" placeholder="Log today's weight (kg)" style="flex:1" step="0.1">
        <button class="btn" style="width:auto; padding:0 20px" onclick="logBodyweight()">Log</button>
      </div>

      <h2>Metabolic targets (Est)</h2>
      <div class="card">
        <div class="grid2">
          <div><p class="sub" style="margin:0">Calorie target</p><p style="margin:4px 0 0; font-size:20px; font-weight:800">${p.calorieTarget}</p></div>
          <div><p class="sub" style="margin:0">Protein target</p><p style="margin:4px 0 0; font-size:20px; font-weight:800">${p.proteinTarget}g</p></div>
          <div><p class="sub" style="margin:0">BMR</p><p style="margin:4px 0 0; font-size:20px; font-weight:800">${Math.round(p.bmr)}</p></div>
          <div><p class="sub" style="margin:0">TDEE</p><p style="margin:4px 0 0; font-size:20px; font-weight:800">${Math.round(p.tdee)}</p></div>
        </div>
      </div>

      <h2>Weekly report</h2>
      <div class="card">
        <p class="sub">Last export: ${AppState.lastWeeklyExport ? new Date(AppState.lastWeeklyExport).toDateString() : "never"}</p>
        <div class="grid2" style="gap:8px;">
          <button class="btn secondary" onclick="exportWeeklyReport()">Export now (.txt)</button>
          <button class="btn secondary" onclick="copyReportToClipboard()">Copy report (clipboard)</button>
        </div>
      </div>
    </div>`;
}

function logBodyweight(){
  const w = parseFloat(document.getElementById("quick_bw").value);
  if(!w) return;
  AppState.bodyweightLog.push({dateISO:new Date().toISOString().slice(0,10), kg:w});
  AppState.profile.weightKg = w;
  saveState(); render(); toast("Bodyweight logged.");
}

/* ============================================================
   SECTION 18: PROFILE / SETTINGS SCREEN
   A3: Modals for editProfile, resetConfirm.
   A8: Full clean reset logic (in confirmResetApp).
   D1, D2: Backup import validation & backup export filename.
   ============================================================ */

function renderProfile(){
  const p = AppState.profile;
  return `
    <div style="padding:16px;">
      <h1 style="margin-top:0">Settings</h1>
      
      <h2>Basic stats</h2>
      <div class="card tight list-item">
        <p style="margin:0">Age ${p.age} · ${p.sex} · ${p.heightCm}cm</p>
        <button class="btn ghost small" onclick="editProfilePrompt()">Edit weight</button>
      </div>

      <h2>Data management</h2>
      <div class="card tight list-item">
        <p style="margin:0">Export full backup (.json)</p>
        <button class="btn ghost small" onclick="exportBackup()">Export</button>
      </div>
      <div class="card tight list-item">
        <p style="margin:0">Import full backup</p>
        <div style="position:relative; overflow:hidden; display:inline-block">
          <button class="btn ghost small">Import</button>
          <input type="file" style="position:absolute; left:0; top:0; opacity:0; cursor:pointer" onchange="importBackup(event)" accept=".json">
        </div>
      </div>
      
      <div class="card tight list-item" style="border-color:var(--bad); margin-top:24px">
        <p style="margin:0; color:var(--bad); font-weight:bold">Danger Zone</p>
        <button class="btn danger small" onclick="resetApp()">Factory Reset</button>
      </div>
    </div>`;
}

let editProfileDraft = { weightKg: "" };
function editProfilePrompt(){ editProfileDraft = { weightKg: AppState.profile.weightKg }; modalStack.push("editProfile"); render(); }
function saveEditProfile(){
  const w = parseFloat(editProfileDraft.weightKg); if(!w || w<=0 || w>500){ toast("Enter a valid weight (kg)."); return; }
  AppState.profile.weightKg = w;
  AppState.profile.bmr = calcBMR(AppState.profile.sex, w, AppState.profile.heightCm, AppState.profile.age);
  AppState.profile.tdee = calcTDEE(AppState.profile.bmr, AppState.profile.activity);
  AppState.profile.calorieTarget = calcCalorieTarget(AppState.profile.tdee, AppState.profile.goal);
  AppState.profile.proteinTarget = calcProteinTarget(w, AppState.profile.goal);
  saveState(); closeModal(); toast("Profile updated.");
}
function renderEditProfileModal(){
  return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div><h2 style="margin-top:0">Edit basic stats</h2>
    <div class="field"><label>Current weight (kg)</label><input type="number" id="ep_weight" placeholder="${AppState.profile.weightKg}" value="${editProfileDraft.weightKg}" oninput="editProfileDraft.weightKg=this.value"></div>
    <button class="btn" onclick="saveEditProfile()">Save</button>
    <button class="btn ghost" onclick="closeModal()">Cancel</button>
  </div></div>`;
}

function resetApp(){ modalStack.push("resetConfirm"); render(); }
function confirmResetApp(){
  try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  try { localStorage.removeItem(STORAGE_KEY+"_tmp"); } catch(e){}
  try { localStorage.removeItem("ironlog_seen_info"); } catch(e){}
  try { sessionStorage.removeItem('ironlog_onboard_draft'); } catch(e){}
  AppState = defaultState(); onboardDraft = {..._OB_DEFAULTS}; modalStack = []; setRoute("today"); toast("All data cleared.");
}
function renderResetConfirmModal(){
  return `<div class="modal-backdrop" onclick="closeModalIfBackdrop(event)"><div class="modal-sheet">
    <div class="handle"></div><h2 style="margin-top:0; color:var(--bad)">Reset all data?</h2>
    <p class="danger-msg" style="font-size:14px; color:var(--text-dim); margin:8px 0 18px; line-height:1.5">This permanently deletes every session, template, profile, and custom exercise. There is no undo.</p>
    <button class="btn danger" onclick="confirmResetApp()">Yes, delete everything</button>
    <button class="btn secondary" style="margin-top:8px" onclick="closeModal()">Cancel — keep my data</button>
  </div></div>`;
}

function exportBackup(){
  const blob = new Blob([JSON.stringify(AppState, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`ironlog_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function importBackup(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{ 
      const parsed = JSON.parse(e.target.result);
      const candidate = validateState(Object.assign(defaultState(), parsed));
      const hasIronLogShape = (candidate.profile !== null || (Array.isArray(candidate.sessions) && candidate.sessions.length > 0) || (Array.isArray(candidate.templates) && candidate.templates.length > 0));
      if(!hasIronLogShape){ toast("This doesn't look like an IronLog backup — import cancelled."); return; }
      AppState = candidate; saveState(); render(); toast("Backup imported successfully."); 
    }
    catch(err){ console.error("importBackup parse error:", err); toast("Invalid backup file — could not parse JSON."); }
  };
  reader.readAsText(file);
}

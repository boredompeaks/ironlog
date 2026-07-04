/* ============================================================
   SECTION 9: UI STATE / ROUTER
   Minimal hand-rolled SPA: one `route` string, one `render()`
   that swaps innerHTML.
   U1: Focus-preservation added to render() via capture/restore.
   C1: Rest timer global UI overlays included.
   ============================================================ */

let route = "today";
let modalStack = [];

function setRoute(r){ route = r; render(); }

function toast(msg){
  const el = document.createElement("div");
  el.className="toast"; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}

function cryptoId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function closeModal(){ modalStack.pop(); render(); }
function closeModalIfBackdrop(e){ if(e.target.classList.contains("modal-backdrop")) closeModal(); }

/* ------------------------------------------------------------
   U1: FOCUS PRESERVATION HELPERS
   Prevents the soft keyboard from dismissing during an innerHTML
   swap when editing a template or input field inline.
   ------------------------------------------------------------ */

function captureFocus(){
  try {
    const el = document.activeElement;
    if(!el || !el.id || !["INPUT","TEXTAREA","SELECT"].includes(el.tagName)) return null;
    return {
      id: el.id,
      value: el.value,
      start: typeof el.selectionStart === "number" ? el.selectionStart : null,
      end:   typeof el.selectionEnd   === "number" ? el.selectionEnd   : null
    };
  } catch(e) {
    return null;
  }
}

function restoreFocus(saved){
  if(!saved) return;
  try {
    const el = document.getElementById(saved.id);
    if(!el) return;
    if(el.value !== saved.value) el.value = saved.value;
    el.focus({ preventScroll: true });
    if(saved.start !== null && typeof el.setSelectionRange === "function"){
      el.setSelectionRange(saved.start, saved.end);
    }
  } catch(e) {}
}

/** Central render dispatcher — call after every state mutation. */
function render(){
  const screen = document.getElementById("screen");
  const tabbar = document.getElementById("tabbar");

  // U1: Capture focus BEFORE any innerHTML replacement
  const focusSaved = captureFocus();

  if(!AppState.profile){
    tabbar.style.display="none";
    screen.innerHTML = renderOnboarding();
    document.getElementById("app").querySelector(".screen").style.paddingBottom="16px";
    restoreFocus(focusSaved);
    return;
  }

  tabbar.style.display="flex";
  document.getElementById("app").querySelector(".screen").style.paddingBottom="90px";
  tabbar.innerHTML = renderTabbar();

  if(route==="today") screen.innerHTML = renderToday();
  else if(route==="dashboard") screen.innerHTML = renderDashboard();
  else if(route==="templates") screen.innerHTML = renderTemplates();
  else if(route==="catalog") screen.innerHTML = renderCatalog();
  else if(route==="profile") screen.innerHTML = renderProfile();

  // U1: Restore focus AFTER screen innerHTML replacement
  restoreFocus(focusSaved);

  renderModals();
}

function renderTabbar(){
  const tabs = [["today","Today","🏋"],["dashboard","Stats","📊"],["templates","Plans","📋"],["catalog","Machines","🗂"],["profile","Profile","⚙"]];
  return tabs.map(([id,label,icon])=>`
    <div class="tab ${route===id?'active':''}" onclick="setRoute('${id}')">
      <span class="icon">${icon}</span>${label}
    </div>`).join("");
}

/* ------------------------------------------------------------
   MODAL DISPATCH
   A3, C4: Updated to handle customExercise, editProfile, resetConfirm, injuryFlag
   ------------------------------------------------------------ */

function renderModals(){
  const container = document.getElementById("modalRoot") || (()=>{const d=document.createElement("div"); d.id="modalRoot"; document.body.appendChild(d); return d;})();
  const top = modalStack[modalStack.length-1];
  let html = "";
  if      (top === "log")            html = renderLogModal();
  else if (top === "info")           html = renderInfoModal();
  else if (top === "customExercise") html = renderCustomExerciseModal();
  else if (top === "editProfile")    html = renderEditProfileModal();
  else if (top === "resetConfirm")   html = renderResetConfirmModal();
  else if (top === "injuryFlag")     html = renderInjuryFlagModal();
  container.innerHTML = html;
}

/* ------------------------------------------------------------
   C1: REST TIMER
   Manual rest timer overlay.
   ------------------------------------------------------------ */

let restTimer = { active: false, seconds: 0, intervalId: null };

function startRestTimer(seconds) {
  try {
    stopRestTimer(); // clear any prior timer first
    restTimer.active = true;
    restTimer.seconds = seconds;
    _renderRestTimerBarDOM(); // show immediately
    restTimer.intervalId = setInterval(function () {
      try {
        restTimer.seconds -= 1;
        if (restTimer.seconds <= 0) {
          stopRestTimer();
          try { navigator.vibrate && navigator.vibrate(400); } catch(e) {}
          toast('Rest done! 💪');
        } else {
          _renderRestTimerBarDOM();
        }
      } catch (err) {
        console.error('Rest timer tick error', err);
        stopRestTimer();
      }
    }, 1000);
  } catch (err) {
    console.error('startRestTimer failed', err);
  }
}

function stopRestTimer() {
  try {
    if (restTimer.intervalId) {
      clearInterval(restTimer.intervalId);
      restTimer.intervalId = null;
    }
    restTimer.active = false;
    restTimer.seconds = 0;
    const el = document.getElementById('restTimerBar');
    if (el) el.remove();
  } catch (err) {
    console.error('stopRestTimer failed', err);
  }
}

function _fmtRestTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function _renderRestTimerBarDOM() {
  try {
    let el = document.getElementById('restTimerBar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'restTimerBar';
      el.className = 'rest-timer-bar';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <span>⏱ ${_fmtRestTime(restTimer.seconds)} rest</span>
      <button class="dismiss" onclick="stopRestTimer()" title="Dismiss">✕</button>
    `;
  } catch (err) {
    console.error('_renderRestTimerBarDOM failed', err);
  }
}

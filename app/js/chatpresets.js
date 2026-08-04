/* ══════════════════════════════════════════════════════════════════════════════
   chatpresets.js — Ausklapp-Schublade für die Chat-Schnellsprüche
   ──────────────────────────────────────────────────────────────────────────────
   Hintergrund: Nach dem Kauf des 🚀 Sprüche-Boosters sind alle 8 Packs frei.
   PACK_PRESETS liefert dann 24 Chips, zusammen mit den 6 statischen Presets
   30 Stück. Die .messages-input-bar (flex-shrink:0) hat dadurch die komplette
   Höhe des Chat-Views belegt und den Nachrichtenverlauf auf 0 px gequetscht.

   Dieses Modul wird NACH app.js geladen und ist rein additiv:
   • es ändert app.js nicht,
   • es umschließt renderPackPresets() nur, statt sie zu ersetzen,
   • bei einem Fehler läuft die ursprüngliche Funktion trotzdem durch.

   Das eigentliche Höhen-Problem ist bereits in css/chat.css gedeckelt — dieses
   JS liefert nur den Komfort (Ein-/Ausklappen, Zähler, Auto-Schließen).
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LS_KEY = 'cc_presets_open';   // pro Gerät gemerkt, Standard: eingeklappt
  var wired  = false;

  function els() {
    return {
      drawer: document.getElementById('presets-drawer'),
      btn:    document.getElementById('btn-presets-toggle'),
      caret:  document.getElementById('presets-caret'),
      count:  document.getElementById('presets-count')
    };
  }

  function setOpen(open, persist) {
    try {
      var e = els();
      if (!e.drawer || !e.btn) return;
      e.drawer.classList.toggle('hidden', !open);
      e.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (e.caret) e.caret.textContent = open ? '▴' : '▾';
      if (open) e.drawer.scrollTop = 0;
      if (persist !== false) {
        try { localStorage.setItem(LS_KEY, open ? '1' : '0'); } catch (err) {}
      }
    } catch (err) { console.warn('Presets-Schublade:', err); }
  }

  function updateCount() {
    try {
      var e = els();
      if (!e.count || !e.drawer) return;
      e.count.textContent = e.drawer.querySelectorAll('.preset-btn').length;
    } catch (err) {}
  }

  function init() {
    if (wired) return;
    var e = els();
    if (!e.drawer || !e.btn) return;   // Chat-View (noch) nicht im DOM
    wired = true;

    e.btn.addEventListener('click', function () {
      setOpen(e.drawer.classList.contains('hidden'), true);
    });

    // Nach dem Absenden eines Spruchs zuklappen → Verlauf sofort wieder sichtbar.
    // Der eigentliche Versand hängt an den Buttons selbst (app.js bzw.
    // renderPackPresets) und läuft vor diesem Bubble-Handler.
    e.drawer.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('.preset-btn')) setOpen(false, true);
    });

    var open = false;
    try { open = localStorage.getItem(LS_KEY) === '1'; } catch (err) {}
    setOpen(open, false);
    updateCount();
  }

  // renderPackPresets umschließen: Original läuft unverändert, danach Zähler
  // aktualisieren. Wird sowohl von switchView('nachrichten') als auch nach dem
  // Pack-/Booster-Kauf in imperium.js aufgerufen.
  function wrapRender() {
    var orig = window.renderPackPresets;
    if (typeof orig !== 'function' || orig.__ccWrapped) return;
    var wrapped = function (member) {
      try { orig.apply(this, arguments); }
      catch (err) { console.warn('renderPackPresets:', err); }
      init();
      updateCount();
    };
    wrapped.__ccWrapped = true;
    window.renderPackPresets = wrapped;
  }

  function boot() { wrapRender(); init(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
/* ECAE IT Help kiosk shell: full screen, idle reset, back-button trap and staff exit PIN.
   A web page cannot block the Android Home or Recents buttons by itself. Pair this with
   screen pinning, a kiosk browser or MDM lock task mode (see SETUP-GUIDE). */
(function () {
  'use strict';

  var C = window.KIOSK_CONFIG || {};
  var PIN = C.pin || {};
  var PAGE_PATTERN = /^[A-Za-z0-9_-]+\.html$/;
  var HOME = 'home.html';

  var $ = function (id) { return document.getElementById(id); };
  var frame = $('app');
  var startScreen = $('startScreen');
  var idleModal = $('idleModal');
  var pinModal = $('pinModal');
  var adminBar = $('adminBar');

  var unlocked = false;
  var relockAt = 0;
  var lastActivity = Date.now();
  var dirty = false;          // true once a student has used the kiosk since the last reset
  var idleWarningUntil = 0;
  var pinEntry = '';
  var pinOpenedAt = 0;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }

  // ---------- App frame ----------
  function startPage() {
    var p = new URLSearchParams(location.search).get('p');
    return (p && PAGE_PATTERN.test(p) && p !== 'index.html') ? p : HOME;
  }

  // Replacing the frame element (instead of changing src) avoids adding browser history entries.
  function loadFrame(page) {
    var fresh = frame.cloneNode(false);
    fresh.src = page;
    frame.parentNode.replaceChild(fresh, frame);
    frame = fresh;
  }

  function resetKiosk() {
    hide(idleModal);
    closePin();
    store('language', C.defaultLanguage === 'ar' ? 'ar' : 'en');
    loadFrame(HOME);
    dirty = false;
    lastActivity = Date.now();
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  }

  // ---------- Full screen ----------
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() {
    var el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
  }
  function enterFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(function () { /* refused, the start screen stays */ });
    } catch (e) { /* ignore */ }
  }
  function exitFullscreen() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn && fsElement()) { try { var p = fn.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
  }
  function refreshStartScreen() {
    var need = C.requireFullscreen !== false && fsSupported() && !fsElement() && !unlocked;
    startScreen.hidden = !need;
  }

  startScreen.addEventListener('click', function () {
    enterFullscreen();
    armBackTrap();
    requestWakeLock();
    markActivity();
  });
  document.addEventListener('fullscreenchange', refreshStartScreen);
  document.addEventListener('webkitfullscreenchange', refreshStartScreen);

  // ---------- Back button trap ----------
  // Chrome ignores history entries added without a user gesture, so the trap is armed on a tap.
  var trapArmed = false;
  function armBackTrap() {
    if (trapArmed || unlocked || !history.pushState) return;
    history.pushState({ kiosk: true }, '', location.href);
    trapArmed = true;
  }
  window.addEventListener('popstate', function () {
    trapArmed = false;
    if (unlocked) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      // No gesture right now: re-arm on the next tap.
      return;
    }
    armBackTrap();
  });

  // ---------- Leave confirmation and wake lock ----------
  window.addEventListener('beforeunload', function (e) {
    if (unlocked || C.confirmBeforeLeaving === false) return;
    e.preventDefault();
    e.returnValue = '';
  });

  var wakeLock = null;
  function requestWakeLock() {
    if (C.keepScreenOn === false || !('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* not allowed here */ });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { requestWakeLock(); refreshStartScreen(); }
  });

  // ---------- Activity and idle reset ----------
  function markActivity() {
    lastActivity = Date.now();
    dirty = true;
    if (!idleModal.hidden) hide(idleModal);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || !event.data || typeof event.data.kiosk !== 'string') return;
    switch (event.data.kiosk) {
      case 'activity':
        markActivity();
        if (navigator.userActivation && navigator.userActivation.isActive) armBackTrap();
        break;
      case 'exit':
        openPin();
        break;
      case 'page':
        if (event.data.page && event.data.page !== HOME) dirty = true;
        break;
    }
  });
  ['pointerdown', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function () { lastActivity = Date.now(); if (!pinModal.hidden) pinOpenedAt = Date.now(); }, true);
  });

  setInterval(function () {
    var now = Date.now();

    if (unlocked) {
      var left = Math.max(0, Math.ceil((relockAt - now) / 1000));
      $('relockCount').textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      if (left === 0) lock();
      return;
    }

    if (!pinModal.hidden && now - pinOpenedAt > 30000) closePin();

    if (!dirty) return;
    var idle = (now - lastActivity) / 1000;
    var limit = C.idleSeconds || 120;
    var warn = C.idleWarningSeconds || 15;

    if (idle >= limit && idleModal.hidden) {
      idleWarningUntil = now + warn * 1000;
      show(idleModal);
    }
    if (!idleModal.hidden) {
      var remain = Math.max(0, Math.ceil((idleWarningUntil - now) / 1000));
      $('idleCount').textContent = remain;
      $('idleCountAr').textContent = remain;
      if (remain === 0) resetKiosk();
    }
  }, 500);

  $('idleStay').addEventListener('click', markActivity);

  // ---------- Staff PIN ----------
  var pinLength = PIN.length || 6;

  function drawDots() {
    var html = '';
    for (var i = 0; i < pinLength; i++) html += '<span class="' + (i < pinEntry.length ? 'on' : '') + '"></span>';
    $('pinDots').innerHTML = html;
  }

  function lockoutLeft() {
    var until = parseInt(store('kioskPinLockUntil') || '0', 10);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  function setPinStatus(text, isError) {
    var el = $('pinStatus');
    el.textContent = text;
    el.className = 'pin-status' + (isError ? ' error' : '');
  }

  function openPin() {
    if (unlocked) return;
    pinEntry = '';
    drawDots();
    var wait = lockoutLeft();
    setPinStatus(wait ? 'Too many attempts. Try again in ' + wait + ' seconds.' : '', !!wait);
    pinOpenedAt = Date.now();
    show(pinModal);
  }

  function closePin() {
    pinEntry = '';
    hide(pinModal);
  }

  function checkPin() {
    var entry = pinEntry;
    pinEntry = '';
    var ok = !!(PIN.hash && PIN.salt) &&
      window.KioskPin.safeEqual(window.KioskPin.pinHash(entry, PIN.salt, PIN.iterations || 20000), PIN.hash);

    if (ok) {
      store('kioskPinFails', null);
      closePin();
      unlock();
      return;
    }

    var fails = parseInt(store('kioskPinFails') || '0', 10) + 1;
    var max = C.maxPinAttempts || 5;
    if (fails >= max) {
      store('kioskPinFails', null);
      store('kioskPinLockUntil', String(Date.now() + (C.lockoutSeconds || 60) * 1000));
      setPinStatus('Too many attempts. Try again in ' + (C.lockoutSeconds || 60) + ' seconds.', true);
    } else {
      store('kioskPinFails', String(fails));
      setPinStatus('Wrong PIN. ' + (max - fails) + ' attempt' + (max - fails === 1 ? '' : 's') + ' left.', true);
    }
    var box = pinModal.querySelector('.pin-modal');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    drawDots();
  }

  $('pinPad').addEventListener('click', function (e) {
    var key = e.target.closest('button') && e.target.closest('button').getAttribute('data-key');
    if (!key) return;
    pinOpenedAt = Date.now();
    var wait = lockoutLeft();
    if (wait) { setPinStatus('Too many attempts. Try again in ' + wait + ' seconds.', true); return; }
    if (key === 'clear') pinEntry = '';
    else if (key === 'back') pinEntry = pinEntry.slice(0, -1);
    else if (pinEntry.length < pinLength) pinEntry += key;
    setPinStatus('', false);
    drawDots();
    if (pinEntry.length === pinLength) setTimeout(checkPin, 120);
  });
  $('pinCancel').addEventListener('click', closePin);

  // ---------- Unlocked (staff) mode ----------
  function unlock() {
    unlocked = true;
    relockAt = Date.now() + (C.relockMinutes || 5) * 60000;
    hide(idleModal);
    startScreen.hidden = true;
    adminBar.hidden = false;
    document.body.classList.add('unlocked');
    $('adminFullyExit').hidden = !(window.fully && typeof window.fully.exit === 'function');
    exitFullscreen();
    // Inside Fully Kiosk Browser with the JavaScript interface on, also release its kiosk lock.
    try { if (window.fully && typeof window.fully.unlockKiosk === 'function') window.fully.unlockKiosk(); } catch (e) { /* ignore */ }
  }

  function lock() {
    unlocked = false;
    adminBar.hidden = true;
    document.body.classList.remove('unlocked');
    try { if (window.fully && typeof window.fully.lockKiosk === 'function') window.fully.lockKiosk(); } catch (e) { /* ignore */ }
    resetKiosk();
    refreshStartScreen();
  }

  $('adminRelock').addEventListener('click', function () { lock(); enterFullscreen(); armBackTrap(); });
  $('adminReload').addEventListener('click', function () { location.replace(location.pathname); });
  $('adminFullyExit').addEventListener('click', function () {
    try { window.fully.exit(); } catch (e) { /* ignore */ }
  });

  // ---------- Shell-level guards ----------
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
  document.addEventListener('selectstart', function (e) { e.preventDefault(); }, true);
  try { window.open = function () { return null; }; } catch (e) { /* ignore */ }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  // ---------- Start ----------
  loadFrame(startPage());
  if (history.replaceState && location.search) history.replaceState(null, '', location.pathname);
  refreshStartScreen();
  requestWakeLock();
})();

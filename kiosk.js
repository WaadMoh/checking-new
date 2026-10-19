/* ECAE IT Help kiosk layer for content pages (home.html and every guide page).
   - Keeps every page inside the kiosk shell (index.html).
   - Turns web addresses into QR codes; nothing on screen opens another site, tab or app.
   - Blocks pop-ups, long-press menus, text selection and image dragging.
   - Adds tap-to-enlarge screenshots, Arabic step counters and an always-visible Home button. */
(function () {
  'use strict';

  var PAGE_PATTERN = /^[A-Za-z0-9_-]+\.html$/;
  var page = (location.pathname.split('/').pop() || 'home.html');

  // 1. Always run inside the shell, so full screen, idle reset and the exit PIN stay in force.
  if (window.parent === window) {
    location.replace('index.html' + (page !== 'home.html' && PAGE_PATTERN.test(page) ? '?p=' + encodeURIComponent(page) : ''));
    return;
  }

  var TEXT = {
    en: {
      home: 'Home',
      scan: 'Scan with your phone camera to open',
      scanMail: 'Scan to write an email from your phone',
      scanTel: 'Scan to call from your phone',
      enlarge: 'Tap to enlarge',
      close: 'Close',
      staff: 'Staff'
    },
    ar: {
      home: 'الرئيسية',
      scan: 'امسح الرمز بكاميرا هاتفك لفتح الرابط',
      scanMail: 'امسح الرمز لكتابة بريد إلكتروني من هاتفك',
      scanTel: 'امسح الرمز للاتصال من هاتفك',
      enlarge: 'اضغط للتكبير',
      close: 'إغلاق',
      staff: 'الموظفون'
    }
  };

  function lang() {
    return (document.documentElement.lang || 'en').slice(0, 2) === 'ar' ? 'ar' : 'en';
  }

  function t(key) {
    return (TEXT[lang()] || TEXT.en)[key] || TEXT.en[key] || '';
  }

  function tellShell(action, extra) {
    var msg = { kiosk: action };
    if (extra) for (var k in extra) msg[k] = extra[k];
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* shell not reachable */ }
  }

  // 2. No pop-ups, new windows or navigation to anything outside this app.
  try { window.open = function () { return null; }; } catch (e) { /* read-only in some browsers */ }

  function go(target) {
    if (!PAGE_PATTERN.test(target) || target === 'index.html') return;
    location.replace(target);
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest ? event.target.closest('a, [data-nav], [data-kiosk-exit]') : null;
    if (!el) return;

    if (el.hasAttribute('data-kiosk-exit')) {
      event.preventDefault();
      tellShell('exit');
      return;
    }
    if (el.tagName === 'A') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    go(el.getAttribute('data-nav'));
  }, true);

  document.addEventListener('auxclick', function (e) { e.preventDefault(); }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
  document.addEventListener('selectstart', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
  }, true);
  document.addEventListener('keydown', function (e) {
    // Block browser shortcuts from a USB or Bluetooth keyboard (new tab, print, save, view source).
    if ((e.ctrlKey || e.metaKey) && /^[a-z]$/i.test(e.key) && !/^[acvxz]$/i.test(e.key)) e.preventDefault();
  }, true);

  // Any anchor that appears later (for example from a translation) is made inert.
  function neutraliseAnchors(root) {
    var anchors = (root.querySelectorAll ? root.querySelectorAll('a[href]') : []);
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (PAGE_PATTERN.test(href)) a.setAttribute('data-nav', href);
      a.removeAttribute('href');
      a.removeAttribute('target');
      a.setAttribute('role', 'button');
    }
  }

  // 3. QR codes for every web, email and phone link.
  function friendly(url) {
    if (/^mailto:/i.test(url)) return url.replace(/^mailto:/i, '');
    if (/^tel:/i.test(url)) return url.replace(/^tel:/i, '');
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  function renderQr(box) {
    if (box.getAttribute('data-ready') === '1' || typeof window.qrcode !== 'function') return;
    var url = box.getAttribute('data-url');
    if (!url) return;
    var display = box.getAttribute('data-display') || friendly(url);

    var qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    var label = box.querySelector('.kiosk-link-label');
    var code = document.createElement('div');
    code.className = 'kiosk-qr';
    code.setAttribute('role', 'img');
    code.setAttribute('aria-label', 'QR code: ' + display);
    code.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });

    var body = document.createElement('div');
    body.className = 'kiosk-link-body';
    if (label) body.appendChild(label);

    var address = document.createElement('span');
    address.className = 'kiosk-link-url';
    address.setAttribute('dir', 'ltr');
    address.textContent = display;
    body.appendChild(address);

    var hint = document.createElement('span');
    hint.className = 'kiosk-link-hint';
    hint.setAttribute('data-k', /^mailto:/i.test(url) ? 'scanMail' : (/^tel:/i.test(url) ? 'scanTel' : 'scan'));
    hint.textContent = t(hint.getAttribute('data-k'));
    body.appendChild(hint);

    box.appendChild(code);
    box.appendChild(body);
    box.setAttribute('data-ready', '1');
  }

  function renderAllQr() {
    var boxes = document.querySelectorAll('.kiosk-link[data-url]');
    for (var i = 0; i < boxes.length; i++) renderQr(boxes[i]);
  }

  // 4. Labels added by the kiosk layer follow the page language.
  var STEP_RE = /^(iOS |Android )?Step (\d+) of (\d+)$/;

  function applyLanguage() {
    var nodes = document.querySelectorAll('[data-k]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-k'));
    localiseStepText();
    localiseStepBadges();
  }

  // The original pages leave the "Step 1" badges in English; translate them with the page.
  function localiseStepBadges() {
    var badges = document.querySelectorAll('.step-number');
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      if (!b.hasAttribute('data-en')) {
        var m = (b.textContent || '').trim().match(/^Step (\d+)$/);
        if (!m) continue;
        b.setAttribute('data-en', m[0]);
        b.setAttribute('data-n', m[1]);
      }
      var text = lang() === 'ar' ? 'الخطوة ' + b.getAttribute('data-n') : b.getAttribute('data-en');
      if (b.textContent !== text) b.textContent = text;
    }
  }

  function localiseStepText() {
    var el = document.getElementById('stepText');
    if (!el || lang() !== 'ar') return;
    var text = (el.textContent || '').trim();
    var m = text.match(STEP_RE);
    if (m) {
      var device = m[1] ? (m[1].trim() === 'iOS' ? 'iOS: ' : 'أندرويد: ') : '';
      el.textContent = device + 'الخطوة ' + m[2] + ' من ' + m[3];
    } else if (text === 'Guide completed') {
      el.textContent = 'اكتمل الدليل';
    }
  }

  // 5. Screenshots open in a full-screen viewer instead of the browser image menu.
  var viewer;

  function openViewer(src, alt) {
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'kiosk-viewer';
      viewer.setAttribute('role', 'dialog');
      viewer.setAttribute('aria-modal', 'true');
      viewer.innerHTML = '<button type="button" class="kiosk-viewer-close"><span aria-hidden="true">✕</span> <span data-k="close"></span></button><div class="kiosk-viewer-stage"><img alt=""></div>';
      viewer.addEventListener('click', function (e) {
        if (e.target.closest('.kiosk-viewer-close') || e.target === viewer || e.target.classList.contains('kiosk-viewer-stage')) closeViewer();
        else if (e.target.tagName === 'IMG') viewer.classList.toggle('zoomed');
      });
      document.body.appendChild(viewer);
    }
    var img = viewer.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    viewer.classList.remove('zoomed');
    viewer.classList.add('open');
    applyLanguage();
  }

  function closeViewer() {
    if (viewer) viewer.classList.remove('open');
  }

  function prepareImages() {
    var imgs = document.querySelectorAll('img.step-image');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.parentNode.classList && img.parentNode.classList.contains('kiosk-shot')) continue;
      var wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = 'kiosk-shot';
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      var badge = document.createElement('span');
      badge.className = 'kiosk-shot-badge';
      badge.setAttribute('data-k', 'enlarge');
      wrap.appendChild(badge);
      wrap.addEventListener('click', (function (image) {
        return function () { openViewer(image.currentSrc || image.src, image.alt); };
      })(img));
    }
  }

  // 6. Guides with a single "Start Interactive Guide" option open straight at step 1.
  function autoStartGuide() {
    var selection = document.getElementById('formatSelection');
    if (!selection || typeof window.openInteractiveGuide !== 'function') return;
    if (selection.querySelectorAll('.guide-option').length !== 1) return;
    if (selection.querySelector('.kiosk-link')) return;
    window.openInteractiveGuide();
    window.scrollTo(0, 0);
  }

  // 7. Tell the shell about activity so it can reset the kiosk after inactivity.
  var lastPing = 0;
  function activity() {
    var now = Date.now();
    if (now - lastPing > 1000) {
      lastPing = now;
      tellShell('activity', { page: page });
    }
  }
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll', 'input'].forEach(function (type) {
    window.addEventListener(type, activity, { passive: true, capture: true });
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.kiosk === 'close-overlays') closeViewer();
  });

  function init() {
    neutraliseAnchors(document);
    renderAllQr();
    prepareImages();
    applyLanguage();

    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'attributes' && r.target === document.documentElement) { applyLanguage(); continue; }
        if (r.target && r.target.id === 'stepText') { localiseStepText(); continue; }
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType === 1) { neutraliseAnchors(n.parentNode || n); }
        }
      }
      renderAllQr();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'], childList: true, subtree: true, characterData: true });

    tellShell('page', { page: page });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // The original pages apply the saved language on "load", so auto-start runs after that.
  window.addEventListener('load', function () {
    setTimeout(function () { autoStartGuide(); applyLanguage(); }, 0);
  });
})();

/* wizard-admin.js — قسم «استمارة ابدأ مشروعك» في لوحة التحكم
   يعدّل المدة التقديرية والمهام لكل نوع تطبيق، وخيارات «أين أنت الآن؟». يُحفظ في settings/wizard. */
window.QMWizardAdmin = function (host) {
  'use strict';
  var D = window.QM_WIZARD_DEFAULTS;
  var TX = {
    ar: { title: 'استمارة «ابدأ مشروعك»', hint: 'عدّلي المدة التقديرية والمهام التي تظهر للعميل لكل نوع تطبيق. اكتبي كل مهمة في سطر.', open: 'فتح الاستمارة',
      dur: 'المدة التقديرية', feat: 'المهام', ar: '(عربي)', en: '(English)', budgets: 'خيارات «أين أنت الآن؟»', save: 'حفظ الاستمارة', saving: 'جارٍ الحفظ…', saved: 'تم الحفظ، والاستمارة تحدّثت.', fail: 'تعذّر الحفظ. حاولي مرة أخرى.', reset: 'استرجاع الافتراضي' },
    en: { title: '“Start your project” form', hint: 'Edit the estimated time and the features clients see for each app type. One feature per line.', open: 'Open the form',
      dur: 'Estimated time', feat: 'Features', ar: '(Arabic)', en: '(English)', budgets: '“Where are you now?” options', save: 'Save form', saving: 'Saving…', saved: 'Saved. The form is updated.', fail: 'Could not save. Please try again.', reset: 'Restore defaults' }
  };
  var state = null, db = null, msg = '', msgOk = true, busy = false;
  var lang = function () { var r = document.querySelector('#app > div'); return r && r.getAttribute('lang') === 'en' ? 'en' : 'ar'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var lines = function (s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); };

  function fromSaved(w) {
    var st = { types: D.types.filter(function (t) { return t.id !== 'unsure'; }).map(function (t) {
      var o = w && Array.isArray(w.types) ? w.types.filter(function (x) { return x.id === t.id; })[0] : null;
      o = Object.assign({}, t, o || {});
      return { id: t.id, ar: t.ar, en: t.en, durationAr: o.durationAr, durationEn: o.durationEn, featuresAr: (o.featuresAr || []).join('\n'), featuresEn: (o.featuresEn || []).join('\n') };
    }) };
    st.stagesAr = ((w && w.stagesAr) || D.stagesAr).join('\n');
    st.stagesEn = ((w && w.stagesEn) || D.stagesEn).join('\n');
    return st;
  }

  var css = 'background:#fff;border:1px solid #E6E1F5;border-radius:24px;padding:22px;display:flex;flex-direction:column;gap:14px;font-family:Tajawal,Tahoma,sans-serif;color:#1C1633';
  var inp = 'min-height:42px;padding:0 12px;border-radius:14px;border:1px solid #D8D1EE;background:#FBFAFE;color:#1C1633;font:inherit;font-size:14px;width:100%;box-sizing:border-box';
  var ta = 'padding:10px 12px;border-radius:14px;border:1px solid #D8D1EE;background:#FBFAFE;color:#1C1633;font:inherit;font-size:14px;line-height:1.7;width:100%;box-sizing:border-box;min-height:120px;resize:vertical';
  var lab = 'display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700';

  function render() {
    var L = TX[lang()], l = lang();
    host.dir = l === 'en' ? 'ltr' : 'rtl'; host.lang = l;
    if (!state) { host.innerHTML = ''; return; }
    var h = '<section style="' + css + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0;font-size:20px;font-weight:800">' + esc(L.title) + '</h2>' +
      '<a href="start.html" target="_blank" rel="noopener" style="min-height:40px;padding:0 16px;border-radius:999px;border:1px solid #1C1633;color:#1C1633;display:inline-flex;align-items:center;font-weight:600;font-size:14px;text-decoration:none">' + esc(L.open) + '</a></div>' +
      '<p style="margin:0;font-size:13px;line-height:1.7;color:#4A4560">' + esc(L.hint) + '</p>';
    state.types.forEach(function (t, i) {
      h += '<details style="border:1px solid #EEEAF7;border-radius:16px;background:#FBFAFE;padding:12px 14px"' + (i === 0 ? ' open' : '') + '><summary style="cursor:pointer;font-weight:800;font-size:15px">' + esc(t[l]) + ' <span style="font-weight:500;color:#6B6585;font-size:13px">· ' + esc(l === 'en' ? t.durationEn : t.durationAr) + '</span></summary>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:12px">' +
        '<label style="' + lab + '">' + esc(L.dur + ' ' + L.ar) + '<input data-i="' + i + '" data-k="durationAr" style="' + inp + '" dir="rtl" value="' + esc(t.durationAr) + '"></label>' +
        '<label style="' + lab + '">' + esc(L.dur + ' ' + L.en) + '<input data-i="' + i + '" data-k="durationEn" style="' + inp + '" dir="ltr" value="' + esc(t.durationEn) + '"></label>' +
        '<label style="' + lab + '">' + esc(L.feat + ' ' + L.ar) + '<textarea data-i="' + i + '" data-k="featuresAr" style="' + ta + '" dir="rtl">' + esc(t.featuresAr) + '</textarea></label>' +
        '<label style="' + lab + '">' + esc(L.feat + ' ' + L.en) + '<textarea data-i="' + i + '" data-k="featuresEn" style="' + ta + '" dir="ltr">' + esc(t.featuresEn) + '</textarea></label>' +
        '</div></details>';
    });
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">' +
      '<label style="' + lab + '">' + esc(L.budgets + ' ' + L.ar) + '<textarea data-k="stagesAr" style="' + ta + '" dir="rtl">' + esc(state.stagesAr) + '</textarea></label>' +
      '<label style="' + lab + '">' + esc(L.budgets + ' ' + L.en) + '<textarea data-k="stagesEn" style="' + ta + '" dir="ltr">' + esc(state.stagesEn) + '</textarea></label></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
      '<button type="button" id="wzSave" style="min-height:44px;padding:0 22px;border-radius:14px;border:none;background:#1C1633;color:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer"' + (busy ? ' disabled' : '') + '>' + esc(busy ? L.saving : L.save) + '</button>' +
      '<button type="button" id="wzReset" style="min-height:44px;padding:0 18px;border-radius:14px;border:1px solid #D8D1EE;background:#fff;color:#1C1633;font:inherit;font-weight:600;font-size:14px;cursor:pointer">' + esc(L.reset) + '</button>' +
      (msg ? '<span role="status" style="font-size:14px;color:' + (msgOk ? '#1F7F6C' : '#A3165B') + '">' + esc(msg) + '</span>' : '') + '</div></section>';
    host.innerHTML = h;
    host.querySelectorAll('[data-k]').forEach(function (el) {
      el.addEventListener('input', function () { var i = el.dataset.i; if (i != null) state.types[i][el.dataset.k] = el.value; else state[el.dataset.k] = el.value; });
    });
    host.querySelector('#wzReset').onclick = function () { state = fromSaved(null); msg = ''; render(); };
    host.querySelector('#wzSave').onclick = save;
  }

  function save() {
    if (!db || busy) return;
    var L = TX[lang()];
    busy = true; msg = ''; render();
    var data = {
      types: state.types.map(function (t) { return { id: t.id, durationAr: t.durationAr.trim(), durationEn: t.durationEn.trim(), featuresAr: lines(t.featuresAr), featuresEn: lines(t.featuresEn) }; }),
      stagesAr: lines(state.stagesAr), stagesEn: lines(state.stagesEn), updatedAt: new Date().toISOString()
    };
    db.doc('settings/wizard').set(data).then(function () { busy = false; msg = L.saved; msgOk = true; render(); },
      function () { busy = false; msg = L.fail; msgOk = false; render(); });
  }

  window.claude.use('db').then(function (d) {
    db = d; if (!db) return;
    db.doc('settings/wizard').get().then(function (snap) { state = fromSaved(snap.exists ? snap.data() : null); render(); }, function () { state = fromSaved(null); render(); });
  });
  // يتبع لغة لوحة التحكم
  var root = document.getElementById('app');
  new MutationObserver(function () { if (host.lang !== lang()) render(); }).observe(root, { attributes: true, subtree: true, attributeFilter: ['lang'] });
};

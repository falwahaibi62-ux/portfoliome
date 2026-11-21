/* qm-store.js — تخزين البورتفوليو داخل مستودع GitHub نفسه (بدون أي قاعدة بيانات خارجية)
   - المحتوى في الملف data/portfolio.json، والصور في المجلد images/
   - الزوار يقرؤون الملف من الموقع مباشرة
   - لوحة التحكم تحفظ بعمل commit عبر GitHub API، بمفتاح وصول (token) خاص بصاحبة الموقع فقط
   يوفّر نفس الواجهة التي تستخدمها الصفحات: window.claude.use('db') و use('assets') */
(function () {
  'use strict';
  var C = window.QM_CONFIG || {};
  var REPO = C.owner + '/' + C.repo, BRANCH = C.branch || 'main', FILE = 'data/portfolio.json';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var TOKEN_KEY = 'qm-gh-token';
  var listeners = [];
  var doc = null, sha = null, loading = null;   // نسخة المحتوى في الذاكرة

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function headers() { var h = { Accept: 'application/vnd.github+json' }; if (token()) h.Authorization = 'Bearer ' + token(); return h; }
  function b64encodeText(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decodeText(s) { return decodeURIComponent(escape(atob(String(s).replace(/\n/g, '')))); }
  function err(status, msg) {
    var e = new Error(msg || ('HTTP ' + status));
    e.code = status === 401 || status === 403 || status === 404 ? 'invalid_argument' : status === 413 ? 'quota_exceeded' : 'unknown';
    return e;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function empty() { return { projects: {}, settings: {} }; }
  function normalize(d) { d = d && typeof d === 'object' ? d : {}; d.projects = d.projects || {}; d.settings = d.settings || {}; return d; }

  // ----- قراءة المحتوى -----
  function load(force) {
    if (doc && !force) return Promise.resolve(doc);
    if (loading && !force) return loading;
    if (C.requireLogin) {
      // لوحة التحكم: من GitHub API مباشرة (أحدث نسخة، ومعها sha للحفظ)
      loading = fetch(API + FILE + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (r.status === 404) { doc = empty(); sha = null; return doc; }
        if (!r.ok) throw err(r.status);
        return r.json().then(function (j) { sha = j.sha; doc = normalize(JSON.parse(b64decodeText(j.content))); return doc; });
      });
    } else {
      // الموقع العام: الملف المنشور مع الموقع
      loading = fetch(FILE + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) { doc = empty(); return doc; }
        return r.json().then(function (j) { doc = normalize(j); return doc; });
      }).catch(function () { doc = empty(); return doc; });
    }
    return loading;
  }

  // ----- الحفظ: commit واحد لكل تغيير، بالترتيب، مع إعادة محاولة عند التعارض -----
  var queue = Promise.resolve();
  function commit(mutate, message) {
    var run = function (retry) {
      return load(retry).then(function (d) {
        var next = normalize(JSON.parse(JSON.stringify(d)));
        mutate(next);
        var body = { message: message, content: b64encodeText(JSON.stringify(next, null, 2) + '\n'), branch: BRANCH };
        if (sha) body.sha = sha;
        return fetch(API + FILE, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()), body: JSON.stringify(body) }).then(function (r) {
          if ((r.status === 409 || r.status === 422) && !retry) return run(true);
          if (!r.ok) throw err(r.status);
          return r.json().then(function (j) { sha = j.content.sha; doc = next; listeners.slice().forEach(function (l) { l(); }); });
        });
      });
    };
    queue = queue.then(function () { return run(false); }, function () { return run(false); });
    return queue;
  }

  function split(path) { var p = path.split('/'); return { col: p[0], id: p[1] }; }
  function bucket(d, col) { return col === 'projects' ? d.projects : d.settings; }
  function snapOf(id, data) { return { id: id, exists: data !== undefined, data: function () { return data; } }; }

  function docRef(path) {
    var s = split(path);
    return {
      id: s.id,
      get: function () { return load().then(function (d) { return snapOf(s.id, bucket(d, s.col)[s.id]); }); },
      set: function (data) { return commit(function (d) { bucket(d, s.col)[s.id] = data; }, 'Update ' + path); },
      delete: function () { return commit(function (d) { delete bucket(d, s.col)[s.id]; }, 'Delete ' + path); },
      onSnapshot: function (cb, onErr) {
        var alive = true, self = this;
        var run = function () { self.get().then(function (x) { if (alive) cb(x); }, function (e) { if (alive && onErr) onErr(e); }); };
        listeners.push(run); run();
        return function () { alive = false; listeners = listeners.filter(function (l) { return l !== run; }); };
      }
    };
  }

  function collection(name) {
    var orderField = null;
    var q = {
      orderBy: function (f) { orderField = f; return q; },
      doc: function (id) { return docRef(name + '/' + (id || uuid())); },
      onSnapshot: function (cb, onErr) {
        var alive = true;
        var run = function () {
          load().then(function (d) {
            if (!alive) return;
            var b = bucket(d, name);
            var rows = Object.keys(b).map(function (id) { return { id: id, data: b[id] }; });
            // الزائر لا يرى المشاريع المخفية
            if (!C.requireLogin && name === 'projects') rows = rows.filter(function (r) { return !r.data || r.data.visible !== false; });
            if (orderField) rows.sort(function (a, c) {
              var x = a.data && a.data[orderField], y = c.data && c.data[orderField];
              x = x === '' || x == null || !isFinite(Number(x)) ? 1e9 : Number(x); y = y === '' || y == null || !isFinite(Number(y)) ? 1e9 : Number(y);
              return x - y;
            });
            cb({ docs: rows.map(function (r) { return snapOf(r.id, r.data); }) });
          }, function (e) { if (alive && onErr) onErr(e); });
        };
        listeners.push(run); run();
        return function () { alive = false; listeners = listeners.filter(function (l) { return l !== run; }); };
      }
    };
    return q;
  }

  var db = { collection: collection, doc: docRef };

  // ----- الصور: تُرفع إلى images/ في نفس المستودع -----
  var assets = {
    upload: function (file) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return Promise.reject(new Error('type'));
      if (file.size > 5 * 1024 * 1024) return Promise.reject(err(413));
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      var path = 'images/' + uuid() + '.' + ext;
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result).split(',')[1]); };
        fr.onerror = rej; fr.readAsDataURL(file);
      }).then(function (b64) {
        return fetch(API + path, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()), body: JSON.stringify({ message: 'Add image ' + path, content: b64, branch: BRANCH }) });
      }).then(function (r) { if (!r.ok) throw err(r.status); return { id: path }; });
    }
  };

  // رابط الصورة: في لوحة التحكم من raw.githubusercontent (يظهر فوراً)، وفي الموقع مساراً نسبياً
  function img(id) {
    if (!id) return '';
    if (/^(https?:|data:)/.test(id)) return id;
    if (C.requireLogin && /^images\//.test(id)) return 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + id;
    return id;
  }

  // ----- الدخول: مفتاح وصول GitHub بصلاحية هذا المستودع فقط -----
  var gate = { ready: !C.requireLogin };
  var auth = {
    hasToken: function () { return !!token(); },
    setToken: function (t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} doc = null; sha = null; },
    // يتحقق أن المفتاح يملك صلاحية الكتابة على المستودع
    check: function () {
      return fetch('https://api.github.com/repos/' + REPO, { headers: headers(), cache: 'no-store' }).then(function (r) {
        if (!r.ok) return { ok: false, status: r.status };
        return r.json().then(function (j) { return { ok: !!(j.permissions && j.permissions.push), status: r.status }; });
      }, function () { return { ok: false, status: 0 }; });
    }
  };

  window.QM = { img: img, gate: gate, auth: auth, repo: REPO };
  window.claude = {
    use: function (what) {
      if (what === 'db') return Promise.resolve(gate.ready ? db : null);
      if (what === 'assets') return Promise.resolve(gate.ready && C.requireLogin ? assets : null);
      return Promise.resolve(null);
    }
  };
})();

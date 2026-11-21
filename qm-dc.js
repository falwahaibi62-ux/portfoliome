/* qm-dc.js — محرّك عرض صغير للبورتفوليو (بدون مكتبات)
   يقرأ شجرة القالب (JSON) ويعرضها مع {{القيم}} و sc-for و sc-if والأحداث،
   ويحدّث الصفحة بمقارنة بسيطة حتى لا يضيع التركيز من الحقول أثناء الكتابة. */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var ONLY_HOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  var BOOL_PROPS = { checked: 1, disabled: 1, selected: 1, multiple: 1 };

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    var parts = path.split('.');
    var v;
    for (var s = scope; s; s = s.__parent) {
      if (Object.prototype.hasOwnProperty.call(s, parts[0])) { v = s[parts[0]]; break; }
    }
    for (var i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null || v === false ? '' : String(v); });
  }
  function child(scope, name, val) { var o = { __parent: scope }; o[name] = val; return o; }

  // ---------- بناء عقد جديدة من القالب ----------
  function build(node, scope, inSvg, out) {
    if (typeof node === 'string') { out.push(document.createTextNode(interp(node, scope))); return; }
    var tag = node[0], attrs = node[1] || {}, kids = node[2] || [];
    if (tag === 'sc-for') {
      var m = ONLY_HOLE.exec(attrs.list || ''), list = m ? lookup(m[1], scope) : null;
      if (Array.isArray(list)) list.forEach(function (item, i) {
        var sc = child(scope, attrs.as || 'item', item); sc.$index = i;
        kids.forEach(function (k) { build(k, sc, inSvg, out); });
      });
      return;
    }
    if (tag === 'sc-if') {
      var m2 = ONLY_HOLE.exec(attrs.value || '');
      if (m2 ? lookup(m2[1], scope) : attrs.value) kids.forEach(function (k) { build(k, scope, inSvg, out); });
      return;
    }
    var svg = inSvg || tag === 'svg';
    var el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    el.__on = {}; el.__props = {};
    Object.keys(attrs).forEach(function (name) {
      if (name.indexOf('hint-') === 0) return;
      var raw = attrs[name], m3 = ONLY_HOLE.exec(raw), v = m3 ? lookup(m3[1], scope) : (raw.indexOf('{{') >= 0 ? interp(raw, scope) : raw);
      var lname = name.toLowerCase();
      if (lname.length > 2 && lname.indexOf('on') === 0) { if (typeof v === 'function') el.__on[lname.slice(2)] = v; return; }
      if (!svg && (lname === 'value' || BOOL_PROPS[lname])) { el.__props[lname] = v; if (lname !== 'value' && v) el.setAttribute(name, ''); return; }
      if (v === true) { el.setAttribute(name, lname.indexOf('aria-') === 0 ? 'true' : ''); return; }
      if (v === false || v == null) { if (lname.indexOf('aria-') === 0) el.setAttribute(name, 'false'); return; }
      el.setAttribute(name, String(v));
    });
    var kidOut = [];
    kids.forEach(function (k) { build(k, scope, svg && tag !== 'foreignObject', kidOut); });
    kidOut.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  // ---------- تطبيق الأحداث والخصائص ----------
  var EVENTS = ['click', 'input', 'change', 'submit', 'mousemove', 'mouseleave', 'keydown', 'focus', 'blur'];
  function applyExtras(live, fresh) {
    EVENTS.forEach(function (ev) {
      var h = fresh.__on && fresh.__on[ev] || null;
      if (live['on' + ev] !== h) live['on' + ev] = h;
    });
    var p = fresh.__props || {};
    if ('checked' in p) live.checked = !!p.checked;
    if ('disabled' in p) live.disabled = !!p.disabled;
    if ('selected' in p) live.selected = !!p.selected;
    if ('value' in p) {
      var v = p.value == null ? '' : String(p.value);
      if (live.type !== 'file' && live.value !== v) live.value = v;
    }
  }
  function adopt(node) {
    if (node.nodeType !== 1) return;
    for (var c = node.firstChild; c; c = c.nextSibling) adopt(c);
    applyExtras(node, node);
  }

  // ---------- مقارنة وتحديث ----------
  function morphChildren(parent, freshList) {
    var live = Array.prototype.slice.call(parent.childNodes);
    for (var i = 0; i < freshList.length; i++) {
      var f = freshList[i], l = live[i];
      if (!l) { parent.appendChild(f); adopt(f); continue; }
      if (l.nodeType !== f.nodeType || (l.nodeType === 1 && (l.namespaceURI !== f.namespaceURI || l.localName !== f.localName))) {
        parent.replaceChild(f, l); adopt(f); continue;
      }
      if (l.nodeType === 3) { if (l.data !== f.data) l.data = f.data; continue; }
      // الخصائص
      var fa = f.attributes, la = l.attributes, k;
      for (k = la.length - 1; k >= 0; k--) { var an = la[k].name; if (!f.hasAttribute(an)) l.removeAttribute(an); }
      for (k = 0; k < fa.length; k++) { if (l.getAttribute(fa[k].name) !== fa[k].value) l.setAttribute(fa[k].name, fa[k].value); }
      morphChildren(l, Array.prototype.slice.call(f.childNodes));
      applyExtras(l, f);
    }
    for (var j = live.length - 1; j >= freshList.length; j--) parent.removeChild(live[j]);
  }

  // ---------- المكوّن ----------
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch, cb) {
    if (typeof patch === 'function') patch = patch(this.state, this.props);
    if (patch) this.state = Object.assign({}, this.state, patch);
    if (this.__schedule) this.__schedule();
    if (cb) Promise.resolve().then(cb);
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };
  window.DCLogic = DCLogic;

  window.QMDC = {
    mount: function (Component, tree, container, props) {
      var comp = new Component(props || {});
      var queued = false;
      function render() {
        queued = false;
        var vals = comp.renderVals ? comp.renderVals() : {};
        var out = [];
        tree.forEach(function (n) { build(n, vals, false, out); });
        morphChildren(container, out);
      }
      comp.__schedule = function () { if (!queued) { queued = true; Promise.resolve().then(render); } };
      render();
      if (comp.componentDidMount) comp.componentDidMount();
      return comp;
    }
  };
})();

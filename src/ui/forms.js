/* ===== ui/forms.js — accessible form controls bound to plain objects ===== */
let fieldSeq = 0;
const fid = () => "f" + (++fieldSeq);

function field(label, control, opts) {
  opts = opts || {};
  const id = opts.forId || control.id || (control.id = fid());
  return h("div", { class: "field" + (opts.error ? " has-err" : "") },
    h("label", { class: "lbl", for: id }, label, opts.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
    opts.hint ? h("div", { class: "hint", id: id + "-h" }, opts.hint) : null,
    control,
    opts.error ? h("div", { class: "field-err", role: "alert" }, opts.error) : null);
}
function textInput(obj, key, attrs) {
  return h("input", Object.assign({ type: "text", class: "input", value: obj[key] ?? "", oninput: e => { obj[key] = e.target.value; attrs && attrs.onchange_ && attrs.onchange_(); } }, attrs || {}));
}
function textArea(obj, key, attrs) {
  const t = h("textarea", Object.assign({ class: "input", rows: 3, oninput: e => { obj[key] = e.target.value; attrs && attrs.onchange_ && attrs.onchange_(); } }, attrs || {}));
  t.value = obj[key] ?? ""; return t;
}
function numberInput(obj, key, attrs) {
  attrs = attrs || {};
  return h("input", Object.assign({ type: "number", inputmode: "decimal", class: "input num-in", value: obj[key] ?? "", oninput: e => { const v = e.target.value; obj[key] = v === "" ? null : Number(v); attrs.onchange_ && attrs.onchange_(); } }, attrs));
}

/* 0–10 (or 0–100) rating slider that can be "not set" until touched */
function rating(label, obj, key, opts) {
  opts = opts || {};
  const max = opts.max ?? 10, step = opts.step ?? 1, id = fid();
  const fmt = v => v == null ? "–" : v + (opts.unit || "");
  const out = h("output", { class: "rating-v", for: id, style: opts.color ? { color: opts.color } : null }, fmt(obj[key]));
  const inp = h("input", { type: "range", id, min: 0, max, step, value: obj[key] ?? Math.round(max / 2), class: "range" + (obj[key] == null ? " unset" : ""), "aria-valuetext": obj[key] == null ? "not set" : String(obj[key]),
    oninput: e => { obj[key] = Number(e.target.value); out.textContent = fmt(obj[key]); e.target.classList.remove("unset"); e.target.setAttribute("aria-valuetext", String(obj[key])); opts.onchange_ && opts.onchange_(); } });
  const scale = h("div", { class: "scale", "aria-hidden": "true" }, h("span", {}, opts.lo || "0"), h("span", {}, opts.hi || String(max)));
  return h("div", { class: "field rating" + (opts.error ? " has-err" : "") },
    h("div", { class: "rating-top" }, h("label", { class: "lbl", for: id }, label, opts.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null), out),
    opts.hint ? h("div", { class: "hint" }, opts.hint) : null,
    inp, scale, opts.error ? h("div", { class: "field-err", role: "alert" }, opts.error) : null);
}

function segmented(label, options, obj, key, opts) {
  opts = opts || {};
  const name = fid();
  const group = h("div", { class: "seg", role: "radiogroup", "aria-label": label },
    options.map(o => h("button", { type: "button", role: "radio", "aria-checked": String(obj[key] === o.key), class: "seg-b" + (obj[key] === o.key ? " on" : ""), "data-k": String(o.key),
      onclick: e => { obj[key] = o.key; group.querySelectorAll(".seg-b").forEach(b => { const on = b.dataset.k === String(o.key); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }); opts.onchange_ && opts.onchange_(); } }, o.label)));
  return h("div", { class: "field" + (opts.error ? " has-err" : "") }, h("div", { class: "lbl", id: name }, label, opts.required ? h("span", { class: "req" }, " *") : null), opts.hint ? h("div", { class: "hint" }, opts.hint) : null, group, opts.error ? h("div", { class: "field-err", role: "alert" }, opts.error) : null);
}
function yesNo(label, obj, key, opts) { return segmented(label, [{ key: true, label: "Yes" }, { key: false, label: "No" }], obj, key, opts); }

/* quick-pick chips + free text (trigger, emotion, alternative) */
function chipText(label, suggestions, obj, key, opts) {
  opts = opts || {};
  const inp = h("input", { type: "text", class: "input", value: obj[key] || "", placeholder: opts.placeholder || "", maxlength: opts.maxlength || 120,
    oninput: e => { obj[key] = e.target.value; sync(); opts.onchange_ && opts.onchange_(); } });
  const chips = h("div", { class: "chips" }, suggestions.slice(0, opts.max || 12).map(sg => h("button", { type: "button", class: "chip", "aria-pressed": "false", onclick: () => { obj[key] = sg; inp.value = sg; sync(); opts.onchange_ && opts.onchange_(); } }, sg)));
  function sync() { chips.querySelectorAll(".chip").forEach(c => { const on = norm(c.textContent) === norm(obj[key] || ""); c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); }); }
  sync(); inp.id = fid();
  return field(label, h("div", { class: "chip-text" }, chips, inp), { hint: opts.hint, required: opts.required, error: opts.error, forId: inp.id });
}

function tagsInput(obj, key) {
  const wrap = h("div", { class: "tags-in" });
  const draw = () => {
    wrap.replaceChildren(...(obj[key] || []).map(t => h("span", { class: "tag" }, "#" + t, h("button", { type: "button", class: "tag-x", "aria-label": "Remove tag " + t, onclick: () => { obj[key] = obj[key].filter(x => x !== t); draw(); } }, "×"))),
      h("input", { type: "text", class: "tag-new", placeholder: "Add tag, press Enter", "aria-label": "Add tag", maxlength: 40,
        onkeydown: e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const v = e.target.value.trim().replace(/^#/, ""); if (v && !(obj[key] || []).includes(v)) { obj[key] = [...(obj[key] || []), v].slice(0, 20); } draw(); wrap.querySelector(".tag-new").focus(); } },
        onblur: e => { const v = e.target.value.trim().replace(/^#/, ""); if (v && !(obj[key] || []).includes(v)) { obj[key] = [...(obj[key] || []), v].slice(0, 20); draw(); } } }));
  };
  draw(); return wrap;
}
function selectBox(options, value, onChange, attrs) {
  return h("select", Object.assign({ class: "input select", onchange: e => onChange(e.target.value) }, attrs || {}), options.map(o => h("option", { value: o.value, selected: o.value === value }, o.label)));
}

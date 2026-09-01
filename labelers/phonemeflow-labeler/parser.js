const SIL_SET = ["pau", "sil", "breath", "br", "cl", "silb", "ap", "sp"];
const SIL_MARKERS = ["R", "-"]; 
const SIL_DUR = 200;            
function extractBlocks(res) {
  if (typeof res === "undefined" || res == null) return null;
  const candidates = Array.isArray(res) ? res : (typeof res === "object" ? Object.values(res) : [res]);
  for (const c of candidates) {
    if (c == null) continue;
    let parsed = c;
    if (typeof c === "string") { try { parsed = JSON.parse(c); } catch (e) { parsed = null; } }
    if (Array.isArray(parsed) && parsed.length && parsed.every(b => b && typeof b === "object" && b.phonemes)) return parsed;
  }
  return null;
}
const ALL_BLOCKS = (() => {
  const b = extractBlocks(typeof resources !== "undefined" ? resources : null);
  return Array.isArray(b) ? b : [];
})();
const KEY_LANG = { japanese: "JA-ROMAJI", chinese: "ZH-PINYIN", english: "EN-ARPABET" };
const LANG_KEY = { "JA-ROMAJI": "japanese", "ZH-PINYIN": "chinese", "EN-ARPABET": "english" };
const MERGED_SEG_LIST = (() => {
  const set = new Set(SIL_SET);
  for (const b of ALL_BLOCKS) {
    const ph = (b && b.phonemes) || {};
    for (const arr of [ph.vowels || [], ph.continuant || [], ph.plosive || []])
      for (const s of arr) set.add(String(s));
  }
  return [...set].sort((a, b) => b.length - a.length);
})();
function blockForLang(lang) {
  if (!lang) return null; 
  const key = KEY_LANG[lang];
  return ALL_BLOCKS.find(b => b && b.language === key) || null;
}
function buildTypeMap(block) {
  const m = {};
  if (!block) return m;
  const ph = block.phonemes || {};
  for (const s of (ph.vowels || [])) m[String(s)] = "vowel";
  for (const s of (ph.continuant || [])) m[String(s)] = "continuant";
  for (const s of (ph.plosive || [])) m[String(s)] = "plosive";
  for (const s of SIL_SET) m[s] = "sil";
  for (const s of SIL_MARKERS) m[s] = "sil";
  return m;
}
let ACTIVE_TYPE_MAP = buildTypeMap(blockForLang((typeof params !== "undefined" && params && params["language"]) || null));
let detectedLanguage = null;
function detectLanguage(symbols) {
  if (!symbols.length) return null;
  let best = null, bestScore = 0;
  for (const b of ALL_BLOCKS) {
    const ph = (b && b.phonemes) || {};
    const known = new Set([...(ph.vowels || []), ...(ph.continuant || []), ...(ph.plosive || []), ...SIL_SET, ...SIL_MARKERS].map(String));
    let covered = 0;
    for (const s of symbols) if (known.has(s)) covered++;
    const score = covered / symbols.length;
    if (score > bestScore) { bestScore = score; best = LANG_KEY[b.language] || null; }
  }
  return bestScore >= 0.5 ? best : null; 
}
const classify = sym => {
  const n = String(sym || "").trim();
  if (!n) return "sil";
  if (ACTIVE_TYPE_MAP[n]) return ACTIVE_TYPE_MAP[n];
  return "vowel";   
};
const isC = t => t === "plosive" || t === "continuant";
function tokenize(alias) {
  const list = MERGED_SEG_LIST;
  if (ALL_BLOCKS.length === 0) return [{ sym: "(empty)", type: "vowel" }];
  if (!list.length) return [{ sym: "(empty)", type: "vowel" }];
  const out = [];
  for (const token of String(alias).replace(/\s+/g, " ").trim().split(" ")) {
    let i = 0;
    while (i < token.length) {
      let hit = null;
      for (const sym of list) if (token.startsWith(sym, i)) { hit = sym; break; }
      if (hit) {
        out.push({ sym: hit, type: classify(hit) });
        i += hit.length;
      } else {
        const cp = token.codePointAt(i);
        const ch = cp != null ? String.fromCodePoint(cp) : token[i];
        if (cp != null && cp < 128 && !/[a-zA-Z]/.test(ch)) { i += ch.length; continue; }
        out.push({ sym: ch, type: classify(ch) });
        i += ch.length;
      }
    }
  }
  return out;
}
function decomp(alias) {
  return tokenize(alias);
}
function clampRec(r) {
  let O = r.O, C = r.C, P = r.P, E = r.E, Ovl = r.Ovl;
  if (!Number.isFinite(O)) O = 0;
  if (!Number.isFinite(E)) E = O + 1;
  if (E <= O) E = O + 1;
  if (!Number.isFinite(Ovl)) Ovl = O;
  if (Ovl < O) Ovl = O;
  if (!Number.isFinite(C)) C = O + (E - O) * 0.5;
  if (C < O) C = O + (E - O) * 0.5;
  if (!Number.isFinite(P)) P = C;
  if (E < P) E = P + 1;
  return { O, C, P, E, Ovl };
}
function kindOf(types) {
  const n = types.length;
  if (n === 1) return types[0] === "vowel" ? "V" : types[0] === "sil" ? "SIL" : "C";
  if (n === 2) {
    if (isC(types[0]) && types[1] === "vowel") return "CV";
    if (types[0] === "vowel" && isC(types[1])) return "VC";
    if (types[0] === "vowel" && types[1] === "vowel") return "VV";
  }
  if (n === 3 && types[0] === "vowel" && isC(types[1]) && types[2] === "vowel") return "VCV";
  return "OTHER";
}
function readInputText(inp) {
  if (inp == null) return "";
  if (typeof inp === "string") return inp;
  if (!Array.isArray(inp)) return String(inp);
  if (inp.length === 1 && typeof inp[0] === "string" && inp[0].indexOf("\n") >= 0) return inp[0];
  return inp.map(x => x == null ? "" : (Array.isArray(x) ? x.join("\n") : String(x))).join("\n");
}
function eachLine(text, fn) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === ";" || line.startsWith("//")) continue;
    const r = fn(line);
    if (r) out.push(r);
  }
  return out;
}
function detectFormat(text) {
  const t = String(text);
  if (t.indexOf("=") >= 0 && !/^\s*[{[]/.test(t)) return "UTAU";
  const head = t.trim()[0];
  return head === "{" || head === "[" ? "DeepVocal" : "VocalSharp";
}
function parseOtoIni(text) {
  return eachLine(text, line => {
    const eq = line.indexOf("=");
    if (eq < 0) return null;
    const wav = line.slice(0, eq).trim();
    const p = line.slice(eq + 1).trim().split(",");
    if (p.length < 6) return null;
    const L = parseFloat(p[1]), fixed = parseFloat(p[2]), right = parseFloat(p[3]), preu = parseFloat(p[4]), ovl = parseFloat(p[5]);
    if ([L, fixed, right, preu, ovl].some(Number.isNaN)) return null;
    const syms = decomp(p[0]);
    if (!syms.length) return null;
    return { wav, alias: p[0].trim(), phonemes: syms, raw: { O: L, C: L + fixed, P: L + preu, E: L - right, Ovl: L + ovl } };
  });
}
function parseVsdxmf(text) {
  return eachLine(text, line => {
    const p = line.split(",");
    if (p.length < 7) return null;
    const O = parseFloat(p[2]), pre = parseFloat(p[3]), con = parseFloat(p[4]), r = parseFloat(p[5]), ovl = parseFloat(p[6]);
    if ([O, pre, con, r, ovl].some(Number.isNaN)) return null;
    const syms = decomp(p[0].trim());
    if (!syms.length) return null;
    return { wav: p[1].trim(), alias: p[0].trim(), phonemes: syms, raw: { O, C: con, P: pre, E: r, Ovl: ovl } };
  });
}
function parseDvcfg(text) {
  let data; try { data = JSON.parse(text); } catch (e) { return []; }
  const cp = 0.06;
  const out = [];
  for (const key of Object.keys(data)) {
    const e = data[key];
    if (!e || typeof e !== "object") continue;
    const st = parseFloat(e.startTime), vs = parseFloat(e.vowelStart), ve = parseFloat(e.vowelEnd), pre = parseFloat(e.preutterance), en = parseFloat(e.endTime);
    if ([st, vs, ve, pre, en].some(Number.isNaN)) continue;
    const syms = decomp(String(e.symbol || ""));
    if (!syms.length) continue;
    out.push({ wav: e.wavName || "", alias: String(e.symbol || ""), phonemes: syms,
      raw: { O: (st + cp) * 1000, C: (st + vs) * 1000, P: (st + pre) * 1000, E: (st + ve) * 1000, Ovl: (st + cp) * 1000 } });
  }
  return out;
}
function detectAndParse(text) {
  const fmt = detectFormat(text);
  return { fmt, recs: fmt === "UTAU" ? parseOtoIni(text) : fmt === "DeepVocal" ? parseDvcfg(text) : parseVsdxmf(text) };
}
function buildWavMap(recs, sampleNames) {
  const lower = sampleNames.map(s => String(s).replace(/\.wav$/i, "").toLowerCase());
  const map = {};
  for (const w of [...new Set(recs.map(r => String(r.wav).replace(/\.wav$/i, "").toLowerCase()))]) {
    const exact = lower.filter(n => n === w);
    if (exact.length === 1) { map[w] = sampleNames[lower.indexOf(exact[0])]; continue; }
    const fuzzy = lower.filter(n => n.indexOf(w) >= 0 || w.indexOf(n) >= 0);
    map[w] = fuzzy.length === 1 ? sampleNames[lower.indexOf(fuzzy[0])] : null;
  }
  return map;
}
function meanOf(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function dropExtremesAvg(a) {
  if (!a.length) return 0;
  if (a.length <= 2) return meanOf(a);
  const s = [...a].sort((x, y) => x - y);
  return meanOf(s.slice(1, -1));
}
function segBounds(start, end, n) {
  if (n <= 0) return [start, end];
  const b = [start];
  for (let k = 1; k < n; k++) b.push(start + (end - start) * k / n);
  b.push(end);
  return b;
}
function clampPoints(e) {
  const lo = e.start, hi = e.end;
  if (e.points && e.points.length >= 2) {
    e.points[0] = Math.min(Math.max(e.points[0], lo), hi);
    e.points[1] = Math.min(Math.max(e.points[1], lo), hi);
  }
}
function reconcile(entries, hasSil) {
  if (!entries || entries.length < 2) return entries;
  entries.sort((a, b) => a.start - b.start || a.end - b.end);
  let i = 1;
  while (i < entries.length) {
    const prev = entries[i - 1], cur = entries[i];
    if (Math.abs(cur.start - prev.end) <= 1e-6) { i++; continue; }
    if (hasSil) {
      const mid = (prev.end + cur.start) / 2;
      entries.splice(i, 0, new Entry(prev.sample, "Sil", prev.end, cur.start, [mid, mid], []));
      i += 2; 
    } else {
      const b = (prev.end + cur.start) / 2; 
      prev.end = b; cur.start = b;
      clampPoints(prev); clampPoints(cur);
      i++;
    }
  }
  return entries;
}
function pickName(names) {
  const all = names.map(n => ({ n, toks: decomp(n) }));
  const cands = all.filter(c => c.toks.length && isC(c.toks[0].type));   
  const pool = cands.length ? cands : all;
  let best = pool[0], bestScore = Infinity;
  for (const c of pool) {
    const score = c.toks.length * 1000 + String(c.n).length;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best.n;
}
function buildFile(sample, params) {
  const base = sample.replace(/\.wav$/i, "").toLowerCase();
  const recs = inputRecsAll.filter(r => {
    const w = String(r.wav).replace(/\.wav$/i, "").toLowerCase();
    const mapped = wavToSample[w];
    return mapped !== undefined && mapped !== null && String(mapped).replace(/\.wav$/i, "").toLowerCase() === base;
  });
  if (!recs.length) return { entries: [], aliases: [] };
  const clean = recs.map(r => ({ ...r, raw: clampRec(r.raw) }));
  const TOL = 5; 
  const groups = [];
  for (const r of clean) {
    let g = groups.find(g => Math.abs(g.O - r.raw.O) <= TOL);
    if (!g) { g = { O: r.raw.O, recs: [] }; groups.push(g); }
    g.recs.push(r);
  }
  const slots = groups.map(g => {
    const O = dropExtremesAvg(g.recs.map(r => r.raw.O));    
    const P = dropExtremesAvg(g.recs.map(r => r.raw.P));    
    const C = dropExtremesAvg(g.recs.map(r => r.raw.C));    
    const E = dropExtremesAvg(g.recs.map(r => r.raw.E));    
    const Ovl = dropExtremesAvg(g.recs.map(r => r.raw.Ovl)); 
    const name = pickName(g.recs.map(r => r.alias));
    return { O, P, C, E, Ovl, name, phonemes: decomp(name) };
  }).sort((a, b) => a.O - b.O);
  const hasConsonantInitial = slots.some(s => s.phonemes.length && isC(s.phonemes[0].type)); 
  const kept = slots; 
  const sampleHasSil = clean.some(r => {
    const toks = String(r.alias).split(/[\s_]+/);
    return toks.some(t => SIL_MARKERS.includes(t));
  });
  const entries = [];
  const add = (sym, start, ss, se, end) => entries.push(new Entry(sample, sym, start, end, [ss, se], []));
  const mid = (a, b) => (a + b) / 2;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const n = slots.length;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    const phs = s.phonemes;
    if (phs.length > 2) {            
      const b = segBounds(s.O, s.E, phs.length);
      for (let k = 0; k < phs.length; k++) add(phs[k].sym, b[k], b[k], b[k + 1], b[k + 1]);
      continue;
    }
    const firstShared = (i > 0) && (phs[0].sym === slots[i - 1].phonemes[slots[i - 1].phonemes.length - 1].sym);
    const startJ = firstShared ? 1 : 0;
    for (let j = startJ; j < phs.length; j++) {
      const ph = phs[j];
      if (ph.type === "sil") continue; 
      const isFirst = (j === 0);
      const isLast = (j === phs.length - 1);
      if (isFirst && !firstShared) {
        if (isLast) {
          const end = (i < n - 1 && !sampleHasSil) ? slots[i + 1].O
            : (sampleHasSil ? (isC(ph.type) ? s.P : s.C) : (isC(ph.type) ? s.P : Math.max(s.E, s.P)));
          if (isC(ph.type)) add(ph.sym, s.O, mid(s.O, end), mid(s.O, end), end);
          else add(ph.sym, s.O, clamp(s.C, s.O, end), clamp(s.E, s.C, end), end);
        } else {
          add(ph.sym, s.O, mid(s.O, s.P), mid(s.O, s.P), s.P);            
        }
      } else if (isLast) {
        const nextShared = (i < n - 1) && (ph.sym === slots[i + 1].phonemes[0].sym);
        if (nextShared) {
          const sn = slots[i + 1];
          if (isC(ph.type)) add(ph.sym, s.P, mid(s.P, sn.P), mid(s.P, sn.P), sn.P);           
          else add(ph.sym, s.P, clamp(s.C, s.P, sn.P), clamp(s.E, s.C, sn.P), sn.P);           
        } else if (isC(ph.type)) {
          const end = (i < n - 1 && !sampleHasSil) ? slots[i + 1].O : (sampleHasSil ? s.P : s.C);
          add(ph.sym, s.P, mid(s.P, end), mid(s.P, end), end);
        } else {
          const end = (i < n - 1 && !sampleHasSil) ? slots[i + 1].O : (sampleHasSil ? s.C : Math.max(s.E, s.P));
          add(ph.sym, s.P, clamp(s.C, s.P, end), clamp(s.E, s.C, end), end);
        }
      }
    }
  }
  reconcile(entries, sampleHasSil); 
  if (entries.length && n > 0) {
    const last = entries[entries.length - 1];
    const sEnd = slots[n - 1].E;
    const room = (last.end >= sEnd - 1e-6) ? Math.max(0, sEnd - slots[n - 1].O) : 0;
    const silLen = Math.min(SIL_DUR, room);
    if (silLen > 1) {
      const s0 = last.end, s1 = s0 + silLen;
      entries.push(new Entry(sample, "Sil", s0, s1, [(s0 + s1) / 2, (s0 + s1) / 2], []));
    }
  }
  const aliases = kept.map(s => ({
    alias: s.name, phonemes: s.phonemes.map(p => p.sym),
    offset: Math.round(s.O), kind: kindOf(s.phonemes.map(p => p.type))
  }));
  return { entries, aliases };
}
function buildManual(sample, params) {
  const def = String(params.defaultPhoneme || "").trim() || "(empty)";
  const sil = Number(params.leadingSilence);
  const bpm = Number(params.bpm);
  const count = Math.max(0, Math.floor(Number(params.entryCount || 0)));
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Manual mode: bpm must be a positive number.");
  const lead = Number.isFinite(sil) && sil > 0 ? sil : 0;
  const beat = 60000 / bpm;     
  const con = 50;               
  const vdur = beat - con;      
  const entries = [];
  const firstCs = Math.max(0, lead - con);
  if (firstCs - SIL_DUR > 0)
    entries.push(new Entry(sample, "Sil", firstCs - SIL_DUR, firstCs, [firstCs - SIL_DUR / 2, firstCs - SIL_DUR / 2], []));
  for (let i = 0; i < count; i++) {
    const vs = lead + i * beat;                 
    const cs = Math.max(0, vs - con);           
    entries.push(new Entry(sample, def, cs, vs, [(cs + vs) / 2, (cs + vs) / 2], []));
    entries.push(new Entry(sample, def, vs, vs + vdur, [vs + 0.3 * vdur, vs + 0.8 * vdur], []));
  }
  if (count > 0 && entries.length) {
    const lastEnd = entries[entries.length - 1].end;
    entries.push(new Entry(sample, "Sil", lastEnd, lastEnd + SIL_DUR, [lastEnd + SIL_DUR / 2, lastEnd + SIL_DUR / 2], []));
  }
  return entries;
}
const mode = String((typeof params !== "undefined" && params && params["mode"]) || "file").trim().toLowerCase();
const inputText = readInputText(typeof inputs !== "undefined" ? inputs : null);
const sampleDefs = (typeof moduleDefinitions !== "undefined" && Array.isArray(moduleDefinitions)) ? moduleDefinitions : null;
const sampleList = (typeof sampleFileNames !== "undefined" && Array.isArray(sampleFileNames)) ? sampleFileNames : [];
const collectSamples = defs => defs ? defs.flatMap(d => d.sampleFileNames || []) : sampleList;
const allSamples = [];
const addSample = s => { if (allSamples.indexOf(s) < 0) allSamples.push(s); };
let inputRecsAll = [], inputFormat = "UTAU", wavToSample = {};
if (mode !== "manual" && inputText.trim()) {
  const d = detectAndParse(inputText);
  inputFormat = d.fmt;
  inputRecsAll = d.recs;
  if (inputRecsAll.length) {
    const symSet = new Set();
    for (const r of inputRecsAll) for (const t of tokenize(String(r.alias || ""))) symSet.add(t.sym);
    detectedLanguage = detectLanguage([...symSet]);
    ACTIVE_TYPE_MAP = buildTypeMap(blockForLang(detectedLanguage));
  }
  const names = collectSamples(sampleDefs);
  names.forEach(addSample);
  wavToSample = buildWavMap(inputRecsAll, names);
} else {
  collectSamples(sampleDefs).forEach(addSample);
}
modules = [];
const allAliases = [];
function process(samples) {
  const entries = [];
  for (const s of samples) {
    addSample(s);
    const r = mode === "manual" ? { entries: buildManual(s, params || {}), aliases: [] } : buildFile(s, params || {});
    entries.push(...r.entries);
    if (r.aliases.length) allAliases.push({ wav: s, aliases: r.aliases });
  }
  return entries;
}
if (sampleDefs) sampleDefs.forEach(def => modules.push(process(def.sampleFileNames || sampleList)));
else modules.push(process(sampleList));
const total = modules.reduce((a, m) => a + (m ? m.length : 0), 0);
if (mode !== "manual") {
  if (!inputText.trim()) {
    throw new Error("File mode: no label file was loaded. Set the 'inputFile' parameter (oto.ini / dvcfg / vsdxmf) before creating the project.");
  }
  if (total === 0) {
    const sampleStr = allSamples.slice(0, 10).map(s => String(s).replace(/\.wav$/i, "")).join(", ") + (allSamples.length > 10 ? " …" : "");
    const wavStr = [...new Set(inputRecsAll.map(r => String(r.wav).replace(/\.wav$/i, "")))].slice(0, 10).join(", ") + (inputRecsAll.length > 10 ? " …" : "");
    const inpType = (typeof inputs === "undefined") ? "undefined" : (Array.isArray(inputs) ? "array[" + inputs.length + "]" : typeof inputs);
    const inp0 = (typeof inputs !== "undefined" && inputs && inputs[0] != null) ? (Array.isArray(inputs[0]) ? "array" : typeof inputs[0]) : "null";
    throw new Error(
      "File mode (" + inputFormat + "): parsed " + inputRecsAll.length + " record(s), but 0 matched the project samples.\n" +
      "inputs type: " + inpType + ", inputs[0] type: " + inp0 + "\n" +
      "inputText head: " + String(inputText).slice(0, 200).replace(/\r?\n/g, "\\n") + "\n" +
      "Project sample names: " + (sampleStr || "(none)") + "\n" +
      "Wav names in label file: " + (wavStr || "(none)") + "\n" +
      "Fix: the wav names in the label file must match the project's sample file names (case-insensitive)."
    );
  }
  const writeMapping = !((typeof params !== "undefined" && params && params["writeMapping"]) === false);
  if (writeMapping) {
    const inPath = (typeof params !== "undefined" && params && params["inputFile"]) ? params["inputFile"] : "";
    if (inPath && typeof File !== "undefined") {
      try {
        const f = File.fromPath(inPath).getParentFile().resolve("phonemeflow-mapping.json");
        const m = {};
        for (const rec of allAliases) {
          const wav = String(rec.wav).replace(/\.wav$/i, "");
          const bucket = (m[wav] = m[wav] || {});
          for (const a of rec.aliases) bucket[a.alias] = a.phonemes;
        }
        const mapObj = { format: inputFormat, detectedLanguage: detectedLanguage, m };
        f.write(JSON.stringify(mapObj, null, 2), "UTF-8");
      } catch (e) {  }
    }
  }
}

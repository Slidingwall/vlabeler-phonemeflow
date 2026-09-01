const fmt = params["format"] || "UTAU";
let mode = params["mode"] || "CVVC";
const pitchSuf = (params["pitchSuffix"] || "").trim();
const vLangParam = params["language"] || ""; 
const ignoreVCV = params["ignoreVCV"] === true || params["ignoreVCV"] === "true";
const sampRate = parseInt(params["sampleRate"] || "44100", 10) || 44100;
const vocRaw = (params["exportPath"] || "").trim();
const vcScheme = (params["vcScheme"] || "").trim();
const aliasMapPath = params["aliasMap"] || "";
const errs = [];
let mappingTable = null;
let vLang = vLangParam;
if (params["mappingTable"]) {
  try {
    mappingTable = JSON.parse(File.fromPath(params["mappingTable"]).readText());
    const dl = mappingTable && mappingTable.detectedLanguage;
    if (dl === "japanese" || dl === "chinese" || dl === "english") vLang = dl;
  } catch (e) { errs.push(`mappingTable read/parse error: ${e.message}`); }
}
const VOW = "vowel", PLOS = "plosive", CONT = "continuant", SIL = "sil";
const PITCH_RE = /^([A-Ga-g])(#)?([1-7])$/;
const LANG_MAP = { japanese: "JA-ROMAJI", chinese: "ZH-PINYIN", english: "EN-ARPABET" };
const langKey = LANG_MAP[vLang];
const useAlias = fmt !== "VocalSharp" && vLang !== "english";
if (fmt === "DeepVocal" || fmt === "VocalSharp") mode = "CVVC";
function loadJson(name) {
  const raw = typeof resources !== "undefined" ? resources[name] : null;
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (e) { errs.push(`${name} parse error: ${e.message}`); return null; }
}
function langBlk(data, key) {
  return data && key ? data.find(b => b.language === key) || null : null;
}
function loadTable(name) {
  const blk = langBlk(loadJson(name), langKey);
  return blk?.table ?? null;
}
const UNVOICED = {
  japanese: ["p","t","k","s","sh","h","f","ts","ch","Sil","Asp","?"],
  chinese:  ["b","p","d","t","g","k","z","c","zh","ch","j","q","f","s","sh","x","h"],
  english:  ["p","t","k","f","th","s","sh","ch","h"]
};
const PLOS_SET = {
  japanese: ["p","t","k","b","d","g","ts","ch","q"],
  chinese:  ["b","p","d","t","g","k"],
  english:  ["p","b","t","d","k","g"]
};
const unvoiced = sym => sym === "Sil" || sym === "Asp" || sym === "?" || (UNVOICED[vLang] || []).includes(sym);
const voiced = sym => !unvoiced(sym);
const isPlos = sym => (PLOS_SET[vLang] || []).includes(sym);
const SIL_SET = ["pau", "sil", "breath", "br", "cl", "silb", "ap", "sp"];
let _phTbl = null;
function phTbl() {
  if (_phTbl === null) {
    const blk = langBlk(loadJson("phonemes.json"), langKey);
    _phTbl = (blk && blk.phonemes) ? blk.phonemes : { vowels: [], continuant: [], plosive: [] };
  }
  return _phTbl;
}
function classify(name) {
  const n = name == null ? "" : String(name).trim().toLowerCase();
  if (!n || SIL_SET.includes(n)) return SIL;
  const t = phTbl();
  if (t.plosive && t.plosive.includes(n)) return PLOS;
  if (t.continuant && t.continuant.includes(n)) return CONT;
  if (t.vowels && t.vowels.includes(n)) return VOW;
  return VOW;
}
const ms = t => Math.round(t);
function effBound(p) {
  let ss = p.ss, se = p.se;
  if (p.type === PLOS) {
    if (se == null) throw new Error(`plosive ${p.name} missing se`);
    ss = p.start;
  } else if (p.type === CONT) {
    if (ss == null) throw new Error(`continuant ${p.name} missing ss`);
    se = p.end;
  } else if (p.type === VOW) {
    if (ss == null || se == null) throw new Error(`vowel ${p.name} needs ss and se`);
  } else if (p.type !== SIL) {
    throw new Error(`unknown type ${p.type} (${p.name})`);
  }
  return [ss, se];
}
function pitchGet(s) {
  if (!s) return "";
  const m = s.trim().match(PITCH_RE);
  return m ? m[1].toUpperCase() + (m[2] || "") + m[3] : "";
}
const pitchDetect = list => (list || []).reduce((res, c) => res || pitchGet(c), "");
function loadAlias(text) {
  const map = new Map();
  if (!text) return map;
  for (const line of text.split("\n")) {
    const ln = line.trim();
    if (!ln || ln.startsWith("#")) continue;
    const eq = ln.indexOf("=");
    if (eq < 0) continue;
    const key = ln.slice(0, eq).trim();
    const val = ln.slice(eq + 1).trim();
    if (key) map.set(key, val);
  }
  return map;
}
function applyRule(map, phon) {
  let best = null;
  for (const key of map.keys()) {
    if (phon === key && (best === null || key.length > best.length)) best = key;
  }
  return best === null ? phon : map.get(best);
}
let vcVow = new Set();
let vcCons = new Set();
let vcOn = false;
let vcId = "";
(function loadVC() {
  const data = loadJson("VC.json");
  const blk = langBlk(data, langKey);
  if (!blk?.vcSchemes?.length) return;
  const scheme = vcScheme ? blk.vcSchemes.find(s => s.schemeId === vcScheme) : blk.vcSchemes[0];
  if (vcScheme && !scheme) { errs.push(`vcScheme '${vcScheme}' not found for ${langKey}`); return; }
  if (!scheme) return;
  vcId = scheme.schemeId;
  vcVow = new Set(scheme.vowels || []);
  vcCons = new Set(scheme.consonants || []);
  vcOn = true;
})();
function vowelStrip(v) {
  v = String(v);
  if (vcOn) {
    if (vcVow.has(v)) return v;
    const cut = v.replace(/^[ywvV]+/, "");
    if (cut !== v && vcVow.has(cut)) return cut;
    return v;
  }
  return v.replace(/^[ywvV]+/, "");
}
let bundledMap = null;
if (useAlias) {
  const table = loadTable("alias.json");
  if (table) bundledMap = new Map(Object.entries(table));
}
let xsMap = null;
if (fmt === "Vocaloid") {
  const table = loadTable("xsampa.json");
  if (table) xsMap = new Map(Object.entries(table));
}
const toXs = sym => xsMap ? (xsMap.get(sym) || sym) : sym;
function getAlias(kind, names) {
  if (vLang === "english") return names.join(" ");
  let seq, out;
  if (kind === "cv" || kind === "head") {
    seq = `${names[0]} ${names[1]}`;
    out = names[0] + names[1];
  } else if (kind === "vc") {
    seq = `${vowelStrip(names[0])} ${names[1]}`;
    out = seq;
  } else if (kind === "vcv") {
    seq = `${names[0]} ${names[1]} ${names[2]}`;
    out = `${names[0]} ${names[1]}${names[2]}`;
  } else {
    seq = out = names.join(" ");
  }
  if (bundledMap) {
    if (bundledMap.has(seq)) return bundledMap.get(seq);
    if (bundledMap.has(out)) return bundledMap.get(out);
  }
  return out;
}
function genList(phones, eff, mode) {
  const n = phones.length;
  const list = [];
  const seen = new Set();
  const push = (rawAlias, phonemes, ptypes, kind, oA, ovlA, preA, conA, endA) => {
    const key = `${rawAlias}|${Math.round(oA * 1e6)}|${Math.round(endA * 1e6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ alias: rawAlias, phonemes, ptypes, kind, absOff: oA, absOvl: ovlA, absPre: preA, absCon: conA, absEnd: endA });
  };
  for (let i = 0; i < n; i++) {
    const p = phones[i];
    if (mode === "VCV") {
      if (p.type === VOW && i + 2 < n) {
        const c = phones[i + 1], v2 = phones[i + 2];
        if ((c.type === PLOS || c.type === CONT) && v2.type === VOW) {
          push(getAlias("vcv", [p.name, c.name, v2.name]),
            [p.name, c.name, v2.name], [p.type, c.type, v2.type], "vcv",
            eff[i][0], eff[i][1], v2.start, eff[i + 2][0], eff[i + 2][1]);
        }
      }
    } else {
      if ((p.type === PLOS || p.type === CONT) && i + 1 < n) {
        const v = phones[i + 1];
        if (v.type === VOW) {
          const head = i === 0 || phones[i - 1].type === SIL;
          const nm = [p.name, v.name];
          const ovl = eff[i][1] < v.start ? eff[i][1] : eff[i][0];
          push((head ? "- " : "") + getAlias("cv", nm),
            nm, [p.type, v.type], head ? "head" : "cv",
            eff[i][0], ovl, v.start, eff[i + 1][0], eff[i + 1][1]);
        }
      }
      if (p.type === VOW && i + 1 < n) {
        const c = phones[i + 1];
        if (c.type === PLOS || c.type === CONT) {
          const vcV = vowelStrip(p.name);
          if (!vcOn || (vcVow.has(vcV) && vcCons.has(c.name))) {
            push(getAlias("vc", [p.name, c.name]),
              [p.name, c.name], [p.type, c.type], "vc",
              eff[i][0], eff[i][1], c.start, eff[i + 1][0], eff[i + 1][1]);
          }
        }
      }
    }
  }
  return list;
}
const write = (outFile, text, enc) => outFile.write(text, enc || "UTF-8");
const safe = s => String(s).replace(/[^A-Za-z0-9]/g, "_");
function quant(bound) {
  const b = [...bound];
  const sr = sampRate;
  for (let i = 0; i < b.length; i++) {
    const val = b[i] / 1000 * sr;
    b[i] = (i === 0 || i !== b.length - 1 ? Math.floor(val) : Math.ceil(val)) * 1000 / sr;
  }
  const min = 10;
  for (let i = 1; i < b.length; i++) {
    if (b[i] - b[i - 1] < min) b[i - 1] = b[i] - min;
  }
  return b;
}
function vocArt(entry) {
  const arts = [];
  const { kind, phonemes: ph, wavName, absOff, absOvl, absPre, absCon, absEnd } = entry;
  const o = ms(absOff), ov = ms(absOvl), pre = ms(absPre), con = ms(absCon), en = ms(absEnd);
  const make = (type, phonemes, ptimes, bound) => ({ type, phonemes, ptimes, bound, cropOff: o, cropCut: en, wavName });
  if (kind === "cv" || kind === "head") {
    const [cSym, vSym] = ph;
    const cStart = isPlos(cSym) ? ov : (ov > o ? o + Math.round((ov - o) / 2) : o);
    const ptimes = [[cSym, cStart, pre], [vSym, pre, con]];
    arts.push(make("cv", [cSym, vSym], ptimes, quant([cStart, pre, con])));
  } else if (kind === "vc") {
    const [vSym, cSym] = ph;
    const cEnd = con + Math.round((en - con) / 2);
    const ptimes = [[vSym, o, pre], [cSym, pre, cEnd]];
    arts.push(make("vc", [vSym, cSym], ptimes, quant([o, pre, cEnd])));
  } else if (kind === "vcv") {
    const [v1, cSym, v2] = ph;
    const cCenter = ov + (isPlos(cSym) ? 20 : Math.round((pre - ov) / 2));
    if (!ignoreVCV) {
      arts.push(make("vcv", [v1, cSym, v2],
        [[v1, o, ov], [cSym, ov, pre], [v2, pre, con]],
        quant([o, ov, cCenter, pre, con])));
    }
    arts.push(make("vc", [v1, cSym], [[v1, o, ov], [cSym, ov, pre]], quant([o, ov, cCenter])));
    const cStart2 = isPlos(cSym) ? ov : (ov > o ? o + Math.round((ov - o) / 2) : o);
    arts.push(make("cv", [cSym, v2], [[cSym, cStart2, pre], [v2, pre, con]], quant([cCenter, pre, con])));
  }
  return arts;
}
function exportUta(list, outFile) {
  const seen = new Set();
  const lines = [];
  for (const e of list) {
    const wav = e.wavName?.toLowerCase().endsWith(".wav") ? e.wavName : `${e.wavName}.wav`;
    const l = `${wav}=${e.alias},${ms(e.absOff)},${ms(e.absCon - e.absOff)},${-ms(e.absEnd - e.absOff)},${ms(e.absPre - e.absOff)},${ms(e.absOvl - e.absOff)}`;
    if (!seen.has(l)) { seen.add(l); lines.push(l); }
  }
  write(outFile, lines.join("\n") + (lines.length ? "\n" : ""));
  return lines.length;
}
function exportDv(list, outFile) {
  const cfg = {};
  for (const e of list) {
    const wav = e.wavName?.toLowerCase().endsWith(".wav") ? e.wavName : `${e.wavName}.wav`;
    const pitch = e.pitch || "#";
    const symbol = e.phonemes.join("");
    const isVX = e.kind === "head" || e.phonemes.length === 1;
    const td = isVX ? 50 : 5;
    const { absOff: startTime, absCon: vStart, absEnd: vEnd, absPre: pre } = e;
    const tail = vEnd + td;
    const end = vEnd + 2 * td;
    cfg[`${pitch}->${symbol}`] = {
      connectPoint: 0,
      endTime: (end / 1000).toFixed(6),
      pitch,
      preutterance: (pre / 1000).toFixed(6),
      srcType: isVX ? "VX" : "CV",
      startTime: (startTime / 1000).toFixed(6),
      symbol,
      tailPoint: (tail / 1000).toFixed(6),
      updateTime: new Date().toISOString().slice(0, 19).replace("T", " "),
      vowelEnd: (vEnd / 1000).toFixed(6),
      vowelStart: (vStart / 1000).toFixed(6),
      wavName: wav
    };
  }
  write(outFile, JSON.stringify(cfg, null, 2));
  return list.length;
}
const vsStr = e => e.kind === "head" ? ` ${e.phonemes[0]}` : `${e.phonemes[0]} ${e.phonemes[1]}`;
function exportVs(list, outFile) {
  const lines = list.map(e => {
    const wav = e.wavName?.toLowerCase().endsWith(".wav") ? e.wavName : `${e.wavName}.wav`;
    return `${vsStr(e)},${wav},${ms(e.absOff)},${ms(e.absPre)},${ms(e.absCon)},${ms(e.absEnd)},${ms(e.absOvl)}`;
  });
  write(outFile, lines.join("\n") + (lines.length ? "\n" : ""));
  return lines.length;
}
function genSeg(phTime, cutMs, wavMs) {
  const lines = [`nPhonemes ${phTime.length + 2}`, "articulationsAreStationaries = 0", "phoneme\t\tBeginTime\t\tEndTime", "==================================================="];
  lines.push(`Sil\t\t0.000000\t\t${(phTime[0][1] / 1000).toFixed(6)}`);
  for (let i = 0; i < phTime.length; i++) {
    const begin = phTime[i][1] / 1000;
    const end = i === phTime.length - 1 ? cutMs / 1000 : phTime[i + 1][1] / 1000;
    lines.push(`${phTime[i][0]}\t\t${begin.toFixed(6)}\t\t${end.toFixed(6)}`);
  }
  lines.push(`Sil\t\t${(cutMs / 1000).toFixed(6)}\t\t${(wavMs / 1000).toFixed(6)}`);
  return lines.join("\n") + "\n";
}
function genAs0(type, ph, bound, cutSamp) {
  const content = [`nphone art segmentation`, "{", `\tphns: ["${ph.join('", "')}"];`, "\tcut offset: 0;", `\tcut length: ${cutSamp};`];
  content.push(`\tboundaries: [${bound.map(b => (b / 1000).toFixed(9)).join(", ")}];`, "\trevised: false;");
  const voicedList = [];
  const tri = ph.length === 3;
  for (let i = 0; i < ph.length; i++) {
    const v = voiced(ph[i]);
    voicedList.push(String(v).toLowerCase());
    if (tri && i === 1) voicedList.push(String(v).toLowerCase());
  }
  content.push(`\tvoiced: [${voicedList.join(", ")}];`, "};", "");
  return content.join("\n");
}
function writeVoc(outDir, arts) {
  const files = [];
  const artList = [];
  const nameSet = new Set();
  for (const art of arts) {
    const outPh = art.phonemes.map(toXs);
    let base = `${art.type}_${art.phonemes.map(safe).join("_")}`;
    let uniq = base, idx = 1;
    while (nameSet.has(uniq)) uniq = `${base}_${idx++}`;
    nameSet.add(uniq);
    const delta = art.cropOff < 100 ? (100 - art.cropOff) : -(art.cropOff - 100);
    const cropMs = (art.cropCut - art.cropOff) + 200;
    const cutPos = art.cropCut + delta;
    const relPh = art.ptimes.map((p, i) => [outPh[i] ?? p[0], p[1] + delta, p[2] + delta]);
    const relBound = art.bound.map(b => b + delta);
    const trans = `${outPh.join(" ")}\n[${outPh.join(" ")}]`;
    const segTxt = genSeg(relPh, cutPos, cropMs);
    const cutLen = Math.round(cropMs / 1000 * sampRate);
    const as0Txt = genAs0(art.type, outPh, relBound, cutLen);
    const transFile = File.fromPathAndChildPath(outDir, `${uniq}.trans`);
    const segFile = File.fromPathAndChildPath(outDir, `${uniq}.seg`);
    const as0File = File.fromPathAndChildPath(outDir, `${uniq}.as0`);
    write(transFile, trans);
    write(segFile, segTxt);
    write(as0File, as0Txt);
    files.push(transFile.getAbsolutePath(), segFile.getAbsolutePath(), as0File.getAbsolutePath());
    artList.push({
      file: uniq,
      srcWav: art.wavName,
      cropStartMs: Math.max(0, art.cropOff - 100),
      cropEndMs: art.cropCut + 100,
      sampleRate: sampRate
    });
  }
  const maniFile = File.fromPathAndChildPath(outDir, "manifest.json");
  write(maniFile, JSON.stringify({ sampleRate: sampRate, articulations: artList }, null, 2));
  files.push(maniFile.getAbsolutePath());
  return { files, arts: artList };
}
let aliasTxt = "";
if (aliasMapPath) {
  try { aliasTxt = File.fromPath(aliasMapPath).readText(); }
  catch (e) { errs.push(`aliasMap read error: ${e.message}`); }
}
const aliasMap = loadAlias(aliasTxt);
const manifestMap = new Map();
if (mappingTable && mappingTable.m && typeof mappingTable.m === "object") {
  for (const wav of Object.keys(mappingTable.m)) {
    const w = wav.replace(/\.wav$/i, "");
    const aliases = mappingTable.m[wav] || {};
    for (const alias of Object.keys(aliases)) {
      const ph = (aliases[alias] || []).join(",");
      if (ph && alias != null) manifestMap.set(`${w}|${ph}`, String(alias));
    }
  }
}
let exportDir = null;
if (vocRaw) {
  exportDir = /^[A-Za-z]:[\\/]/.test(vocRaw) || vocRaw.startsWith("/")
    ? vocRaw
    : (typeof projectRootDirectory !== "undefined" && projectRootDirectory
      ? File.fromPathAndChildPath(projectRootDirectory, vocRaw).getAbsolutePath()
      : vocRaw);
}
const allList = [];
const pitchLog = [];
for (const module of modules) {
  const sampDir = module.sampleDirectory || "";
  const folder = (sampDir.split(/[\\/]/).pop() || "");
  const bySamp = new Map();
  for (const e of module.entries) {
    let s = e.sample && String(e.sample).trim() !== ""
      ? String(e.sample).trim()
      : (module.sampleFileNames?.length ? module.sampleFileNames[0] : "");
    s = s.split(/[\\/]/).pop();
    if (!bySamp.has(s)) bySamp.set(s, []);
    bySamp.get(s).push(e);
  }
  for (const [sampName, sampEntries] of bySamp) {
    if (!sampName) continue;
    const wavName = sampName.toLowerCase().endsWith(".wav") ? sampName : `${sampName}.wav`;
    let pitch = pitchSuf || pitchDetect([folder, sampName.replace(/\.[^.]+$/, "")]);
    if (pitch && !/^[A-G](#)?[1-7]$/.test(pitch)) {
      errs.push(`${sampName}: bad pitch '${pitch}'`);
      pitch = "";
    }
    if (!pitch) pitchLog.push(`${sampName} (pitch not detected)`);
    const phones = sampEntries.map(e => ({
      name: e.name, start: e.start, end: e.end,
      ss: e.points[0], se: e.points[1],
      type: classify(e.name)
    }));
    let eff;
    try { eff = phones.map(effBound); }
    catch (e) { errs.push(`${sampName}: ${e.message}`); continue; }
    const entries = genList(phones, eff, mode);
    for (const g of entries) {
      g.pitch = pitch;
      g.wavName = wavName;
      g.sampleDir = sampDir;
      const mkey = `${sampName.replace(/\.wav$/i, "")}|${(g.phonemes || []).join(",")}`;
      if (manifestMap.has(mkey)) {
        g.alias = manifestMap.get(mkey);
      } else {
        g.alias = (useAlias ? applyRule(aliasMap, g.alias) : g.alias) + (pitch ? ` ${pitch}` : "");
      }
    }
    allList.push(...entries);
  }
}
const root = typeof projectRootDirectory !== "undefined" && projectRootDirectory ? projectRootDirectory : "";
const outFiles = [];
let total = 0;
if (fmt === "Vocaloid") {
  if (!exportDir) {
    errs.push("Vocaloid export requires 'Export path (folder)'. Please set it before exporting.");
  } else {
    const allArt = allList.flatMap(vocArt);
    const written = writeVoc(exportDir, allArt);
    total += allArt.length;
    outFiles.push(...written.files);
  }
} else if (fmt === "DeepVocal") {
  if (exportDir) {
    const byP = new Map();
    allList.forEach(e => { const p = e.pitch || ""; if (!byP.has(p)) byP.set(p, []); byP.get(p).push(e); });
    for (const [p, entries] of byP) {
      const nm = `voice${p ? "_" + p : ""}.dvcfg`;
      const outFile = File.fromPathAndChildPath(exportDir, nm);
      total += exportDv(entries, outFile);
      outFiles.push(outFile.getAbsolutePath());
    }
  } else {
    const outFile = File.fromPathAndChildPath(root, "voice.dvcfg");
    total += exportDv(allList, outFile);
    outFiles.push(outFile.getAbsolutePath());
  }
} else if (fmt === "UTAU") {
  if (exportDir) {
    const byP = new Map();
    allList.forEach(e => { const p = e.pitch || ""; if (!byP.has(p)) byP.set(p, []); byP.get(p).push(e); });
    for (const [p, entries] of byP) {
      const nm = `oto${p ? "_" + p : ""}.ini`;
      const outFile = File.fromPathAndChildPath(exportDir, nm);
      total += exportUta(entries, outFile);
      outFiles.push(outFile.getAbsolutePath());
    }
  } else {
    const group = new Map();
    allList.forEach(e => { if (!group.has(e.sampleDir)) group.set(e.sampleDir, []); group.get(e.sampleDir).push(e); });
    for (const [sampDir, entries] of group) {
      const outFile = File.fromPathAndChildPath(sampDir, "oto.ini");
      total += exportUta(entries, outFile);
      outFiles.push(outFile.getAbsolutePath());
    }
  }
} else if (fmt === "VocalSharp") {
  if (exportDir) {
    const byP = new Map();
    allList.forEach(e => { const p = e.pitch || ""; if (!byP.has(p)) byP.set(p, []); byP.get(p).push(e); });
    for (const [p, entries] of byP) {
      const nm = `oto${p ? "_" + p : ""}.vsdxmf`;
      const outFile = File.fromPathAndChildPath(exportDir, nm);
      total += exportVs(entries, outFile);
      outFiles.push(outFile.getAbsolutePath());
    }
  } else {
    const group = new Map();
    allList.forEach(e => { if (!group.has(e.sampleDir)) group.set(e.sampleDir, []); group.get(e.sampleDir).push(e); });
    for (const [sampDir, entries] of group) {
      const outFile = File.fromPathAndChildPath(sampDir, "oto.vsdxmf");
      total += exportVs(entries, outFile);
      outFiles.push(outFile.getAbsolutePath());
    }
  }
}
let enRep = `Exported ${total} entries (${mode}, ${fmt}) to:\n${outFiles.join("\n")}`;
let zhRep = `已导出 ${total} 条条目（${mode}，格式 ${fmt}）到：\n${outFiles.join("\n")}`;
let jaRep = `${total} 件を書き出しました（${mode}, ${fmt}）`;
if (errs.length) {
  enRep += `\nErrors:\n${errs.join("\n")}`;
  zhRep += `\n错误：\n${errs.join("\n")}`;
  jaRep += `\nエラー:\n${errs.join("\n")}`;
}
if (pitchLog.length) {
  enRep += `\nPitch notes:\n${pitchLog.join("\n")}`;
  zhRep += `\n音高提示：\n${pitchLog.join("\n")}`;
  jaRep += `\nピッチ通知:\n${pitchLog.join("\n")}`;
}
if (fmt === "Vocaloid") {
  enRep += `\n[NOTE] Vocaloid seg/trans/as0 written to ${exportDir}. Crop wav with:\n  python tools/vocaloid-crop.py ${exportDir} --manifest ${exportDir}/manifest.json`;
  zhRep += `\n[提示] Vocaloid 的 seg/trans/as0 已写出至 ${exportDir}。裁剪 wav 请运行：\n  python tools/vocaloid-crop.py ${exportDir} --manifest ${exportDir}/manifest.json`;
  jaRep += `\n[注記] Vocaloid seg/trans/as0 は ${exportDir} に出力されました。wav切り抜きコマンド:\n  python tools/vocaloid-crop.py ${exportDir} --manifest ${exportDir}/manifest.json`;
} else {
  enRep += `\n[NOTE] ${fmt} references the long recording directly (no wav crop).`;
  zhRep += `\n[提示] ${fmt} 直接引用长录音，未裁剪 wav。`;
  jaRep += `\n[注記] ${fmt} は長尺録音を直接参照します（wav切り抜きなし）。`;
}
report({ en: enRep, zh: zhRep, ja: jaRep });

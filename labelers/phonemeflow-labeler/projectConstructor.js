const exts = (typeof acceptedSampleExtensions !== "undefined" && acceptedSampleExtensions && acceptedSampleExtensions.length)
  ? acceptedSampleExtensions.map(e => String(e).toLowerCase())
  : ["wav", "mp3", "ogg", "flac", "aiff", "m4a", "aif"];
function isAudio(f) {
  return exts.includes(f.getExtension().toLowerCase());
}
modules = [];
const inputFile = (typeof params !== "undefined" && params["inputFile"]) ? String(params["inputFile"]) : "";
const inputPaths = inputFile ? [inputFile] : [];
function walk(dir, rel) {
  if (!dir.exists() || !dir.isDirectory()) return;
  const samples = dir.listChildFiles().filter(isAudio);
  if (samples.length) {
    modules.push(new ModuleDefinition(
      rel || "(Root)",
      dir.getAbsolutePath(),
      samples.map(f => f.getName()),
      inputPaths,
      null
    ));
  }
  for (const sub of dir.listChildDirectories()) {
    walk(sub, rel ? rel + "/" + sub.getName() : sub.getName());
  }
}
walk(root, "");
if (!modules.length) {
  error("No audio files found in the project folder. Put wav files inside the project folder (subfolders allowed).");
}

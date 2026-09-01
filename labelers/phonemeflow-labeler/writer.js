let groups = [];
for (let mi = 0; mi < moduleNames.length; mi++) {
  const entries = modules[mi] || [];
  const byWav = {};
  for (const e of entries) {
    const wav = e.sample ? String(e.sample) : "";
    if (!byWav[wav]) byWav[wav] = [];
    byWav[wav].push(e);
  }
  for (const wav in byWav) {
    const phs = byWav[wav].map(e => ({ k: e.name, v: [e.start, e.points[0], e.points[1], e.end] }));
    groups.push({ wav: wav, phonemes: phs });
  }
}
output = JSON.stringify(groups, null, 4);

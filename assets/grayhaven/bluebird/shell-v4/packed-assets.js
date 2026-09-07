export async function readPacked(url, progress) {
  const manifestURL = new URL(url + '.parts.json', location.href);
  const response = await fetch(manifestURL);
  if (!response.ok) throw new Error('文件清单载入失败');
  const manifest = await response.json();
  let done = 0;
  const chunks = await Promise.all(manifest.parts.map(async path => {
    const r = await fetch(new URL(path, manifestURL));
    if (!r.ok) throw new Error('文件载入失败，请重试');
    const b = await r.arrayBuffer();
    done += b.byteLength;
    progress?.(done, manifest.size);
    return new Uint8Array(b);
  }));
  const bytes = new Uint8Array(manifest.size);
  let offset = 0;
  for (const b of chunks) { bytes.set(b, offset); offset += b.byteLength; }
  if (offset !== manifest.size) throw new Error('文件长度不匹配');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
  if (hash !== manifest.sha256) throw new Error('文件完整性校验未通过');
  return { bytes, filename: manifest.filename };
}

document.addEventListener('click', async e => {
  const a = e.target.closest?.('a[data-packed]');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.loading) return;
  const original = a.textContent;
  a.dataset.loading = 'true';
  try {
    const { bytes, filename } = await readPacked(a.href, (n,total) => { a.textContent = '正在准备下载 ' + Math.round(100*n/total) + '%'; });
    const url = URL.createObjectURL(new Blob([bytes]));
    const download = document.createElement('a');
    download.href = url; download.download = filename; download.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) { alert(err.message); }
  finally { delete a.dataset.loading; a.textContent = original; }
});

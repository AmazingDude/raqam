// Synthetic, selectable-text statements only; no private financial records.
export function statementPdf(pages: string[][][], ruled = false, columnX = [30, 120, 330, 430, 530]): Buffer {
  const fontId = 3 + pages.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  pages.forEach((rows, pageIndex) => {
    const pageId = 3 + pageIndex * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const lines = rows.map((row, rowIndex) => row.map((cell, column) => cell
      ? `1 0 0 1 ${columnX[column]} ${740 - rowIndex * 30} Tm (${escapeText(cell)}) Tj` : '').filter(Boolean).join(' '));
    const bottom = 755 - rows.length * 30;
    const grid = ruled ? [...[20,110,320,420,520,590].map(x => `${x} 755 m ${x} ${bottom} l S`), ...Array.from({length: rows.length + 1}, (_, i) => `20 ${755 - i * 30} m 590 ${755 - i * 30} l S`)].join(' ') : '';
    const stream = Buffer.from(`${grid} BT /F1 10 Tf ${lines.join(' ')} ET`, 'ascii');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream.toString('ascii')}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const parts = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  let length = parts[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const part = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'ascii');
    parts.push(part); length += part.length;
  });
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'ascii'));
  return Buffer.concat(parts);
}

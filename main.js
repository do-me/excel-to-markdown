// --- Toast Notification ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `px-4 py-2 rounded shadow text-white text-sm animate-fade-in ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  }`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
    setTimeout(() => container.removeChild(toast), 500);
  }, 2000);
}

// --- Parsing Logic ---

// --- Cell Cleanup Rules (see GitHub issue #1) ---
// Built-in rules for ** and <br>, plus arbitrary custom find→replace rules.
// All state (panel visibility, toggles, values, custom rules) persists in localStorage.

const CLEANUP_KEY = 'cleanupConfig';
let cleanupState = {
  visible: false,
  bold: { on: false, repl: '' },
  br: { on: false, repl: '' },
  custom: [] // { on, find, repl }
};

function loadCleanupState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLEANUP_KEY));
    if (saved && typeof saved === 'object') {
      cleanupState = {
        visible: !!saved.visible,
        bold: { on: !!saved.bold?.on, repl: saved.bold?.repl ?? '' },
        br: { on: !!saved.br?.on, repl: saved.br?.repl ?? '' },
        custom: Array.isArray(saved.custom)
          ? saved.custom.map(r => ({ on: !!r.on, find: r.find ?? '', repl: r.repl ?? '' }))
          : []
      };
    }
  } catch (e) { /* corrupted storage -> defaults */ }
}

function saveCleanupState() {
  localStorage.setItem(CLEANUP_KEY, JSON.stringify(cleanupState));
}

function cleanCell(cell) {
  let result = String(cell);
  if (cleanupState.bold.on) {
    result = result.split('**').join(cleanupState.bold.repl);
  }
  if (cleanupState.br.on) {
    result = result.replace(/<\s*\/?\s*br\s*\/?\s*>/gi, cleanupState.br.repl);
  }
  for (const rule of cleanupState.custom) {
    if (rule.on && rule.find) {
      result = result.split(rule.find).join(rule.repl);
    }
  }
  return result.trim();
}

// Re-render the preview silently (no toast) if one is already showing
function refreshPreview() {
  const output = document.getElementById('outputArea');
  if (!output || !output.innerHTML.trim()) return;
  const { rows } = parseInput();
  output.innerHTML = rows.length
    ? generateTableHTML(rows)
    : '<p class="text-red-500">❌ Could not detect table format.</p>';
}

function toggleCleanup() {
  cleanupState.visible = !cleanupState.visible;
  saveCleanupState();
  renderCleanupUI();
}

function updateBuiltinRule(key, field, value) {
  cleanupState[key][field] = value;
  saveCleanupState();
  refreshPreview();
}

function addCustomRule() {
  cleanupState.custom.push({ on: true, find: '', repl: '' });
  saveCleanupState();
  renderCustomRules();
}

function updateCustomRule(i, field, value) {
  cleanupState.custom[i][field] = value;
  saveCleanupState();
  refreshPreview();
}

function deleteCustomRule(i) {
  cleanupState.custom.splice(i, 1);
  saveCleanupState();
  renderCustomRules();
  refreshPreview();
}

function renderCleanupUI() {
  document.getElementById('cleanupPanel').classList.toggle('hidden', !cleanupState.visible);
  document.getElementById('cleanupChevron').className =
    'fas text-xs ' + (cleanupState.visible ? 'fa-chevron-up' : 'fa-chevron-down');
  document.getElementById('replaceBold').checked = cleanupState.bold.on;
  document.getElementById('replaceBoldChar').value = cleanupState.bold.repl;
  document.getElementById('replaceBr').checked = cleanupState.br.on;
  document.getElementById('replaceBrChar').value = cleanupState.br.repl;
  renderCustomRules();
}

function renderCustomRules() {
  const container = document.getElementById('customRules');
  container.innerHTML = '';
  const inputClass = 'flex-1 min-w-0 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 font-mono text-xs';

  cleanupState.custom.forEach((rule, i) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'accent-blue-600';
    cb.checked = rule.on;
    cb.addEventListener('change', () => updateCustomRule(i, 'on', cb.checked));

    const find = document.createElement('input');
    find.type = 'text';
    find.className = inputClass;
    find.placeholder = 'find';
    find.value = rule.find;
    find.addEventListener('input', () => updateCustomRule(i, 'find', find.value));

    const arrow = document.createElement('span');
    arrow.className = 'text-gray-400';
    arrow.textContent = '→';

    const repl = document.createElement('input');
    repl.type = 'text';
    repl.className = inputClass;
    repl.placeholder = '(nothing)';
    repl.value = rule.repl;
    repl.addEventListener('input', () => updateCustomRule(i, 'repl', repl.value));

    const del = document.createElement('button');
    del.className = 'text-red-500 hover:text-red-700 px-1';
    del.title = 'Delete rule';
    del.innerHTML = '<i class="fas fa-trash-alt"></i>';
    del.addEventListener('click', () => deleteCustomRule(i));

    row.append(cb, find, arrow, repl, del);
    container.appendChild(row);
  });
}

function parseInput() {
  const parsed = parseInputRaw();
  return { ...parsed, rows: parsed.rows.map(row => row.map(cleanCell)) };
}

function parseInputRaw() {
  const input = document.getElementById('inputArea').value.trim();

  // Try JSON
  if (input.startsWith('[') || input.startsWith('{')) {
    try {
      const data = JSON.parse(input);
      if (Array.isArray(data) && data.length > 0) {
        if (typeof data[0] === 'object' && data[0] !== null) {
          const keys = Object.keys(data[0]);
          const rows = [keys, ...data.map(obj => keys.map(key => obj[key] || ''))];
          return { type: 'json', rows };
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Check for box-drawing table (e.g. claude-code / CLI-style output)
  if (input.includes('│')) {
    const rows = input.split('\n')
      .map(line => line.trim())
      .filter(line => line.includes('│') && !/^[┌┬┐├┼┤└┴┘─╭╮╰╯]+$/.test(line.replace(/│/g, '')))
      .map(line =>
        line.replace(/^│/, '').replace(/│$/, '').split('│').map(cell => cell.trim())
      );
    if (rows.length > 0) return { type: 'box', rows };
  }

  // Check for ASCII table (+---+ borders with | cells, e.g. MySQL CLI output)
  if (/^\+[-+]+\+$/m.test(input.split('\n').map(l => l.trim()).find(l => l.startsWith('+')) || '')) {
    const rows = input.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('|') && line.endsWith('|'))
      .map(line =>
        line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
      );
    if (rows.length > 0) return { type: 'ascii', rows };
  }

  // Check for HTML table
  if (input.includes('<table') || input.includes('<tr') || input.includes('<td') || input.includes('<th')) {
    const container = document.createElement('div');
    container.innerHTML = input;
    const rows = Array.from(container.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
    );
    if (rows.length > 0) return { type: 'html', rows };
  }

  // Check for tab-separated (Excel paste)
  if (input.includes('\t')) {
    const rows = input.split('\n').filter(line => line.trim()).map(row => row.split('\t'));
    return { type: 'excel', rows };
  }

  // Check for markdown table
  if (input.includes('|')) {
    const lines = input.split('\n').filter(line => line.trim().startsWith('|'));
    if (lines.length > 0) {
      let rows = lines.map(line =>
        line.trim().replace(/^(\||\s*)|(\|\s*)$/g, '').split('|').map(cell => cell.trim())
      );
      // Remove Markdown separator lines (e.g. ---)
      rows = rows.filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
      return { type: 'markdown', rows };
    }
  }

  // Auto-detect CSV
  const csvResult = parseCSV(input);
  if (csvResult.rows.length > 0) return csvResult;

  return { type: 'unknown', rows: [] };
}

function parseCSV(input) {
  const lines = input.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { type: 'unknown', rows: [] };

  const separators = [',', ';', '|', '\t'];
  let bestSeparator = ',';
  let maxColumns = 0;

  for (const sep of separators) {
    const testRow = lines[0].split(sep);
    if (testRow.length > maxColumns) {
      maxColumns = testRow.length;
      bestSeparator = sep;
    }
  }

  const rows = lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === bestSeparator && !inQuotes) {
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    result.push(current.trim());
    return result.map(cell => cell.replace(/^"(.*)"$/, '$1'));
  });

  const columnCounts = rows.map(row => row.length);
  const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
  
  if (avgColumns >= 2 && rows.length > 0) {
    return { type: 'csv', rows, separator: bestSeparator };
  }
  return { type: 'unknown', rows: [] };
}

// --- Content Generation Functions (Pure Logic) ---

function generateMarkdown() {
  const { rows } = parseInput();
  if (!rows.length) return null;
  const header = rows[0];
  const separator = header.map(() => '---');
  return [header, separator, ...rows.slice(1)]
    .map(row => '| ' + row.join(' | ') + ' |')
    .join('\n');
}

function generateExcel() {
  const { rows } = parseInput();
  if (!rows.length) return null;
  return rows.map(row => row.join('\t')).join('\n');
}

function generateHTML() {
  const { rows } = parseInput();
  if (!rows.length) return null;
  return generateTableHTML(rows); // Reusing the helper
}

function generateCSV() {
  const { rows } = parseInput();
  if (!rows.length) return null;
  return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function generateJSON() {
  const { rows } = parseInput();
  if (!rows.length || rows.length < 2) return null;
  const header = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = row[i] || '';
    });
    return obj;
  });
  return JSON.stringify(data, null, 2);
}

const BOX_CHARS = {
  unicode: { tl: '┌', tm: '┬', tr: '┐', ml: '├', mm: '┼', mr: '┤', bl: '└', bm: '┴', br: '┘', h: '─', v: '│' },
  ascii:   { tl: '+', tm: '+', tr: '+', ml: '+', mm: '+', mr: '+', bl: '+', bm: '+', br: '+', h: '-', v: '|' }
};

function generateBoxTable(charset) {
  const { rows } = parseInput();
  if (!rows.length) return null;
  const ch = BOX_CHARS[charset];
  const numCols = Math.max(...rows.map(r => r.length));
  const norm = rows.map(r => Array.from({ length: numCols }, (_, i) => String(r[i] ?? '')));
  // Use code-point length so multi-byte chars (e.g. ↔) count as one
  const len = s => [...s].length;
  const widths = Array.from({ length: numCols }, (_, i) => Math.max(...norm.map(r => len(r[i]))));

  const border = (l, m, r) => l + widths.map(w => ch.h.repeat(w + 2)).join(m) + r;
  const isNumeric = c => /\d/.test(c) && /^-?[\d.,\s]+%?$/.test(c.trim());
  const pad = (cell, w, align) => {
    const space = w - len(cell);
    if (align === 'center') {
      const left = Math.floor(space / 2);
      return ' '.repeat(left) + cell + ' '.repeat(space - left);
    }
    return align === 'right' ? ' '.repeat(space) + cell : cell + ' '.repeat(space);
  };
  const rowLine = (r, isHeader) =>
    ch.v + r.map((c, i) =>
      ' ' + pad(c, widths[i], isHeader ? 'center' : (isNumeric(c) ? 'right' : 'left')) + ' '
    ).join(ch.v) + ch.v;

  const out = [border(ch.tl, ch.tm, ch.tr), rowLine(norm[0], true)];
  for (let i = 1; i < norm.length; i++) {
    out.push(border(ch.ml, ch.mm, ch.mr));
    out.push(rowLine(norm[i], false));
  }
  out.push(border(ch.bl, ch.bm, ch.br));
  return out.join('\n');
}

function generateBox() {
  return generateBoxTable('unicode');
}

function generateAscii() {
  return generateBoxTable('ascii');
}

// --- Copy & Download Actions ---

// Helper for download
function downloadContent(content, filename, mimeType) {
  if (!content) return showToast('❌ No valid data to download.', 'error');
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ Downloaded ${filename}`);
}

// Markdown
function copyMarkdown() {
  const content = generateMarkdown();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ Markdown copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadMarkdown() {
  const content = generateMarkdown();
  downloadContent(content, 'table.md', 'text/markdown');
}

// Excel
function copyExcel() {
  const content = generateExcel();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ Excel (TSV) copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadExcel() {
  const { rows } = parseInput();
  if (!rows.length) return showToast('❌ No valid data to download.', 'error');
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Table');
  XLSX.writeFile(workbook, 'table.xlsx');
  showToast('✅ Downloaded table.xlsx');
}

// HTML
function copyHTML() {
  const content = generateHTML();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ HTML copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadHTML() {
  const content = generateHTML();
  downloadContent(content, 'table.html', 'text/html');
}

// CSV
function copyCSV() {
  const content = generateCSV();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ CSV copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadCSV() {
  const content = generateCSV();
  downloadContent(content, 'table.csv', 'text/csv');
}

// JSON
function copyJSON() {
  const content = generateJSON();
  if (!content) return showToast('❌ Header + Data required.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ JSON copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadJSON() {
  const content = generateJSON();
  downloadContent(content, 'table.json', 'application/json');
}

// Unicode box-drawing table
function copyBox() {
  const content = generateBox();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ Unicode table copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

function downloadBox() {
  const content = generateBox();
  downloadContent(content, 'table.txt', 'text/plain');
}

// ASCII table
function copyAscii() {
  const content = generateAscii();
  if (!content) return showToast('❌ No table to convert.', 'error');
  navigator.clipboard.writeText(content)
    .then(() => showToast('✅ ASCII table copied!'))
    .catch(err => showToast('❌ Failed: ' + err, 'error'));
}

// Parquet (hyparquet / hyparquet-writer, lazy-loaded from CDN on first use)
let parquetModulesPromise = null;
function loadParquetModules() {
  if (!parquetModulesPromise) {
    parquetModulesPromise = Promise.all([
      import('https://cdn.jsdelivr.net/npm/hyparquet@1/+esm'),
      import('https://cdn.jsdelivr.net/npm/hyparquet-writer@0.16/+esm'),
      // Optional: adds gzip/brotli/zstd etc. support on top of the built-in snappy
      import('https://cdn.jsdelivr.net/npm/hyparquet-compressors@1/+esm').catch(() => null)
    ]).then(([hyparquet, writer, compressorsMod]) => ({
      hyparquet,
      writer,
      compressors: compressorsMod ? compressorsMod.compressors : undefined
    }));
    parquetModulesPromise.catch(() => { parquetModulesPromise = null; });
  }
  return parquetModulesPromise;
}

function parquetCellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\r?\n/g, ' ');
}

async function downloadParquet() {
  const { rows } = parseInput();
  if (!rows.length || rows.length < 2) return showToast('❌ No valid data to download.', 'error');
  try {
    const { writer } = await loadParquetModules();
    const header = rows[0];
    const body = rows.slice(1);
    const columnData = header.map((name, i) => {
      const values = body.map(row => (row[i] ?? '').toString());
      const nonEmpty = values.filter(v => v.trim() !== '');
      const isNumeric = nonEmpty.length > 0 && nonEmpty.every(v => !isNaN(Number(v)));
      if (isNumeric) {
        return { name, data: values.map(v => v.trim() === '' ? null : Number(v)), type: 'DOUBLE' };
      }
      return { name, data: values, type: 'STRING' };
    });
    const buffer = writer.parquetWriteBuffer({ columnData });
    downloadContent(buffer, 'table.parquet', 'application/vnd.apache.parquet');
  } catch (err) {
    console.error(err);
    showToast('❌ Error generating Parquet file', 'error');
  }
}

function downloadAscii() {
  const content = generateAscii();
  downloadContent(content, 'table-ascii.txt', 'text/plain');
}

// --- Preview / Helper ---

function renderToHTML() {
  const { type, rows, separator } = parseInput();
  const output = document.getElementById('outputArea');

  if (!rows.length) {
    output.innerHTML = '<p class="text-red-500">❌ Could not detect table format.</p>';
    return showToast('❌ Invalid input for rendering.', 'error');
  }

  output.innerHTML = generateTableHTML(rows);
  const typeDisplay = type === 'csv' ? `CSV (${separator})` : type.toUpperCase();
  showToast(`✅ Rendered ${typeDisplay} table to HTML!`);
}

function generateTableHTML(rows) {
  if (rows.length === 0) return '';
  const header = rows[0];
  const body = rows.slice(1);

  const thead = `<thead class="bg-gray-100 dark:bg-gray-700"><tr>${header.map(cell => `<th class="px-4 py-2 border dark:border-gray-600 text-left">${cell}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map(row =>
    `<tr>${row.map(cell => `<td class="px-4 py-2 border dark:border-gray-700">${cell}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;

  return `<table class="table-auto border-collapse w-full text-sm">${thead}${tbody}</table>`;
}

// --- UI / Upload Logic ---

function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
  showToast(`🌙 Dark mode ${isDark ? 'enabled' : 'disabled'}`);
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  const isDark = document.documentElement.classList.contains('dark');
  icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function setupFileUpload() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault(); e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(ev => dropZone.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-gray-700'));
  ['dragleave', 'drop'].forEach(ev => dropZone.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-gray-700'));

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  function handleFile(file) {
    const isExcel = file.name.match(/\.(xlsx|xls)$/i);
    const isParquet = file.name.match(/\.parquet$/i);
    if (isParquet) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const { hyparquet, compressors } = await loadParquetModules();
          const data = await hyparquet.parquetReadObjects({ file: e.target.result, compressors });
          if (!data.length) return showToast('❌ Parquet file has no rows', 'error');
          const header = Object.keys(data[0]);
          const csvOutput = [header, ...data.map(row => header.map(k => parquetCellToString(row[k])))]
            .map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
            .join('\n');
          document.getElementById('inputArea').value = csvOutput;
          showToast(`✅ Loaded Parquet file: ${file.name}`);
          renderToHTML();
        } catch (err) {
          console.error(err);
          showToast('❌ Error parsing Parquet file', 'error');
        }
      };
      reader.onerror = () => showToast('❌ Error reading file', 'error');
      reader.readAsArrayBuffer(file);
    } else if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
          document.getElementById('inputArea').value = csvOutput;
          showToast(`✅ Loaded Excel file: ${file.name}`);
          renderToHTML();
        } catch (err) {
          console.error(err);
          showToast('❌ Error parsing Excel file', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        document.getElementById('inputArea').value = e.target.result;
        showToast(`✅ Loaded text file: ${file.name}`);
        renderToHTML();
      };
      reader.onerror = () => showToast('❌ Error reading file', 'error');
      reader.readAsText(file);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('theme');
  const html = document.documentElement;
  if (saved === 'dark') html.classList.add('dark');
  else if (saved === 'light') html.classList.remove('dark');
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) html.classList.add('dark');
  updateThemeIcon();
  setupFileUpload();
  loadCleanupState();
  renderCleanupUI();
});
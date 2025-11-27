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
function parseInput() {
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
  const content = generateExcel();
  // Downloading as .tsv so Excel opens it correctly without warnings, 
  // or .txt. TSV is safest for "copy paste compatible" downloads.
  downloadContent(content, 'table.tsv', 'text/tab-separated-values');
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
    if (isExcel) {
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
});
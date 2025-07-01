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

function parseInput() {
  const input = document.getElementById('inputArea').value.trim();

  if (input.includes('<table')) {
    const container = document.createElement('div');
    container.innerHTML = input;
    const rows = Array.from(container.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
    );
    return { type: 'html', rows };
  } else if (input.includes('\t')) {
    const rows = input.split('\n').map(row => row.split('\t'));
    return { type: 'excel', rows };
  } else if (input.includes('|')) {
    const lines = input.split('\n').filter(line => line.trim().startsWith('|'));
    let rows = lines.map(line =>
      line.trim().replace(/^(\||\s*)|(\|\s*)$/g, '').split('|').map(cell => cell.trim())
    );
    rows = rows.filter(row => !row.every(cell => /^-+$/.test(cell)));
    return { type: 'markdown', rows };
  }
  return { type: 'unknown', rows: [] };
}

function copyMarkdown() {
  const { rows } = parseInput();
  if (!rows.length) return showToast('❌ No table to convert.', 'error');

  const header = rows[0];
  const separator = header.map(() => '---');
  const markdown = [header, separator, ...rows.slice(1)]
    .map(row => '| ' + row.join(' | ') + ' |')
    .join('\n');

  navigator.clipboard.writeText(markdown)
    .then(() => showToast('✅ Markdown copied to clipboard!'))
    .catch(err => showToast('❌ Failed to copy: ' + err, 'error'));
}

function copyExcel() {
  const { rows } = parseInput();
  if (!rows.length) return showToast('❌ No table to convert.', 'error');

  const tsv = rows.map(row => row.join('\t')).join('\n');

  navigator.clipboard.writeText(tsv)
    .then(() => showToast('✅ Excel-compatible data copied!'))
    .catch(err => showToast('❌ Failed to copy: ' + err, 'error'));
}

function copyHTML() {
  const { rows } = parseInput();
  if (!rows.length) return showToast('❌ No table to convert.', 'error');

  const html = generateTableHTML(rows);
  navigator.clipboard.writeText(html)
    .then(() => showToast('✅ HTML table copied to clipboard!'))
    .catch(err => showToast('❌ Failed to copy: ' + err, 'error'));
}

function copyCSV() {
  const { rows } = parseInput();
  if (!rows.length) return showToast('❌ No table to convert.', 'error');

  const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

  navigator.clipboard.writeText(csv)
    .then(() => showToast('✅ CSV copied to clipboard!'))
    .catch(err => showToast('❌ Failed to copy: ' + err, 'error'));
}

function copyJSON() {
  const { rows } = parseInput();
  if (!rows.length || rows.length < 2) return showToast('❌ Need header + data for JSON.', 'error');

  const header = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = row[i] || '';
    });
    return obj;
  });

  navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    .then(() => showToast('✅ JSON copied to clipboard!'))
    .catch(err => showToast('❌ Failed to copy: ' + err, 'error'));
}

function renderToHTML() {
  const { type, rows } = parseInput();
  const output = document.getElementById('outputArea');

  if (!rows.length) {
    output.innerHTML = '<p class="text-red-500">❌ Could not detect table format.</p>';
    return showToast('❌ Invalid input for rendering.', 'error');
  }

  output.innerHTML = generateTableHTML(rows);
  showToast(`✅ Rendered ${type.toUpperCase()} table to HTML!`);
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

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('theme');
  const html = document.documentElement;

  if (saved === 'dark') {
    html.classList.add('dark');
  } else if (saved === 'light') {
    html.classList.remove('dark');
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    html.classList.add('dark');
  }

  updateThemeIcon();
});

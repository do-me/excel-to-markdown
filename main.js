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

  // Try JSON first
  if (input.startsWith('[') || input.startsWith('{')) {
    try {
      const data = JSON.parse(input);
      if (Array.isArray(data) && data.length > 0) {
        if (typeof data[0] === 'object' && data[0] !== null) {
          // Array of objects - convert to table
          const keys = Object.keys(data[0]);
          const rows = [keys, ...data.map(obj => keys.map(key => obj[key] || ''))];
          return { type: 'json', rows };
        }
      }
    } catch (e) {
      // Not valid JSON, continue with other parsers
    }
  }

  // Check for HTML table
  if (input.includes('<table') || input.includes('<tr') || input.includes('<td') || input.includes('<th')) {
    const container = document.createElement('div');
    container.innerHTML = input;
    const rows = Array.from(container.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
    );
    if (rows.length > 0) {
      return { type: 'html', rows };
    }
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
      // Updated regex to match separator rows with colons (like :--- or ---:)
      rows = rows.filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
      return { type: 'markdown', rows };
    }
  }

  // Auto-detect CSV with different separators
  const csvResult = parseCSV(input);
  if (csvResult.rows.length > 0) {
    return csvResult;
  }

  return { type: 'unknown', rows: [] };
}

function parseCSV(input) {
  const lines = input.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { type: 'unknown', rows: [] };

  // Test different separators
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

  // Parse with the best separator
  const rows = lines.map(line => {
    // Simple CSV parsing - handles quoted fields
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === bestSeparator && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    result.push(current.trim());
    return result.map(cell => cell.replace(/^"(.*)"$/, '$1')); // Remove outer quotes
  });

  // Validate that we have consistent columns
  const columnCounts = rows.map(row => row.length);
  const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
  
  if (avgColumns >= 2 && rows.length > 0) {
    return { type: 'csv', rows, separator: bestSeparator };
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
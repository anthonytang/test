// Track model selection
document.getElementById('modelName').addEventListener('change', function(e) {
    const modelInfo = document.getElementById('modelInfo');
    modelInfo.innerHTML = `Selected model: <strong>${e.target.value}</strong>`;
});

// Track output format selection
document.getElementById('outputFormat').addEventListener('change', function(e) {
    const formatInfo = document.getElementById('formatInfo');
    const formatNames = {
        'text': 'Text',
        'table': 'Table',
        'chart': 'Chart'
    };
    formatInfo.innerHTML = `Selected format: <strong>${formatNames[e.target.value]}</strong>`;
});

// Track file selection
document.getElementById('files').addEventListener('change', function(e) {
    const files = e.target.files;
    const fileInfo = document.getElementById('fileInfo');

    if (files.length > 0) {
        const fileNames = Array.from(files).map(f => f.name).join(', ');
        fileInfo.textContent = `Selected: ${fileNames}`;
        fileInfo.style.display = 'block';
    } else {
        fileInfo.style.display = 'none';
    }
});

// Toggle step visibility
function toggleStep(stepId) {
    const content = document.getElementById(`${stepId}-content`);
    const icon = document.getElementById(`${stepId}-icon`);

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.textContent = '▶';
    } else {
        content.classList.add('expanded');
        icon.textContent = '▼';
    }
}

// Handle form submission
document.getElementById('playgroundForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const files = document.getElementById('files').files;
    const sectionName = document.getElementById('sectionName').value;
    const sectionDescription = document.getElementById('sectionDescription').value;
    const modelName = document.getElementById('modelName').value;
    const outputFormat = document.getElementById('outputFormat').value;

    // Validation
    if (!sectionName || !sectionDescription) {
        alert('Please provide section name and description');
        return;
    }

    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').classList.remove('visible');
    document.getElementById('error').style.display = 'none';
    document.getElementById('submitBtn').disabled = true;

    try {
        // Create FormData
        const formData = new FormData();

        // Add files if any
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        formData.append('section_name', sectionName);
        formData.append('section_description', sectionDescription);
        formData.append('model_name', modelName);
        formData.append('output_format', outputFormat);

        // Call backend
        const response = await fetch('/playground/process', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        const data = await response.json();

        // Display results
        displayResults(data);

    } catch (error) {
        document.getElementById('error').textContent = `Error: ${error.message}`;
        document.getElementById('error').style.display = 'block';
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('submitBtn').disabled = false;
    }
});

function renderTable(tableData) {
    if (!tableData || !tableData.rows || tableData.rows.length === 0) {
        return '<p style="color: #999;">No table data available</p>';
    }

    const rows = tableData.rows;
    let html = '<div class="table-container"><table class="result-table">';

    // Header row (first row)
    html += '<thead><tr>';
    const headerRow = rows[0];
    if (headerRow && headerRow.cells) {
        headerRow.cells.forEach(cell => {
            html += `<th>${escapeHtml(cell.text || '')}</th>`;
        });
    }
    html += '</tr></thead>';

    // Data rows (remaining rows)
    html += '<tbody>';
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.cells) continue;

        html += '<tr>';
        row.cells.forEach(cell => {
            const cellText = escapeHtml(cell.text || '');
            const tags = cell.tags || [];

            let cellContent = cellText;
            if (tags.length > 0) {
                const citations = tags.map(tag => `<span class="table-citation">${tag}</span>`).join('');
                cellContent += citations;
            }

            html += `<td>${cellContent}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody>';

    html += '</table></div>';
    return html;
}

function displayResults(data) {
    // Show results section
    document.getElementById('results').classList.add('visible');

    // 0. Display processing logs
    const logsList = document.getElementById('logsList');
    if (data.processing_logs && data.processing_logs.length > 0) {
        logsList.innerHTML = data.processing_logs.map(log => `• ${log}`).join('<br>');
    } else {
        logsList.innerHTML = '<span style="color: #999;">No logs available</span>';
    }

    // 1. Display search queries
    const queryList = document.getElementById('queryList');
    queryList.innerHTML = '';
    (data.queries || []).forEach((query, i) => {
        const li = document.createElement('li');
        li.textContent = `${i + 1}. ${query}`;
        queryList.appendChild(li);
    });

    // 2. Display retrieved chunks
    const chunkList = document.getElementById('chunkList');
    const chunksSummary = document.getElementById('chunksSummary');
    chunkList.innerHTML = '';

    const chunks = data.chunks || [];
    const chunksTotal = data.chunks_total || chunks.length;

    // Display summary
    if (chunks.length > 0) {
        const avgScore = chunks.reduce((sum, c) => sum + (c.similarity_score || 0), 0) / chunks.length;
        chunksSummary.innerHTML = `📊 Retrieved ${chunksTotal} chunks | Average similarity score: ${avgScore.toFixed(3)}`;
    } else {
        chunksSummary.innerHTML = '';
    }

    // Display individual chunks
    chunks.forEach((chunk, i) => {
        const div = document.createElement('div');
        div.className = 'chunk';
        div.innerHTML = `
            <div class="chunk-meta" style="margin-bottom: 8px;">
                <strong>Chunk ${i + 1}:</strong> ${chunk.file_name} | <strong>Similarity:</strong> ${chunk.similarity_score?.toFixed(3) || 'N/A'}
            </div>
            <div class="chunk-meta" style="font-size: 11px; color: #666; margin-bottom: 8px;">
                📍 ${chunk.page_info || 'Page N/A'}, ${chunk.line_info || 'Lines N/A'} |
                📏 ${chunk.char_count || 0} chars, ${chunk.token_count || 0} tokens, ${chunk.line_count || 0} lines
            </div>
            <div class="chunk-text">${escapeHtml(chunk.text.substring(0, 200))}...</div>
        `;
        chunkList.appendChild(div);
    });

    if (chunks.length === 0) {
        chunkList.innerHTML = '<p style="color: #666;">No chunks retrieved (no files uploaded or no matches found)</p>';
    }

    // 3. Display numbered context
    document.getElementById('contextText').textContent = data.context || 'No context generated';

    // 4. Display cited sources
    const citedText = document.getElementById('citedText');
    if (data.cited_context && data.cited_context.length > 0) {
        citedText.textContent = data.cited_context;
    } else {
        citedText.textContent = 'No sources cited in the response';
    }

    // 5. Display AI response (text or table based on format)
    const responseText = document.getElementById('responseText');
    const outputFormat = data.output_format || 'text';

    if (outputFormat === 'table' || outputFormat === 'chart') {
        // Render table from response_data
        if (data.response_data) {
            responseText.innerHTML = renderTable(data.response_data);
        } else {
            responseText.innerHTML = '<p style="color: #999;">No table data generated</p>';
        }
    } else {
        // Render text response
        let response = data.response || 'No response generated';

        // Highlight citations [1], [2-3], etc.
        response = response.replace(/\[(\d+(?:-\d+)?)\]/g, '<span class="citation">[$1]</span>');

        responseText.innerHTML = `<div style="background: white; padding: 16px; border-radius: 4px; line-height: 1.8;">${response}</div>`;
    }

    // Auto-expand cited sources and response, collapse others
    document.getElementById('cited-content').classList.add('expanded');
    document.getElementById('cited-icon').textContent = '▼';
    document.getElementById('response-content').classList.add('expanded');
    document.getElementById('response-icon').textContent = '▼';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let testCases = {};
let currentTestData = null;
let currentRequirements = null;
let currentModelName = null;

// Load available test cases on page load
async function loadTestCases() {
    try {
        const response = await fetch('/tester/test-cases');
        if (!response.ok) {
            throw new Error(`Failed to load test cases: ${response.statusText}`);
        }

        testCases = await response.json();
        const select = document.getElementById('testCase');
        select.innerHTML = '';

        if (Object.keys(testCases).length === 0) {
            select.innerHTML = '<option value="">No test cases available</option>';
            return;
        }

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a test case...';
        select.appendChild(defaultOption);

        // Add test case options
        for (const [filename, testCase] of Object.entries(testCases)) {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = testCase.test_name || filename;
            select.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading test cases:', error);
        document.getElementById('testCase').innerHTML = '<option value="">Error loading test cases</option>';
    }
}

// Display test case info when selected
document.getElementById('testCase').addEventListener('change', function(e) {
    const filename = e.target.value;
    const testInfo = document.getElementById('testInfo');

    if (!filename || !testCases[filename]) {
        testInfo.style.display = 'none';
        return;
    }

    const testCase = testCases[filename];
    document.getElementById('testName').textContent = testCase.test_name || filename;
    document.getElementById('testDescription').textContent = testCase.description || 'No description';
    document.getElementById('testFiles').textContent = (testCase.file_paths || []).join(', ');
    document.getElementById('testSection').textContent = testCase.section_name || 'N/A';
    testInfo.style.display = 'block';
});

// Track model selection
document.getElementById('modelName').addEventListener('change', function(e) {
    const modelInfo = document.getElementById('modelInfo');
    modelInfo.innerHTML = `Selected model: <strong>${e.target.value}</strong>`;
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

// Trigger evaluation when button is clicked
async function triggerEvaluation() {
    if (!currentTestData || !currentRequirements) {
        alert('No test data available for evaluation');
        return;
    }

    // Get selected evaluator model
    const evaluatorModel = document.getElementById('evaluatorModel').value;

    // Disable button and dropdown during evaluation
    const btn = document.getElementById('runEvaluationBtn');
    const modelSelect = document.getElementById('evaluatorModel');
    btn.disabled = true;
    modelSelect.disabled = true;
    btn.textContent = 'Evaluating...';

    await runEvaluation(currentTestData, currentRequirements, evaluatorModel);

    // Re-enable button and dropdown
    btn.disabled = false;
    modelSelect.disabled = false;
    btn.textContent = 'Run LLM Evaluation';
}

// Run LLM evaluation
async function runEvaluation(testData, requirements, modelName) {
    try {
        // Show evaluation section and loading
        const evaluationSection = document.getElementById('evaluationSection');
        const evaluationLoading = document.getElementById('evaluationLoading');
        const evaluationText = document.getElementById('evaluationText');

        evaluationSection.style.display = 'block';
        evaluationLoading.style.display = 'block';
        evaluationText.textContent = '';

        // Extract the output (either text or table)
        let output = '';
        if (testData.response) {
            // Text output
            output = testData.response;
        } else if (testData.response_data) {
            // Table/chart output - convert to string representation
            output = JSON.stringify(testData.response_data, null, 2);
        }

        // Call evaluation endpoint with full generator context
        const response = await fetch('/tester/evaluate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context: testData.context || '',
                section_name: testData.test_details.section_name || '',
                section_description: testData.test_details.section_description || '',
                template_description: testData.test_case || 'Test case',
                project_description: 'Test case evaluation',
                output_format: testData.output_format || 'text',
                output: output,
                requirements: requirements,
                model_name: modelName
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Evaluation failed: ${response.statusText}`);
        }

        const evalData = await response.json();

        // Display feedback
        evaluationLoading.style.display = 'none';

        // Show which model was used
        const modelInfo = document.getElementById('evaluationModelInfo');
        modelInfo.textContent = `Evaluated using: ${evalData.model_used}`;
        modelInfo.style.display = 'block';

        evaluationText.textContent = evalData.feedback;

    } catch (error) {
        console.error('Evaluation error:', error);
        const evaluationLoading = document.getElementById('evaluationLoading');
        const evaluationText = document.getElementById('evaluationText');
        const modelInfo = document.getElementById('evaluationModelInfo');

        evaluationLoading.style.display = 'none';
        modelInfo.style.display = 'none';
        evaluationText.innerHTML = `<div style="color: #c62828;">Error running evaluation: ${escapeHtml(error.message)}</div>`;
    }
}

// Handle form submission
document.getElementById('testerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const testCaseFilename = document.getElementById('testCase').value;
    const modelName = document.getElementById('modelName').value;

    // Get output_format from the selected test case
    const selectedTestCase = testCases[testCaseFilename];
    const outputFormat = selectedTestCase ? selectedTestCase.output_format : 'text';

    // Validation
    if (!testCaseFilename) {
        alert('Please select a test case');
        return;
    }

    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').classList.remove('visible');
    document.getElementById('error').style.display = 'none';
    document.getElementById('submitBtn').disabled = true;

    try {
        // Call backend
        const response = await fetch('/tester/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                test_case: testCaseFilename,
                model_name: modelName,
                output_format: outputFormat
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Server error: ${response.statusText}`);
        }

        const data = await response.json();

        // Display results and store data for optional evaluation
        const selectedTestCase = testCases[testCaseFilename];
        displayResults(data, selectedTestCase, modelName);

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

function displayResults(data, testCase, modelName) {
    // Store data for optional evaluation
    currentTestData = data;
    currentModelName = modelName;
    currentRequirements = (testCase && testCase.requirements) ? testCase.requirements : null;

    // Show results section
    document.getElementById('results').classList.add('visible');

    // Show/hide requirements section
    const requirementsSection = document.getElementById('requirementsSection');
    const requirementsList = document.getElementById('requirementsList');

    if (currentRequirements && currentRequirements.length > 0) {
        // Display requirements
        requirementsList.innerHTML = '';
        currentRequirements.forEach(req => {
            const li = document.createElement('li');
            li.textContent = req;
            li.style.marginBottom = '8px';
            li.style.lineHeight = '1.6';
            requirementsList.appendChild(li);
        });
        requirementsSection.style.display = 'block';
    } else {
        requirementsSection.style.display = 'none';
    }

    // Hide evaluation section initially
    document.getElementById('evaluationSection').style.display = 'none';

    // 0. Display test case details
    const testDetailsFiles = document.getElementById('testDetailsFiles');
    const testDetailsSectionName = document.getElementById('testDetailsSectionName');
    const testDetailsSectionDescription = document.getElementById('testDetailsSectionDescription');

    if (data.test_details) {
        // Display files
        if (data.test_details.file_paths && data.test_details.file_paths.length > 0) {
            testDetailsFiles.innerHTML = data.test_details.file_paths.map(path =>
                `<div style="margin-bottom: 4px;">• ${escapeHtml(path)}</div>`
            ).join('');
        } else {
            testDetailsFiles.innerHTML = '<span style="color: #999;">No files specified</span>';
        }

        // Display section name
        testDetailsSectionName.textContent = data.test_details.section_name || 'N/A';

        // Display section description
        testDetailsSectionDescription.textContent = data.test_details.section_description || 'N/A';
    }

    // 1. Display processing logs
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
        chunkList.innerHTML = '<p style="color: #666;">No chunks retrieved</p>';
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

// Load test cases on page load
loadTestCases();

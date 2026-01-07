// State
let testCases = [];
let selectedTests = new Set();
let testResults = {}; // Store results keyed by test name

// DOM Elements
const selectAllCheckbox = document.getElementById('selectAll');
const runSelectedBtn = document.getElementById('runSelectedBtn');
const testTableBody = document.getElementById('testTableBody');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const totalTestsSpan = document.getElementById('totalTests');
const selectedTestsSpan = document.getElementById('selectedTests');

// Load test cases on page load
async function loadTestCases() {
    try {
        // Show loading
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';

        // Fetch test cases
        const response = await fetch('/batch/test-cases');
        if (!response.ok) {
            throw new Error(`Failed to load test cases: ${response.statusText}`);
        }

        testCases = await response.json();

        // Hide loading
        loadingDiv.style.display = 'none';

        // Populate table
        populateTable();

        // Update stats
        updateStats();

    } catch (error) {
        console.error('Error loading test cases:', error);
        loadingDiv.style.display = 'none';
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
    }
}

// Populate the test table
function populateTable() {
    testTableBody.innerHTML = '';

    if (testCases.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" style="text-align: center; padding: 40px; color: #999;">
                No test cases found. Add test cases to all_test_cases.json to get started.
            </td>
        `;
        testTableBody.appendChild(row);
        return;
    }

    testCases.forEach((testCase, index) => {
        const row = document.createElement('tr');
        row.dataset.testIndex = index;
        row.dataset.testName = testCase.test_name;

        // Format file paths
        const files = testCase.file_paths || [];
        const fileCount = files.length;
        const fileDisplay = files.length > 0
            ? files.map(f => f.split('/').pop()).join(', ')
            : 'No files';

        row.innerHTML = `
            <td class="col-select">
                <input type="checkbox"
                       class="test-checkbox"
                       data-test-index="${index}"
                       data-test-name="${testCase.test_name}">
            </td>
            <td class="col-test-name">
                <div class="test-name">${escapeHtml(testCase.test_name)}</div>
            </td>
            <td class="col-description">
                <div class="test-description">${escapeHtml(testCase.description || 'No description')}</div>
            </td>
            <td class="col-files">
                <div class="file-list" title="${files.join(', ')}">
                    <span class="file-count">${fileCount}</span>
                    ${escapeHtml(fileDisplay)}
                </div>
            </td>
            <td class="col-status">
                <span class="status-badge status-pending">Pending</span>
            </td>
            <td class="col-actions">
                <button class="btn-view" data-test-name="${testCase.test_name}" disabled>View</button>
                <button class="btn-grade" data-test-name="${testCase.test_name}" disabled>Grade</button>
                <span class="score-badge" data-test-name="${testCase.test_name}" style="display: none;"></span>
            </td>
        `;

        testTableBody.appendChild(row);
    });

    // Add event listeners to checkboxes
    attachCheckboxListeners();

    // Add event listeners to View buttons
    attachViewButtonListeners();

    // Add event listeners to Grade buttons
    attachGradeButtonListeners();
}

// Attach event listeners to checkboxes
function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.test-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

// Handle individual checkbox change
function handleCheckboxChange(event) {
    const checkbox = event.target;
    const testName = checkbox.dataset.testName;

    if (checkbox.checked) {
        selectedTests.add(testName);
    } else {
        selectedTests.delete(testName);
    }

    // Update select all checkbox state
    updateSelectAllCheckbox();

    // Update button state
    updateRunButtonState();

    // Update stats
    updateStats();
}

// Attach event listeners to View buttons
function attachViewButtonListeners() {
    const viewButtons = document.querySelectorAll('.btn-view');
    viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const testName = this.dataset.testName;
            openResultModal(testName);
        });
    });
}

// Attach event listeners to Grade buttons
function attachGradeButtonListeners() {
    const gradeButtons = document.querySelectorAll('.btn-grade');
    gradeButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const testName = this.dataset.testName;
            await gradeTest(testName);
        });
    });
}

// Grade a test result
async function gradeTest(testName) {
    try {
        const result = testResults[testName];
        const testCase = testCases.find(tc => tc.test_name === testName);

        if (!result || !testCase) {
            alert('No result or test case found for grading.');
            return;
        }

        // Get the Grade button
        const row = document.querySelector(`tr[data-test-name="${testName}"]`);
        const gradeBtn = row.querySelector('.btn-grade');

        // Change button to "Grading..."
        const originalText = gradeBtn.textContent;
        gradeBtn.textContent = 'Grading...';
        gradeBtn.disabled = true;

        // Get response text (handle both text and table formats)
        let responseText = '';
        if (result.response) {
            responseText = result.response;
        } else if (result.response_data) {
            responseText = JSON.stringify(result.response_data);
        } else {
            throw new Error('No response data available for grading');
        }

        // Call grading endpoint
        const response = await fetch('/tester/grade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response_text: responseText,
                requirements: testCase.requirements || [],
                model_name: 'gpt-4o-mini'
            })
        });

        if (!response.ok) {
            throw new Error(`Grading failed: ${response.statusText}`);
        }

        const gradeResult = await response.json();

        // Hide the Grade button and show Score Badge
        gradeBtn.style.display = 'none';

        // Calculate percentage
        const percentage = gradeResult.total_count > 0
            ? Math.round((gradeResult.passed_count / gradeResult.total_count) * 100)
            : 0;

        // Determine color class
        let colorClass = 'score-low';
        if (percentage === 100) {
            colorClass = 'score-perfect';
        } else if (percentage >= 80) {
            colorClass = 'score-high';
        } else if (percentage >= 60) {
            colorClass = 'score-medium';
        }

        // Show score badge
        const scoreBadge = row.querySelector('.score-badge');
        scoreBadge.textContent = `${gradeResult.passed_count}/${gradeResult.total_count} (${percentage}%)`;
        scoreBadge.className = `score-badge ${colorClass}`;
        scoreBadge.style.display = 'inline-block';

        // Store grade result for detailed view
        scoreBadge.dataset.gradeResult = JSON.stringify(gradeResult);

        // Make badge clickable to show detailed breakdown
        scoreBadge.onclick = function() {
            showGradeBreakdown(testName, gradeResult);
        };

    } catch (error) {
        console.error(`Error grading test ${testName}:`, error);
        alert(`Failed to grade test: ${error.message}`);

        // Reset button on error
        const row = document.querySelector(`tr[data-test-name="${testName}"]`);
        const gradeBtn = row.querySelector('.btn-grade');
        gradeBtn.textContent = 'Grade';
        gradeBtn.disabled = false;
    }
}

// Show detailed grade breakdown
function showGradeBreakdown(testName, gradeResult) {
    // Set modal title
    document.getElementById('modalTestName').textContent = `Grade Breakdown: ${testName}`;

    // Get modal body
    const modalBody = document.getElementById('modalBody');

    // Calculate percentage
    const percentage = gradeResult.total_count > 0
        ? Math.round((gradeResult.passed_count / gradeResult.total_count) * 100)
        : 0;

    // Build HTML for breakdown
    let html = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px 0; color: #333;">Overall Score: ${gradeResult.passed_count}/${gradeResult.total_count} (${percentage}%)</h3>
        </div>
    `;

    // Check if we have detailed requirements breakdown
    if (gradeResult.requirements && gradeResult.requirements.length > 0) {
        html += '<div style="margin-top: 16px;">';

        gradeResult.requirements.forEach((req, index) => {
            const statusIcon = req.passed ? '✅' : '❌';
            const statusColor = req.passed ? '#4CAF50' : '#f44336';
            const statusText = req.passed ? 'PASSED' : 'FAILED';

            html += `
                <div style="margin-bottom: 20px; padding: 16px; background: ${req.passed ? '#f1f8f4' : '#ffebee'}; border-left: 4px solid ${statusColor}; border-radius: 4px;">
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 20px; margin-right: 8px;">${statusIcon}</span>
                        <span style="font-weight: 700; color: ${statusColor};">${statusText}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Requirement ${index + 1}:</strong> ${escapeHtml(req.requirement)}
                    </div>
                    <div style="color: #555; font-size: 14px; line-height: 1.6;">
                        <strong>Reason:</strong> ${escapeHtml(req.reason)}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // Fallback to old reasoning format if detailed breakdown not available
        html += `
            <div style="padding: 16px; background: #f9f9f9; border-radius: 4px; margin-top: 16px;">
                <strong>Reasoning:</strong><br>
                ${escapeHtml(gradeResult.reasoning || 'No detailed breakdown available')}
            </div>
        `;
    }

    modalBody.innerHTML = html;

    // Show the modal
    document.getElementById('resultModal').style.display = 'flex';
}

// Open result modal
function openResultModal(testName) {
    const result = testResults[testName];

    if (!result) {
        alert('No result available for this test.');
        return;
    }

    // Set modal title
    document.getElementById('modalTestName').textContent = testName;

    // Get modal body
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = '';

    // Render the result based on output format (same as tester)
    const testCase = testCases.find(tc => tc.test_name === testName);
    const outputFormat = testCase ? testCase.output_format : 'text';

    if (outputFormat === 'table' || outputFormat === 'chart') {
        // Render table from response_data
        if (result.response_data) {
            modalBody.innerHTML = renderTable(result.response_data);
        } else if (result.response) {
            // Fallback: If no response_data but we have response text, show it
            let response = result.response;
            response = response.replace(/\[(\d+(?:-\d+)?)\]/g, '<span class="citation">[$1]</span>');

            modalBody.innerHTML = `
                <div style="background: #fff3cd; padding: 12px; border-left: 4px solid #ffc107; margin-bottom: 16px; border-radius: 4px;">
                    <strong>⚠️ Note:</strong> Expected table format but received text response. The backend may not be returning structured table data.
                </div>
                <div style="background: white; padding: 16px; border-radius: 4px; line-height: 1.8;">${response}</div>
            `;
        } else {
            modalBody.innerHTML = '<p style="color: #999;">No table data or response generated</p>';
        }
    } else {
        // Render text response
        let response = result.response || 'No response generated';

        // Highlight citations [1], [2-3], etc.
        response = response.replace(/\[(\d+(?:-\d+)?)\]/g, '<span class="citation">[$1]</span>');

        modalBody.innerHTML = `<div style="background: white; padding: 16px; border-radius: 4px; line-height: 1.8;">${response}</div>`;
    }

    // Show the modal
    document.getElementById('resultModal').style.display = 'flex';
}

// Close result modal
function closeResultModal() {
    document.getElementById('resultModal').style.display = 'none';
}

// Render table HTML from response_data (same as tester)
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

// Handle "Select All" checkbox
selectAllCheckbox.addEventListener('change', function(event) {
    const isChecked = event.target.checked;
    const checkboxes = document.querySelectorAll('.test-checkbox');

    selectedTests.clear();

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        if (isChecked) {
            selectedTests.add(checkbox.dataset.testName);
        }
    });

    // Update button state
    updateRunButtonState();

    // Update stats
    updateStats();
});

// Update "Select All" checkbox state
function updateSelectAllCheckbox() {
    const checkboxes = document.querySelectorAll('.test-checkbox');
    const totalCheckboxes = checkboxes.length;
    const checkedCheckboxes = Array.from(checkboxes).filter(cb => cb.checked).length;

    if (checkedCheckboxes === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCheckboxes === totalCheckboxes) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

// Update "Run Selected" button state
function updateRunButtonState() {
    runSelectedBtn.disabled = selectedTests.size === 0;
}

// Update statistics display
function updateStats() {
    totalTestsSpan.innerHTML = `Total: <strong>${testCases.length}</strong>`;
    selectedTestsSpan.innerHTML = `Selected: <strong>${selectedTests.size}</strong>`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Get status badge element for a test row
function getStatusBadge(testName) {
    const row = document.querySelector(`tr[data-test-name="${testName}"]`);
    return row ? row.querySelector('.status-badge') : null;
}

// Update status badge
function updateStatusBadge(testName, status) {
    const badge = getStatusBadge(testName);
    if (!badge) return;

    // Remove all status classes
    badge.classList.remove('status-pending', 'status-running', 'status-success', 'status-failed');

    // Add new status class and update text
    switch (status) {
        case 'running':
            badge.classList.add('status-running');
            badge.innerHTML = '<span class="spinner-mini"></span> Running';
            break;
        case 'success':
            badge.classList.add('status-success');
            badge.textContent = 'Success';
            break;
        case 'failed':
            badge.classList.add('status-failed');
            badge.textContent = 'Failed';
            break;
        default:
            badge.classList.add('status-pending');
            badge.textContent = 'Pending';
    }
}

// Run a single test
async function runTest(testName, model, format) {
    try {
        // Call the tester endpoint (match tester parameter names)
        const response = await fetch('/tester/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                test_case: `${testName}.json`,
                model_name: model,
                output_format: format
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        return {
            success: true,
            testName: testName,
            model: model,
            format: format,
            result: result
        };

    } catch (error) {
        console.error(`Error running test ${testName}:`, error);
        return {
            success: false,
            testName: testName,
            model: model,
            format: format,
            error: error.message
        };
    }
}

// Save batch run results
async function saveBatchRun(results) {
    try {
        const response = await fetch('/batch/save-run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                model: document.getElementById('modelSelect').value,
                totalTests: results.length,
                successCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
                results: results
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to save batch run: ${response.statusText}`);
        }

        const saveResult = await response.json();
        return saveResult;

    } catch (error) {
        console.error('Error saving batch run:', error);
        throw error;
    }
}

// Run selected tests
runSelectedBtn.addEventListener('click', async function() {
    if (selectedTests.size === 0) {
        return;
    }

    // Disable the button during execution
    runSelectedBtn.disabled = true;
    runSelectedBtn.textContent = 'Running...';

    // Get global configuration
    const model = document.getElementById('modelSelect').value;

    // Array to store results
    const results = [];

    // Loop through selected tests
    for (const testName of selectedTests) {
        // Find the test case data to get its output_format
        const testCase = testCases.find(tc => tc.test_name === testName);
        const format = testCase ? testCase.output_format : 'text';

        console.log(`Running test: ${testName} with model: ${model}, format: ${format}`);

        // Update status to Running
        updateStatusBadge(testName, 'running');

        // Run the test
        const result = await runTest(testName, model, format);

        // Update status based on result
        if (result.success) {
            updateStatusBadge(testName, 'success');

            // Store the result globally for viewing
            testResults[testName] = result.result;

            // Enable the View and Grade buttons for this row
            const row = document.querySelector(`tr[data-test-name="${testName}"]`);
            if (row) {
                const viewBtn = row.querySelector('.btn-view');
                if (viewBtn) {
                    viewBtn.disabled = false;
                }
                const gradeBtn = row.querySelector('.btn-grade');
                if (gradeBtn) {
                    gradeBtn.disabled = false;
                }
            }
        } else {
            updateStatusBadge(testName, 'failed');
        }

        // Store the result
        results.push(result);
    }

    // All tests complete - save the batch run
    try {
        const saveResult = await saveBatchRun(results);
        console.log('Batch run saved:', saveResult);

        // Show success message
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        alert(
            `Batch run complete!\n\n` +
            `✓ Successful: ${successCount}\n` +
            `✗ Failed: ${failedCount}\n\n` +
            `Results saved to: ${saveResult.filename}`
        );

    } catch (error) {
        alert(`Batch run complete, but failed to save results:\n${error.message}`);
    }

    // Re-enable the button
    runSelectedBtn.disabled = false;
    runSelectedBtn.innerHTML = '<span class="btn-icon">▶</span> Run Selected Tests';
});

// Close modal on ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('resultModal');
        if (modal.style.display === 'flex') {
            closeResultModal();
        }
    }
});

// Initialize on page load
loadTestCases();

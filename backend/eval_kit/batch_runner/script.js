// State
let testCases = [];
let selectedTests = new Set();

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
                <button class="btn-view" disabled>View</button>
            </td>
        `;

        testTableBody.appendChild(row);
    });

    // Add event listeners to checkboxes
    attachCheckboxListeners();
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
        // Call the tester endpoint
        const response = await fetch('/tester/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                test_case: `${testName}.json`,
                model: model,
                format: format
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

// Initialize on page load
loadTestCases();

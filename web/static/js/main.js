// Global variables
let currentDocument = null;
let allDocuments = [];

// Application state management
const appState = {
  currentDocument: null,
  originalData: null,
  editedFields: new Map(), // Map of field paths to new values
  
  // Initialize with document
  setDocument(document) {
    this.currentDocument = document;
    this.originalData = JSON.parse(JSON.stringify(document)); // Deep clone
    this.editedFields.clear();
  },
  
  // Track edited field
  updateField(path, value) {
    this.editedFields.set(path, value);
    document.getElementById('saveAllChanges').disabled = false;
  },
  
  // Remove edited field
  removeField(path) {
    this.editedFields.delete(path);
    if (this.editedFields.size === 0) {
      document.getElementById('saveAllChanges').disabled = true;
    }
  },
  
  // Check if has edits
  hasEdits() {
    return this.editedFields.size > 0;
  },
  
  // Generate updated document
  getUpdatedDocument() {
    const updated = JSON.parse(JSON.stringify(this.originalData));
    
    for (const [path, value] of this.editedFields) {
      const parts = path.split('.');
      let current = updated;
      
      // Navigate to the right nesting level
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part.includes('[')) {
          // Handle array access like service_lines[0]
          const name = part.substring(0, part.indexOf('['));
          const index = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
          
          if (!current[name]) current[name] = [];
          while (current[name].length <= index) current[name].push({});
          current = current[name][index];
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      }
      
      // Get the final property name
      const lastPart = parts[parts.length - 1];
      
      // Special handling for modifiers which should be an array
      if (lastPart === 'modifiers' && typeof value === 'string') {
        current[lastPart] = value.split(',').map(m => m.trim()).filter(Boolean);
      } else {
        // Set the value at the final property
        current[lastPart] = value;
      }
    }
    
    return updated;
  }
};

// Debug mode flag
const DEBUG = true;

// Enhanced logging function
function debug(...args) {
    if (DEBUG) {
        console.log(`[${new Date().toISOString()}]`, ...args);
    }
}

// Error logging with stack traces
function logError(message, error) {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
    if (error && error.stack) {
        console.error('Stack trace:', error.stack);
    }
}

/**
 * Safely get a nested property from an object
 */
function getNestedProperty(obj, path, defaultValue = 'N/A') {
    if (!obj) return defaultValue;
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
        if (value === null || value === undefined || typeof value !== 'object') {
            return defaultValue;
        }
        value = value[key];
    }
    
    return value === null || value === undefined ? defaultValue : value;
}

/**
 * Format a value for display, handling various data types
 */
function formatDisplayValue(value, defaultValue = 'N/A') {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    
    if (Array.isArray(value)) {
        return value.join(', ');
    }
    
    return String(value);
}

/**
 * Clean and sanitize input values
 */
function sanitizeInputValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Convert to string and trim
    return String(value).trim();
}

/**
 * Safely get a value from a nested path in an object
 */
function getValueByPath(obj, path) {
  if (!obj || !path) return null;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (part.includes('[')) {
      // Handle array access like service_lines[0]
      const name = part.substring(0, part.indexOf('['));
      const index = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
      
      if (!current[name] || !current[name][index]) return null;
      current = current[name][index];
    } else {
      if (!current[part]) return null;
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Format a value for display
 */
function formatForDisplay(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Clean a value for an input field
 */
function formatForInput(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Create an editable field component
 */
function createEditableField(value, path) {
  const displayValue = formatForDisplay(value);
  const inputValue = formatForInput(value);
  const fieldId = `field-${path.replace(/\./g, '-').replace(/\[|\]/g, '-')}`;
  
  return `
    <div class="editable-field" data-path="${path}">
      <div class="display-value" id="${fieldId}-display">${displayValue}</div>
      <div class="edit-container" style="display: none;">
        <input type="text" 
               class="form-control form-control-sm" 
               id="${fieldId}-input" 
               value="${inputValue}" 
               data-original-value="${inputValue}">
      </div>
    </div>
  `;
}

// Define the click handler function globally
function handleEditClick(event) {
    event.preventDefault(); // Prevent any default button behavior
    event.stopPropagation(); // Prevent event bubbling
    
    const button = event.currentTarget;
    const field = button.dataset.field;
    const section = button.dataset.section;
    const index = button.hasAttribute('data-index') ? button.dataset.index : null;
    
    debug('Edit button clicked:', { field, section, index });
    
    // Find the editable field container - look in the same td as the button
    const td = button.closest('td');
    if (!td) {
        logError('Table cell not found');
        return;
    }
    
    // Find the editable field container within the same td
    const editableField = td.querySelector('.editable-field');
    if (!editableField) {
        logError('Editable field container not found');
        return;
    }
    
    const input = editableField.querySelector('.editable-input');
    const display = editableField.querySelector('.editable-display');
    
    if (!input || !display) {
        logError('Input or display element not found', { input, display });
        return;
    }
    
    const isCurrentlyEditing = editableField.classList.contains('editing');
    debug('Current editing state:', isCurrentlyEditing);
    
    if (!isCurrentlyEditing) {
        // Show input and hide display
        editableField.classList.add('editing');
        
        // Reset input value to match display (in case there were unsaved changes)
        input.value = display.textContent === 'N/A' ? '' : display.textContent;
        
        input.focus(); // Focus the input field
        
        editedFields.add(`${section}:${field}:${index || ''}`);
        
        // Make sure save button is visible
        const sectionSaveButton = document.querySelector(`.save-section[data-section="${section}"]`);
        if (sectionSaveButton) {
            debug('Showing save button for section:', section);
            sectionSaveButton.style.display = 'block';
        } else {
            logError(`Save button not found for section: ${section}`);
        }
    } else {
        // Hide input and show display
        editableField.classList.remove('editing');
        
        button.textContent = 'Edit';
        button.classList.remove('btn-outline-danger');
        button.classList.add('btn-outline-primary');
        
        // Remove from edited fields
        editedFields.delete(`${section}:${field}:${index || ''}`);
        
        // Check if any other fields in this section are still being edited
        const hasSectionEdits = Array.from(editedFields).some(f => f.startsWith(section + ':'));
        
        // Hide save button if no more edits in this section
        const sectionSaveButton = document.querySelector(`.save-section[data-section="${section}"]`);
        if (sectionSaveButton && !hasSectionEdits) {
            debug('Hiding save button for section:', section);
            sectionSaveButton.style.display = 'none';
        }
    }
}

// Add this function after handleEditClick function
async function handleSaveClick(section) {
    showLoading();
    
    try {
        // Get current document data
        const documentData = window.currentDocumentData;
        if (!documentData) {
            throw new Error('No document data available');
        }
        
        // Deep clone to avoid modifying the original directly
        const updatedData = JSON.parse(JSON.stringify(documentData));
        
        debug('Original data:', documentData);
        debug('Section to update:', section);
        
        // Get all edited fields for this section
        const editedFieldsForSection = Array.from(document.querySelectorAll(`.editable-field.editing`))
            .filter(field => {
                const input = field.querySelector('.editable-input');
                return input && input.dataset.section === section;
            });
        
        debug('Fields to update:', editedFieldsForSection.length);
        
        // Update data based on edited fields
        editedFieldsForSection.forEach(field => {
            const input = field.querySelector('.editable-input');
            const value = input.value;
            const fieldName = input.dataset.field;
            const index = input.hasAttribute('data-index') ? parseInt(input.dataset.index) : null;
            
            debug('Updating field:', { fieldName, value, index });
            
            if (index !== null && !isNaN(index)) {
                // Handle array items (like service_lines)
                if (!updatedData[section]) {
                    updatedData[section] = [];
                }
                
                // Ensure array has enough elements
                while (updatedData[section].length <= index) {
                    updatedData[section].push({});
                }
                
                // Handle special cases like modifiers which are arrays
                if (fieldName === 'modifiers') {
                    updatedData[section][index][fieldName] = value.split(',')
                        .map(m => m.trim())
                        .filter(m => m);
                } else {
                    updatedData[section][index][fieldName] = value;
                }
            } else {
                // Handle direct properties
                if (!updatedData[section]) {
                    updatedData[section] = {};
                }
                updatedData[section][fieldName] = value;
            }
            
            // Reset edit state
            field.classList.remove('editing');
            const editButton = field.closest('td').querySelector('.edit-field');
            if (editButton) {
                editButton.textContent = 'Edit';
                editButton.classList.remove('btn-outline-danger');
                editButton.classList.add('btn-outline-primary');
            }
        });
        
        debug('Updated data:', updatedData);
        
        // Save changes back to server
        const response = await fetch(`/api/failures/${currentDocument.filename}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Changes saved successfully');
            
            // Update the local data
            window.currentDocumentData = updatedData;
            
            // Update the UI with new values
            editedFieldsForSection.forEach(field => {
                const display = field.querySelector('.editable-display');
                const input = field.querySelector('.editable-input');
                if (display && input) {
                    display.textContent = input.value || 'N/A';
                }
            });
            
            // Reset edited fields tracking
            editedFields.clear();
            
            // Hide save button
            const saveButton = document.querySelector(`.save-section[data-section="${section}"]`);
            if (saveButton) {
                saveButton.style.display = 'none';
            }
        } else {
            throw new Error(result.message || 'Failed to save changes');
        }
    } catch (error) {
        logError('Error saving changes:', error);
        showError(`Failed to save changes: ${error.message}`);
    } finally {
        hideLoading();
    }
}

/**
 * Save all changes to the server
 */
async function saveAllChanges() {
  if (!appState.hasEdits()) return;
  
  showLoading();
  
  try {
    const updatedDocument = appState.getUpdatedDocument();
    
    // Send to server
    const response = await fetch(`/api/failures/${currentDocument.filename}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedDocument)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Update state with saved document
      appState.setDocument(updatedDocument);
      
      // Show success message
      showSuccess('All changes saved successfully');
      
      // Disable save button
      document.getElementById('saveAllChanges').disabled = true;
    } else {
      throw new Error(result.message || 'Failed to save changes');
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    showError(`Failed to save: ${error.message}`);
  } finally {
    hideLoading();
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFailures();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterDocuments(e.target.value);
        });
    }

    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', function(e) {
            filterDocuments(document.getElementById('searchInput').value, e.target.value);
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadFailures);
    }

    // Add document-level event delegation for editable fields
    document.addEventListener('click', function(event) {
        const target = event.target;
        
        // Edit All button clicked
        if (target.classList.contains('edit-all-btn')) {
            event.preventDefault();
            
            const section = target.dataset.section;
            const editableFields = document.querySelectorAll(`.editable-field[data-path^="${section}"]`);
            
            // Enter edit mode for all fields in the section
            editableFields.forEach(field => {
                field.classList.add('editing');
                field.querySelector('.display-value').style.display = 'none';
                field.querySelector('.edit-container').style.display = 'block';
            });
            
            // Hide Edit All button and show Save button
            target.style.display = 'none';
            const saveButton = document.querySelector(`.save-section[data-section="${section}"]`);
            if (saveButton) {
                saveButton.style.display = 'block';
            }
            
            // Focus the first input
            const firstInput = editableFields[0]?.querySelector('input');
            if (firstInput) firstInput.focus();
        }
        
        // Save section button clicked
        if (target.classList.contains('save-section')) {
            event.preventDefault();
            
            const section = target.dataset.section;
            const editableFields = document.querySelectorAll(`.editable-field[data-path^="${section}"]`);
            
            // Save changes for all fields in the section
            editableFields.forEach(field => {
                const path = field.dataset.path;
                const input = field.querySelector('input');
                const display = field.querySelector('.display-value');
                
                if (!input || !display) return;
                
                const newValue = input.value;
                
                // Check if value actually changed
                if (input.dataset.originalValue !== newValue) {
                    // Update state
                    appState.updateField(path, newValue);
                    
                    // Update display
                    display.textContent = formatForDisplay(newValue);
                }
                
                // Exit edit mode
                field.classList.remove('editing');
                display.style.display = 'block';
                field.querySelector('.edit-container').style.display = 'none';
            });
            
            // Show Edit All button and hide Save button
            const editAllButton = document.querySelector(`.edit-all-btn[data-section="${section}"]`);
            if (editAllButton) editAllButton.style.display = 'block';
            target.style.display = 'none';
        }
        
        // Global save button clicked
        if (target.id === 'saveAllChanges') {
            event.preventDefault();
            saveAllChanges();
        }
    });
    
    // Handle keyboard events in input fields
    document.addEventListener('keydown', function(event) {
        const target = event.target;
        
        // Only handle events in our inputs
        if (!target.matches('.editable-field input')) return;
        
        if (event.key === 'Enter') {
            // Find the section this input belongs to
            const field = target.closest('.editable-field');
            const path = field.dataset.path;
            const section = path.split('.')[0];
            
            // Find and click the save button for this section
            const saveButton = document.querySelector(`.save-section[data-section="${section}"]`);
            if (saveButton) saveButton.click();
        } else if (event.key === 'Escape') {
            // Find the section this input belongs to
            const field = target.closest('.editable-field');
            const path = field.dataset.path;
            const section = path.split('.')[0];
            
            // Find and click the edit all button for this section
            const editAllButton = document.querySelector(`.edit-all-btn[data-section="${section}"]`);
            if (editAllButton) editAllButton.click();
        }
    });
}

// Load validation failures
async function loadFailures() {
    showLoading();
    try {
        const response = await fetch('/api/failures');
        const result = await response.json();
        if (result.status === 'success') {
            allDocuments = result.data;
            renderDocumentList(result.data);
        } else {
            showError('Failed to load validation failures: ' + result.message);
        }
    } catch (error) {
        console.error('Error loading failures:', error);
        showError('Failed to load validation failures');
    } finally {
        hideLoading();
    }
}

// Render document list
function renderDocumentList(documents) {
    const container = document.getElementById('documentList');
    container.innerHTML = '';

    documents.forEach(doc => {
        const div = document.createElement('div');
        div.className = 'document-item';
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <strong>${doc.filename}</strong>
                    <div class="text-muted small">Order ID: ${doc.order_id || 'N/A'}</div>
                </div>
                <span class="status-badge ${doc.status === 'critical' ? 'status-critical' : 'status-non-critical'}">
                    ${doc.status}
                </span>
            </div>
            <div class="text-muted small mt-1">
                Patient: ${doc.patient_name || 'N/A'} | Date: ${doc.date_of_service || 'N/A'}
            </div>
        `;
        div.onclick = () => selectDocument(doc);
        container.appendChild(div);
    });
}

// Select a document
async function selectDocument(doc) {
  // Remove any existing save button
  const existingSaveBtn = document.getElementById('saveAllChanges');
  if (existingSaveBtn) existingSaveBtn.remove();
  
  currentDocument = doc;
  
  // Update active state in document list
  document.querySelectorAll('.document-item').forEach(item => {
    item.classList.remove('active');
  });
  event.currentTarget.classList.add('active');

  // Load and display details
  showLoading();
  try {
    // Fetch JSON details first
    const jsonResponse = await fetch(`/api/failures/${doc.filename}`);
    const jsonData = await jsonResponse.json();
    
    if (jsonData.status !== 'success') {
      throw new Error(`Failed to load JSON details: ${jsonData.message}`);
    }
    
    // Then try to fetch DB details
    let dbData = null;
    try {
      const dbResponse = await fetch(`/api/order/${doc.order_id}`);
      dbData = await dbResponse.json();
      
      if (dbData.status !== 'success') {
        console.warn(`Database details not available: ${dbData.message}`);
      }
    } catch (dbError) {
      console.warn('Failed to load database details:', dbError);
    }
    
    // Display details even if DB data is missing
    displayDetails(jsonData.data, dbData?.data || null);
    
  } catch (error) {
    console.error('Error loading document details:', error);
    showError(`Failed to load document details: ${error.message}`);
  } finally {
    hideLoading();
  }
}

/**
 * Display document details with editable fields
 */
function displayDetails(jsonDetails, dbDetails) {
  if (!jsonDetails) {
    showError('No document details available');
    return;
  }
  
  // Store the document in application state
  appState.setDocument(jsonDetails);
  
  // Render HCFA details with editable fields
  const hcfaDetails = document.getElementById('hcfaDetails');
  if (!hcfaDetails) return;

  // Format DOB to remove newlines and extra spaces
  const formatDOB = (dob) => {
    if (!dob) return null;
    return dob.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // Get patient info
  const patientInfo = jsonDetails.patient_info || {};
  const billingInfo = jsonDetails.billing_info || {};
  const serviceLines = jsonDetails.service_lines || [];

  // Create service lines HTML
  const serviceLinesHtml = serviceLines.map((line, index) => `
    <tr>
      <td>${createEditableField(line.date_of_service, `service_lines.${index}.date_of_service`)}</td>
      <td>${createEditableField(line.cpt_code, `service_lines.${index}.cpt_code`)}</td>
      <td>${createEditableField(line.modifiers, `service_lines.${index}.modifiers`)}</td>
      <td>${createEditableField(line.units, `service_lines.${index}.units`)}</td>
      <td>${createEditableField(line.diagnosis_pointer, `service_lines.${index}.diagnosis_pointer`)}</td>
      <td>${createEditableField(line.place_of_service, `service_lines.${index}.place_of_service`)}</td>
      <td>${createEditableField(line.charge_amount, `service_lines.${index}.charge_amount`)}</td>
    </tr>
  `).join('');

  hcfaDetails.innerHTML = `
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">Patient Information</h6>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-all-btn" data-section="patient_info">
            Edit All
          </button>
          <button class="btn btn-sm btn-primary save-section" data-section="patient_info" style="display: none;">
            Save Changes
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table">
            <tbody>
              <tr>
                <th style="width: 200px;">Name</th>
                <td>${createEditableField(patientInfo.patient_name, 'patient_info.patient_name')}</td>
              </tr>
              <tr>
                <th>DOB</th>
                <td>${createEditableField(formatDOB(patientInfo.patient_dob), 'patient_info.patient_dob')}</td>
              </tr>
              <tr>
                <th>ZIP</th>
                <td>${createEditableField(patientInfo.patient_zip, 'patient_info.patient_zip')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">Billing Information</h6>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-all-btn" data-section="billing_info">
            Edit All
          </button>
          <button class="btn btn-sm btn-primary save-section" data-section="billing_info" style="display: none;">
            Save Changes
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table">
            <tbody>
              <tr>
                <th style="width: 200px;">Provider Name</th>
                <td>${createEditableField(billingInfo.billing_provider_name, 'billing_info.billing_provider_name')}</td>
              </tr>
              <tr>
                <th>Provider NPI</th>
                <td>${createEditableField(billingInfo.billing_provider_npi, 'billing_info.billing_provider_npi')}</td>
              </tr>
              <tr>
                <th>Provider TIN</th>
                <td>${createEditableField(billingInfo.billing_provider_tin, 'billing_info.billing_provider_tin')}</td>
              </tr>
              <tr>
                <th>Total Charge</th>
                <td>${createEditableField(billingInfo.total_charge, 'billing_info.total_charge')}</td>
              </tr>
              <tr>
                <th>Account Number</th>
                <td>${createEditableField(billingInfo.patient_account_no, 'billing_info.patient_account_no')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">Service Lines</h6>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-all-btn" data-section="service_lines">
            Edit All
          </button>
          <button class="btn btn-sm btn-primary save-section" data-section="service_lines" style="display: none;">
            Save Changes
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 120px;">Date of Service</th>
                <th style="width: 100px;">CPT</th>
                <th style="width: 150px;">Modifier</th>
                <th style="width: 80px;">Units</th>
                <th style="width: 100px;">Diagnosis</th>
                <th style="width: 120px;">Place of Service</th>
                <th style="width: 120px;">Charge Amount</th>
              </tr>
            </thead>
            <tbody>
              ${serviceLinesHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="card mb-4">
      <div class="card-header">
        <h6 class="mb-0">Validation Messages</h6>
      </div>
      <div class="card-body">
        <pre class="validation-message">${(jsonDetails.validation_messages || []).join('\n')}</pre>
      </div>
    </div>
  `;

  // Display DB details if available
  const dbDetailsPanel = document.getElementById('dbDetails');
  if (dbDetails) {
    // Render database details (no changes from your original implementation)
    // ...existing dbDetails rendering code...
  } else {
    dbDetailsPanel.innerHTML = `
      <div class="alert alert-warning">
        Database details not available for this order.
      </div>
    `;
  }
  
  // Add global save button
  const saveButton = document.createElement('button');
  saveButton.id = 'saveAllChanges';
  saveButton.className = 'btn btn-primary';
  saveButton.textContent = 'Save All Changes';
  saveButton.disabled = true;
  document.body.appendChild(saveButton);
}

// Filter documents
function filterDocuments(searchText, status = 'all') {
    const filtered = allDocuments.filter(doc => {
        const matchesSearch = searchText === '' || 
            doc.filename.toLowerCase().includes(searchText.toLowerCase()) ||
            doc.order_id?.toLowerCase().includes(searchText.toLowerCase()) ||
            doc.patient_name?.toLowerCase().includes(searchText.toLowerCase());
        
        const matchesStatus = status === 'all' || doc.status === status;
        
        return matchesSearch && matchesStatus;
    });
    
    renderDocumentList(filtered);
}

// Loading state
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Error handling
function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.querySelector('.container-fluid').insertBefore(alert, document.querySelector('.row'));
    setTimeout(() => alert.remove(), 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.querySelector('.container-fluid').insertBefore(alert, document.querySelector('.row'));
    setTimeout(() => alert.remove(), 5000);
}
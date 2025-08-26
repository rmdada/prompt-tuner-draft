/**
 * Dynamic Workflow Manager
 * Main coordinator for dynamic workflow functionality
 * Handles schema selection, form generation, and workflow processing
 */

class DynamicWorkflowManager {
    constructor() {
        // Dependencies
        this.dataManager = null;
        this.arrayManager = null;
        
        // State management
        this.currentSchema = null;
        this.availableWorkflows = [];
        this.schemaCache = {};
        this.fieldCache = {};
        this.schemasLoaded = false;
        
        // UI State
        this.showFormHeader = false;
        this.showFormActions = false;
        this.showResults = false;
        this.formTitle = 'Dynamic Form';
        this.dynamicFormHtml = '';
        this.resultsHtml = '';
        
        // Configuration
        this.API_BASE_URL = 'http://localhost:8000/api/v1/custom-workflows';
        this._isLoadingWorkflows = false;
    }

    /**
     * Initialize the workflow manager and dependencies
     */
    async init() {
        console.log('Dynamic Workflows System loaded');
        
        // Initialize dependencies
        this.initializeDependencies();
        
        // Load available workflows
        await this.fetchAvailableWorkflows();
        console.log('Schema tiles generated successfully');
    }

    /**
     * Initialize dependency classes
     */
    initializeDependencies() {
        // Create data manager instance
        if (window.DataManager) {
            this.dataManager = new DataManager();
        }
        
        // Create array manager instance
        if (window.ArrayManager) {
            this.arrayManager = new ArrayManager(this.dataManager, this.schemaCache, this.fieldCache);
            // CRITICAL: Set global reference for HTML onclick handlers
            window.arrayManager = this.arrayManager;
        }
    }

    /**
     * Fetch available workflows from API
     */
    async fetchAvailableWorkflows() {
        // Prevent multiple simultaneous calls
        if (this._isLoadingWorkflows) {
            console.log('[fetchAvailableWorkflows] Already loading workflows, skipping...');
            return;
        }
        
        this._isLoadingWorkflows = true;
        
        try {
            // Reset state first
            this.availableWorkflows = [];
            this.schemasLoaded = false;
            
            // Hardcoded available workflows
            const workflowNames = ['bike_insights', 'restaurant_recommender', 'bike_stock', 'bike_sales'];
            console.log('[fetchAvailableWorkflows] Starting to process workflows:', workflowNames);
            
            for (const workflowName of workflowNames) {
                console.log(`[fetchAvailableWorkflows] Processing workflow: ${workflowName}`);
                try {
                    const schema = await this.fetchSchema(workflowName);
                    const rootModel = schema.schemas.RootModel;
                    const schemaTitle = this.getSchemaTitle(rootModel, workflowName);
                    
                    const workflow = {
                        name: workflowName,
                        title: schemaTitle,
                        description: rootModel.description || `Dynamic ${workflowName.replace(/_/g, ' ')} workflow`
                    };
                    
                    this.availableWorkflows.push(workflow);
                    console.log(`[fetchAvailableWorkflows] Successfully added workflow: ${workflowName}`, workflow);
                } catch (error) {
                    console.error(`Failed to load schema for ${workflowName}:`, error);
                    
                    // Create unique fallback titles based on workflow name
                    const fallbackTitle = this.createFallbackTitle(workflowName);
                    const fallbackWorkflow = {
                        name: workflowName,
                        title: fallbackTitle,
                        description: `${fallbackTitle} workflow (schema unavailable)`
                    };
                    
                    this.availableWorkflows.push(fallbackWorkflow);
                    console.log(`[fetchAvailableWorkflows] Added fallback workflow: ${workflowName}`, fallbackWorkflow);
                }
            }
            
            this.schemasLoaded = true;
            console.log('[fetchAvailableWorkflows] Final availableWorkflows:', this.availableWorkflows);
            console.log(`[fetchAvailableWorkflows] Total workflows loaded: ${this.availableWorkflows.length}`);
            
        } catch (error) {
            console.error('[fetchAvailableWorkflows] Failed to fetch available workflows:', error);
            this.availableWorkflows = [];
            this.schemasLoaded = true;
        } finally {
            this._isLoadingWorkflows = false;
        }
    }

    /**
     * Create unique fallback title for workflows when schema loading fails
     */
    createFallbackTitle(workflowName) {
        // Convert workflow name to a readable title
        const title = workflowName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        
        // Add specific suffixes for known workflows
        if (workflowName.includes('copy')) {
            return title;
        } else if (workflowName === 'bike_insights') {
            return 'Bike Insights Original';
        }
        
        return title;
    }

    /**
     * Fetch schema from API with caching
     */
    async fetchSchema(workflowName) {
        if (this.schemaCache[workflowName]) {
            return this.schemaCache[workflowName];
        }
        try {
            const response = await fetch(`${this.API_BASE_URL}/schema/${workflowName}/`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const schema = await response.json();
            this.schemaCache[workflowName] = schema;
            return schema;
        } catch (error) {
            console.error(`Failed to fetch schema for ${workflowName}:`, error);
            throw new Error(`Schema fetch failed: ${workflowName}`);
        }
    }

    /**
     * Select and load a schema
     */
    async selectSchema(schemaName) {
        this.currentSchema = schemaName;
        await this.loadSchemaForm(schemaName);
        this.resetFormData();
    }

    /**
     * Load schema form and generate UI
     */
    async loadSchemaForm(schemaName) {
        try {
            const schema = await this.fetchSchema(schemaName);
            const rootModel = schema.schemas.RootModel;
            
            this.showFormHeader = true;
            this.showFormActions = true;
            
            this.formTitle = this.getSchemaTitle(rootModel, schemaName);
            
            // Use form generation to create the form HTML
            const formHtml = this.generateFormFromSchema(rootModel, schema.schemas);
            this.dynamicFormHtml = formHtml;
            
            this.initializeFormData(rootModel);
            
            // Auto-add first array items after DOM update
            setTimeout(async () => {
                await this.autoAddFirstArrayItems(rootModel);
            }, 50);
        } catch (error) {
            console.error('Failed to load schema form:', error);
            this.dynamicFormHtml = `
                <div class="enhanced-card">
                    <div class="empty-state">
                        <div class="empty-state-icon">❌</div>
                        <p>Failed to load schema form</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Auto-add first array items for required arrays
     */
    async autoAddFirstArrayItems(rootModel) {
        if (this.arrayManager) {
            await this.arrayManager.autoAddFirstArrayItems(this.currentSchema, rootModel);
        }
    }

    /**
     * Generate form HTML from schema
     */
    generateFormFromSchema(model, allSchemas) {
        if (!model.properties) return '';
        let formHtml = '';
        const displayOrder = model.ui_metadata?.display_order || Object.keys(model.properties);
        for (const fieldName of displayOrder) {
            const field = model.properties[fieldName];
            if (field) {
                formHtml += this.generateFieldHtml(fieldName, field, allSchemas);
            }
        }
        return formHtml;
    }

    /**
     * Generate HTML for individual field
     */
    generateFieldHtml(fieldName, field, allSchemas) {
        const displayName = field.display_name || field.title || fieldName;
        const fieldId = `field-${fieldName}`;
        
        // Always prioritize $ref object references over ui_component
        if (field.$ref) {
            return this.generateNestedObjectField(fieldName, field, allSchemas);
        }
        
        switch (field.ui_component) {
            case 'text_input':
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="text" class="form-control" id="${fieldId}" 
                               placeholder="Enter ${displayName.toLowerCase()}"
                               onchange="window.dynamicWorkflow.updateFormData('${fieldName}', this.value)">
                    </div>
                `;
            case 'number_input':
                const numConf = field.number_config || {};
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="number" class="form-control" id="${fieldId}"
                               min="${numConf.min || ''}" max="${numConf.max || ''}" step="${numConf.step || 1}"
                               placeholder="Enter ${displayName.toLowerCase()}"
                               onchange="window.dynamicWorkflow.updateFormData('${fieldName}', parseFloat(this.value))">
                    </div>
                `;
            case 'array':
                return this.generateArrayField(fieldName, field, allSchemas);
            case 'union_select':
                return this.generateUnionSelectField(fieldName, field, allSchemas);
            default:
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="text" class="form-control" id="${fieldId}"
                               placeholder="Enter ${displayName.toLowerCase()}"
                               onchange="window.dynamicWorkflow.updateFormData('${fieldName}', this.value)">
                    </div>
                `;
        }
    }

    /**
     * Generate array field (delegate to ArrayManager)
     */
    generateArrayField(fieldName, field, allSchemas) {
        if (this.arrayManager) {
            return this.arrayManager.generateArrayField(this.currentSchema, fieldName, field);
        }
        return `<div class="alert alert-warning">Array field generation not available</div>`;
    }

    /**
     * Generate nested object field
     */
    generateNestedObjectField(fieldName, field, allSchemas) {
        const displayName = field.display_name || field.title || fieldName;
        
        // Resolve the $ref to get the referenced schema
        const schemaRef = field.$ref;
        if (!schemaRef) {
            console.error(`No $ref found for nested object field: ${fieldName}`);
            return this.generateFallbackField(fieldName, field);
        }
        
        const schemaName = schemaRef.split('/').pop();
        const referencedSchema = allSchemas[schemaName] || 
                               allSchemas.RootModel?.definitions?.[schemaName] ||
                               this.schemaCache[this.currentSchema]?.schemas?.RootModel?.definitions?.[schemaName];
        
        if (!referencedSchema) {
            console.error(`Referenced schema not found: ${schemaName}`);
            return this.generateFallbackField(fieldName, field);
        }
        
        // Generate nested fields HTML
        let nestedFieldsHtml = '';
        if (referencedSchema.properties) {
            const displayOrder = referencedSchema.ui_metadata?.display_order || Object.keys(referencedSchema.properties);
            for (const propName of displayOrder) {
                const prop = referencedSchema.properties[propName];
                if (prop) {
                    nestedFieldsHtml += this.generateNestedObjectFieldHtml(fieldName, propName, prop);
                }
            }
        }
        
        return `
            <div class="card mb-4">
                <div class="card-body">
                    <h5 class="card-title mb-3">${displayName}</h5>
                    <div class="nested-object-fields">
                        ${nestedFieldsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Generate HTML for nested object field
     */
    generateNestedObjectFieldHtml(parentFieldName, propName, prop) {
        const displayName = prop.display_name || prop.title || propName;
        const fieldId = `${parentFieldName}-${propName}`;
        const onChange = `onchange="window.dynamicWorkflow.updateNestedObjectFieldData('${parentFieldName}', '${propName}', this.value)"`;
        const onChangeFloat = `onchange="window.dynamicWorkflow.updateNestedObjectFieldData('${parentFieldName}', '${propName}', parseFloat(this.value))"`;

        switch (prop.type) {
            case 'number':
                const numConf = prop.number_config || {};
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="number" class="form-control" id="${fieldId}"
                               min="${numConf.min || ''}" max="${numConf.max || ''}" step="${numConf.step || 0.01}"
                               placeholder="Enter ${displayName.toLowerCase()}" ${onChangeFloat}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
            case 'integer':
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="number" class="form-control" id="${fieldId}"
                               step="1" placeholder="Enter ${displayName.toLowerCase()}" ${onChangeFloat}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
            default:
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="text" class="form-control" id="${fieldId}"
                               placeholder="Enter ${displayName.toLowerCase()}" ${onChange}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
        }
    }

    /**
     * Generate fallback field
     */
    generateFallbackField(fieldName, field) {
        const displayName = field.display_name || field.title || fieldName;
        const fieldId = `field-${fieldName}`;
        return `
            <div class="mb-3">
                <label class="form-label" for="${fieldId}">${displayName}</label>
                <input type="text" class="form-control" id="${fieldId}"
                       placeholder="Enter ${displayName.toLowerCase()}"
                       onchange="window.dynamicWorkflow.updateFormData('${fieldName}', this.value)">
                <div class="form-text text-warning">Unable to resolve nested object schema</div>
            </div>
        `;
    }

    /**
     * Generate union select field
     */
    generateUnionSelectField(fieldName, field, allSchemas) {
        const displayName = field.display_name || field.title || fieldName;
        const unionOptions = field.union_options || [];
        
        // Cache the field and union options for dynamic rendering
        this.fieldCache[`${this.currentSchema}_${fieldName}_union`] = {
            field: field,
            unionOptions: unionOptions,
            allSchemas: allSchemas
        };
        
        let optionsHtml = unionOptions.map(option => `
            <div class="option-card" onclick="window.dynamicWorkflow.selectUnionOption('${fieldName}', '${option.value}', this)">
                <span class="option-icon">${this.getUnionIcon(option.label)}</span>
                <span class="option-name">${option.label}</span>
            </div>
        `).join('');

        return `
            <div class="form-group">
                <label class="form-label">${displayName}</label>
                <div class="option-selection" id="union-${fieldName}">${optionsHtml}</div>
                <div id="union-fields-${fieldName}" class="union-fields-container mt-3"></div>
            </div>
        `;
    }

    /**
     * Get union icon
     */
    getUnionIcon(label) {
        return '🔧';
    }

    /**
     * Get schema title
     */
    getSchemaTitle(schema, workflowName) {
        if (schema.title && schema.title !== 'RootModel') {
            return schema.title;
        }
        return workflowName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Update form data (delegate to DataManager)
     */
    updateFormData(fieldName, value) {
        if (this.dataManager) {
            this.dataManager.updateFormData(this.currentSchema, fieldName, value);
        }
    }

    /**
     * Initialize form data (delegate to DataManager)
     */
    initializeFormData(model) {
        if (this.dataManager) {
            this.dataManager.initializeFormData(this.currentSchema, model);
        }
    }

    /**
     * Reset form data (delegate to DataManager)
     */
    resetFormData() {
        if (this.dataManager) {
            this.dataManager.resetFormData(this.currentSchema);
        }
        
        setTimeout(() => {
            document.querySelectorAll('.form-input').forEach(input => input.value = '');
            document.querySelectorAll('.option-card.selected').forEach(card => card.classList.remove('selected'));
        }, 50);
    }

    /**
     * Get form data for schema (delegate to DataManager)
     */
    getFormDataForSchema() {
        if (this.dataManager) {
            return this.dataManager.getFormDataForSchema(this.currentSchema);
        }
        return {};
    }

    /**
     * Update nested object field data (delegate to DataManager)
     */
    updateNestedObjectFieldData(parentFieldName, propName, value) {
        if (this.dataManager) {
            this.dataManager.updateNestedObjectFieldData(this.currentSchema, parentFieldName, propName, value);
        }
    }

    /**
     * Update union field data (delegate to DataManager)
     */
    updateUnionFieldData(parentFieldName, propName, value) {
        if (this.dataManager) {
            this.dataManager.updateUnionFieldData(this.currentSchema, parentFieldName, propName, value);
        }
    }

    /**
     * Select union option
     */
    async selectUnionOption(fieldName, value, element) {
        element.parentNode.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        element.classList.add('selected');
        this.updateFormData(fieldName, value);
        
        // Render dynamic fields for the selected union option
        await this.renderUnionFields(fieldName, value);
    }

    /**
     * Render dynamic fields for selected union option
     */
    async renderUnionFields(fieldName, selectedValue) {
        try {
            const fieldKey = `${this.currentSchema}_${fieldName}_union`;
            const cachedData = this.fieldCache[fieldKey];
            if (!cachedData) {
                console.error(`Union field data not found for: ${fieldKey}`);
                return;
            }

            const { unionOptions, allSchemas } = cachedData;
            const selectedOption = unionOptions.find(option => option.value === selectedValue);
            if (!selectedOption) {
                console.error(`Selected union option not found: ${selectedValue}`);
                return;
            }

            // Get the schema for the selected union type
            const schemaRef = selectedOption.schema_ref;
            if (!schemaRef) {
                console.error(`Schema reference not found for union option: ${selectedValue}`);
                return;
            }

            const schemaName = schemaRef.split('/').pop();
            const selectedSchema = allSchemas[schemaName] || 
                                allSchemas.RootModel?.definitions?.[schemaName] ||
                                this.schemaCache[this.currentSchema]?.schemas?.RootModel?.definitions?.[schemaName];

            if (!selectedSchema) {
                console.error(`Schema not found for: ${schemaName}`);
                return;
            }

            // Clear previous union fields
            const container = document.getElementById(`union-fields-${fieldName}`);
            if (container) {
                container.innerHTML = '';
            }

            // Generate fields HTML for the selected schema
            const fieldsHtml = this.generateUnionSchemaFields(fieldName, selectedSchema, allSchemas);
            if (container) {
                container.innerHTML = fieldsHtml;
            }

            // Initialize form data for the selected union type
            this.initializeUnionFormData(fieldName, selectedSchema);

        } catch (error) {
            console.error('Failed to render union fields:', error);
        }
    }

    /**
     * Generate HTML for union schema fields
     */
    generateUnionSchemaFields(parentFieldName, schema, allSchemas) {
        if (!schema.properties) return '';
        
        let fieldsHtml = '<div class="union-schema-fields mt-3 p-3" style="border: 1px solid var(--bs-border-color); border-radius: 6px; background-color: #f8f9fa;">';
        
        const displayOrder = schema.ui_metadata?.display_order || Object.keys(schema.properties);
        for (const propName of displayOrder) {
            const prop = schema.properties[propName];
            if (prop) {
                fieldsHtml += this.generateUnionFieldHtml(parentFieldName, propName, prop);
            }
        }
        
        fieldsHtml += '</div>';
        return fieldsHtml;
    }

    /**
     * Generate HTML for individual union field
     */
    generateUnionFieldHtml(parentFieldName, propName, prop) {
        const displayName = prop.display_name || prop.title || propName;
        const fieldId = `${parentFieldName}-${propName}`;
        const onChange = `onchange="window.dynamicWorkflow.updateUnionFieldData('${parentFieldName}', '${propName}', this.value)"`;
        const onChangeFloat = `onchange="window.dynamicWorkflow.updateUnionFieldData('${parentFieldName}', '${propName}', parseFloat(this.value))"`;

        switch (prop.type) {
            case 'number':
                const numConf = prop.number_config || {};
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="number" class="form-control" id="${fieldId}"
                               min="${numConf.min || ''}" max="${numConf.max || ''}" step="${numConf.step || 0.01}"
                               placeholder="Enter ${displayName.toLowerCase()}" ${onChangeFloat}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
            case 'integer':
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="number" class="form-control" id="${fieldId}"
                               step="1" placeholder="Enter ${displayName.toLowerCase()}" ${onChangeFloat}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
            default:
                return `
                    <div class="mb-3">
                        <label class="form-label" for="${fieldId}">${displayName}</label>
                        <input type="text" class="form-control" id="${fieldId}"
                               placeholder="Enter ${displayName.toLowerCase()}" ${onChange}>
                        ${prop.description ? `<div class="form-text">${prop.description}</div>` : ''}
                    </div>
                `;
        }
    }

    /**
     * Initialize union form data (delegate to DataManager)
     */
    initializeUnionFormData(fieldName, schema) {
        if (this.dataManager) {
            this.dataManager.initializeUnionFormData(this.currentSchema, fieldName, schema);
        }
    }

    /**
     * Add entity (delegate to ArrayManager)
     */
    async addEntity() {
        if (this.arrayManager) {
            await this.arrayManager.addEntity(this.currentSchema);
        } else {
            alert('Array manager not available');
        }
    }

    /**
     * Process workflow data
     */
    processData() {
        if (!this.currentSchema || !Object.keys(this.getFormDataForSchema()).length) {
            alert('Please select a schema and enter some data first');
            return;
        }
        
        this.showResults = true;
        const results = this.generateSchemaResults();
        this.displayResults(results);
        
        setTimeout(() => {
            document.querySelector('[x-show="showResults"]')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    /**
     * Generate schema processing results
     */
    generateSchemaResults() {
        const data = this.getFormDataForSchema();
        const dataKeys = Object.keys(data);
        return {
            summary: {
                schema: this.currentSchema,
                fieldsCompleted: dataKeys.length,
                dataEntries: JSON.stringify(data, null, 2)
            },
            insights: [
                `Using schema: <strong>${this.currentSchema}</strong>`,
                `Completed <strong>${dataKeys.length}</strong> top-level form fields.`,
                'Data structure follows the selected API-driven schema format.',
                'Form data is ready for processing or export.'
            ]
        };
    }

    /**
     * Display processing results
     */
    displayResults(results) {
        const dataStr = results.summary.dataEntries;
        this.resultsHtml = `
            <div style="margin-bottom: 2rem;">
                <h4 style="color: #333; margin-bottom: 1rem;">📊 Processing Summary</h4>
                <ul style="list-style: none; padding: 0;">
                    ${results.insights.map(insight => `
                        <li style="padding: 0.5rem 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: var(--primary-blue); margin-right: 0.5rem;">•</span>
                            ${insight}
                        </li>
                    `).join('')}
                </ul>
            </div>
            <div>
                <h4 style="color: #333; margin-bottom: 1rem;">📋 Submitted Data (JSON)</h4>
                <pre style="background-color: #f8f9fa; padding: 1rem; border-radius: 6px; border: 1px solid var(--border-color); white-space: pre-wrap; word-wrap: break-word;"><code>${dataStr}</code></pre>
            </div>
        `;
    }

    /**
     * Export workflow data
     */
    exportData() {
        if (!this.currentSchema || !Object.keys(this.getFormDataForSchema()).length) {
            alert('No data to export. Please fill out the form first.');
            return;
        }
        
        if (this.dataManager) {
            try {
                const exportResult = this.dataManager.exportData(this.currentSchema, 'json');
                this.downloadFile(exportResult.content, exportResult.filename, exportResult.mimeType);
            } catch (error) {
                console.error('Export failed:', error);
                alert('Export failed: ' + error.message);
            }
        }
    }

    /**
     * Download file utility
     */
    downloadFile(content, filename, mimeType) {
        const dataBlob = new Blob([content], {type: mimeType});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
    }

    /**
     * Reset all workflow data
     */
    resetAll() {
        if (confirm('Are you sure you want to reset all data? This action cannot be undone.')) {
            if (this.dataManager) {
                this.dataManager.clearAll();
            }
            
            this.currentSchema = null;
            this.dynamicFormHtml = '';
            this.resultsHtml = '';
            this.showFormHeader = false;
            this.showFormActions = false;
            this.showResults = false;
        }
    }

    /**
     * Get current workflow state
     */
    getCurrentState() {
        return {
            currentSchema: this.currentSchema,
            availableWorkflows: this.availableWorkflows,
            schemasLoaded: this.schemasLoaded,
            showFormHeader: this.showFormHeader,
            showFormActions: this.showFormActions,
            showResults: this.showResults,
            formTitle: this.formTitle,
            formData: this.getFormDataForSchema()
        };
    }
}

// Create global instance and initialize
window.dynamicWorkflow = new DynamicWorkflowManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.dynamicWorkflow) {
        window.dynamicWorkflow.init();
    }
});

// Export for use in other modules
window.DynamicWorkflowManager = DynamicWorkflowManager;

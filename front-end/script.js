class MoAInterface {
    constructor() {
        this.promptInput = document.getElementById('promptInput');
        this.modelCheckboxGroup = document.getElementById('modelCheckboxes');
        this.generateBtn = document.getElementById('generateBtn');
        this.modelOutputs = document.getElementById('modelOutputs');
        this.modelTabs = document.getElementById('modelTabs');
        this.modelResponses = document.getElementById('modelResponses');
        this.synthesizedOutput = document.getElementById('synthesizedOutput');
        this.progressBarContainer = document.getElementById('progressBarContainer');
        this.progressBar = document.getElementById('progressBar');

        this.fetchModelChoices();
        this.initEventListeners();
    }

    fetchModelChoices() {
        fetch('/models')
            .then(response => response.json())
            .then(models => this.populateModelChoices(models))
            .catch(error => console.error('Error fetching models:', error));
    }

    populateModelChoices(models) {
        const groupedModels = models.reduce((acc, model) => {
            const [provider, ...modelName] = model.split(' ');
            if (!acc[provider]) acc[provider] = [];
            acc[provider].push(modelName.join(' '));
            return acc;
        }, {});

        const allOption = this.createProviderBlock('All', 'all');
        this.modelCheckboxGroup.appendChild(allOption);

        Object.entries(groupedModels).forEach(([provider, modelNames]) => {
            const providerBlock = this.createProviderBlock(provider, modelNames);
            this.modelCheckboxGroup.appendChild(providerBlock);
        });

        this.modelCheckboxes = document.querySelectorAll('input[name="model"]');
        this.modelCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateModelOutputs());
        });

        this.selectAllCheckbox = document.getElementById('selectAll');
        this.selectAllCheckbox.addEventListener('change', () => this.handleSelectAll());
    }

    createProviderBlock(provider, modelNames) {
        const providerBlock = document.createElement('div');
        providerBlock.className = `provider-block ${provider === 'All' ? 'all' : ''}`;
        providerBlock.innerHTML = `<h3>${provider}</h3>`;
        if (provider === 'All') {
            providerBlock.innerHTML = `
                <label class="checkbox-label">
                    <input type="checkbox" id="selectAll"> <strong>All</strong>
                </label>
            `;
        } else {
            modelNames.forEach(modelName => {
                const label = document.createElement('label');
                label.className = 'checkbox-label';
                label.innerHTML = `
                    <input type="checkbox" name="model" value="${provider} ${modelName}"> ${modelName}
                `;
                providerBlock.appendChild(label);
            });
        }
        return providerBlock;
    }

    handleSelectAll() {
        const isChecked = this.selectAllCheckbox.checked;
        this.modelCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        this.updateModelOutputs();
    }

    updateModelOutputs() {
        const selectedModels = Array.from(this.modelCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        this.modelTabs.innerHTML = '';
        this.modelResponses.innerHTML = '';

        if (selectedModels.length > 0) {
            this.modelOutputs.style.display = 'block';
            selectedModels.forEach((model, index) => {
                const sanitizedId = model.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                const tab = document.createElement('div');
                tab.className = `tab ${index === 0 ? 'active' : ''}`;
                tab.textContent = model;
                tab.dataset.tab = sanitizedId;
                tab.addEventListener('click', () => this.activateTab(tab));
                this.modelTabs.appendChild(tab);

                const content = document.createElement('div');
                content.id = sanitizedId;
                content.className = `tab-content ${index === 0 ? 'active' : ''}`;
                content.innerHTML = `<p>${model} response will appear here...</p>`;
                this.modelResponses.appendChild(content);
            });
        } else {
            this.modelOutputs.style.display = 'none';
        }
    }

    activateTab(clickedTab) {
        document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
        clickedTab.classList.add('active');
        const tabContent = document.getElementById(clickedTab.dataset.tab);
        if (tabContent) {
            tabContent.classList.add('active');
        }
    }

    showProgressBar() {
        this.progressBarContainer.style.display = 'block';
        this.progressBar.style.height = '0';
    }

    updateProgressBar(progress) {
        this.progressBar.style.height = `${progress}%`;
    }

    hideProgressBar() {
        this.progressBarContainer.style.display = 'none';
        this.progressBar.style.height = '0';
    }

    showLoadingSpinner() {
        document.getElementById('loadingSpinner').style.display = 'block';
    }

    hideLoadingSpinner() {
        document.getElementById('loadingSpinner').style.display = 'none';
    }
    
    generateResponse() {
        const prompt = this.promptInput.value;
        const selectedModels = Array.from(this.modelCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => {
                const [provider, ...modelParts] = cb.value.split(' ');
                return { provider, model: modelParts.join(' ') };
            });
    
        if (prompt && selectedModels.length > 0) {
            this.showProgressBar();
            this.showLoadingSpinner();
    
            fetch('/moa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    selectedModels: selectedModels,
                    aggregatorConfig: { provider: 'OpenAI', model: 'gpt-3.5-turbo' },
                    customPrompt: '',
                    rounds: 1,
                    temperature: 0.7,
                    maxTokens: 2048
                }),
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                // Update individual model responses
                Object.entries(data.proposals).forEach(([model, response]) => {
                    const sanitizedId = model.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                    const contentElement = document.getElementById(sanitizedId);
                    if (contentElement) {
                        this.renderContentWithMath(response, contentElement);
                    }
                });
    
                // Update synthesized output
                this.renderContentWithMath(data.aggregatedResponse, this.synthesizedOutput);
    
                this.hideProgressBar();
                this.hideLoadingSpinner();
            })
            .catch((error) => {
                this.hideProgressBar();
                this.hideLoadingSpinner();
                console.error('Error:', error);
                alert('An error occurred while generating the response. Please try again.');
            });
        } else {
            alert('Please enter a prompt and select at least one model.');
        }
    }

    renderContentWithMath(content, targetElement) {
        const htmlContent = this.renderMarkdown(content);
        targetElement.innerHTML = htmlContent;
        MathJax.typesetPromise([targetElement]).catch((err) => console.log('MathJax error:', err));
    }

    renderMarkdown(content) {
        // Temporarily replace display math delimiters
        content = content.replace(/\\\[(.*?)\\\]/g, '%%%DISPLAY_MATH_START%%%$1%%%DISPLAY_MATH_END%%%');
        
        // Convert inline math to display math, but only if not already in display math
        content = content.replace(/(?<!%%%)(\$)(?!%)(.+?)(\$)(?!%%)/g, '%%%INLINE_MATH_START%%%$2%%%INLINE_MATH_END%%%');

        // Render Markdown
        let htmlContent = marked.parse(content);

        // Replace math delimiters with appropriate MathJax delimiters
        htmlContent = htmlContent.replace(/%%%DISPLAY_MATH_START%%%(.*?)%%%DISPLAY_MATH_END%%%/g, '\\[$1\\]');
        htmlContent = htmlContent.replace(/%%%INLINE_MATH_START%%%(.*?)%%%INLINE_MATH_END%%%/g, '\\($1\\)');

        return htmlContent;
    }

    initEventListeners() {
        this.generateBtn.addEventListener('click', () => this.generateResponse());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MoAInterface();
});

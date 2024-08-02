class MoAInterface {
    constructor() {
        this.promptInput = document.getElementById('promptInput');
        this.selectAllCheckbox = document.getElementById('selectAll');
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
            .then(models => {
                const groupedModels = models.reduce((acc, model) => {
                    const [provider, ...modelName] = model.split(' ');
                    if (!acc[provider]) acc[provider] = [];
                    acc[provider].push(modelName.join(' '));
                    return acc;
                }, {});

                const allOption = document.createElement('div');
                allOption.className = 'provider-block all'; // Added "all" class
                allOption.innerHTML = `
                    <label class="checkbox-label">
                        <input type="checkbox" id="selectAll"> <strong>All</strong>
                    </label>
                `;
                this.modelCheckboxGroup.appendChild(allOption);

                Object.entries(groupedModels).forEach(([provider, modelNames]) => {
                    const providerBlock = document.createElement('div');
                    providerBlock.className = 'provider-block';
                    providerBlock.innerHTML = `<h3>${provider}</h3>`;
                    modelNames.forEach(modelName => {
                        const label = document.createElement('label');
                        label.className = 'checkbox-label';
                        label.innerHTML = `
                            <input type="checkbox" name="model" value="${provider} ${modelName}"> ${modelName}
                        `;
                        providerBlock.appendChild(label);
                    });
                    this.modelCheckboxGroup.appendChild(providerBlock);
                });

                this.modelCheckboxes = document.querySelectorAll('input[name="model"]');
                this.modelCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => this.updateModelOutputs());
                });

                this.selectAllCheckbox = document.getElementById('selectAll');
                this.selectAllCheckbox.addEventListener('change', () => this.handleSelectAll());
            })
            .catch(error => console.error('Error fetching models:', error));
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

    // generateResponse() {
    //     const prompt = this.promptInput.value;
    //     const selectedModels = Array.from(this.modelCheckboxes)
    //         .filter(cb => cb.checked)
    //         .map(cb => {
    //             const [provider, ...modelParts] = cb.value.split(' ');
    //             return { provider, model: modelParts.join(' ') };
    //         });

    //     console.log("Generate button clicked");
    //     console.log("Prompt:", prompt);
    //     console.log("Selected Models:", selectedModels);

    //     if (prompt && selectedModels.length > 0) {
    //         this.showProgressBar();
    //         this.showLoadingSpinner(); // Show loading spinner

    //         fetch('/moa', {
    //             method: 'POST',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //             body: JSON.stringify({
    //                 prompt: prompt,
    //                 selectedModels: selectedModels,
    //                 aggregatorConfig: { provider: 'OpenAI', model: 'gpt-3.5-turbo' },
    //                 customPrompt: '',
    //                 rounds: 1,
    //                 temperature: 0.7,
    //                 maxTokens: 2048
    //             }),
    //         })
    //         .then(response => {
    //             if (!response.ok) {
    //                 throw new Error('Network response was not ok');
    //             }
    //             console.log('Response received:', response);
    //             const reader = response.body.getReader();
    //             const decoder = new TextDecoder('utf-8');
    //             let receivedLength = 0;
    //             const contentLength = response.headers.get('Content-Length');

    //             const read = () => {
    //                 reader.read().then(({ done, value }) => {
    //                     if (done) {
    //                         this.hideProgressBar();
    //                         this.hideLoadingSpinner(); // Hide loading spinner
    //                         return;
    //                     }

    //                     receivedLength += value.length;
    //                     const progress = (receivedLength / contentLength) * 100;
    //                     this.updateProgressBar(progress);

    //                     const text = decoder.decode(value, { stream: true });
    //                     console.log("Received text:", text);
    //                     this.synthesizedOutput.textContent += text;

    //                     const modelResponses = JSON.parse(text);

    //                     Object.keys(modelResponses.proposals).forEach(model => {
    //                         const sanitizedId = model.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    //                         const contentElement = document.getElementById(sanitizedId);
    //                         if (contentElement) {
    //                             contentElement.innerHTML = `<p>${modelResponses.proposals[model]}</p>`;
    //                         }
    //                     });

    //                     this.synthesizedOutput.innerHTML = modelResponses.aggregatedResponse;

    //                     read();
    //                 });
    //             };
    //             read();
    //         })
    //         .catch((error) => {
    //             this.hideProgressBar();
    //             this.hideLoadingSpinner(); // Hide loading spinner
    //             console.error('Error:', error);
    //         });
    //     } else {
    //         alert('Please enter a prompt and select at least one model.');
    //     }
    // }

    generateResponse() {
        const prompt = this.promptInput.value;
        const selectedModels = Array.from(this.modelCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => {
                const [provider, ...modelParts] = cb.value.split(' ');
                return { provider, model: modelParts.join(' ') };
            });
    
        console.log("Generate button clicked");
        console.log("Prompt:", prompt);
        console.log("Selected Models:", selectedModels);
    
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
                return response.json(); // Parse the response as JSON
            })
            .then(data => {
                console.log('Response received:', data);
                
                // Update individual model responses
                Object.entries(data.proposals).forEach(([model, response]) => {
                    const sanitizedId = model.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                    const contentElement = document.getElementById(sanitizedId);
                    if (contentElement) {
                        contentElement.innerHTML = `<p>${response}</p>`;
                    }
                });
    
                // Update synthesized output
                this.synthesizedOutput.innerHTML = data.aggregatedResponse;
    
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

    initEventListeners() {
        this.generateBtn.addEventListener('click', () => this.generateResponse());
        // Add a button to fetch conversation history
    }
    
}

document.addEventListener('DOMContentLoaded', () => {
    new MoAInterface();
});

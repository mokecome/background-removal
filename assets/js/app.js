// 主应用程序逻辑
class BackgroundRemovalApp {
    constructor() {
        this.currentFiles = [];
        this.selectedMode = 'auto';
        this.isManualMode = false;
        this.processors = {};
        this.currentResults = [];
        
        this.init();
    }

    init() {
        this.initElements();
        this.bindEvents();
        this.loadUserPreferences();
        this.initProcessors();
    }

    initElements() {
        // 主要界面元素
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.processBtn = document.getElementById('processBtn');
        
        // 模式选择元素
        this.toggleManual = document.getElementById('toggleManual');
        this.autoMode = document.getElementById('autoMode');
        this.manualModes = document.getElementById('manualModes');
        this.selectedMode = document.getElementById('selectedMode');
        
        // 状态显示元素
        this.previewSection = document.getElementById('previewSection');
        this.processingSection = document.getElementById('processingSection');
        this.resultSection = document.getElementById('resultSection');
        
        // 其他控制元素
        this.downloadBtn = document.getElementById('downloadBtn');
        this.retryBtn = document.getElementById('retryBtn');
        this.newImageBtn = document.getElementById('newImageBtn');
    }

    bindEvents() {
        // 文件上传事件
        this.uploadZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // 拖拽上传事件
        this.uploadZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadZone.addEventListener('drop', (e) => this.handleDrop(e));
        
        // 模式切换事件
        this.toggleManual.addEventListener('click', () => this.toggleModeSelection());
        
        // 模式选择事件
        document.querySelectorAll('.mode-option').forEach(option => {
            option.addEventListener('click', () => this.selectMode(option.dataset.mode));
        });
        
        // 处理和控制按钮事件
        this.processBtn.addEventListener('click', () => this.startProcessing());
        this.downloadBtn.addEventListener('click', () => this.downloadResults());
        this.retryBtn.addEventListener('click', () => this.showModeSelection());
        this.newImageBtn.addEventListener('click', () => this.resetApp());
        
        // 其他控制按钮
        document.getElementById('changeMode').addEventListener('click', () => this.showModeSelection());
    }

    initProcessors() {
        // 初始化处理器
        this.processors = {
            fast: new CanvasProcessor(),
            balanced: new MediaPipeProcessor(),
            precise: new TensorFlowProcessor()
        };
        
        // 初始化图片分析器
        this.imageAnalyzer = new ImageAnalyzer();
    }

    loadUserPreferences() {
        const preferences = localStorage.getItem('bgRemovalPreferences');
        if (preferences) {
            const prefs = JSON.parse(preferences);
            this.isManualMode = prefs.isManualMode || false;
            this.selectedMode = prefs.selectedMode || 'auto';
        }
    }

    saveUserPreferences() {
        const preferences = {
            isManualMode: this.isManualMode,
            selectedMode: this.selectedMode
        };
        localStorage.setItem('bgRemovalPreferences', JSON.stringify(preferences));
    }

    // 文件处理方法
    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.processFiles(files);
    }

    handleDragOver(event) {
        event.preventDefault();
        this.uploadZone.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.uploadZone.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        this.uploadZone.classList.remove('drag-over');
        
        const files = Array.from(event.dataTransfer.files);
        this.processFiles(files);
    }

    processFiles(files) {
        // 过滤有效的图片文件
        const validFiles = files.filter(file => {
            const isValidType = file.type === 'image/jpeg' || file.type === 'image/png';
            const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB限制
            
            if (!isValidType) {
                this.showMessage('只支持 JPG 和 PNG 格式的图片', 'warning');
                return false;
            }
            
            if (!isValidSize) {
                this.showMessage(`文件 ${file.name} 超过 10MB 限制`, 'warning');
                return false;
            }
            
            return true;
        });

        if (validFiles.length === 0) return;

        this.currentFiles = validFiles;
        this.showImagePreviews();
        this.enableProcessButton();
        
        // 如果是自动模式，自动分析图片
        if (!this.isManualMode) {
            this.analyzeImagesAndRecommend();
        }
    }

    async showImagePreviews() {
        const previewContainer = document.getElementById('imagePreview');
        previewContainer.innerHTML = '';
        
        for (const file of this.currentFiles) {
            const preview = await this.createImagePreview(file);
            previewContainer.appendChild(preview);
        }
        
        this.previewSection.classList.remove('hidden');
    }

    async createImagePreview(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const container = document.createElement('div');
                container.className = 'image-preview-item bg-white/5 rounded-lg p-4';
                
                container.innerHTML = `
                    <div class=\"flex items-center gap-4\">
                        <img src=\"${e.target.result}\" alt=\"预览\" class=\"w-24 h-24 object-cover rounded-lg\">
                        <div class=\"flex-1\">
                            <h5 class=\"text-white font-medium mb-1\">${file.name}</h5>
                            <p class=\"text-gray-400 text-sm\">${this.formatFileSize(file.size)} • ${file.type.split('/')[1].toUpperCase()}</p>
                        </div>
                        <div class=\"text-green-400\">
                            <i class=\"fas fa-check-circle text-xl\"></i>
                        </div>
                    </div>
                `;
                
                resolve(container);
            };
            reader.readAsDataURL(file);
        });
    }

    async analyzeImagesAndRecommend() {
        if (this.currentFiles.length === 0) return;
        
        this.showMessage('🤖 智能分析图片中...', 'info');
        
        try {
            // 分析第一张图片作为代表
            const analysis = await this.imageAnalyzer.analyze(this.currentFiles[0]);
            const recommendedMode = this.getRecommendedMode(analysis);
            
            this.selectedMode = recommendedMode;
            this.updateAutoModeDisplay(analysis, recommendedMode);
            
        } catch (error) {
            console.error('图片分析失败:', error);
            this.showMessage('图片分析失败，将使用平衡模式处理', 'warning');
            this.selectedMode = 'balanced';
        }
    }

    getRecommendedMode(analysis) {
        if (analysis.hasHuman && analysis.complexity > 0.7) {
            return 'precise';
        } else if (analysis.hasHuman || analysis.complexity > 0.4) {
            return 'balanced';
        } else {
            return 'fast';
        }
    }

    updateAutoModeDisplay(analysis, mode) {
        const recommendation = document.getElementById('autoRecommendation');
        const modeNames = {
            fast: '快速模式',
            balanced: '平衡模式',
            precise: '精确模式'
        };
        
        const reasons = [];
        if (analysis.hasHuman) reasons.push('检测到人物');
        if (analysis.complexity > 0.7) reasons.push('背景复杂');
        else if (analysis.complexity > 0.4) reasons.push('背景中等复杂度');
        else reasons.push('背景简单');
        
        const reasonText = reasons.join('，');
        recommendation.textContent = `💡 智能分析: ${reasonText}，推荐使用${modeNames[mode]}`;
    }

    // 模式选择方法
    toggleModeSelection() {
        this.isManualMode = !this.isManualMode;
        
        if (this.isManualMode) {
            this.autoMode.classList.add('hidden');
            this.manualModes.classList.remove('hidden');
            document.getElementById('toggleText').textContent = '使用智能模式';
            document.getElementById('toggleIcon').className = 'fas fa-chevron-up ml-1';
        } else {
            this.autoMode.classList.remove('hidden');
            this.manualModes.classList.add('hidden');
            document.getElementById('toggleText').textContent = '手动选择模式';
            document.getElementById('toggleIcon').className = 'fas fa-chevron-down ml-1';
        }
        
        this.saveUserPreferences();
    }

    selectMode(mode) {
        this.selectedMode = mode;
        
        // 更新UI选中状态
        document.querySelectorAll('.mode-option').forEach(option => {
            option.classList.remove('selected');
        });
        document.querySelector(`[data-mode=\"${mode}\"]`).classList.add('selected');
        
        // 显示选择状态
        this.showSelectedMode(mode);
        this.saveUserPreferences();
    }

    showSelectedMode(mode) {
        const modeInfo = {
            fast: { icon: 'fas fa-bolt', name: '快速模式', color: 'text-green-400' },
            balanced: { icon: 'fas fa-balance-scale', name: '平衡模式', color: 'text-blue-400' },
            precise: { icon: 'fas fa-crosshairs', name: '精确模式', color: 'text-purple-400' }
        };
        
        const info = modeInfo[mode];
        document.getElementById('selectedIcon').className = `${info.icon} text-xl ${info.color}`;
        document.getElementById('selectedText').textContent = `将使用${info.name}处理`;
        
        this.selectedMode.classList.remove('hidden');
    }

    showModeSelection() {
        this.selectedMode.classList.add('hidden');
        if (this.isManualMode) {
            this.manualModes.classList.remove('hidden');
        } else {
            this.autoMode.classList.remove('hidden');
        }
    }

    enableProcessButton() {
        this.processBtn.disabled = false;
        this.processBtn.innerHTML = '<i class=\"fas fa-play mr-2\"></i>开始处理';
    }

    // 图片处理方法
    async startProcessing() {
        if (this.currentFiles.length === 0) return;
        
        this.showProcessingUI();
        
        try {
            this.currentResults = [];
            const processor = this.processors[this.selectedMode];
            
            for (let i = 0; i < this.currentFiles.length; i++) {
                const file = this.currentFiles[i];
                
                this.updateProcessingProgress(i, this.currentFiles.length, `正在处理 ${file.name}...`);
                
                const result = await processor.process(file);
                this.currentResults.push({
                    original: file,
                    processed: result,
                    mode: this.selectedMode
                });
                
                this.updateProcessingProgress(i + 1, this.currentFiles.length);
            }
            
            this.showResults();
            
        } catch (error) {
            console.error('处理失败:', error);
            this.showMessage('图片处理失败，请重试或尝试其他模式', 'error');
            this.hideProcessingUI();
        }
    }

    showProcessingUI() {
        this.previewSection.classList.add('hidden');
        this.resultSection.classList.add('hidden');
        this.processingSection.classList.remove('hidden');
        
        document.getElementById('processingTitle').textContent = '处理中...';
        document.getElementById('processingStatus').textContent = '正在准备处理...';
        document.getElementById('progressBar').style.width = '0%';
    }

    updateProcessingProgress(current, total, status = null) {
        const progress = (current / total) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        
        if (status) {
            document.getElementById('processingStatus').textContent = status;
        } else {
            document.getElementById('processingStatus').textContent = `已完成 ${current}/${total} 张图片`;
        }
    }

    hideProcessingUI() {
        this.processingSection.classList.add('hidden');
    }

    // 结果显示方法
    showResults() {
        this.hideProcessingUI();
        this.resultSection.classList.remove('hidden');
        
        const resultContainer = document.getElementById('resultPreview');
        resultContainer.innerHTML = '';
        
        this.currentResults.forEach((result, index) => {
            const comparison = this.createResultComparison(result, index);
            resultContainer.appendChild(comparison);
        });
    }

    createResultComparison(result, index) {
        const container = document.createElement('div');
        container.className = 'result-comparison';
        
        container.innerHTML = `
            <div class=\"result-image-container\">
                <h5>原图</h5>
                <img src=\"${URL.createObjectURL(result.original)}\" alt=\"原图\">
            </div>
            <div class=\"result-image-container transparent-bg\">
                <h5>处理结果</h5>
                <img src=\"${result.processed}\" alt=\"处理结果\">
            </div>
        `;
        
        return container;
    }

    // 下载和重置方法
    downloadResults() {
        if (this.currentResults.length === 0) return;
        
        this.currentResults.forEach((result, index) => {
            const link = document.createElement('a');
            link.href = result.processed;
            link.download = `removed_bg_${result.original.name}`;
            link.click();
        });
        
        this.showMessage('文件下载已开始', 'success');
    }

    resetApp() {
        this.currentFiles = [];
        this.currentResults = [];
        this.selectedMode = 'auto';
        
        this.previewSection.classList.add('hidden');
        this.processingSection.classList.add('hidden');
        this.resultSection.classList.add('hidden');
        this.selectedMode.classList.add('hidden');
        
        this.processBtn.disabled = true;
        this.processBtn.innerHTML = '<i class=\"fas fa-play mr-2\"></i>开始处理';
        
        this.fileInput.value = '';
        
        if (!this.isManualMode) {
            this.autoMode.classList.remove('hidden');
        }
    }

    // 工具方法
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showMessage(message, type = 'info') {
        const messageContainer = document.createElement('div');
        messageContainer.className = `message ${type}`;
        messageContainer.textContent = message;
        
        document.body.appendChild(messageContainer);
        
        setTimeout(() => {
            messageContainer.remove();
        }, 5000);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new BackgroundRemovalApp();
});
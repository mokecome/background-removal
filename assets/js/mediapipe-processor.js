// MediaPipe平衡处理模式 - 人物分割
class MediaPipeProcessor {
    constructor() {
        this.selfieSegmentation = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    async process(file) {
        try {
            // 确保MediaPipe已加载
            await this.ensureLoaded();
            
            const image = await this.loadImage(file);
            
            // 设置canvas尺寸
            this.canvas.width = image.width;
            this.canvas.height = image.height;
            
            // 执行分割
            const segmentationResult = await this.performSegmentation(image);
            
            // 应用分割结果
            const processedDataURL = await this.applySegmentation(image, segmentationResult);
            
            return processedDataURL;
            
        } catch (error) {
            console.error('MediaPipe处理失败:', error);
            
            // 如果MediaPipe失败，回退到Canvas处理
            console.log('回退到Canvas处理模式');
            const canvasProcessor = new CanvasProcessor();
            return await canvasProcessor.process(file);
        }
    }

    async ensureLoaded() {
        if (this.isLoaded) return;
        
        if (this.isLoading) {
            // 等待加载完成
            while (this.isLoading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isLoading = true;
        
        try {
            // 检查是否已经加载了MediaPipe
            if (typeof SelfieSegmentation === 'undefined') {
                await this.loadMediaPipeScript();
            }
            
            // 初始化SelfieSegmentation
            this.selfieSegmentation = new SelfieSegmentation({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
                }
            });
            
            // 配置选项
            this.selfieSegmentation.setOptions({
                modelSelection: 1, // 0 for general, 1 for landscape
                selfieMode: false,
            });
            
            // 等待初始化完成
            await new Promise((resolve, reject) => {
                let resolved = false;
                
                this.selfieSegmentation.onResults((results) => {
                    if (!resolved) {
                        resolved = true;
                        resolve(results);
                    }
                });
                
                // 创建一个简单的测试图像
                const testCanvas = document.createElement('canvas');
                testCanvas.width = 100;
                testCanvas.height = 100;
                const testCtx = testCanvas.getContext('2d');
                testCtx.fillStyle = 'rgb(128, 128, 128)';
                testCtx.fillRect(0, 0, 100, 100);
                
                this.selfieSegmentation.send({ image: testCanvas });
                
                // 设置超时
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        reject(new Error('MediaPipe初始化超时'));
                    }
                }, 5000);
            });
            
            this.isLoaded = true;
            
        } catch (error) {
            console.error('MediaPipe加载失败:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    async loadMediaPipeScript() {
        return new Promise((resolve, reject) => {
            // 检查是否已经存在脚本
            if (document.querySelector('script[src*="mediapipe"]')) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('MediaPipe脚本加载失败'));
            document.head.appendChild(script);
        });
    }

    async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = URL.createObjectURL(file);
        });
    }

    async performSegmentation(image) {
        return new Promise((resolve, reject) => {
            let resolved = false;
            
            this.selfieSegmentation.onResults((results) => {
                if (!resolved) {
                    resolved = true;
                    resolve(results);
                }
            });
            
            // 发送图像进行处理
            this.selfieSegmentation.send({ image: image });
            
            // 设置超时
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error('分割处理超时'));
                }
            }, 10000);
        });
    }

    async applySegmentation(image, segmentationResult) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制原始图像
        this.ctx.drawImage(image, 0, 0);
        
        // 获取图像数据
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        
        // 获取分割遮罩
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = this.canvas.width;
        maskCanvas.height = this.canvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        
        maskCtx.drawImage(segmentationResult.segmentationMask, 0, 0, this.canvas.width, this.canvas.height);
        const maskData = maskCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // 应用遮罩
        for (let i = 0; i < data.length; i += 4) {
            const maskValue = maskData.data[i]; // 使用R通道作为遮罩值
            
            // MediaPipe的segmentationMask中，255表示人物，0表示背景
            if (maskValue < 128) {
                data[i + 3] = 0; // 设置为透明（背景）
            } else {
                // 边缘软化处理
                const alpha = this.calculateEdgeSoftening(i, maskData.data, this.canvas.width, this.canvas.height);
                data[i + 3] = Math.min(255, data[i + 3] * alpha);
            }
        }
        
        // 后处理优化
        this.postProcessSegmentation(imageData);
        
        this.ctx.putImageData(imageData, 0, 0);
        
        return this.canvas.toDataURL('image/png');
    }

    calculateEdgeSoftening(pixelIndex, maskData, width, height) {
        const i = pixelIndex / 4;
        const x = i % width;
        const y = Math.floor(i / width);
        
        // 检查周围像素的遮罩值
        let foregroundCount = 0;
        let totalCount = 0;
        
        const radius = 2;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const neighborIndex = (ny * width + nx) * 4;
                    const neighborMask = maskData[neighborIndex];
                    
                    totalCount++;
                    if (neighborMask >= 128) {
                        foregroundCount++;
                    }
                }
            }
        }
        
        const ratio = foregroundCount / totalCount;
        
        // 边缘软化：在边缘区域降低不透明度
        if (ratio > 0.8) {
            return 1.0; // 完全不透明
        } else if (ratio > 0.6) {
            return 0.8; // 轻微透明
        } else if (ratio > 0.4) {
            return 0.5; // 半透明
        } else if (ratio > 0.2) {
            return 0.2; // 很透明
        } else {
            return 0.0; // 完全透明
        }
    }

    postProcessSegmentation(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 1. 中值滤波去噪
        this.medianFilter(imageData);
        
        // 2. 形态学操作
        this.morphologicalOperations(imageData);
        
        // 3. 边缘羽化
        this.edgeFeathering(imageData);
    }

    medianFilter(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const originalData = new Uint8ClampedArray(data);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                
                // 收集3x3邻域的alpha值
                const alphaValues = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIndex = ((y + dy) * width + (x + dx)) * 4;
                        alphaValues.push(originalData[nIndex + 3]);
                    }
                }
                
                // 计算中值
                alphaValues.sort((a, b) => a - b);
                data[index + 3] = alphaValues[4]; // 中间值
            }
        }
    }

    morphologicalOperations(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 开运算：先腐蚀后膨胀，去除小噪点
        const tempData = new Uint8ClampedArray(data);
        
        // 腐蚀
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                
                let minAlpha = 255;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIndex = ((y + dy) * width + (x + dx)) * 4;
                        minAlpha = Math.min(minAlpha, tempData[nIndex + 3]);
                    }
                }
                data[index + 3] = minAlpha;
            }
        }
        
        // 膨胀
        const erodedData = new Uint8ClampedArray(data);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                
                let maxAlpha = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIndex = ((y + dy) * width + (x + dx)) * 4;
                        maxAlpha = Math.max(maxAlpha, erodedData[nIndex + 3]);
                    }
                }
                data[index + 3] = maxAlpha;
            }
        }
    }

    edgeFeathering(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const originalData = new Uint8ClampedArray(data);
        
        // 高斯模糊边缘
        const radius = 2;
        const sigma = 1.0;
        
        for (let y = radius; y < height - radius; y++) {
            for (let x = radius; x < width - radius; x++) {
                const index = (y * width + x) * 4;
                
                // 检查是否在边缘附近
                if (this.isEdgePixel(x, y, originalData, width, height)) {
                    let weightSum = 0;
                    let alphaSum = 0;
                    
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
                            
                            const nIndex = ((y + dy) * width + (x + dx)) * 4;
                            alphaSum += originalData[nIndex + 3] * weight;
                            weightSum += weight;
                        }
                    }
                    
                    data[index + 3] = alphaSum / weightSum;
                }
            }
        }
    }

    isEdgePixel(x, y, data, width, height) {
        const centerIndex = (y * width + x) * 4;
        const centerAlpha = data[centerIndex + 3];
        
        // 检查4连通邻域
        const neighbors = [
            [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];
        
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIndex = (ny * width + nx) * 4;
                const nAlpha = data[nIndex + 3];
                
                // 如果透明度差异很大，说明是边缘
                if (Math.abs(centerAlpha - nAlpha) > 100) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // 获取处理器状态
    getStatus() {
        if (this.isLoaded) {
            return 'ready';
        } else if (this.isLoading) {
            return 'loading';
        } else {
            return 'not_loaded';
        }
    }

    // 预加载MediaPipe模型
    async preload() {
        if (!this.isLoaded && !this.isLoading) {
            try {
                await this.ensureLoaded();
                return true;
            } catch (error) {
                console.error('MediaPipe预加载失败:', error);
                return false;
            }
        }
        return true;
    }
}
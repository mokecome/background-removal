// TensorFlow.js精确处理模式 - 深度学习背景移除
class TensorFlowProcessor {
    constructor() {
        this.model = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.modelType = 'body-segmentation'; // 'body-segmentation' 或 'deeplab-v3'
    }

    async process(file) {
        try {
            // 确保TensorFlow.js已加载
            await this.ensureLoaded();
            
            const image = await this.loadImage(file);
            
            // 设置canvas尺寸
            this.canvas.width = image.width;
            this.canvas.height = image.height;
            
            // 执行推理
            const segmentation = await this.performInference(image);
            
            // 应用分割结果
            const processedDataURL = await this.applySegmentation(image, segmentation);
            
            return processedDataURL;
            
        } catch (error) {
            console.error('TensorFlow.js处理失败:', error);
            
            // 如果TensorFlow.js失败，回退到MediaPipe处理
            console.log('回退到MediaPipe处理模式');
            const mediapipeProcessor = new MediaPipeProcessor();
            return await mediapipeProcessor.process(file);
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
            // 加载TensorFlow.js核心库
            await this.loadTensorFlowScript();
            
            // 根据模型类型加载相应的模型
            if (this.modelType === 'body-segmentation') {
                await this.loadBodySegmentationModel();
            } else {
                await this.loadDeepLabModel();
            }
            
            this.isLoaded = true;
            
        } catch (error) {
            console.error('TensorFlow.js加载失败:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    async loadTensorFlowScript() {
        return new Promise((resolve, reject) => {
            // 检查是否已经存在脚本
            if (typeof tf !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest';
            script.onload = () => {
                // 加载body-segmentation模型
                const bodySegScript = document.createElement('script');
                bodySegScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation@latest';
                bodySegScript.onload = resolve;
                bodySegScript.onerror = () => reject(new Error('Body-segmentation脚本加载失败'));
                document.head.appendChild(bodySegScript);
            };
            script.onerror = () => reject(new Error('TensorFlow.js脚本加载失败'));
            document.head.appendChild(script);
        });
    }

    async loadBodySegmentationModel() {
        try {
            // 配置后端
            await tf.setBackend('webgl');
            await tf.ready();
            
            // 加载BodyPix模型或SelfieSegmentation模型
            this.model = await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, {
                runtime: 'tfjs'
            });
            
            console.log('TensorFlow.js Body Segmentation模型加载成功');
            
        } catch (error) {
            console.error('Body Segmentation模型加载失败，尝试加载BodyPix:', error);
            
            // 回退到BodyPix模型
            try {
                this.model = await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.BodyPix, {
                    architecture: 'MobileNetV1',
                    outputStride: 16,
                    multiplier: 0.75,
                    quantBytes: 2
                });
                
                console.log('TensorFlow.js BodyPix模型加载成功');
                
            } catch (bodyPixError) {
                console.error('BodyPix模型也加载失败:', bodyPixError);
                throw new Error('所有TensorFlow.js模型都加载失败');
            }
        }
    }

    async loadDeepLabModel() {
        try {
            // 加载DeepLab模型（如果可用）
            const modelUrl = 'https://tfhub.dev/tensorflow/tfjs-model/deeplab/pascal/1/default/1';
            this.model = await tf.loadLayersModel(modelUrl);
            
            console.log('TensorFlow.js DeepLab模型加载成功');
            
        } catch (error) {
            console.error('DeepLab模型加载失败，回退到Body Segmentation:', error);
            this.modelType = 'body-segmentation';
            await this.loadBodySegmentationModel();
        }
    }

    async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = URL.createObjectURL(file);
        });
    }

    async performInference(image) {
        if (this.modelType === 'body-segmentation') {
            return await this.performBodySegmentation(image);
        } else {
            return await this.performDeepLabSegmentation(image);
        }
    }

    async performBodySegmentation(image) {
        try {
            // 使用body-segmentation模型
            const segmentation = await this.model.segmentPeople(image, {
                multiSegmentation: false,
                segmentBodyParts: false,
                flipHorizontal: false
            });
            
            if (segmentation && segmentation.length > 0) {
                return segmentation[0];
            } else {
                throw new Error('未检测到人物');
            }
            
        } catch (error) {
            console.error('Body segmentation推理失败:', error);
            throw error;
        }
    }

    async performDeepLabSegmentation(image) {
        try {
            // 预处理图像
            const inputTensor = this.preprocessImage(image);
            
            // 执行推理
            const prediction = this.model.predict(inputTensor);
            
            // 后处理
            const segmentation = await this.postprocessDeepLab(prediction, image.width, image.height);
            
            // 清理张量
            inputTensor.dispose();
            prediction.dispose();
            
            return segmentation;
            
        } catch (error) {
            console.error('DeepLab推理失败:', error);
            throw error;
        }
    }

    preprocessImage(image) {
        // 将图像调整为模型输入尺寸
        const modelSize = 513;
        
        // 创建临时canvas调整尺寸
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = modelSize;
        tempCanvas.height = modelSize;
        
        tempCtx.drawImage(image, 0, 0, modelSize, modelSize);
        
        // 转换为张量
        const imageData = tempCtx.getImageData(0, 0, modelSize, modelSize);
        const tensor = tf.browser.fromPixels(imageData, 3)
            .toFloat()
            .div(tf.scalar(255))
            .expandDims(0);
        
        return tensor;
    }

    async postprocessDeepLab(prediction, originalWidth, originalHeight) {
        // 获取预测结果
        const segmentationMap = await prediction.squeeze().argMax(2).data();
        
        // 创建分割遮罩
        const maskCanvas = document.createElement('canvas');
        const maskCtx = maskCanvas.getContext('2d');
        maskCanvas.width = 513;
        maskCanvas.height = 513;
        
        const imageData = maskCtx.createImageData(513, 513);
        const data = imageData.data;
        
        for (let i = 0; i < segmentationMap.length; i++) {
            const pixelIndex = i * 4;
            const segmentValue = segmentationMap[i];
            
            // 假设类别15是人物（PASCAL VOC数据集中）
            if (segmentValue === 15) {
                data[pixelIndex] = 255;     // R
                data[pixelIndex + 1] = 255; // G
                data[pixelIndex + 2] = 255; // B
                data[pixelIndex + 3] = 255; // A
            } else {
                data[pixelIndex] = 0;
                data[pixelIndex + 1] = 0;
                data[pixelIndex + 2] = 0;
                data[pixelIndex + 3] = 255;
            }
        }
        
        maskCtx.putImageData(imageData, 0, 0);
        
        return {
            mask: maskCanvas,
            width: originalWidth,
            height: originalHeight
        };
    }

    async applySegmentation(image, segmentation) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制原始图像
        this.ctx.drawImage(image, 0, 0);
        
        // 获取图像数据
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.modelType === 'body-segmentation') {
            await this.applyBodySegmentationMask(imageData, segmentation);
        } else {
            await this.applyDeepLabMask(imageData, segmentation);
        }
        
        // 后处理优化
        this.postProcessSegmentation(imageData);
        
        this.ctx.putImageData(imageData, 0, 0);
        
        return this.canvas.toDataURL('image/png');
    }

    async applyBodySegmentationMask(imageData, segmentation) {
        const data = imageData.data;
        const mask = segmentation.mask;
        
        // 获取遮罩数据
        const maskData = await mask.data();
        
        for (let i = 0; i < data.length; i += 4) {
            const pixelIndex = i / 4;
            const maskValue = maskData[pixelIndex];
            
            // 根据遮罩值设置透明度
            if (maskValue < 0.5) {
                data[i + 3] = 0; // 背景设为透明
            } else {
                // 边缘柔化处理
                const alpha = this.calculateSmoothAlpha(maskValue, pixelIndex, maskData, imageData.width, imageData.height);
                data[i + 3] = Math.min(255, data[i + 3] * alpha);
            }
        }
    }

    async applyDeepLabMask(imageData, segmentation) {
        const data = imageData.data;
        
        // 创建临时canvas来处理遮罩
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        
        // 将遮罩调整到原始图像尺寸
        tempCtx.drawImage(segmentation.mask, 0, 0, imageData.width, imageData.height);
        const maskImageData = tempCtx.getImageData(0, 0, imageData.width, imageData.height);
        const maskData = maskImageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const maskValue = maskData[i]; // 使用R通道
            
            if (maskValue < 128) {
                data[i + 3] = 0; // 背景设为透明
            } else {
                // 边缘柔化
                const alpha = this.calculateEdgeSmoothness(i, maskData, imageData.width, imageData.height);
                data[i + 3] = Math.min(255, data[i + 3] * alpha);
            }
        }
    }

    calculateSmoothAlpha(maskValue, pixelIndex, maskData, width, height) {
        // 基于遮罩值和邻域信息计算平滑的透明度
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        
        // 检查邻域遮罩值
        let neighborSum = 0;
        let neighborCount = 0;
        
        const radius = 2;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIndex = ny * width + nx;
                    neighborSum += maskData[nIndex];
                    neighborCount++;
                }
            }
        }
        
        const avgNeighborValue = neighborSum / neighborCount;
        
        // 结合当前值和邻域平均值
        const smoothValue = (maskValue * 0.6) + (avgNeighborValue * 0.4);
        
        return Math.max(0, Math.min(1, smoothValue));
    }

    calculateEdgeSmoothness(pixelIndex, maskData, width, height) {
        const i = pixelIndex / 4;
        const x = i % width;
        const y = Math.floor(i / width);
        
        const centerMask = maskData[pixelIndex];
        
        // 计算梯度
        let gradientSum = 0;
        const neighbors = [
            [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
        ];
        
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIndex = (ny * width + nx) * 4;
                const nMask = maskData[nIndex];
                gradientSum += Math.abs(centerMask - nMask);
            }
        }
        
        const avgGradient = gradientSum / neighbors.length;
        
        // 基于梯度调整透明度
        if (avgGradient < 10) {
            return 1.0; // 平滑区域，完全不透明
        } else if (avgGradient < 50) {
            return 0.8; // 轻微边缘，稍微透明
        } else if (avgGradient < 100) {
            return 0.5; // 明显边缘，半透明
        } else {
            return 0.2; // 强烈边缘，很透明
        }
    }

    postProcessSegmentation(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 1. 双边滤波去噪
        this.bilateralFilter(imageData);
        
        // 2. 连通分量分析
        this.connectedComponentAnalysis(imageData);
        
        // 3. 边缘优化
        this.edgeOptimization(imageData);
    }

    bilateralFilter(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const originalData = new Uint8ClampedArray(data);
        
        const spatialSigma = 5.0;
        const rangeSigma = 50.0;
        const radius = 5;
        
        for (let y = radius; y < height - radius; y++) {
            for (let x = radius; x < width - radius; x++) {
                const centerIndex = (y * width + x) * 4;
                const centerAlpha = originalData[centerIndex + 3];
                
                let weightSum = 0;
                let alphaSum = 0;
                
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nIndex = ((y + dy) * width + (x + dx)) * 4;
                        const nAlpha = originalData[nIndex + 3];
                        
                        const spatialDistance = Math.sqrt(dx * dx + dy * dy);
                        const rangeDistance = Math.abs(centerAlpha - nAlpha);
                        
                        const spatialWeight = Math.exp(-(spatialDistance * spatialDistance) / (2 * spatialSigma * spatialSigma));
                        const rangeWeight = Math.exp(-(rangeDistance * rangeDistance) / (2 * rangeSigma * rangeSigma));
                        
                        const weight = spatialWeight * rangeWeight;
                        
                        weightSum += weight;
                        alphaSum += nAlpha * weight;
                    }
                }
                
                data[centerIndex + 3] = alphaSum / weightSum;
            }
        }
    }

    connectedComponentAnalysis(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        const visited = new Array(width * height).fill(false);
        const components = [];
        
        // 查找所有连通分量
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                if (!visited[index]) {
                    const pixelIndex = index * 4;
                    if (data[pixelIndex + 3] > 128) { // 前景像素
                        const component = this.floodFill(data, visited, x, y, width, height);
                        if (component.length > 0) {
                            components.push(component);
                        }
                    }
                }
            }
        }
        
        // 移除太小的连通分量（噪点）
        const minComponentSize = Math.max(50, (width * height) / 1000);
        
        for (const component of components) {
            if (component.length < minComponentSize) {
                for (const pixelIndex of component) {
                    data[pixelIndex * 4 + 3] = 0; // 设为透明
                }
            }
        }
    }

    floodFill(data, visited, startX, startY, width, height) {
        const component = [];
        const stack = [[startX, startY]];
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const index = y * width + x;
            
            if (x < 0 || x >= width || y < 0 || y >= height || visited[index]) {
                continue;
            }
            
            const pixelIndex = index * 4;
            if (data[pixelIndex + 3] <= 128) { // 背景像素
                continue;
            }
            
            visited[index] = true;
            component.push(index);
            
            // 添加4连通邻居
            stack.push([x - 1, y]);
            stack.push([x + 1, y]);
            stack.push([x, y - 1]);
            stack.push([x, y + 1]);
        }
        
        return component;
    }

    edgeOptimization(imageData) {
        // 使用自适应的边缘柔化
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const originalData = new Uint8ClampedArray(data);
        
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                const index = (y * width + x) * 4;
                
                if (this.isEdgePixel(x, y, originalData, width, height)) {
                    // 自适应高斯平滑
                    const edgeStrength = this.calculateEdgeStrength(x, y, originalData, width, height);
                    const sigma = Math.max(0.5, Math.min(2.0, edgeStrength / 50));
                    
                    let weightSum = 0;
                    let alphaSum = 0;
                    const radius = Math.ceil(sigma * 2);
                    
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
        
        const neighbors = [
            [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
            [x - 1, y],                  [x + 1, y],
            [x - 1, y + 1], [x, y + 1], [x + 1, y + 1]
        ];
        
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIndex = (ny * width + nx) * 4;
                const nAlpha = data[nIndex + 3];
                
                if (Math.abs(centerAlpha - nAlpha) > 50) {
                    return true;
                }
            }
        }
        
        return false;
    }

    calculateEdgeStrength(x, y, data, width, height) {
        const centerIndex = (y * width + x) * 4;
        const centerAlpha = data[centerIndex + 3];
        
        let maxDiff = 0;
        const neighbors = [
            [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
            [x - 1, y],                  [x + 1, y],
            [x - 1, y + 1], [x, y + 1], [x + 1, y + 1]
        ];
        
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIndex = (ny * width + nx) * 4;
                const nAlpha = data[nIndex + 3];
                maxDiff = Math.max(maxDiff, Math.abs(centerAlpha - nAlpha));
            }
        }
        
        return maxDiff;
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

    // 预加载TensorFlow.js模型
    async preload() {
        if (!this.isLoaded && !this.isLoading) {
            try {
                await this.ensureLoaded();
                return true;
            } catch (error) {
                console.error('TensorFlow.js预加载失败:', error);
                return false;
            }
        }
        return true;
    }

    // 切换模型类型
    async switchModel(modelType) {
        if (this.modelType !== modelType) {
            this.modelType = modelType;
            this.isLoaded = false;
            this.model = null;
            
            try {
                await this.ensureLoaded();
                return true;
            } catch (error) {
                console.error('模型切换失败:', error);
                return false;
            }
        }
        return true;
    }
}
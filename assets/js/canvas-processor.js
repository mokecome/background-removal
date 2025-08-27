// Canvas快速处理模式 - 基于颜色相似度的背景移除
class CanvasProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    async process(file) {
        try {
            const image = await this.loadImage(file);
            
            // 设置canvas尺寸
            this.canvas.width = image.width;
            this.canvas.height = image.height;
            
            // 绘制原始图像
            this.ctx.drawImage(image, 0, 0);
            
            // 获取图像数据
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            // 执行背景移除
            const processedData = this.removeBackground(imageData);
            
            // 应用处理后的数据
            this.ctx.putImageData(processedData, 0, 0);
            
            // 返回处理后的数据URL
            return this.canvas.toDataURL('image/png');
            
        } catch (error) {
            console.error('Canvas处理失败:', error);
            throw new Error('图片处理失败，请重试');
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

    removeBackground(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 分析背景颜色
        const backgroundColors = this.detectBackgroundColors(imageData);
        
        // 创建边缘图
        const edgeMap = this.createEdgeMap(imageData);
        
        // 执行背景移除
        for (let i = 0; i < data.length; i += 4) {
            const pixelIndex = i / 4;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 检查是否为背景像素
            if (this.isBackgroundPixel(r, g, b, backgroundColors, edgeMap, x, y, width, height)) {
                data[i + 3] = 0; // 设置为透明
            } else {
                // 如果是边缘附近，进行柔化处理
                const edgeDistance = this.getEdgeDistance(x, y, edgeMap, width, height);
                if (edgeDistance < 3) {
                    data[i + 3] = Math.max(0, data[i + 3] - (50 * (3 - edgeDistance) / 3));
                }
            }
        }
        
        // 后处理：去除噪点
        this.removeNoise(imageData);
        
        return imageData;
    }

    detectBackgroundColors(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const colorMap = new Map();
        
        // 采样边缘像素来检测背景颜色
        const samplePoints = [];
        
        // 顶部和底部边缘
        for (let x = 0; x < width; x += 5) {
            samplePoints.push([x, 0]);
            samplePoints.push([x, height - 1]);
        }
        
        // 左侧和右侧边缘
        for (let y = 0; y < height; y += 5) {
            samplePoints.push([0, y]);
            samplePoints.push([width - 1, y]);
        }
        
        // 统计颜色频率
        samplePoints.forEach(([x, y]) => {
            const index = (y * width + x) * 4;
            const r = Math.floor(data[index] / 16) * 16;
            const g = Math.floor(data[index + 1] / 16) * 16;
            const b = Math.floor(data[index + 2] / 16) * 16;
            
            const colorKey = `${r}-${g}-${b}`;
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        });
        
        // 获取最常见的颜色作为背景色
        const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        return sortedColors.map(([colorKey]) => {
            const [r, g, b] = colorKey.split('-').map(Number);
            return { r, g, b };
        });
    }

    createEdgeMap(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const edgeMap = new Uint8Array(width * height);
        
        // Sobel边缘检测
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const gx = this.getSobelX(data, x, y, width);
                const gy = this.getSobelY(data, x, y, width);
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                
                edgeMap[y * width + x] = magnitude > 30 ? 255 : 0;
            }
        }
        
        return edgeMap;
    }

    getSobelX(data, x, y, width) {
        const kernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const offsets = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],  [0, 0],  [1, 0],
            [-1, 1],  [0, 1],  [1, 1]
        ];
        
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            const px = x + offsets[i][0];
            const py = y + offsets[i][1];
            const index = (py * width + px) * 4;
            
            const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
            sum += gray * kernel[i];
        }
        
        return sum;
    }

    getSobelY(data, x, y, width) {
        const kernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        const offsets = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],  [0, 0],  [1, 0],
            [-1, 1],  [0, 1],  [1, 1]
        ];
        
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            const px = x + offsets[i][0];
            const py = y + offsets[i][1];
            const index = (py * width + px) * 4;
            
            const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
            sum += gray * kernel[i];
        }
        
        return sum;
    }

    isBackgroundPixel(r, g, b, backgroundColors, edgeMap, x, y, width, height) {
        // 检查是否接近背景颜色
        for (const bgColor of backgroundColors) {
            const colorDistance = Math.sqrt(
                Math.pow(r - bgColor.r, 2) +
                Math.pow(g - bgColor.g, 2) +
                Math.pow(b - bgColor.b, 2)
            );
            
            // 如果在边缘附近，提高阈值
            const isNearEdge = this.isNearEdge(x, y, edgeMap, width, height);
            const threshold = isNearEdge ? 40 : 60;
            
            if (colorDistance < threshold) {
                return true;
            }
        }
        
        return false;
    }

    isNearEdge(x, y, edgeMap, width, height, radius = 2) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    if (edgeMap[ny * width + nx] > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    getEdgeDistance(x, y, edgeMap, width, height) {
        let minDistance = Infinity;
        
        for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    if (edgeMap[ny * width + nx] > 0) {
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        minDistance = Math.min(minDistance, distance);
                    }
                }
            }
        }
        
        return minDistance === Infinity ? 10 : minDistance;
    }

    removeNoise(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 使用形态学操作去除噪点
        const originalData = new Uint8ClampedArray(data);
        
        // 腐蚀操作 - 去除小的前景噪点
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                
                if (originalData[index + 3] > 128) { // 如果是前景像素
                    let foregroundCount = 0;
                    
                    // 检查3x3邻域
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nIndex = ((y + dy) * width + (x + dx)) * 4;
                            if (originalData[nIndex + 3] > 128) {
                                foregroundCount++;
                            }
                        }
                    }
                    
                    // 如果周围前景像素太少，设置为透明
                    if (foregroundCount < 5) {
                        data[index + 3] = 0;
                    }
                }
            }
        }
        
        // 膨胀操作 - 恢复被过度腐蚀的边缘
        const erodedData = new Uint8ClampedArray(data);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                
                if (erodedData[index + 3] === 0) { // 如果是透明像素
                    let foregroundCount = 0;
                    
                    // 检查3x3邻域
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nIndex = ((y + dy) * width + (x + dx)) * 4;
                            if (erodedData[nIndex + 3] > 128) {
                                foregroundCount++;
                            }
                        }
                    }
                    
                    // 如果周围有足够的前景像素，恢复这个像素
                    if (foregroundCount >= 6) {
                        data[index] = originalData[index];
                        data[index + 1] = originalData[index + 1];
                        data[index + 2] = originalData[index + 2];
                        data[index + 3] = originalData[index + 3];
                    }
                }
            }
        }
    }

    // 高级背景移除（适用于更复杂的场景）
    advancedRemoveBackground(imageData) {
        // 实现更复杂的算法，如GrabCut简化版
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // 1. 初始前景/背景分割
        const trimap = this.createTrimap(imageData);
        
        // 2. 颜色模型构建
        const fgModel = this.buildColorModel(imageData, trimap, 'foreground');
        const bgModel = this.buildColorModel(imageData, trimap, 'background');
        
        // 3. 图割算法简化版
        const segmentation = this.graphCutSegmentation(imageData, fgModel, bgModel);
        
        // 4. 应用分割结果
        for (let i = 0; i < data.length; i += 4) {
            const pixelIndex = i / 4;
            if (segmentation[pixelIndex] === 0) { // 背景
                data[i + 3] = 0;
            }
        }
        
        return imageData;
    }

    createTrimap(imageData) {
        // 创建三值图：0-背景, 128-未知, 255-前景
        const width = imageData.width;
        const height = imageData.height;
        const trimap = new Uint8Array(width * height);
        
        // 简化版：边缘区域标记为背景，中心区域标记为前景
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 3;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                const index = y * width + x;
                
                if (x < 20 || x >= width - 20 || y < 20 || y >= height - 20) {
                    trimap[index] = 0; // 边缘为背景
                } else if (distance < maxRadius / 2) {
                    trimap[index] = 255; // 中心为前景
                } else {
                    trimap[index] = 128; // 未知区域
                }
            }
        }
        
        return trimap;
    }

    buildColorModel(imageData, trimap, type) {
        const data = imageData.data;
        const colors = [];
        const targetValue = type === 'foreground' ? 255 : 0;
        
        for (let i = 0; i < trimap.length; i++) {
            if (trimap[i] === targetValue) {
                const pixelIndex = i * 4;
                colors.push([
                    data[pixelIndex],     // R
                    data[pixelIndex + 1], // G
                    data[pixelIndex + 2]  // B
                ]);
            }
        }
        
        // 简化的颜色模型：计算均值和标准差
        if (colors.length === 0) return null;
        
        const mean = [0, 0, 0];
        for (const color of colors) {
            mean[0] += color[0];
            mean[1] += color[1];
            mean[2] += color[2];
        }
        mean[0] /= colors.length;
        mean[1] /= colors.length;
        mean[2] /= colors.length;
        
        const variance = [0, 0, 0];
        for (const color of colors) {
            variance[0] += Math.pow(color[0] - mean[0], 2);
            variance[1] += Math.pow(color[1] - mean[1], 2);
            variance[2] += Math.pow(color[2] - mean[2], 2);
        }
        variance[0] /= colors.length;
        variance[1] /= colors.length;
        variance[2] /= colors.length;
        
        return { mean, variance };
    }

    graphCutSegmentation(imageData, fgModel, bgModel) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const segmentation = new Uint8Array(width * height);
        
        // 简化的图割：基于颜色概率的像素分类
        for (let i = 0; i < data.length; i += 4) {
            const pixelIndex = i / 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const fgProb = this.calculateColorProbability([r, g, b], fgModel);
            const bgProb = this.calculateColorProbability([r, g, b], bgModel);
            
            segmentation[pixelIndex] = fgProb > bgProb ? 255 : 0;
        }
        
        return segmentation;
    }

    calculateColorProbability(color, model) {
        if (!model) return 0.5;
        
        const [r, g, b] = color;
        const { mean, variance } = model;
        
        // 简化的高斯概率计算
        const prob = Math.exp(
            -(Math.pow(r - mean[0], 2) / (2 * variance[0] + 1) +
              Math.pow(g - mean[1], 2) / (2 * variance[1] + 1) +
              Math.pow(b - mean[2], 2) / (2 * variance[2] + 1))
        );
        
        return prob;
    }
}
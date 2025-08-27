// 图片分析引擎
class ImageAnalyzer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    async analyze(file) {
        const image = await this.loadImage(file);
        
        // 调整图片到合适尺寸进行分析
        const maxSize = 300;
        const scale = Math.min(maxSize / image.width, maxSize / image.height);
        
        this.canvas.width = image.width * scale;
        this.canvas.height = image.height * scale;
        
        this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
        
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        const analysis = {
            hasHuman: await this.detectHuman(imageData),
            complexity: this.calculateComplexity(imageData),
            colorVariance: this.calculateColorVariance(imageData),
            edgeDensity: this.calculateEdgeDensity(imageData),
            size: {
                width: image.width,
                height: image.height,
                fileSize: file.size
            }
        };
        
        return analysis;
    }

    async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    async detectHuman(imageData) {
        // 简单的肤色检测算法
        const pixels = imageData.data;
        let skinPixels = 0;
        let totalPixels = pixels.length / 4;
        
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            if (this.isSkinColor(r, g, b)) {
                skinPixels++;
            }
        }
        
        const skinRatio = skinPixels / totalPixels;
        
        // 如果肤色像素占比超过5%，认为可能包含人物
        return skinRatio > 0.05;
    }

    isSkinColor(r, g, b) {
        // 基于RGB的简单肤色检测
        // 这里使用一个简化的肤色检测算法
        return (
            r > 95 && g > 40 && b > 20 &&
            r > g && r > b &&
            Math.abs(r - g) > 15 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15
        ) || (
            r > 220 && g > 210 && b > 170 &&
            Math.abs(r - g) <= 15 &&
            r > b && g > b
        );
    }

    calculateComplexity(imageData) {
        // 计算图片复杂度（基于颜色变化和边缘密度）
        const colorVariance = this.calculateColorVariance(imageData);
        const edgeDensity = this.calculateEdgeDensity(imageData);
        const textureComplexity = this.calculateTextureComplexity(imageData);
        
        // 归一化复杂度分数 (0-1)
        const complexity = (colorVariance * 0.4 + edgeDensity * 0.4 + textureComplexity * 0.2);
        return Math.min(1, Math.max(0, complexity));
    }

    calculateColorVariance(imageData) {
        const pixels = imageData.data;
        const colorMap = new Map();
        
        // 将颜色量化到较小的色彩空间
        for (let i = 0; i < pixels.length; i += 4) {
            const r = Math.floor(pixels[i] / 32) * 32;
            const g = Math.floor(pixels[i + 1] / 32) * 32;
            const b = Math.floor(pixels[i + 2] / 32) * 32;
            
            const colorKey = `${r}-${g}-${b}`;
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        }
        
        // 颜色种类越多，复杂度越高
        const uniqueColors = colorMap.size;
        const maxPossibleColors = 8 * 8 * 8; // 32级量化的最大颜色数
        
        return uniqueColors / maxPossibleColors;
    }

    calculateEdgeDensity(imageData) {
        const pixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        let edgeCount = 0;
        const threshold = 30;
        
        // Sobel边缘检测
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // 转换为灰度
                const center = this.rgbToGray(
                    pixels[idx], pixels[idx + 1], pixels[idx + 2]
                );
                
                // 计算Sobel算子
                const gx = this.getSobelX(pixels, x, y, width);
                const gy = this.getSobelY(pixels, x, y, width);
                const gradient = Math.sqrt(gx * gx + gy * gy);
                
                if (gradient > threshold) {
                    edgeCount++;
                }
            }
        }
        
        const totalPixels = (width - 2) * (height - 2);
        return edgeCount / totalPixels;
    }

    calculateTextureComplexity(imageData) {
        // 计算局部二值模式(LBP)的变化
        const pixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        let textureVariance = 0;
        let sampleCount = 0;
        
        // 每隔8像素采样一次
        for (let y = 8; y < height - 8; y += 8) {
            for (let x = 8; x < width - 8; x += 8) {
                const lbp = this.calculateLBP(pixels, x, y, width);
                textureVariance += this.getLBPVariance(lbp);
                sampleCount++;
            }
        }
        
        return sampleCount > 0 ? textureVariance / sampleCount / 255 : 0;
    }

    rgbToGray(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    getSobelX(pixels, x, y, width) {
        const positions = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0], [0,  0], [1,  0],
            [-1,  1], [0,  1], [1,  1]
        ];
        
        const kernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        let sum = 0;
        
        for (let i = 0; i < 9; i++) {
            const px = x + positions[i][0];
            const py = y + positions[i][1];
            const idx = (py * width + px) * 4;
            
            const gray = this.rgbToGray(
                pixels[idx], pixels[idx + 1], pixels[idx + 2]
            );
            
            sum += gray * kernel[i];
        }
        
        return sum;
    }

    getSobelY(pixels, x, y, width) {
        const positions = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0], [0,  0], [1,  0],
            [-1,  1], [0,  1], [1,  1]
        ];
        
        const kernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        let sum = 0;
        
        for (let i = 0; i < 9; i++) {
            const px = x + positions[i][0];
            const py = y + positions[i][1];
            const idx = (py * width + px) * 4;
            
            const gray = this.rgbToGray(
                pixels[idx], pixels[idx + 1], pixels[idx + 2]
            );
            
            sum += gray * kernel[i];
        }
        
        return sum;
    }

    calculateLBP(pixels, centerX, centerY, width) {
        const centerIdx = (centerY * width + centerX) * 4;
        const centerGray = this.rgbToGray(
            pixels[centerIdx], pixels[centerIdx + 1], pixels[centerIdx + 2]
        );
        
        const positions = [
            [-1, -1], [0, -1], [1, -1],
            [1,   0],          [-1,  0],
            [1,   1], [0,  1], [-1,  1]
        ];
        
        let lbpValue = 0;
        
        for (let i = 0; i < 8; i++) {
            const px = centerX + positions[i][0];
            const py = centerY + positions[i][1];
            const idx = (py * width + px) * 4;
            
            const gray = this.rgbToGray(
                pixels[idx], pixels[idx + 1], pixels[idx + 2]
            );
            
            if (gray >= centerGray) {
                lbpValue |= (1 << i);
            }
        }
        
        return lbpValue;
    }

    getLBPVariance(lbpValue) {
        // 计算LBP值的位变化次数
        let transitions = 0;
        const binary = lbpValue.toString(2).padStart(8, '0');
        
        for (let i = 0; i < 8; i++) {
            const current = binary[i];
            const next = binary[(i + 1) % 8];
            if (current !== next) {
                transitions++;
            }
        }
        
        return transitions;
    }

    // 获取图像的主要统计信息
    getImageStatistics(imageData) {
        const pixels = imageData.data;
        const stats = {
            brightness: 0,
            contrast: 0,
            saturation: 0
        };
        
        let totalBrightness = 0;
        let brightnessList = [];
        
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            const brightness = (r + g + b) / 3;
            totalBrightness += brightness;
            brightnessList.push(brightness);
        }
        
        const pixelCount = pixels.length / 4;
        stats.brightness = totalBrightness / pixelCount / 255;
        
        // 计算对比度（标准差）
        const avgBrightness = totalBrightness / pixelCount;
        let variance = 0;
        
        for (const brightness of brightnessList) {
            variance += Math.pow(brightness - avgBrightness, 2);
        }
        
        stats.contrast = Math.sqrt(variance / pixelCount) / 255;
        
        return stats;
    }
}
// Performance Test Script for Çorlu Karavan App
// Bu script'i browser console'da çalıştırarak performansı test edebilirsiniz

console.log('🚀 Çorlu Karavan - Performans Testi Başlatılıyor...');

// 1. Bundle boyutlarını kontrol et
const checkBundleSize = () => {
    const scripts = document.querySelectorAll('script[src]');
    const styles = document.querySelectorAll('link[rel="stylesheet"]');
    
    console.log('\n📦 Bundle Analizi:');
    scripts.forEach((script, index) => {
        console.log(`JS ${index + 1}: ${script.src}`);
    });
    
    styles.forEach((style, index) => {
        console.log(`CSS ${index + 1}: ${style.href}`);
    });
};

// 2. Sayfa yükleme performansını ölç
const measurePagePerformance = () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    
    console.log('\n⚡ Sayfa Yükleme Performansı:');
    console.log(`DOM İçerik Yüklendi: ${perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart}ms`);
    console.log(`Sayfa Tam Yüklendi: ${perfData.loadEventEnd - perfData.loadEventStart}ms`);
    console.log(`İlk Byte Süresi (TTFB): ${perfData.responseStart - perfData.requestStart}ms`);
    console.log(`DNS Çözümleme: ${perfData.domainLookupEnd - perfData.domainLookupStart}ms`);
    console.log(`Bağlantı Kurma: ${perfData.connectEnd - perfData.connectStart}ms`);
};

// 3. Bellek kullanımını kontrol et
const checkMemoryUsage = () => {
    if (performance.memory) {
        console.log('\n💾 Bellek Kullanımı:');
        console.log(`Kullanılan Heap: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Toplam Heap: ${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Heap Limiti: ${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    }
};

// 4. Kaynak yükleme sürelerini analiz et
const analyzeResourceTiming = () => {
    const resources = performance.getEntriesByType('resource');
    
    console.log('\n📊 Kaynak Yükleme Analizi:');
    
    const resourceStats = {
        scripts: [],
        styles: [],
        images: [],
        other: []
    };
    
    resources.forEach(resource => {
        const duration = resource.responseEnd - resource.requestStart;
        const size = resource.transferSize;
        
        const resourceInfo = {
            name: resource.name.split('/').pop(),
            duration: Math.round(duration),
            size: size ? `${(size / 1024).toFixed(2)} KB` : 'N/A'
        };
        
        if (resource.name.includes('.js')) {
            resourceStats.scripts.push(resourceInfo);
        } else if (resource.name.includes('.css')) {
            resourceStats.styles.push(resourceInfo);
        } else if (resource.name.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
            resourceStats.images.push(resourceInfo);
        } else {
            resourceStats.other.push(resourceInfo);
        }
    });
    
    console.log('JavaScript Dosyaları:', resourceStats.scripts);
    console.log('CSS Dosyaları:', resourceStats.styles);
    console.log('Görsel Dosyalar:', resourceStats.images);
};

// 5. React DevTools varsa component render sayısını kontrol et
const checkReactPerformance = () => {
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('\n⚛️ React DevTools algılandı - Component analizi için DevTools kullanın');
    } else {
        console.log('\n⚛️ React DevTools bulunamadı');
    }
};

// 6. Lighthouse benzeri basit skorlama
const calculatePerformanceScore = () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    const fcp = perfData.domContentLoadedEventEnd - perfData.fetchStart;
    const lcp = perfData.loadEventEnd - perfData.fetchStart;
    
    let score = 100;
    
    // FCP skorlaması
    if (fcp > 3000) score -= 30;
    else if (fcp > 1800) score -= 15;
    
    // LCP skorlaması  
    if (lcp > 4000) score -= 40;
    else if (lcp > 2500) score -= 20;
    
    console.log('\n🎯 Performans Skoru:');
    console.log(`Genel Skor: ${Math.max(0, score)}/100`);
    console.log(`İlk İçerik Boyama (FCP): ${fcp}ms`);
    console.log(`En Büyük İçerik Boyama (LCP): ${lcp}ms`);
    
    if (score >= 90) console.log('✅ Mükemmel performans!');
    else if (score >= 70) console.log('⚡ İyi performans');
    else if (score >= 50) console.log('⚠️ Orta performans - İyileştirme yapılabilir');
    else console.log('❌ Zayıf performans - Optimizasyon gerekli');
};

// Tüm testleri çalıştır
const runAllTests = () => {
    setTimeout(() => {
        checkBundleSize();
        measurePagePerformance();
        checkMemoryUsage();
        analyzeResourceTiming();
        checkReactPerformance();
        calculatePerformanceScore();
        
        console.log('\n🎉 Performans testi tamamlandı!');
        console.log('\n💡 İpucu: Bu sonuçları farklı cihaz ve ağ koşullarında test edin.');
    }, 1000);
};

// Test'i çalıştır
runAllTests();
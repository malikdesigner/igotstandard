
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class DataCachingSystem {
    constructor() {
        this.cacheDir = path.join(__dirname, 'cache');
        this.progressFile = path.join(this.cacheDir, 'progress.json');
        this.resultsFile = path.join(this.cacheDir, 'results.json');
        this.errorLogFile = path.join(this.cacheDir, 'errors.json');
        this.batchSize = 10; // Process 10 combinations at a time
        this.delayBetweenRequests = 3000; // 3 seconds between requests
        this.retryAttempts = 3;
        
        // Define all possible parameter combinations
        this.parameterRanges = {
            minAge: [18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50],
            maxAge: [22, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60, 65],
            excludeMarried: [true, false],
            race: [0, 1, 2, 3], // any, white, black, asian
            minHeight: [0, 150, 155, 160, 165, 170, 175, 180, 185, 190], // in CM
            excludeObese: [true, false],
            minIncome: [0, 30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000]
        };
        
        this.raceMapping = {
            0: 'any',
            1: 'white', 
            2: 'black',
            3: 'asian'
        };
    }

    async initialize() {
        try {
            // Create cache directory if it doesn't exist
            await fs.mkdir(this.cacheDir, { recursive: true });
            
            // Initialize progress file if it doesn't exist
            try {
                await fs.access(this.progressFile);
            } catch {
                await this.saveProgress({
                    totalCombinations: 0,
                    processed: 0,
                    currentIndex: 0,
                    startTime: null,
                    lastProcessedAt: null,
                    errors: 0,
                    successes: 0
                });
            }
            
            // Initialize results file if it doesn't exist
            try {
                await fs.access(this.resultsFile);
            } catch {
                await fs.writeFile(this.resultsFile, '{}');
            }
            
            // Initialize error log if it doesn't exist
            try {
                await fs.access(this.errorLogFile);
            } catch {
                await fs.writeFile(this.errorLogFile, '[]');
            }
            
            console.log('✅ Cache system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize cache system:', error);
            throw error;
        }
    }

    generateAllCombinations() {
        const combinations = [];
        const { minAge, maxAge, excludeMarried, race, minHeight, excludeObese, minIncome } = this.parameterRanges;
        
        for (const minAgeVal of minAge) {
            for (const maxAgeVal of maxAge) {
                // Skip invalid age combinations
                if (minAgeVal >= maxAgeVal) continue;
                
                for (const excludeMarriedVal of excludeMarried) {
                    for (const raceVal of race) {
                        for (const minHeightVal of minHeight) {
                            for (const excludeObeseVal of excludeObese) {
                                for (const minIncomeVal of minIncome) {
                                    const combination = {
                                        minAge: minAgeVal,
                                        maxAge: maxAgeVal,
                                        excludeMarried: excludeMarriedVal,
                                        race: raceVal,
                                        minHeight: minHeightVal,
                                        excludeObese: excludeObeseVal,
                                        minIncome: minIncomeVal
                                    };
                                    
                                    combinations.push({
                                        id: this.generateCombinationId(combination),
                                        params: combination
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`📊 Generated ${combinations.length} total combinations`);
        return combinations;
    }

    generateCombinationId(params) {
        // Create a unique ID for each combination
        return `${params.minAge}-${params.maxAge}-${params.excludeMarried}-${params.race}-${params.minHeight}-${params.excludeObese}-${params.minIncome}`;
    }

    async saveProgress(progress) {
        await fs.writeFile(this.progressFile, JSON.stringify(progress, null, 2));
    }

    async loadProgress() {
        try {
            const data = await fs.readFile(this.progressFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async saveResults(results) {
        await fs.writeFile(this.resultsFile, JSON.stringify(results, null, 2));
    }

    async loadResults() {
        try {
            const data = await fs.readFile(this.resultsFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async logError(combination, error) {
        try {
            const errors = await this.loadErrors();
            errors.push({
                timestamp: new Date().toISOString(),
                combination,
                error: error.message,
                stack: error.stack
            });
            await fs.writeFile(this.errorLogFile, JSON.stringify(errors, null, 2));
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
    }

    async loadErrors() {
        try {
            const data = await fs.readFile(this.errorLogFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async scrapeWithRetry(browser, combination, attempt = 1) {
        try {
            console.log(`🔄 Processing: ${combination.id} (Attempt ${attempt})`);
            
            const page = await browser.newPage();
            
            // Build URL with parameters
            const params = new URLSearchParams();
            params.append('minAge', combination.params.minAge);
            params.append('maxAge', combination.params.maxAge);
            params.append('excludeMarried', combination.params.excludeMarried);
            params.append('race', combination.params.race);
            params.append('minHeight', combination.params.minHeight.toFixed(2));
            params.append('excludeObese', combination.params.excludeObese);
            params.append('minIncome', combination.params.minIncome);
            
            const url = `https://igotstandardsbro.com/results?${params.toString()}`;
            
            // Navigate to page
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 45000 
            });
            
            // Wait for page to load
            await page.waitForTimeout(8000);
            
            // Extract data
            const results = await page.evaluate(() => {
                const data = {};
                
                const resultNumbers = document.querySelectorAll('.result-number');
                
                if (resultNumbers.length >= 3) {
                    data.probability = resultNumbers[0].textContent.trim();
                    data.delusionScoreNumber = resultNumbers[1].textContent.trim();
                    data.delusionScore = resultNumbers[2].textContent.trim();
                } else {
                    // Fallback methods
                    for (let i = 0; i < resultNumbers.length; i++) {
                        const text = resultNumbers[i].textContent.trim();
                        if (text.includes('%') && !data.probability) {
                            data.probability = text;
                        }
                        if (text.match(/^\d+\/\d+$/) && !data.delusionScoreNumber) {
                            data.delusionScoreNumber = text;
                        }
                        const delusionTexts = ['Aspiring cat lady', 'Very Delusional', 'Delusional', 'Picky', 'Reasonable', 'Down to earth'];
                        if (delusionTexts.includes(text) && !data.delusionScore) {
                            data.delusionScore = text;
                        }
                    }
                }
                
                // Get additional data
                const populationElement = document.querySelector('.population-visualizer');
                if (populationElement) {
                    data.populationData = populationElement.innerHTML;
                }
                
                const paragraphElement = document.querySelector('.paragraph');
                if (paragraphElement) {
                    data.paragraphText = paragraphElement.innerHTML;
                }
                
                const scoreFlexElement = document.querySelector('.score-flex');
                if (scoreFlexElement) {
                    data.scoreFlexHTML = scoreFlexElement.innerHTML;
                }
                
                // Get box paragraph list
                const boxParagraphSelectors = [
                    '.box.paragraph ul li',
                    '.box ul li', 
                    '.paragraph ul li',
                    'ul li'
                ];
                
                for (const selector of boxParagraphSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        data.boxParagraphList = Array.from(elements).map(el => el.outerHTML);
                        break;
                    }
                }
                
                return data;
            });
            
            await page.close();
            
            // Validate results
            if (!results.probability && !results.delusionScore && !results.delusionScoreNumber) {
                throw new Error('No valid results found on page');
            }
            
            console.log(`✅ Success: ${combination.id}`);
            return {
                ...results,
                timestamp: new Date().toISOString(),
                parameters: combination.params
            };
            
        } catch (error) {
            console.log(`❌ Error processing ${combination.id} (Attempt ${attempt}): ${error.message}`);
            
            if (attempt < this.retryAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
                return this.scrapeWithRetry(browser, combination, attempt + 1);
            } else {
                await this.logError(combination, error);
                throw error;
            }
        }
    }

    async startCaching() {
        await this.initialize();
        
        const combinations = this.generateAllCombinations();
        const progress = await this.loadProgress();
        const existingResults = await this.loadResults();
        
        // Update total combinations
        progress.totalCombinations = combinations.length;
        
        // Resume from where we left off
        let startIndex = progress.currentIndex || 0;
        let processedCount = progress.processed || 0;
        let successCount = progress.successes || 0;
        let errorCount = progress.errors || 0;
        
        if (startIndex === 0) {
            progress.startTime = new Date().toISOString();
        }
        
        console.log(`🚀 Starting/Resuming caching process...`);
        console.log(`📊 Progress: ${processedCount}/${combinations.length} (${((processedCount/combinations.length)*100).toFixed(2)}%)`);
        console.log(`✅ Successes: ${successCount}, ❌ Errors: ${errorCount}`);
        console.log(`🔄 Starting from index: ${startIndex}`);
        
        let browser;
        
        try {
            browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ],
                timeout: 60000
            });
            
            // Process combinations in batches
            for (let i = startIndex; i < combinations.length; i += this.batchSize) {
                const batch = combinations.slice(i, Math.min(i + this.batchSize, combinations.length));
                
                console.log(`\n📦 Processing batch ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(combinations.length/this.batchSize)}`);
                console.log(`📝 Combinations ${i + 1} to ${Math.min(i + this.batchSize, combinations.length)}`);
                
                for (const combination of batch) {
                    // Skip if already processed
                    if (existingResults[combination.id]) {
                        console.log(`⏭️  Skipping already processed: ${combination.id}`);
                        processedCount++;
                        successCount++;
                        continue;
                    }
                    
                    try {
                        const result = await this.scrapeWithRetry(browser, combination);
                        existingResults[combination.id] = result;
                        successCount++;
                        
                        // Save results after each successful scrape
                        await this.saveResults(existingResults);
                        
                    } catch (error) {
                        errorCount++;
                        console.log(`❌ Failed to process ${combination.id} after ${this.retryAttempts} attempts`);
                    }
                    
                    processedCount++;
                    
                    // Update progress
                    const currentProgress = {
                        totalCombinations: combinations.length,
                        processed: processedCount,
                        currentIndex: i + batch.indexOf(combination) + 1,
                        startTime: progress.startTime,
                        lastProcessedAt: new Date().toISOString(),
                        errors: errorCount,
                        successes: successCount,
                        completionPercentage: ((processedCount/combinations.length)*100).toFixed(2)
                    };
                    
                    await this.saveProgress(currentProgress);
                    
                    // Add delay between requests
                    if (combination !== batch[batch.length - 1]) {
                        await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
                    }
                }
                
                // Longer delay between batches
                if (i + this.batchSize < combinations.length) {
                    console.log(`⏸️  Batch complete. Waiting 10 seconds before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
            
            console.log(`\n🎉 Caching process completed!`);
            console.log(`✅ Total successes: ${successCount}`);
            console.log(`❌ Total errors: ${errorCount}`);
            console.log(`📊 Success rate: ${((successCount/(successCount+errorCount))*100).toFixed(2)}%`);
            
        } catch (error) {
            console.error('❌ Fatal error in caching process:', error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    // Method to get cached results
    async getCachedResult(params) {
        const results = await this.loadResults();
        const id = this.generateCombinationId(params);
        return results[id] || null;
    }

    // Method to get caching statistics
    async getStats() {
        const progress = await this.loadProgress();
        const results = await this.loadResults();
        const errors = await this.loadErrors();
        
        return {
            progress,
            totalCachedResults: Object.keys(results).length,
            totalErrors: errors.length,
            cacheHitRate: progress.successes / (progress.successes + progress.errors) * 100
        };
    }

    // Method to export cache to different formats
    async exportCache(format = 'json') {
        const results = await this.loadResults();
        const exportDir = path.join(this.cacheDir, 'exports');
        await fs.mkdir(exportDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        switch (format.toLowerCase()) {
            case 'json':
                const jsonFile = path.join(exportDir, `cache_export_${timestamp}.json`);
                await fs.writeFile(jsonFile, JSON.stringify(results, null, 2));
                console.log(`📁 Exported to: ${jsonFile}`);
                break;
                
            case 'csv':
                const csvFile = path.join(exportDir, `cache_export_${timestamp}.csv`);
                const csvData = this.convertToCSV(results);
                await fs.writeFile(csvFile, csvData);
                console.log(`📁 Exported to: ${csvFile}`);
                break;
                
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    convertToCSV(results) {
        const headers = ['id', 'minAge', 'maxAge', 'excludeMarried', 'race', 'minHeight', 'excludeObese', 'minIncome', 'probability', 'delusionScore', 'delusionScoreNumber', 'timestamp'];
        const rows = [headers.join(',')];
        
        for (const [id, result] of Object.entries(results)) {
            const row = [
                id,
                result.parameters.minAge,
                result.parameters.maxAge,
                result.parameters.excludeMarried,
                result.parameters.race,
                result.parameters.minHeight,
                result.parameters.excludeObese,
                result.parameters.minIncome,
                `"${result.probability || ''}"`,
                `"${result.delusionScore || ''}"`,
                `"${result.delusionScoreNumber || ''}"`,
                result.timestamp
            ];
            rows.push(row.join(','));
        }
        
        return rows.join('\n');
    }
}

// Usage example and CLI interface
if (require.main === module) {
    const cacheSystem = new DataCachingSystem();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'start':
            console.log('🚀 Starting cache generation...');
            cacheSystem.startCaching().catch(console.error);
            break;
            
        case 'stats':
            cacheSystem.getStats().then(stats => {
                console.log('📊 Cache Statistics:');
                console.log(JSON.stringify(stats, null, 2));
            }).catch(console.error);
            break;
            
        case 'export':
            const format = process.argv[3] || 'json';
            cacheSystem.exportCache(format).catch(console.error);
            break;
            
        case 'test':
            // Test with sample parameters
            const testParams = {
                minAge: 25,
                maxAge: 35,
                excludeMarried: true,
                race: 0,
                minHeight: 170,
                excludeObese: true,
                minIncome: 100000
            };
            
            cacheSystem.getCachedResult(testParams).then(result => {
                if (result) {
                    console.log('✅ Found cached result:');
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log('❌ No cached result found for these parameters');
                }
            }).catch(console.error);
            break;
            
        default:
            console.log(`
Usage: node cache-system.js <command>

Commands:
  start    - Start/resume the caching process
  stats    - Show caching statistics
  export   - Export cache (json|csv)
  test     - Test cache lookup with sample parameters

Examples:
  node cache-system.js start
  node cache-system.js stats
  node cache-system.js export json
  node cache-system.js export csv
            `);
    }
}

module.exports = DataCachingSystem;


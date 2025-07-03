
const { chromium } = require('playwright');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Cache Manager Class
class CacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, 'cache');
        this.cacheFile = path.join(this.cacheDir, 'scraped_data.json');
        this.cache = new Map();
        this.initializeCache();
    }

    initializeCache() {
        try {
            // Create cache directory if it doesn't exist
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
                console.log('Created cache directory');
            }

            // Load existing cache data
            if (fs.existsSync(this.cacheFile)) {
                const cacheData = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                this.cache = new Map(Object.entries(cacheData));
                console.log(`Loaded ${this.cache.size} cached entries`);
            } else {
                console.log('No existing cache file found, starting fresh');
            }
        } catch (error) {
            console.error('Error initializing cache:', error.message);
            this.cache = new Map();
        }
    }

    // Generate unique key for criteria
    generateKey(criteria) {
        // Normalize criteria to ensure consistent keys - FIXED LOGIC
        const normalized = this.getNormalizedCriteria(criteria);

        // Sort keys to ensure consistent hash generation
        const sortedNormalized = {};
        Object.keys(normalized).sort().forEach(key => {
            sortedNormalized[key] = normalized[key];
        });

        // Create hash of normalized criteria
        const hash = crypto.createHash('md5')
            .update(JSON.stringify(sortedNormalized))
            .digest('hex');
        
        console.log('Generated cache key:', hash, 'for criteria:', sortedNormalized);
        return hash;
    }

    normalizeRace(race) {
        const raceMapping = {
            'any': 0, '0': 0,
            'white': 1, '1': 1,
            'black': 2, '2': 2,
            'asian': 3, '3': 3
        };
        const result = raceMapping[race?.toString()] !== undefined ? raceMapping[race.toString()] : 0;
        console.log('Normalized race:', race, '->', result);
        return result;
    }

    normalizeHeight(height) {
        if (!height || height === 'any' || height === 0) return 0;
        const result = parseFloat(height) || 0;
        console.log('Normalized height:', height, '->', result);
        return result;
    }

    // Get cached data
    get(criteria) {
        const key = this.generateKey(criteria);
        const cached = this.cache.get(key);
        
        console.log(`Cache lookup for key: ${key}`);
        console.log(`Cache keys available:`, Array.from(this.cache.keys()));
        
        if (cached) {
            console.log(`✅ Cache HIT for key: ${key}`);
            console.log(`Returning cached data from:`, cached.timestamp);
            return {
                ...cached.data,
                fromCache: true,
                cacheKey: key,
                cachedAt: cached.timestamp,
                accessCount: cached.accessCount
            };
        }
        
        console.log(`❌ Cache MISS for key: ${key}`);
        console.log(`Total cached entries: ${this.cache.size}`);
        return null;
    }

    // Set cached data
    set(criteria, data) {
        const key = this.generateKey(criteria);
        const normalizedCriteria = this.getNormalizedCriteria(criteria);
        
        const cacheEntry = {
            criteria: normalizedCriteria,
            data: data,
            timestamp: new Date().toISOString(),
            accessCount: 1
        };

        this.cache.set(key, cacheEntry);
        this.saveToFile();
        
        console.log(`💾 Cached data for key: ${key}`);
        console.log(`Criteria:`, normalizedCriteria);
        console.log(`Total cached entries: ${this.cache.size}`);
        return key;
    }

    // Update access count for existing cache entry
    updateAccess(criteria) {
        const key = this.generateKey(criteria);
        const cached = this.cache.get(key);
        
        if (cached) {
            cached.accessCount = (cached.accessCount || 1) + 1;
            cached.lastAccessed = new Date().toISOString();
            this.cache.set(key, cached);
            this.saveToFile();
        }
    }

    getNormalizedCriteria(criteria) {
        // FIXED: Handle all possible input variations consistently
        const normalized = {
            minAge: parseInt(criteria.minAge) || 25,
            maxAge: parseInt(criteria.maxAge) || 35,
            excludeMarried: Boolean(criteria.excludeMarried),
            race: this.normalizeRace(criteria.race),
            minHeight: this.normalizeHeight(criteria.height || criteria.minHeight),
            excludeObese: Boolean(criteria.excludeObese),
            minIncome: parseInt(criteria.income || criteria.minIncome || 0)
        };

        console.log('Input criteria:', criteria);
        console.log('Normalized criteria:', normalized);
        return normalized;
    }

    // Save cache to file
    saveToFile() {
        try {
            const cacheObject = Object.fromEntries(this.cache);
            fs.writeFileSync(this.cacheFile, JSON.stringify(cacheObject, null, 2));
        } catch (error) {
            console.error('Error saving cache to file:', error.message);
        }
    }

    // Get all cached data
    getAllCached() {
        return Array.from(this.cache.entries()).map(([key, value]) => ({
            key,
            ...value
        }));
    }

    // Get cache statistics
    getStats() {
        const entries = Array.from(this.cache.values());
        return {
            totalEntries: this.cache.size,
            totalAccesses: entries.reduce((sum, entry) => sum + (entry.accessCount || 1), 0),
            oldestEntry: entries.length > 0 ? 
                entries.reduce((oldest, entry) => 
                    entry.timestamp < oldest.timestamp ? entry : oldest
                ).timestamp : null,
            newestEntry: entries.length > 0 ? 
                entries.reduce((newest, entry) => 
                    entry.timestamp > newest.timestamp ? entry : newest
                ).timestamp : null
        };
    }

    // Clear cache
    clear() {
        this.cache.clear();
        if (fs.existsSync(this.cacheFile)) {
            fs.unlinkSync(this.cacheFile);
        }
        console.log('Cache cleared');
    }
}

// Initialize cache manager
const cacheManager = new CacheManager();

// Simple License System (No External Dependencies)
class LicenseManager {
    constructor() {
        // Set license expiry date (1 month from deployment)
        this.licenseExpiry = process.env.LICENSE_EXPIRY || '2025-07-15'; // Change this date
        this.isExpired = false;
        
        // Check license on startup
        this.checkLicenseExpiry();
        
        // Check every hour
        setInterval(() => {
            this.checkLicenseExpiry();
        }, 3600000); // 1 hour
    }

    checkLicenseExpiry() {
        const now = new Date();
        const expiry = new Date(this.licenseExpiry);
        
        if (now > expiry) {
            if (!this.isExpired) {
                console.log('🚨 LICENSE EXPIRED 🚨');
                this.isExpired = true;
                this.createExpiredPage();
            }
            return false;
        }
        
        const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 7) {
            console.log(`⚠️ WARNING: License expires in ${daysRemaining} days`);
        }
        
        return true;
    }

    createExpiredPage() {
        const expiredHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Container Not Found</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 50px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-width: 600px;
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 20px;
            color: #ff6b6b;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .icon {
            font-size: 5rem;
            margin-bottom: 30px;
            display: block;
        }
        p {
            font-size: 1.3rem;
            margin-bottom: 15px;
            opacity: 0.9;
            line-height: 1.6;
        }
        .expired-date {
            font-size: 1.1rem;
            color: #ffeb3b;
            margin-top: 30px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
        .contact-info {
            margin-top: 30px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            border-left: 4px solid #ff6b6b;
        }
    </style>
</head>
<body>
    <div class="container">
        <span class="icon">🚫</span>
        <h1>Container Not Found</h1>
        <p>This application container has expired and is no longer available.</p>
        <p>Please contact the developer to renew access.</p>
        
        <div class="expired-date">
            <strong>License Expired:</strong> ${this.licenseExpiry}<br>
            <strong>Current Date:</strong> ${new Date().toISOString().split('T')[0]}
        </div>
        
        <div class="contact-info">
            <strong>📧 Contact Developer</strong><br>
            To renew access or get support, please contact:<br>
            <strong>Email:</strong> navidml6453@gmail.com<br>
            <strong>Phone:</strong> +447491598168<br>
            <strong>WhatsApp:</strong> +447491598168
        </div>
    </div>
</body>
</html>`;

        try {
            // Ensure public directory exists
            if (!fs.existsSync('public')) {
                fs.mkdirSync('public', { recursive: true });
            }
            
            // Replace all HTML files with expired page
            fs.writeFileSync(path.join('public', 'index.html'), expiredHTML);
            fs.writeFileSync(path.join('public', 'results.html'), expiredHTML);
            
            console.log('License expired - Created "Container Not Found" page');
        } catch (error) {
            console.log('Failed to create expired page');
        }
    }

    isActive() {
        return !this.isExpired && this.checkLicenseExpiry();
    }
}

// Initialize license manager
const licenseManager = new LicenseManager();

// Middleware to check license status
function checkLicense(req, res, next) {
    if (!licenseManager.isActive()) {
        // If accessing API endpoints, return JSON error
        if (req.path.startsWith('/api/')) {
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Container license has expired',
                expired: true
            });
        }
        
        // For web requests, let it serve the expired page
        return next();
    }
    next();
}

// Apply license check to all routes
app.use(checkLicense);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Cleanup old screenshots (keep only last 50)
function cleanupOldScreenshots() {
    try {
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) return;
        
        const files = fs.readdirSync(publicDir)
            .filter(file => file.startsWith('screenshot_') && file.endsWith('.png'))
            .map(file => ({
                name: file,
                path: path.join(publicDir, file),
                time: fs.statSync(path.join(publicDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by modification time, newest first
        
        // Keep only the latest 50 screenshots, delete the rest
        if (files.length > 50) {
            const filesToDelete = files.slice(50);
            filesToDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log('Deleted old screenshot:', file.name);
                } catch (deleteError) {
                    console.log('Could not delete screenshot:', file.name);
                }
            });
        }
    } catch (error) {
        console.log('Error during screenshot cleanup:', error.message);
    }
}

// Run cleanup every hour
setInterval(cleanupOldScreenshots, 3600000); // 1 hour

// Race mapping - Updated to use 0,1,2,3
const raceMapping = {
    'any': 0,
    '0': 0,
    'white': 1,
    '1': 1,
    'black': 2,
    '2': 2,
    'asian': 3,
    '3': 3
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeResults(criteria) {
    let browser;
    try {
        console.log('Launching Playwright browser...');
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
        
        console.log('Creating new page...');
        const page = await browser.newPage();
        
        // FIXED: Handle different input formats and convert to correct values
        console.log('Input criteria:', criteria);
        
        // Handle height - convert from CM to proper format if needed
        let minHeight = 0;
        if (criteria.height && criteria.height !== 'any' && criteria.height !== 0) {
            // If it's already a CM value (number), use it directly
            if (typeof criteria.height === 'number' || !isNaN(parseFloat(criteria.height))) {
                minHeight = parseFloat(criteria.height);
            } else {
                // If it's a string like "6'0", would need conversion (not implemented in original)
                minHeight = 0;
            }
        }
        
        // Handle income - ensure it's a number or 0
        let minIncome = 0;
        if (criteria.income && criteria.income !== 'any') {
            minIncome = parseInt(criteria.income) || 0;
        } else if (criteria.minIncome && criteria.minIncome !== 'any') {
            // Also handle if frontend sends minIncome directly
            minIncome = parseInt(criteria.minIncome) || 0;
        }
        
        // Handle race - ensure it's a number
        let race = 0;
        if (criteria.race !== undefined) {
            race = raceMapping[criteria.race.toString()] !== undefined ? raceMapping[criteria.race.toString()] : 0;
        }
        
        // FIXED: Build URL with correct parameter names and values
        const params = new URLSearchParams();
        
        // Add parameters in the EXACT order from the target URL
        params.append('minAge', criteria.minAge || 25);
        params.append('maxAge', criteria.maxAge || 35);
        params.append('excludeMarried', criteria.excludeMarried ? 'true' : 'false');
        params.append('race', race);
        params.append('minHeight', minHeight.toFixed(2));
        params.append('excludeObese', criteria.excludeObese ? 'true' : 'false');
        params.append('minIncome', minIncome);
        
        const url = `https://igotstandardsbro.com/results?${params.toString()}`;
        console.log('Navigating to:', url);
        console.log('Final parameters being sent:', {
            minAge: criteria.minAge || 25,
            maxAge: criteria.maxAge || 35,
            excludeMarried: criteria.excludeMarried ? 'true' : 'false',
            race: race,
            minHeight: minHeight.toFixed(2),
            excludeObese: criteria.excludeObese ? 'true' : 'false',
            minIncome: minIncome
        });
        
        // Navigate with retry logic
        let navigationSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!navigationSuccess && retryCount < maxRetries) {
            try {
                console.log(`Navigation attempt ${retryCount + 1}/${maxRetries}`);
                
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 45000 
                });
                
                navigationSuccess = true;
                console.log('Navigation successful');
                
            } catch (gotoError) {
                retryCount++;
                console.log(`Navigation failed (attempt ${retryCount}):`, gotoError.message);
                
                if (retryCount >= maxRetries) {
                    throw new Error(`Failed to navigate after ${maxRetries} attempts: ${gotoError.message}`);
                }
                
                console.log(`Retrying in 3 seconds...`);
                await delay(3000);
            }
        }
        
        // Wait for page to load completely
        console.log('Waiting for page to load...');
        await delay(8000); // Increased wait time for better loading
        
        // Wait for body element
        try {
            await page.waitForSelector('body', { timeout: 10000 });
            await delay(3000); // Additional wait for dynamic content
        } catch (waitError) {
            console.log('Warning: Could not wait for body selector');
        }
        
        console.log('Starting data extraction...');
        
        // Extract the results using the specific selectors provided
        const results = await page.evaluate(() => {
            const data = {};
            
            console.log('Starting data extraction in browser context...');
            
            // Use the exact selectors provided
            const resultNumbers = document.querySelectorAll('.result-number');
            console.log('Found .result-number elements:', resultNumbers.length);
            
            if (resultNumbers.length >= 3) {
                // Probability score - $('.result-number')[0].textContent
                data.probability = resultNumbers[0].textContent.trim();
                console.log('Probability (index 0):', data.probability);
                
                // Delusion score number - $('.result-number')[1].textContent
                data.delusionScoreNumber = resultNumbers[1].textContent.trim();
                console.log('Delusion score number (index 1):', data.delusionScoreNumber);
                
                // Delusion label - $('.result-number')[2].textContent
                data.delusionScore = resultNumbers[2].textContent.trim();
                console.log('Delusion label (index 2):', data.delusionScore);
            } else {
                console.log('Not enough .result-number elements found, trying fallback methods...');
                
                // Fallback: try to find probability
                for (let i = 0; i < resultNumbers.length; i++) {
                    const text = resultNumbers[i].textContent.trim();
                    if (text.includes('%')) {
                        data.probability = text;
                        console.log('Found probability at index', i, ':', text);
                        break;
                    }
                }
                
                // Fallback: try to find delusion score number
                for (let i = 0; i < resultNumbers.length; i++) {
                    const text = resultNumbers[i].textContent.trim();
                    if (text.match(/^\d+\/\d+$/)) {
                        data.delusionScoreNumber = text;
                        console.log('Found delusion score number at index', i, ':', text);
                        break;
                    }
                }
                
                // Fallback: try to find delusion label
                const delusionTexts = ['Aspiring cat lady', 'Very Delusional', 'Delusional', 'Picky', 'Reasonable', 'Down to earth'];
                for (let i = 0; i < resultNumbers.length; i++) {
                    const text = resultNumbers[i].textContent.trim();
                    if (delusionTexts.includes(text)) {
                        data.delusionScore = text;
                        console.log('Found delusion label at index', i, ':', text);
                        break;
                    }
                }
            }
            
            // Get population visualizer
            const populationElement = document.querySelector('.population-visualizer');
            if (populationElement) {
                data.populationData = populationElement.innerHTML;
                console.log('Found population data');
            }
            
            // Get paragraph text
            const paragraphElement = document.querySelector('.paragraph');
            if (paragraphElement) {
                data.paragraphText = paragraphElement.innerHTML;
                console.log('Found paragraph text');
            }
            
            // Get score flex container
            const scoreFlexElement = document.querySelector('.score-flex');
            if (scoreFlexElement) {
                data.scoreFlexHTML = scoreFlexElement.innerHTML;
                console.log('Found score flex HTML');
            }
            
            // Enhanced box paragraph extraction
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
                    console.log('Found box paragraph list items with selector', selector, ':', elements.length);
                    break;
                }
            }
            
            // Get page HTML for debugging if no main data found
            if (!data.probability && !data.delusionScore && !data.delusionScoreNumber) {
                console.log('No data found, capturing page HTML and all .result-number elements...');
                data.debugHTML = document.body.innerHTML.substring(0, 2000); // First 2000 chars
                
                // Log all .result-number elements for debugging
                data.debugResultNumbers = Array.from(resultNumbers).map((el, index) => ({
                    index: index,
                    text: el.textContent.trim(),
                    innerHTML: el.innerHTML
                }));
            }
            
            console.log('Final extracted data:', data);
            return data;
        });
        
        console.log('Scraped results:', results);
        
        // Take a screenshot for user verification (always save)
        const timestamp = Date.now();
        const screenshotPath = path.join(__dirname, 'public', `screenshot_${timestamp}.png`);
        const screenshotUrl = `/screenshot_${timestamp}.png`;
        
        try {
            // Ensure public directory exists
            if (!fs.existsSync(path.join(__dirname, 'public'))) {
                fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
            }
            
            await page.screenshot({ 
                path: screenshotPath, 
                fullPage: true,
                timeout: 10000
            });
            console.log('Screenshot saved:', screenshotPath);
            results.screenshotUrl = screenshotUrl;
        } catch (screenshotError) {
            console.log('Could not save screenshot:', screenshotError.message);
            results.screenshotUrl = null;
        }

        // Validate results
        if (!results.probability && !results.delusionScore && !results.delusionScoreNumber) {
            // Log debug information
            if (results.debugResultNumbers) {
                console.log('Debug - All .result-number elements found:');
                results.debugResultNumbers.forEach(item => {
                    console.log(`Index ${item.index}: "${item.text}" (HTML: ${item.innerHTML})`);
                });
            }
            
            // Get page content for debugging
            const pageTitle = await page.title();
            const pageUrl = page.url();
            console.log('Page title:', pageTitle);
            console.log('Page URL:', pageUrl);
            
            if (results.debugHTML) {
                console.log('Page HTML preview:', results.debugHTML);
            }
            
            throw new Error('No valid results found on the page - .result-number elements may not be available');
        }
        
        return results;
        
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    } finally {
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed successfully');
            } catch (closeError) {
                console.log('Error closing browser:', closeError.message);
            }
        }
    }
}

// Enhanced function to get results with caching
async function getResults(criteria) {
    console.log('\n🔍 === CACHE LOOKUP STARTING ===');
    console.log('Raw input criteria:', JSON.stringify(criteria, null, 2));
    
    // Check cache first
    const cachedResult = cacheManager.get(criteria);
    if (cachedResult) {
        console.log('✅ Found in cache, updating access count');
        cacheManager.updateAccess(criteria);
        console.log('🔍 === CACHE LOOKUP COMPLETE (HIT) ===\n');
        return cachedResult;
    }

    console.log('❌ Not found in cache, proceeding to scrape');
    console.log('🔍 === CACHE LOOKUP COMPLETE (MISS) ===\n');

    console.log('\n🌐 === SCRAPING STARTING ===');
    // If not in cache, scrape and cache the result
    const results = await scrapeResults(criteria);
    console.log('🌐 === SCRAPING COMPLETE ===\n');

    console.log('\n💾 === CACHING RESULT ===');
    const cacheKey = cacheManager.set(criteria, results);
    console.log('💾 === CACHING COMPLETE ===\n');
    
    return {
        ...results,
        fromCache: false,
        cacheKey: cacheKey
    };
}

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to handle scraping requests (now with caching)
app.post('/api/scrape', async (req, res) => {
    try {
        const criteria = req.body;
        console.log('\n🚀 === API SCRAPE REQUEST ===');
        console.log('Received criteria:', JSON.stringify(criteria, null, 2));
        
        const results = await getResults(criteria);
        
        // Validate that we got valid results
        if (!results.probability && !results.delusionScore && !results.delusionScoreNumber) {
            console.error('❌ No valid results found in response:', results);
            throw new Error('No valid results found on the page');
        }
        
        console.log('✅ Valid results obtained');
        console.log('Results summary:', {
            probability: results.probability,
            delusionScore: results.delusionScore,
            fromCache: results.fromCache
        });
        console.log('🚀 === API SCRAPE REQUEST COMPLETE ===\n');
        
        res.json({
            success: true,
            data: results
        });
        
    } catch (error) {
        console.error('❌ API scrape error:', error.message);
        console.error('Error stack:', error.stack);
        console.log('🚀 === API SCRAPE REQUEST FAILED ===\n');
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'Check server logs for more information'
        });
    }
});

// NEW: API endpoint to get results by criteria (for external API usage)
app.post('/api/results', async (req, res) => {
    try {
        const criteria = req;
        console.log(criteria.query)
        // Validate required fields
        if (!criteria) {
            return res.status(400).json({
                success: false,
                error: 'Criteria object is required',
                example: {
                    minAge: 25,
                    maxAge: 35,
                    excludeMarried: false,
                    race: 'any', // 'any', 'white', 'black', 'asian' or 0,1,2,3
                    height: 0, // in CM, 0 for any
                    excludeObese: false,
                    income: 0 // minimum income, 0 for any
                }
            });
        }

        console.log('\n🎯 === API RESULTS REQUEST (POST) ===');
        console.log('API Request - Received criteria:', JSON.stringify(criteria, null, 2));
        
        const results = await getResults(criteria);
        
        // Validate that we got valid results
        if (!results.probability && !results.delusionScore && !results.delusionScoreNumber) {
            console.error('❌ No valid results found in response:', results);
            throw new Error('No valid results found');
        }
        
        console.log('✅ Valid results obtained');
        console.log('Results summary:', {
            probability: results.probability,
            delusionScore: results.delusionScore,
            fromCache: results.fromCache
        });
        console.log('🎯 === API RESULTS REQUEST COMPLETE ===\n');
        
        // Return clean API response
        res.json({
            success: true,
            fromCache: results.fromCache,
            cacheKey: results.cacheKey,
            criteria: cacheManager.getNormalizedCriteria(criteria),
            results: {
                probability: results.probability,
                delusionScore: results.delusionScore,
                delusionScoreNumber: results.delusionScoreNumber,
                populationData: results.populationData,
                paragraphText: results.paragraphText,
                scoreFlexHTML: results.scoreFlexHTML,
                boxParagraphList: results.boxParagraphList,
                screenshotUrl: results.screenshotUrl
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ API results error:', error.message);
        console.error('Error stack:', error.stack);
        console.log('🎯 === API RESULTS REQUEST FAILED ===\n');
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'Check server logs for more information',
            timestamp: new Date().toISOString()
        });
    }
});

// NEW: GET version of API endpoint to handle query parameters
app.get('/api/results', async (req, res) => {
    try {
        // Convert query parameters to criteria object
        const criteria = {
            minAge: req.query.minAge ? parseInt(req.query.minAge) : undefined,
            maxAge: req.query.maxAge ? parseInt(req.query.maxAge) : undefined,
            excludeMarried: req.query.excludeMarried === 'true',
            race: req.query.race || 'any',
            height: req.query.minHeight ? parseFloat(req.query.minHeight) : 0,
            excludeObese: req.query.excludeObese === 'true',
            income: req.query.minIncome ? parseInt(req.query.minIncome) : 0
        };

        console.log('\n🎯 === API RESULTS REQUEST (GET) ===');
        console.log('Query parameters received:', JSON.stringify(req.query, null, 2));
        console.log('Converted criteria:', JSON.stringify(criteria, null, 2));
        
        const results = await getResults(criteria);
        
        // Validate that we got valid results
        if (!results.probability && !results.delusionScore && !results.delusionScoreNumber) {
            console.error('❌ No valid results found in response:', results);
            throw new Error('No valid results found');
        }
        
        console.log('✅ Valid results obtained');
        console.log('Results summary:', {
            probability: results.probability,
            delusionScore: results.delusionScore,
            fromCache: results.fromCache
        });
        console.log('🎯 === API RESULTS REQUEST COMPLETE ===\n');
        
        // Return clean API response
        res.json({
            success: true,
            fromCache: results.fromCache,
            cacheKey: results.cacheKey,
            criteria: cacheManager.getNormalizedCriteria(criteria),
            results: {
                probability: results.probability,
                delusionScore: results.delusionScore,
                delusionScoreNumber: results.delusionScoreNumber,
                populationData: results.populationData,
                paragraphText: results.paragraphText,
                scoreFlexHTML: results.scoreFlexHTML,
                boxParagraphList: results.boxParagraphList,
                screenshotUrl: results.screenshotUrl
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ API results GET error:', error.message);
        console.error('Error stack:', error.stack);
        console.log('🎯 === API RESULTS REQUEST FAILED ===\n');
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: 'Check server logs for more information',
            timestamp: new Date().toISOString()
        });
    }
});

// NEW: Get all cached data
app.get('/api/cache', (req, res) => {
    try {
        const allCached = cacheManager.getAllCached();
        const stats = cacheManager.getStats();
        
        res.json({
            success: true,
            stats: stats,
            data: allCached
        });
    } catch (error) {
        console.error('Cache API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Get cache statistics
app.get('/api/cache/stats', (req, res) => {
    try {
        const stats = cacheManager.getStats();
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Cache stats API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Clear cache (admin endpoint)
app.delete('/api/cache', (req, res) => {
    try {
        cacheManager.clear();
        
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        console.error('Clear cache API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Search cached data
app.get('/api/search', (req, res) => {
    try {
        const { minAge, maxAge, race, minIncome } = req.query;
        const allCached = cacheManager.getAllCached();
        
        let filtered = allCached;
        
        // Apply filters if provided
        if (minAge) {
            filtered = filtered.filter(entry => entry.criteria.minAge >= parseInt(minAge));
        }
        if (maxAge) {
            filtered = filtered.filter(entry => entry.criteria.maxAge <= parseInt(maxAge));
        }
        if (race && race !== 'any') {
            const raceValue = cacheManager.normalizeRace(race);
            filtered = filtered.filter(entry => entry.criteria.race === raceValue);
        }
        if (minIncome) {
            filtered = filtered.filter(entry => entry.criteria.minIncome >= parseInt(minIncome));
        }
        
        res.json({
            success: true,
            total: allCached.length,
            filtered: filtered.length,
            data: filtered
        });
    } catch (error) {
        console.error('Search API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Get API documentation
app.get('/api/docs', (req, res) => {
    const docs = {
        title: "Standards Calculator API Documentation",
        version: "1.0.0",
        description: "API for calculating dating standards and probability scores",
        endpoints: {
            "GET /api/results": {
                description: "Get results for given criteria using query parameters (alternative to POST)",
                parameters: {
                    minAge: { type: "number", default: 25, description: "Minimum age" },
                    maxAge: { type: "number", default: 35, description: "Maximum age" },
                    excludeMarried: { type: "boolean", default: false, description: "Exclude married individuals (true/false)" },
                    race: { type: "string", values: ["any", "white", "black", "asian", "0", "1", "2", "3"], default: "any", description: "Race preference" },
                    minHeight: { type: "number", default: 0, description: "Minimum height in CM (0 for any)" },
                    excludeObese: { type: "boolean", default: false, description: "Exclude obese individuals (true/false)" },
                    minIncome: { type: "number", default: 0, description: "Minimum income (0 for any)" }
                },
                response: "Same as POST /api/results"
            },
            "POST /api/results": {
                description: "Get results for given criteria (with caching)",
                parameters: {
                    minAge: { type: "number", default: 25, description: "Minimum age" },
                    maxAge: { type: "number", default: 35, description: "Maximum age" },
                    excludeMarried: { type: "boolean", default: false, description: "Exclude married individuals" },
                    race: { type: "string", values: ["any", "white", "black", "asian", "0", "1", "2", "3"], default: "any", description: "Race preference" },
                    height: { type: "number", default: 0, description: "Minimum height in CM (0 for any)" },
                    excludeObese: { type: "boolean", default: false, description: "Exclude obese individuals" },
                    income: { type: "number", default: 0, description: "Minimum income (0 for any)" }
                },
                response: {
                    success: "boolean",
                    fromCache: "boolean",
                    cacheKey: "string",
                    criteria: "object",
                    results: {
                        probability: "string",
                        delusionScore: "string",
                        delusionScoreNumber: "string",
                        populationData: "string",
                        paragraphText: "string",
                        scoreFlexHTML: "string",
                        boxParagraphList: "array",
                        screenshotUrl: "string"
                    }
                }
            },
            "GET /api/cache": {
                description: "Get all cached data with statistics",
                response: {
                    success: "boolean",
                    stats: "object",
                    data: "array"
                }
            },
            "GET /api/cache/stats": {
                description: "Get cache statistics only",
                response: {
                    success: "boolean",
                    stats: {
                        totalEntries: "number",
                        totalAccesses: "number",
                        oldestEntry: "string",
                        newestEntry: "string"
                    }
                }
            },
            "GET /api/search": {
                description: "Search cached data with filters",
                parameters: {
                    minAge: { type: "number", optional: true },
                    maxAge: { type: "number", optional: true },
                    race: { type: "string", optional: true },
                    minIncome: { type: "number", optional: true }
                },
                response: {
                    success: "boolean",
                    total: "number",
                    filtered: "number",
                    data: "array"
                }
            },
            "DELETE /api/cache": {
                description: "Clear all cached data (admin only)",
                response: {
                    success: "boolean",
                    message: "string"
                }
            },
            "POST /api/scrape": {
                description: "Legacy endpoint - same as /api/results but returns different format",
                parameters: "Same as /api/results",
                response: {
                    success: "boolean",
                    data: "object"
                }
            }
        },
        examples: {
            "GET Request with Query Parameters": {
                url: "GET /api/results?minAge=27&maxAge=40&excludeMarried=true&race=0&minHeight=160.02&excludeObese=false&minIncome=215000",
                description: "Use query parameters for easy testing and integration"
            },
            "POST Request with JSON Body": {
                url: "POST /api/results",
                body: {
                    minAge: 25,
                    maxAge: 30,
                    excludeMarried: true,
                    race: "any",
                    height: 170,
                    excludeObese: true,
                    income: 50000
                }
            },
            "Minimal GET Request": {
                url: "GET /api/results?minAge=20&maxAge=40",
                description: "Minimal parameters, rest use defaults"
            },
            "Search Cache": {
                url: "GET /api/search?minAge=25&race=white&minIncome=40000",
                description: "Find all cached entries for white individuals, min age 25, min income 40k"
            }
        }
    };
    
    res.json(docs);
});

// Health check endpoint
app.get('/health', (req, res) => {
    const expiry = new Date(licenseManager.licenseExpiry);
    const now = new Date();
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const cacheStats = cacheManager.getStats();
    
    res.json({ 
        status: licenseManager.isActive() ? 'OK' : 'EXPIRED',
        timestamp: new Date().toISOString(),
        licenseExpiry: licenseManager.licenseExpiry,
        daysRemaining: daysRemaining,
        expired: now > expiry,
        cache: {
            totalEntries: cacheStats.totalEntries,
            totalAccesses: cacheStats.totalAccesses
        }
    });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api/docs`);
    console.log(`Cache stats available at http://localhost:${PORT}/api/cache/stats`);
    
    // Log initial cache stats
    const stats = cacheManager.getStats();
    console.log(`Cache initialized with ${stats.totalEntries} entries`);
});

module.exports = { scrapeResults, getResults, licenseManager, cacheManager };


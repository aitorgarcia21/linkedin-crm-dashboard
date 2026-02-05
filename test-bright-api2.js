const { chromium } = require('playwright-core');

const API_KEY = 'c1xaq8mjfteu';
const AUTH = `brd-customer-hl_dbce36ae-zone-scraping_browser1:${API_KEY}`;
const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;

async function testBrightData() {
    console.log('🔌 Testing Bright Data connection...');
    console.log('Auth:', AUTH);
    
    try {
        const browser = await chromium.connectOverCDP(SBR_WS_ENDPOINT);
        console.log('✅ Connected to Bright Data!');
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        console.log('🌍 Navigating to LinkedIn login...');
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.log('📝 Testing password input...');
        try {
            await page.fill('input#username', 'test@test.com');
            await page.fill('input#password', 'testpassword');
            console.log('✅ Password typing WORKS! KYC approved!');
        } catch (e) {
            console.log('❌ Password typing blocked:', e.message);
        }
        
        await browser.close();
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    }
}

testBrightData().catch(console.error);

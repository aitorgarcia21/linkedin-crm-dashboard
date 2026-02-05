const { chromium } = require('playwright-core');

const API_KEY = '86b72742-5e02-458a-ac29-16ff679f2aaa';
const AUTH = `brd-customer-hl_dbce36ae-zone-scraping_browser1:${API_KEY}`;
const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;

async function testBrightData() {
    console.log('🔌 Testing Bright Data connection...');
    console.log('Auth:', AUTH);
    console.log('Endpoint:', SBR_WS_ENDPOINT);
    
    try {
        const browser = await chromium.connectOverCDP(SBR_WS_ENDPOINT);
        console.log('✅ Connected to Bright Data!');
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        console.log('🌍 Navigating to test page...');
        await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const title = await page.title();
        console.log('✅ Page loaded:', title);
        
        await browser.close();
        console.log('✅ Test successful!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
    }
}

testBrightData().catch(console.error);

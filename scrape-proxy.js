const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Config - Using Bright Data PROXY (not Scraping Browser)
const BRIGHT_DATA_HOST = 'brd.superproxy.io';
const BRIGHT_DATA_PORT = 33335;
const BRIGHT_DATA_USERNAME = process.env.BRIGHT_DATA_USERNAME || 'brd-customer-hl_dbce36ae-zone-residential';
const BRIGHT_DATA_PASSWORD = process.env.BRIGHT_DATA_PASSWORD || 'de8e8wg0wkf3';

const COOKIES_FILE = path.join(__dirname, 'linkedin-cookies.json');

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL || 'aitorgarcia2112@gmail.com';
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD || '21AiPa01....';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneXhjb2J1amFjYW1waXFuZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDYxMTUsImV4cCI6MjA4NTUyMjExNX0.8jgz6G0Irj6sRclcBKzYE5VzzXNrxzHgrAz45tHfHpc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function scrapeLinkedIn() {
    console.log('🚀 Starting LinkedIn scraper with Bright Data Proxy...');
    
    // Launch browser with Bright Data proxy
    const browser = await chromium.launch({
        headless: true,
        proxy: {
            server: `http://${BRIGHT_DATA_HOST}:${BRIGHT_DATA_PORT}`,
            username: BRIGHT_DATA_USERNAME,
            password: BRIGHT_DATA_PASSWORD
        }
    });
    
    const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
        // Load cookies if available
        if (fs.existsSync(COOKIES_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            await context.addCookies(cookies);
            console.log(`🍪 Loaded ${cookies.length} cookies`);
        }
        
        console.log('🌍 Navigating to LinkedIn...');
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        
        // Check if logged in
        const url = page.url();
        if (url.includes('/feed')) {
            console.log('✅ Logged in via cookies!');
        } else {
            console.log('🔐 Logging in with credentials...');
            
            // Handle cookie banner
            try {
                const acceptBtn = await page.$('button[action-type="ACCEPT"]');
                if (acceptBtn) {
                    await acceptBtn.click();
                    await page.waitForTimeout(1000);
                }
            } catch (e) {}
            
            // Fill login form
            await page.fill('input[name="session_key"]', LINKEDIN_EMAIL);
            await page.fill('input[name="session_password"]', LINKEDIN_PASSWORD);
            await page.click('button[type="submit"]');
            
            // Wait for login
            await page.waitForURL('**/feed/**', { timeout: 60000 });
            console.log('✅ Logged in!');
            
            // Save cookies for next time
            const newCookies = await context.cookies();
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(newCookies, null, 2));
            console.log('💾 Cookies saved');
        }
        
        // Navigate to messages
        console.log('📬 Navigating to messages...');
        await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        console.log('✅ Scraper ready! (proxy mode works)');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

scrapeLinkedIn().catch(console.error);

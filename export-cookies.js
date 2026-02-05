const { chromium } = require('playwright-core');
const fs = require('fs');

const AUTH = process.env.BRIGHT_DATA_API_KEY || 'brd-customer-hl_dbce36ae-zone-scraping_browser1-country-fr:de8e8wg0wkf3';
const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;

async function exportCookies() {
    console.log('🔌 Connecting to Bright Data...');
    const browser = await chromium.connectOverCDP(SBR_WS_ENDPOINT);
    
    const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // Get CDP session for debugger URL
    const client = await page.context().newCDPSession(page);
    const { frameTree: { frame } } = await client.send('Page.getFrameTree');
    const { url: inspectUrl } = await client.send('Page.inspect', { frameId: frame.id });
    
    console.log('');
    console.log('🔗 OUVRE CE LIEN DANS TON NAVIGATEUR :');
    console.log(inspectUrl);
    console.log('');
    console.log('👉 Connecte-toi manuellement à LinkedIn dans cette fenêtre');
    console.log('👉 Une fois connecté (tu vois le feed), appuie sur ENTRÉE ici');
    console.log('');
    
    // Navigate to LinkedIn
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for user to login manually
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    await new Promise(resolve => {
        rl.question('Appuie sur ENTRÉE quand tu es connecté à LinkedIn... ', () => {
            rl.close();
            resolve();
        });
    });
    
    // Export cookies
    const cookies = await context.cookies();
    const linkedinCookies = cookies.filter(c => c.domain.includes('linkedin'));
    
    fs.writeFileSync('linkedin-cookies.json', JSON.stringify(linkedinCookies, null, 2));
    
    console.log(`✅ ${linkedinCookies.length} cookies exportés dans linkedin-cookies.json`);
    console.log('');
    console.log('Tu peux maintenant lancer le scraper avec ces cookies !');
    
    await browser.close();
}

exportCookies().catch(console.error);

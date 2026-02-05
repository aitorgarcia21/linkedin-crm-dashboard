const { chromium } = require('playwright-core');
const fs = require('fs');

const AUTH = 'brd-customer-hl_dbce36ae-zone-scraping_browser1:de8e8wg0wkf3';
const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;

async function loginAndSaveSession() {
    console.log('🔌 Connecting to Bright Data...');
    const browser = await chromium.connectOverCDP(SBR_WS_ENDPOINT);
    
    const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // Get debugger URL
    const client = await page.context().newCDPSession(page);
    const { frameTree: { frame } } = await client.send('Page.getFrameTree');
    const { url: inspectUrl } = await client.send('Page.inspect', { frameId: frame.id });
    
    console.log('');
    console.log('🔗 OUVRE CE LIEN DANS CHROME :');
    console.log(inspectUrl);
    console.log('');
    console.log('📝 INSTRUCTIONS :');
    console.log('   1. Dans DevTools, va dans l\'onglet "Console"');
    console.log('   2. Tape ces commandes une par une :');
    console.log('');
    console.log('      document.querySelector(\'input[name="session_key"]\').value = "aitorgarcia2112@gmail.com"');
    console.log('      document.querySelector(\'input[name="session_password"]\').value = "21AiPa01...."');
    console.log('      document.querySelector(\'button[type="submit"]\').click()');
    console.log('');
    console.log('   3. Une fois sur le FEED LinkedIn, reviens ici et appuie sur ENTRÉE');
    console.log('');
    
    // Navigate to login
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for user to login via DevTools console
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    await new Promise(resolve => {
        rl.question('Appuie sur ENTRÉE quand tu es connecté... ', () => {
            rl.close();
            resolve();
        });
    });
    
    // Save cookies AND localStorage
    const cookies = await context.cookies();
    const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
    const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));
    
    const session = {
        cookies,
        localStorage: JSON.parse(localStorage),
        sessionStorage: JSON.parse(sessionStorage),
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        timestamp: Date.now()
    };
    
    fs.writeFileSync('linkedin-session.json', JSON.stringify(session, null, 2));
    
    console.log('');
    console.log(`✅ Session complète sauvegardée !`);
    console.log(`   - ${cookies.length} cookies`);
    console.log(`   - ${Object.keys(session.localStorage).length} localStorage items`);
    console.log(`   - ${Object.keys(session.sessionStorage).length} sessionStorage items`);
    console.log('📁 Fichier: linkedin-session.json');
    console.log('');
    
    await browser.close();
}

loginAndSaveSession().catch(console.error);

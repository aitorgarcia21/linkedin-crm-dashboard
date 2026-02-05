const { chromium } = require('playwright');
const fs = require('fs');

async function exportCookies() {
    console.log('🚀 Lancement du navigateur local...');
    
    // Launch local browser (headful so you can see and interact)
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--start-maximized']
    });
    
    const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: null
    });
    
    const page = await context.newPage();
    
    console.log('');
    console.log('📱 Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/login');
    
    console.log('');
    console.log('👉 CONNECTE-TOI MANUELLEMENT dans la fenêtre du navigateur');
    console.log('👉 Une fois sur le FEED, reviens ici et appuie sur ENTRÉE');
    console.log('');
    
    // Wait for user to login manually
    const readline = require('readline');
    const rl = readline.createInterface({ 
        input: process.stdin, 
        output: process.stdout 
    });
    
    await new Promise(resolve => {
        rl.question('Appuie sur ENTRÉE quand tu es connecté... ', () => {
            rl.close();
            resolve();
        });
    });
    
    // Export cookies
    const cookies = await context.cookies();
    const linkedinCookies = cookies.filter(c => c.domain.includes('linkedin'));
    
    fs.writeFileSync('linkedin-cookies.json', JSON.stringify(linkedinCookies, null, 2));
    
    console.log('');
    console.log(`✅ ${linkedinCookies.length} cookies LinkedIn exportés !`);
    console.log('📁 Fichier: linkedin-cookies.json');
    console.log('');
    console.log('🚀 Tu peux maintenant lancer le scraper avec ces cookies');
    
    await browser.close();
}

exportCookies().catch(console.error);

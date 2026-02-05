const { chromium } = require('playwright');

async function debugLogin() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    await page.goto('https://www.linkedin.com/login');
    await page.waitForTimeout(3000);
    
    // Get all input fields
    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(input => ({
            id: input.id,
            name: input.name,
            type: input.type,
            placeholder: input.placeholder,
            visible: input.offsetParent !== null
        }));
    });
    
    console.log('Input fields found:');
    console.log(JSON.stringify(inputs, null, 2));
    
    await page.screenshot({ path: 'linkedin-login.png', fullPage: true });
    console.log('Screenshot saved: linkedin-login.png');
    
    await browser.close();
}

debugLogin().catch(console.error);

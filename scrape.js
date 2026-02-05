const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Config
const USE_BRIGHT_DATA = process.env.USE_BRIGHT_DATA === 'true';
const BRIGHT_DATA_PASSWORD = process.env.BRIGHT_DATA_PASSWORD || '86b72742-5e02-458a-ac29-16ff679f2aaa';
const AUTH = `brd-customer-hl_dbce36ae-zone-scraping_browser1:${BRIGHT_DATA_PASSWORD}`;
const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;
const COOKIES_FILE = process.env.COOKIES_FILE || path.join(__dirname, 'linkedin-cookies.json');
const COOKIES_JSON = process.env.COOKIES_JSON; // Railway env var

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL || 'aitorgarcia2112@gmail.com';
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD || '21AiPa01....';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneXhjb2J1amFjYW1waXFuZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDYxMTUsImV4cCI6MjA4NTUyMjExNX0.8jgz6G0Irj6sRclcBKzYE5VzzXNrxzHgrAz45tHfHpc';

async function scrapeLinkedIn() {
    // Get existing conversations from Supabase to avoid duplicates
    console.log('📊 Checking existing data in Supabase...');
    const supabaseCheck = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: existingConversations } = await supabaseCheck.from('conversations').select('linkedin_conversation_id');
    const existingConvIds = new Set((existingConversations || []).map(c => c.linkedin_conversation_id));
    console.log(`✅ Found ${existingConvIds.size} existing conversations in database`);

    let browser, context, page;
    
    if (USE_BRIGHT_DATA) {
        console.log('🔌 Connecting to Bright Data...');
        const { chromium: chromiumCore } = require('playwright-core');
        browser = await chromiumCore.connectOverCDP(SBR_WS_ENDPOINT);
        context = await browser.newContext({
            locale: 'fr-FR',
            timezoneId: 'Europe/Paris',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            ignoreHTTPSErrors: true
        });
        page = await context.newPage();
    } else {
        console.log('� Launching local browser (no Bright Data)...');
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
            locale: 'fr-FR',
            timezoneId: 'Europe/Paris',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        page = await context.newPage();
    }

    try {
        // Simple login with credentials (no cookies)
        console.log('🔐 Logging into LinkedIn...');
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(3000);
        
        // Fill credentials
        console.log('📝 Entering credentials...');
        await page.fill('input#username', LINKEDIN_EMAIL);
        await page.fill('input#password', LINKEDIN_PASSWORD);
        await page.click('button[type="submit"]');
        
        // Wait for navigation to feed
        console.log('⏳ Waiting for login...');
        await page.waitForURL('**/feed/**', { timeout: 60000 });
        console.log('✅ Logged in!');

        // Go to messages with retry
        console.log('📬 Navigating to messages...');
        try {
            await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            // Handle redirects
            console.log('⚠️ Navigation interrupted, checking current URL...');
            const currentUrl = page.url();
            if (!currentUrl.includes('/messaging')) {
                await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            }
        }
        await page.waitForTimeout(5000);

        // Handle Cookie Banner - LinkedIn's new consent screen
        try {
            console.log('🍪 Checking for cookie/consent banner...');
            await page.waitForTimeout(2000);
            
            // Multiple strategies for cookie acceptance
            const cookieSelectors = [
                'button[action-type="ACCEPT"]',
                'button[data-control-name="ga-cookie.accept"]', 
                '.artdeco-global-alert-action__button',
                'button:has-text("Accept")',
                'button:has-text("Accepter")',
                '[data-testid="accept-cookie-banner-button"]',
                '.truste-button',
                'button[id*="accept"]',
                'button[class*="accept"]',
                'button:has-text("Agree")',
                'button:has-text("Continue")'
            ];
            
            for (const selector of cookieSelectors) {
                const btn = await page.$(selector);
                if (btn) {
                    console.log(`🍪 Clicking cookie button: ${selector}`);
                    await btn.click();
                    await page.waitForTimeout(1500);
                    break;
                }
            }
            
            // Alternative: Click by text content evaluation
            const clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const acceptBtn = buttons.find(b => 
                    b.textContent?.toLowerCase().includes('accept') ||
                    b.textContent?.toLowerCase().includes('accepter') ||
                    b.textContent?.toLowerCase().includes('agree') ||
                    b.textContent?.toLowerCase().includes('continue') ||
                    b.textContent?.toLowerCase().includes('consent')
                );
                if (acceptBtn) {
                    acceptBtn.click();
                    return true;
                }
                return false;
            });
            
            if (clicked) {
                console.log('🍪 Cookie banner handled via text matching');
                await page.waitForTimeout(1500);
            } else {
                console.log('🍪 No cookie banner found or already accepted');
            }
            
        } catch (e) { 
            console.log('🍪 Cookie handling error:', e.message); 
        }

        // Scroll to load ALL conversations
        console.log('📜 Loading all conversations...');
        let previousCount = 0;
        let currentCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 50;

        do {
            previousCount = currentCount;
            
            // Scroll conversation list to bottom
            await page.evaluate(() => {
                const convList = document.querySelector('.msg-conversations-container__conversations-list');
                if (convList) {
                    convList.scrollTop = convList.scrollHeight;
                }
            });
            
            await page.waitForTimeout(2000);
            
            const conversations = await page.$$('.msg-conversation-listitem');
            currentCount = conversations.length;
            scrollAttempts++;
            
            console.log(`📊 Loaded ${currentCount} conversations (attempt ${scrollAttempts}/${maxScrollAttempts})`);
            
        } while (currentCount > previousCount && scrollAttempts < maxScrollAttempts);

        // Get final conversation list
        const conversationElements = await page.$$('.msg-conversation-listitem');
        console.log(`📨 Total conversations found: ${conversationElements.length}`);

        const allData = [];
        const TEST_MODE = process.env.TEST_MODE === 'true';
        const maxConversations = TEST_MODE ? 1 : conversationElements.length;

        for (let i = 0; i < maxConversations; i++) {
            try {
                // Click conversation
                const convItems = await page.$$('.msg-conversation-listitem');
                await convItems[i].click();
                await page.waitForTimeout(2000);

                // Get prospect name
                const nameEl = await page.$('.msg-entity-lockup__entity-title');
                const prospectName = nameEl ? await nameEl.innerText() : 'Unknown';

                // Get profile URL
                const linkEl = await page.$('.msg-entity-lockup__entity-title a');
                const prospectUrl = linkEl ? await linkEl.getAttribute('href') : '';

                // Scroll to load all messages in conversation
                await page.evaluate(() => {
                    const msgList = document.querySelector('.msg-s-message-list-container');
                    if (msgList) {
                        msgList.scrollTop = 0; // Scroll to top to load older messages
                    }
                });
                await page.waitForTimeout(2000);

                // Get messages
                const messageEls = await page.$$('.msg-s-event-listitem');
                const messages = [];

                for (const msgEl of messageEls) {
                    const isSelf = await msgEl.$('.msg-s-message-list__event--from-self');
                    const sender = isSelf ? 'me' : 'them';

                    const contentEl = await msgEl.$('.msg-s-event-listitem__body');
                    const content = contentEl ? await contentEl.innerText() : '';

                    const timeEl = await msgEl.$('time');
                    const timestamp = timeEl ? await timeEl.getAttribute('datetime') : new Date().toISOString();

                    if (content.trim()) {
                        messages.push({ sender, content: content.trim(), timestamp });
                    }
                }

                // Check if conversation already exists
                const convId = prospectUrl || `conv-${prospectName.trim()}`;
                if (existingConvIds.has(convId)) {
                    console.log(`⏭️  Skipped ${i + 1}/${conversationElements.length}: ${prospectName} (already in database)`);
                    continue;
                }

                allData.push({
                    prospect_name: prospectName.trim(),
                    prospect_url: prospectUrl,
                    messages
                });

                console.log(`✅ Scraped ${i + 1}/${conversationElements.length}: ${prospectName} (${messages.length} messages) [NEW]`);

            } catch (e) {
                console.log(`⚠️ Error on conversation ${i + 1}:`, e.message);
            }
        }

        console.log(`\n📊 Total conversations scraped: ${allData.length}`);

        // Close browser
        await browser.close();
        console.log('🔒 Browser closed');

        // Save to JSON file
        const dataFile = path.join(__dirname, 'scraped-data.json');
        fs.writeFileSync(dataFile, JSON.stringify(allData, null, 2));
        console.log(`💾 Saved ${allData.length} conversations to ${dataFile}`);

        // Upload to Supabase (wait a bit for network to stabilize after browser close)
        console.log('⏳ Waiting for network to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('📤 Uploading to Supabase...');
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        let saved = 0;

        for (const conv of allData) {
            try {
                // Insert prospect (ignore if exists)
                const { data: prospect, error: prospectError } = await supabase
                    .from('prospects')
                    .upsert({
                        linkedin_url: conv.prospect_url || `https://linkedin.com/unknown/${conv.prospect_name.replace(/\s+/g, '-')}`,
                        name: conv.prospect_name
                    }, { onConflict: 'linkedin_url', ignoreDuplicates: false })
                    .select()
                    .single();

                if (prospectError) throw prospectError;

                // Insert conversation (will fail if duplicate due to unique constraint)
                const { data: conversation, error: conversationError } = await supabase
                    .from('conversations')
                    .insert({
                        prospect_id: prospect.id,
                        linkedin_conversation_id: conv.prospect_url || `conv-${conv.prospect_name}`,
                        last_message_by: conv.messages.length ? conv.messages[conv.messages.length - 1].sender : 'unknown',
                        last_message_at: conv.messages.length ? conv.messages[conv.messages.length - 1].timestamp : new Date().toISOString()
                    })
                    .select()
                    .single();

                if (conversationError) throw conversationError;

                // Insert messages (only new ones due to unique constraint)
                for (const msg of conv.messages) {
                    await supabase
                        .from('messages')
                        .insert({
                            conversation_id: conversation.id,
                            sender: msg.sender,
                            content: msg.content,
                            timestamp: msg.timestamp || new Date().toISOString()
                        })
                        .select();
                }

                saved++;
                if (saved % 10 === 0) {
                    console.log(`💾 Saved ${saved}/${allData.length} conversations...`);
                }
            } catch (e) {
                console.log(`⚠️ Error saving ${conv.prospect_name}:`, e.message);
            }
        }

        console.log(`🎉 Upload complete! Saved ${saved}/${allData.length} conversations`);
        return { scraped: allData.length, saved };

    } catch (error) {
        console.error('❌ Fatal error:', error);
        throw error;
    }
}

module.exports = { scrapeLinkedIn };

// Run directly if called as script
if (require.main === module) {
    scrapeLinkedIn()
        .then(console.log)
        .catch(console.error);
}

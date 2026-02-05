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

async function scrapeLinkedIn(forceFullScrape = false) {
    // === SMART CHECK: Query Supabase for latest message timestamp ===
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: latestConv } = await supabase
        .from('conversations')
        .select('last_message_at')
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();
    
    const lastKnownTimestamp = latestConv?.last_message_at ? new Date(latestConv.last_message_at) : null;
    const totalConvsInDB = await supabase.from('conversations').select('id', { count: 'exact', head: true });
    const dbCount = totalConvsInDB.count || 0;
    
    console.log(`📊 DB status: ${dbCount} conversations, last message: ${lastKnownTimestamp ? lastKnownTimestamp.toLocaleString('fr-FR') : 'never'}`);

    let browser, context, page;
    let existingConvIds = new Set();
    
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

        // === SMART SCRAPE: Only check first page for new messages ===
        console.log('📜 Quick check: scanning visible conversations...');
        await page.waitForTimeout(3000);

        // Get first page of conversations (no scrolling = fast)
        const firstPageConvs = await page.$$('.msg-conversation-listitem');
        console.log(`� Visible conversations: ${firstPageConvs.length}`);

        // Quick check: extract timestamps from visible conversations to detect new messages
        const visibleConvData = await page.evaluate(() => {
            const items = document.querySelectorAll('.msg-conversation-listitem');
            return Array.from(items).map(item => {
                const nameEl = item.querySelector('.msg-conversation-listitem__participant-names');
                const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp') || item.querySelector('time');
                const unreadEl = item.querySelector('.msg-conversation-listitem__unread-count') || item.querySelector('.notification-badge');
                return {
                    name: nameEl?.textContent?.trim() || '',
                    time: timeEl?.textContent?.trim() || timeEl?.getAttribute('datetime') || '',
                    hasUnread: !!unreadEl || item.classList.contains('msg-conversation-listitem--unread')
                };
            });
        });

        const unreadCount = visibleConvData.filter(c => c.hasUnread).length;
        console.log(`📬 Unread conversations: ${unreadCount} / ${visibleConvData.length}`);

        // If no unread and DB already has data, skip full scrape
        if (!forceFullScrape && unreadCount === 0 && dbCount > 0) {
            console.log('✅ No new messages detected — skipping full scrape');
            await browser.close();
            return { scraped: 0, saved: 0, skipped: true, reason: 'no_new_messages' };
        }

        // Only scrape conversations with unread messages (or all if first time / forced)
        const shouldScrapeAll = forceFullScrape || dbCount === 0;
        let maxConversations;
        
        if (shouldScrapeAll) {
            // First time or forced: scroll to load more (but cap at 100 to avoid timeout)
            console.log('📜 Full scrape mode: loading more conversations...');
            let previousCount = 0;
            let currentCount = firstPageConvs.length;
            let scrollAttempts = 0;
            const maxScrollAttempts = 15; // Cap at ~15 scrolls instead of 50

            while (currentCount > previousCount && scrollAttempts < maxScrollAttempts) {
                previousCount = currentCount;
                await page.evaluate(() => {
                    const convList = document.querySelector('.msg-conversations-container__conversations-list');
                    if (convList) convList.scrollTop = convList.scrollHeight;
                });
                await page.waitForTimeout(2000);
                const convs = await page.$$('.msg-conversation-listitem');
                currentCount = convs.length;
                scrollAttempts++;
                console.log(`📊 Loaded ${currentCount} conversations (scroll ${scrollAttempts}/${maxScrollAttempts})`);
            }
            maxConversations = currentCount;
        } else {
            // Smart mode: only scrape first page (unread messages are always at top)
            maxConversations = Math.min(firstPageConvs.length, 40);
            console.log(`⚡ Smart mode: checking top ${maxConversations} conversations for new messages`);
        }

        const conversationElements = await page.$$('.msg-conversation-listitem');
        const allData = [];
        const TEST_MODE = process.env.TEST_MODE === 'true';
        if (TEST_MODE) maxConversations = 1;

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

                // Scrape LinkedIn profile for enrichment (skip by default to avoid timeouts)
                let profileData = {
                    job_title: null,
                    company: null,
                    location: null,
                    sector: null
                };

                const ENRICH_PROFILES = process.env.ENRICH_PROFILES === 'true';
                if (ENRICH_PROFILES && prospectUrl && prospectUrl.includes('linkedin.com')) {
                    try {
                        console.log(`   📋 Enriching profile: ${prospectName}...`);
                        await page.goto(prospectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);

                        // Get job title
                        const titleEl = await page.$('.text-body-medium.break-words');
                        if (titleEl) profileData.job_title = await titleEl.innerText();

                        // Get company
                        const companyEl = await page.$('.inline-show-more-text--is-collapsed-with-line-clamp span[aria-hidden="true"]');
                        if (companyEl) profileData.company = await companyEl.innerText();

                        // Get location
                        const locationEl = await page.$('.text-body-small.inline.t-black--light.break-words');
                        if (locationEl) profileData.location = await locationEl.innerText();

                        console.log(`   ✅ Profile enriched: ${profileData.job_title || 'N/A'} @ ${profileData.company || 'N/A'}`);

                        // Go back to messages
                        await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);
                        
                        // Re-click conversation
                        const convItems2 = await page.$$('.msg-conversation-listitem');
                        await convItems2[i].click();
                        await page.waitForTimeout(2000);
                    } catch (e) {
                        console.log(`   ⚠️ Profile enrichment failed: ${e.message}`);
                    }
                }

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

                // Skip deduplication check for now (will be done during upload)
                // const convId = prospectUrl || `conv-${prospectName.trim()}`;
                // if (existingConvIds.has(convId)) {
                //     console.log(`⏭️  Skipped ${i + 1}/${maxConversations}: ${prospectName} (already in database)`);
                //     continue;
                // }

                allData.push({
                    prospect_name: prospectName.trim(),
                    prospect_url: prospectUrl,
                    messages,
                    profile_data: profileData
                });

                console.log(`✅ Scraped ${i + 1}/${maxConversations}: ${prospectName} (${messages.length} messages)`);

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
                const prospectData = {
                    linkedin_url: conv.prospect_url || `https://linkedin.com/unknown/${conv.prospect_name.replace(/\s+/g, '-')}`,
                    name: conv.prospect_name
                };
                // Add profile data if available
                if (conv.profile_data) {
                    if (conv.profile_data.job_title) prospectData.job_title = conv.profile_data.job_title;
                    if (conv.profile_data.company) prospectData.company = conv.profile_data.company;
                    if (conv.profile_data.location) prospectData.location = conv.profile_data.location;
                    if (conv.profile_data.sector) prospectData.sector = conv.profile_data.sector;
                }

                const { data: prospect, error: prospectError } = await supabase
                    .from('prospects')
                    .upsert(prospectData, { onConflict: 'linkedin_url', ignoreDuplicates: false })
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

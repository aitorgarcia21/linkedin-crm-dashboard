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

        // === SMART SCRAPE: Quick check for unread messages ===
        console.log('📜 Quick check: scanning visible conversations...');
        await page.waitForTimeout(3000);

        // Scan first page — unread conversations are always at the top on LinkedIn
        const visibleConvData = await page.evaluate(() => {
            const items = document.querySelectorAll('.msg-conversation-listitem');
            return Array.from(items).map((item, idx) => {
                const nameEl = item.querySelector('.msg-conversation-listitem__participant-names');
                const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp') || item.querySelector('time');
                const unreadEl = item.querySelector('.msg-conversation-listitem__unread-count') || item.querySelector('.notification-badge');
                return {
                    index: idx,
                    name: nameEl?.textContent?.trim() || '',
                    time: timeEl?.textContent?.trim() || timeEl?.getAttribute('datetime') || '',
                    hasUnread: !!unreadEl || item.classList.contains('msg-conversation-listitem--unread')
                };
            });
        });

        const unreadConvs = visibleConvData.filter(c => c.hasUnread);
        const totalVisible = visibleConvData.length;
        console.log(`� Visible: ${totalVisible} | �📬 Unread: ${unreadConvs.length}`);

        if (unreadConvs.length > 0) {
            console.log('📬 Unread conversations:');
            unreadConvs.forEach(c => console.log(`   → ${c.name} (${c.time})`));
        }

        // If no unread and DB already has data → nothing to do
        if (!forceFullScrape && unreadConvs.length === 0 && dbCount > 0) {
            console.log('✅ No new messages — nothing to scrape');
            await browser.close();
            return { scraped: 0, saved: 0, skipped: true, reason: 'no_new_messages' };
        }

        // === GET EXISTING TIMESTAMPS FROM DB to only fetch NEW messages ===
        const { data: existingConvs } = await supabase
            .from('conversations')
            .select('id, linkedin_conversation_id, last_message_at, prospects(name, linkedin_url)')
            .order('last_message_at', { ascending: false });
        
        // Build lookup: linkedin_url → { conv_id, last_message_at }
        const dbLookup = {};
        (existingConvs || []).forEach(c => {
            const url = c.linkedin_conversation_id || c.prospects?.linkedin_url;
            if (url) {
                dbLookup[url] = {
                    conv_id: c.id,
                    last_message_at: c.last_message_at ? new Date(c.last_message_at) : null
                };
            }
            // Also index by name for fallback matching
            if (c.prospects?.name) {
                dbLookup[`name:${c.prospects.name.trim().toLowerCase()}`] = {
                    conv_id: c.id,
                    last_message_at: c.last_message_at ? new Date(c.last_message_at) : null
                };
            }
        });

        // === DETERMINE WHICH CONVERSATIONS TO SCRAPE ===
        let indicesToScrape = [];
        
        if (forceFullScrape || dbCount === 0) {
            // Full scrape: scroll to load more, then scrape all
            console.log('📜 Full scrape mode: loading conversations...');
            let previousCount = 0;
            let currentCount = totalVisible;
            let scrollAttempts = 0;
            const maxScrollAttempts = 15;

            while (currentCount > previousCount && scrollAttempts < maxScrollAttempts) {
                previousCount = currentCount;
                await page.evaluate(() => {
                    const convList = document.querySelector('.msg-conversations-container__conversations-list');
                    if (convList) convList.scrollTop = convList.scrollHeight;
                });
                await page.waitForTimeout(2000);
                currentCount = (await page.$$('.msg-conversation-listitem')).length;
                scrollAttempts++;
                console.log(`📊 Loaded ${currentCount} conversations (scroll ${scrollAttempts}/${maxScrollAttempts})`);
            }
            // Scrape all loaded conversations
            for (let i = 0; i < currentCount; i++) indicesToScrape.push(i);
        } else {
            // Smart mode: ONLY scrape unread conversations
            indicesToScrape = unreadConvs.map(c => c.index);
            console.log(`⚡ Smart mode: scraping ONLY ${indicesToScrape.length} unread conversations`);
        }

        const TEST_MODE = process.env.TEST_MODE === 'true';
        if (TEST_MODE) indicesToScrape = indicesToScrape.slice(0, 1);

        const allData = [];

        for (let idx = 0; idx < indicesToScrape.length; idx++) {
            const i = indicesToScrape[idx];
            try {
                // Click conversation
                const convItems = await page.$$('.msg-conversation-listitem');
                if (i >= convItems.length) continue;
                await convItems[i].click();
                await page.waitForTimeout(2000);

                // Get prospect name
                const nameEl = await page.$('.msg-entity-lockup__entity-title');
                const prospectName = nameEl ? await nameEl.innerText() : 'Unknown';

                // Get profile URL
                const linkEl = await page.$('.msg-entity-lockup__entity-title a');
                const prospectUrl = linkEl ? await linkEl.getAttribute('href') : '';

                // Find last known timestamp for this conversation
                const convKey = prospectUrl || `conv-${prospectName.trim()}`;
                const nameKey = `name:${prospectName.trim().toLowerCase()}`;
                const dbEntry = dbLookup[convKey] || dbLookup[nameKey];
                const lastKnownMsgTime = dbEntry?.last_message_at || null;

                // Profile enrichment (skip by default)
                let profileData = { job_title: null, company: null, location: null, sector: null };
                const ENRICH_PROFILES = process.env.ENRICH_PROFILES === 'true';
                if (ENRICH_PROFILES && prospectUrl && prospectUrl.includes('linkedin.com')) {
                    try {
                        console.log(`   📋 Enriching profile: ${prospectName}...`);
                        await page.goto(prospectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);
                        const titleEl = await page.$('.text-body-medium.break-words');
                        if (titleEl) profileData.job_title = await titleEl.innerText();
                        const companyEl = await page.$('.inline-show-more-text--is-collapsed-with-line-clamp span[aria-hidden="true"]');
                        if (companyEl) profileData.company = await companyEl.innerText();
                        const locationEl = await page.$('.text-body-small.inline.t-black--light.break-words');
                        if (locationEl) profileData.location = await locationEl.innerText();
                        console.log(`   ✅ Profile enriched: ${profileData.job_title || 'N/A'} @ ${profileData.company || 'N/A'}`);
                        await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);
                        const convItems2 = await page.$$('.msg-conversation-listitem');
                        await convItems2[i].click();
                        await page.waitForTimeout(2000);
                    } catch (e) {
                        console.log(`   ⚠️ Profile enrichment failed: ${e.message}`);
                    }
                }

                // Get messages — only scroll if no DB entry (new conversation)
                if (!dbEntry) {
                    await page.evaluate(() => {
                        const msgList = document.querySelector('.msg-s-message-list-container');
                        if (msgList) msgList.scrollTop = 0;
                    });
                    await page.waitForTimeout(2000);
                }

                // Extract messages
                const messageEls = await page.$$('.msg-s-event-listitem');
                const messages = [];
                let newMsgCount = 0;

                for (const msgEl of messageEls) {
                    const isSelf = await msgEl.$('.msg-s-message-list__event--from-self');
                    const sender = isSelf ? 'me' : 'them';
                    const contentEl = await msgEl.$('.msg-s-event-listitem__body');
                    const content = contentEl ? await contentEl.innerText() : '';
                    const timeEl = await msgEl.$('time');
                    const timestamp = timeEl ? await timeEl.getAttribute('datetime') : new Date().toISOString();

                    if (!content.trim()) continue;

                    // SMART FILTER: Only keep messages AFTER last known timestamp
                    if (lastKnownMsgTime && timestamp) {
                        const msgTime = new Date(timestamp);
                        if (msgTime <= lastKnownMsgTime) continue; // Skip old messages
                    }

                    messages.push({ sender, content: content.trim(), timestamp });
                    newMsgCount++;
                }

                // Skip if no new messages found
                if (messages.length === 0 && dbEntry) {
                    console.log(`⏭️  ${idx + 1}/${indicesToScrape.length}: ${prospectName} — no new messages`);
                    continue;
                }

                allData.push({
                    prospect_name: prospectName.trim(),
                    prospect_url: prospectUrl,
                    messages,
                    profile_data: profileData,
                    is_update: !!dbEntry, // Flag: updating existing conversation
                    existing_conv_id: dbEntry?.conv_id
                });

                console.log(`✅ ${idx + 1}/${indicesToScrape.length}: ${prospectName} — ${newMsgCount} NEW messages`);

            } catch (e) {
                console.log(`⚠️ Error on conversation ${idx + 1}:`, e.message);
            }
        }

        console.log(`\n📊 Conversations with new messages: ${allData.length}`);

        // Close browser
        await browser.close();
        console.log('🔒 Browser closed');

        // Save to JSON file
        const dataFile = path.join(__dirname, 'scraped-data.json');
        fs.writeFileSync(dataFile, JSON.stringify(allData, null, 2));
        console.log(`💾 Saved ${allData.length} conversations to ${dataFile}`);

        // Upload to Supabase
        console.log('📤 Uploading new messages to Supabase...');
        let saved = 0;
        let newMessages = 0;

        for (const conv of allData) {
            try {
                let conversationId;

                if (conv.is_update && conv.existing_conv_id) {
                    // === EXISTING CONVERSATION: just add new messages ===
                    conversationId = conv.existing_conv_id;
                    
                    // Update conversation metadata
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    await supabase.from('conversations').update({
                        last_message_by: lastMsg.sender,
                        last_message_at: lastMsg.timestamp,
                        updated_at: new Date().toISOString()
                    }).eq('id', conversationId);

                    console.log(`   📝 Updating existing conversation: ${conv.prospect_name}`);
                } else {
                    // === NEW CONVERSATION: create prospect + conversation ===
                    const prospectData = {
                        linkedin_url: conv.prospect_url || `https://linkedin.com/unknown/${conv.prospect_name.replace(/\s+/g, '-')}`,
                        name: conv.prospect_name
                    };
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

                    conversationId = conversation.id;
                    console.log(`   🆕 New conversation: ${conv.prospect_name}`);
                }

                // Insert ONLY new messages
                for (const msg of conv.messages) {
                    const { error: msgError } = await supabase
                        .from('messages')
                        .insert({
                            conversation_id: conversationId,
                            sender: msg.sender,
                            content: msg.content,
                            timestamp: msg.timestamp || new Date().toISOString()
                        });
                    if (!msgError) newMessages++;
                }

                saved++;
            } catch (e) {
                console.log(`⚠️ Error saving ${conv.prospect_name}:`, e.message);
            }
        }

        console.log(`🎉 Done! ${saved} conversations updated, ${newMessages} new messages saved`);
        return { scraped: allData.length, saved, newMessages, skipped: false };

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

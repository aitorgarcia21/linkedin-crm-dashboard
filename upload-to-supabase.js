const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://igyxcobujacampiqndpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneXhjb2J1amFjYW1waXFuZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDYxMTUsImV4cCI6MjA4NTUyMjExNX0.8jgz6G0Irj6sRclcBKzYE5VzzXNrxzHgrAz45tHfHpc';

async function uploadToSupabase() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Read scraped data
    const dataFile = path.join(__dirname, 'scraped-data.json');
    if (!fs.existsSync(dataFile)) {
        console.log('❌ No scraped-data.json found');
        process.exit(1);
    }
    
    const allData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log(`📂 Loaded ${allData.length} conversations from file`);
    
    let saved = 0;
    
    for (const conv of allData) {
        try {
            // Upsert prospect
            const { data: prospect, error: prospectError } = await supabase
                .from('prospects')
                .upsert({
                    linkedin_url: conv.prospect_url,
                    name: conv.prospect_name
                }, { onConflict: 'linkedin_url' })
                .select()
                .single();

            if (prospectError) {
                console.log(`⚠️ Error upserting prospect ${conv.prospect_name}:`, prospectError.message);
                continue;
            }

            // Upsert conversation
            const { data: conversation, error: conversationError } = await supabase
                .from('conversations')
                .upsert({
                    prospect_id: prospect.id,
                    linkedin_conversation_id: conv.prospect_url,
                    last_message_by: conv.messages.length ? conv.messages[conv.messages.length - 1].sender : 'unknown',
                    last_message_at: conv.messages.length ? conv.messages[conv.messages.length - 1].timestamp : new Date().toISOString()
                }, { onConflict: 'linkedin_conversation_id' })
                .select()
                .single();

            if (conversationError) {
                console.log(`⚠️ Error upserting conversation ${conv.prospect_name}:`, conversationError.message);
                continue;
            }

            // Insert messages
            for (const msg of conv.messages) {
                await supabase
                    .from('messages')
                    .upsert({
                        conversation_id: conversation.id,
                        sender: msg.sender,
                        content: msg.content,
                        timestamp: msg.timestamp
                    }, { onConflict: 'conversation_id,content,timestamp' });
            }

            saved++;
            console.log(`✅ Saved ${saved}/${allData.length}: ${conv.prospect_name}`);
        } catch (e) {
            console.log(`⚠️ Error saving ${conv.prospect_name}:`, e.message);
        }
    }

    console.log(`🎉 Upload complete! Saved ${saved}/${allData.length} conversations`);
}

uploadToSupabase().catch(console.error);

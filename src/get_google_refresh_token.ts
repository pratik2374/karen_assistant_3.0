import 'dotenv/config';
import { google } from 'googleapis';
import * as readline from 'node:readline';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ ERROR: Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env first!');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'http://localhost:3000'
);

// Request BOTH Drive and Calendar scopes for unified authentication
const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', 
  scope: scopes,
  prompt: 'consent' 
});

console.log('=== KAREN UNIFIED GOOGLE OAUTH AUTHORIZATION ===\n');
console.log('1. Click or copy this URL into your browser to authorize BOTH Google Drive & Google Calendar:');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n2. Complete authorization, then copy the "code" query parameter from the localhost address bar.');
console.log('   Example URL: http://localhost:3000/?code=4/0AdQt8qi...&scope=...\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    console.log('\nExchanging authorization code for permanent unified tokens...');
    const { tokens } = await oauth2Client.getToken(code.trim());
    
    console.log('\n=== UNIFIED GOOGLE OAUTH SUCCESS ===');
    console.log('\x1b[32m✓ Permanent Unified Tokens Retrieved!\x1b[0m');
    console.log('\nCopy and paste this into your .env file (replacing your old token):');
    console.log('\x1b[33m%s\x1b[0m', `GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log('\n=============================');
  } catch (err: any) {
    console.error('\n❌ ERROR: Failed to exchange authorization code:', err.message);
  }
});

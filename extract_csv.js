const fs = require('fs');
const path = require('path');

const appDataDir = process.env.USERPROFILE + '\\.gemini\\antigravity';
const transcriptPath = path.join(appDataDir, 'brain', '8ab2a4d5-e49e-4e94-9dae-a99982185db7', '.system_generated', 'logs', 'transcript_full.jsonl');

if (!fs.existsSync(transcriptPath)) {
  console.error("Transcript file not found at:", transcriptPath);
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
let csvText = '';

for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const json = JSON.parse(lines[i]);
    if (json.type === 'USER_INPUT' && json.content && json.content.includes('Phone Number')) {
      const match = json.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (match) {
        csvText = match[1].trim();
        break;
      }
    }
  } catch (e) {}
}

if (csvText) {
  const target = path.join(__dirname, 'botbiz_subscribers.csv');
  fs.writeFileSync(target, csvText, 'utf8');
  console.log('✅ Saved botbiz_subscribers.csv from transcript_full! Total length:', csvText.length);
} else {
  console.error('❌ CSV text not found in transcript_full!');
}

import {
  fetchDesktopSystemInfo,
  getDesktopBridgeToken,
  listDesktopFiles,
  listUsbDrives,
  openChromeNewTab,
  openDesktopLocation,
  runDesktopApp,
  searchInChrome,
} from './desktopBridge';
import { detectUsbTransferIntent } from './usbTransfer';

export async function executeDesktopCommand(
  raw: string
): Promise<{ reply: string; emotion: 'happy' } | null> {
  // Only intercept laptop commands when desktop companion is paired
  if (!getDesktopBridgeToken()) return null;

  const usbIntent = detectUsbTransferIntent(raw);
  if (usbIntent) {
    if (usbIntent.action === 'check_status') {
      const drives = await listUsbDrives();
      return {
        reply:
          drives.length > 0
            ? `Connected USB drives: ${drives.map((d) => `${d.label} (${d.path})`).join(', ')}`
            : 'Abhi laptop par koi removable USB drive detect nahi hui.',
        emotion: 'happy',
      };
    }
    return null;
  }

  const urduWords: Record<string, string> = {
    'کروم': 'chrome', 'گوگل': 'google', 'کھولو': 'kholo', 'کھولیں': 'kholo',
    'نیا': 'naya', 'ٹیب': 'tab', 'کا': 'ka', 'کے': 'ke', 'میں': 'mein',
    'پر': 'par', 'پہ': 'pe', 'تلاش': 'search', 'سرچ': 'search',
    'یوٹیوب': 'youtube', 'جی میل': 'gmail', 'فیس بک': 'facebook',
    'واٹس ایپ': 'whatsapp', 'نوٹ پیڈ': 'notepad', 'کیلکولیٹر': 'calculator',
    'ایج': 'edge', 'گٹ ہب': 'github', 'چیٹ جی پی ٹی': 'chatgpt',
    'فائل ایکسپلورر': 'file explorer', 'ڈاؤن لوڈز': 'downloads',
    'ڈیسک ٹاپ': 'desktop', 'دستاویزات': 'documents', 'ٹاسک مینیجر': 'task manager',
    'ٹرمینل': 'terminal', 'فائلز': 'files', 'دکھاؤ': 'dikhao',
  };
  const translated = raw
    .trim()
    .toLowerCase()
    .replace(/[!?.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(
      /کروم|گوگل|کھولو|کھولیں|نیا|ٹیب|کا|کے|میں|پر|پہ|تلاش|سرچ|یوٹیوب|جی میل|فیس بک|واٹس ایپ|نوٹ پیڈ|کیلکولیٹر|ایج|گٹ ہب|چیٹ جی پی ٹی|ٹرمینل|فائلز|دکھاؤ/g,
      (word) => urduWords[word] || word
    );
  const command = translated.replace(/\s+/g, ' ').trim();

  if (/\b(system info|laptop info|ram check|laptop status|pc status)\b/i.test(command)) {
    const info = await fetchDesktopSystemInfo();
    return {
      reply: `Laptop (${info.hostname} · ${info.platform}): ${info.cpuCount} CPUs, ${info.freeMemoryGb} GB free / ${info.totalMemoryGb} GB total RAM, uptime ${info.uptimeMinutes} mins.`,
      emotion: 'happy',
    };
  }

  const listMatch = command.match(
    /(desktop|downloads|documents|pictures|music|videos|home)(?: folder)? (?:files|dikhao|list)/
  );
  if (listMatch) {
    const folder = listMatch[1];
    const listing = await listDesktopFiles(folder);
    const names = listing.entries
      .slice(0, 12)
      .map((e) => `${e.type === 'dir' ? '[Folder]' : '[File]'} ${e.name}`)
      .join(', ');
    return {
      reply: names
        ? `Aap ke ${folder} folder mein yeh files hain: ${names}`
        : `Aap ka ${folder} folder khali hai.`,
      emotion: 'happy',
    };
  }

  const folderCommand = command.match(
    /^(desktop|downloads|documents|pictures|music|videos|home)(?: folder)? (?:kholo|open(?: karo)?)$/
  );
  if (folderCommand) {
    const folder = folderCommand[1];
    await openDesktopLocation(folder);
    return { reply: `Ji, aap ka ${folder} folder khol diya hai.`, emotion: 'happy' };
  }

  const newTab = /^(?:(?:google )?chrome(?: (?:mein|ka|ke))? )?(?:new|naya) tab(?: (?:kholo|open(?: karo)?))?$/.test(
    command
  );
  if (newTab) {
    await openChromeNewTab();
    return { reply: 'Ji, Chrome mein naya tab khol diya hai.', emotion: 'happy' };
  }

  const search = command.match(
    /^(?:google|chrome)(?: (?:par|pe|mein))? (.+?) (?:search|dhundo|dhoondo)(?: karo)?$/
  );
  if (search) {
    await searchInChrome(search[1]);
    return { reply: `Ji, Chrome mein ${search[1]} search kar rahi hoon.`, emotion: 'happy' };
  }

  const siteCommand = command.match(/^(?:please )?(.+?) (?:kholo|open(?: karo)?)$/);
  if (siteCommand) {
    const site = siteCommand[1].replace(/^(?:google )?chrome (?:mein|par|pe) /, '').trim();
    const sites: Record<string, string> = {
      youtube: 'https://www.youtube.com',
      google: 'https://www.google.com',
      gmail: 'https://mail.google.com',
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://web.whatsapp.com',
      github: 'https://github.com',
      chatgpt: 'https://chatgpt.com',
    };
    const url =
      sites[site] ||
      (/^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/.test(site)
        ? site.startsWith('http')
          ? site
          : `https://${site}`
        : null);
    if (url) {
      await openChromeNewTab(url);
      return { reply: `Ji, ${site} Chrome mein khol diya hai.`, emotion: 'happy' };
    }
  }

  const app = command.match(
    /^(?:please )?(chrome|edge|vs\s?code|vscode|terminal|cmd|notepad|calculator|file explorer|explorer|task manager|settings)(?: (?:kholo|open(?: karo)?|launch(?: karo)?))?$/i
  );
  if (app) {
    const aliases: Record<string, string> = {
      'file explorer': 'explorer',
      explorer: 'explorer',
      'task manager': 'task-manager',
      'vs code': 'vscode',
      cmd: 'terminal',
    };
    const appId = aliases[app[1].toLowerCase()] || app[1].toLowerCase();
    await runDesktopApp(appId);
    return { reply: `${app[1]} launch kar diya hai.`, emotion: 'happy' };
  }
  return null;
}

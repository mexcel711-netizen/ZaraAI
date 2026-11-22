import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemoryVaultPayload,
  detectUsbTransferIntent,
  formatMemoryVaultMarkdown,
  isPathSafelyInsideRoot,
} from './usbTransfer';
import { buildLocalConversationalReply } from './localBrain';
import type { AppConfig, MemoryRecord } from '../types/nova';

test('isPathSafelyInsideRoot prevents sibling prefix bypass and path traversal', () => {
  assert.equal(isPathSafelyInsideRoot('/home/ali/Downloads', '/home/ali', '/'), true);
  assert.equal(isPathSafelyInsideRoot('/home/ali', '/home/ali', '/'), true);
  assert.equal(isPathSafelyInsideRoot('/home/alice/secret', '/home/ali', '/'), false);
  assert.equal(isPathSafelyInsideRoot('/etc/passwd', '/home/ali', '/'), false);
  assert.equal(isPathSafelyInsideRoot('E:\\NOVA-Memory-Backup', 'E:\\', '\\'), true);
  assert.equal(isPathSafelyInsideRoot('D:\\Other', 'E:\\', '\\'), false);
});

test('detectUsbTransferIntent parses manual, auto-on, auto-off, and check commands across languages', () => {
  assert.equal(detectUsbTransferIntent('یو ایس بی میں ٹرانسفر کر دو')?.action, 'transfer_now');
  assert.equal(detectUsbTransferIntent('USB mein backup save kar do')?.action, 'transfer_now');
  assert.equal(detectUsbTransferIntent('transfer my memory to USB E:')?.driveHint, 'E:');

  assert.equal(detectUsbTransferIntent('خود بخود یو ایس بی میں ٹرانسفر کر دے')?.action, 'enable_auto');
  assert.equal(detectUsbTransferIntent('khud bakhud USB mein transfer kar do')?.action, 'enable_auto');
  assert.equal(detectUsbTransferIntent('enable auto sync to USB')?.action, 'enable_auto');

  assert.equal(detectUsbTransferIntent('auto USB sync band karo')?.action, 'disable_auto');
  assert.equal(detectUsbTransferIntent('check connected USB drives')?.action, 'check_status');
  assert.equal(detectUsbTransferIntent('aaj mausam kaisa hai?'), null);
});

test('buildMemoryVaultPayload and formatMemoryVaultMarkdown preserve recorded memories & notes', () => {
  const memories: MemoryRecord[] = [
    {
      id: 1,
      category: 'fact',
      key: 'user_name',
      value: "User's name is Ali",
      source: 'user_stated',
      confidence: 1,
      created_at: '2026-11-21T00:00:00Z',
      updated_at: '2026-11-21T00:00:00Z',
    },
  ];
  const vault = buildMemoryVaultPayload({
    config: { assistant_name: 'ZARA', user_name: 'Ali' },
    memories,
    notes: [
      {
        id: 1,
        title: 'Sprint Plan',
        content: 'Ship USB memory sync',
        tags: ['work'],
        created_at: '2026-11-21T00:00:00Z',
        updated_at: '2026-11-21T00:00:00Z',
      },
    ],
    reminders: [],
    knowledge: [],
    characters: [],
    sessions: [],
    recentConversations: [
      {
        session_id: 's1',
        role: 'user',
        content: 'Mera naam Ali hai',
        language: 'ur',
        timestamp: '2026-11-21T00:00:00Z',
      },
    ],
  });

  const md = formatMemoryVaultMarkdown(vault);
  assert.equal(vault.memories.length, 1);
  assert.ok(md.includes('ZARA Memory Vault Backup'));
  assert.ok(md.includes("User's name is Ali"));
  assert.ok(md.includes('Ship USB memory sync'));
});

test('buildLocalConversationalReply replies warmly offline using recorded memories', () => {
  const cfg = {
    assistant_name: 'ZARA',
    user_name: 'Ali',
    user_nickname: 'Ali',
    language: 'bilingual',
  } as AppConfig;

  const recall = buildLocalConversationalReply({
    userMessage: 'mere baare mein kya yaad hai?',
    config: cfg,
    memories: [
      {
        id: 1,
        category: 'fact',
        key: 'user_name',
        value: "User's name is Ali",
        source: 'user_stated',
        confidence: 1,
        created_at: '2026-11-21T00:00:00Z',
        updated_at: '2026-11-21T00:00:00Z',
      },
    ],
    notes: [],
    reminders: [],
    knowledge: [],
    extractedMemoriesCount: 0,
  });

  assert.equal(recall.language, 'ur');
  assert.ok(recall.reply.includes("User's name is Ali"));
});

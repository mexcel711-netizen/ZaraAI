import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSecMsGecPayload, generateSecMsGec } from './edgeTtsSecurity';

test('Sec-MS-GEC v2 matches the Microsoft Edge reference hashes', async () => {
  assert.equal(
    await hashSecMsGecPayload('1234567'),
    'CF8264F204E37578-4B4B1B27BCB09F84AE904B387373DA006A64E1B4EFCC1BAF1D6F289D44E6DAC8',
  );
  assert.equal(
    await hashSecMsGecPayload('12345678'),
    'FF68734F9C22A4D6-F7CC197E8281C6E3B1AE9BC5214DFF71C9E86469BCFAA2DABD23507CDA13FC63',
  );
  assert.equal(
    await hashSecMsGecPayload('x'.repeat(55)),
    '996577B3641023D6-05A53DDF994DCE366C6ED80548479F12ECF745F579F815913817D28CBE6E34FE',
  );
});

test('Sec-MS-GEC v2 rounds generated tokens to five-minute windows', async () => {
  const trusted = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const expected =
    '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2';
  assert.equal(await generateSecMsGec(trusted, 1700000000), expected);
  assert.equal(await generateSecMsGec(trusted, 1700000099.9), expected);
  assert.notEqual(
    await generateSecMsGec(trusted, 1700000100),
    expected,
  );
});

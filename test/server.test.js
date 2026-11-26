const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAppServer, normalizePhone } = require('../server');

describe('Phone Bill App API', () => {
  let server;
  let baseUrl;
  let tmpDir;
  let dbPath;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-bill-test-'));
    dbPath = path.join(tmpDir, 'db.json');
    server = createAppServer({ dbPath, adminPassword: 'test-password' });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normalizes phone numbers with dashes or spaces', () => {
    assert.equal(normalizePhone('081-234-5678'), '0812345678');
    assert.equal(normalizePhone(' 089 876 5432 '), '0898765432');
  });

  it('returns outstanding debt, unpaid months, and paid months for a user', async () => {
    const res = await fetch(`${baseUrl}/api/user/bills?phone=081-234-5678`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.subscriber.phone, '0812345678');
    assert.equal(data.totalOutstanding, 1241); // 642 + 599
    assert.equal(data.unpaidCount, 2);
    assert.equal(data.paidCount, 2);
    assert.deepEqual(
      data.unpaidBills.map((b) => b.monthLabel),
      ['ตุลาคม 2569', 'กันยายน 2569']
    );
    assert.deepEqual(
      data.paidBills.map((b) => b.monthLabel),
      ['สิงหาคม 2569', 'กรกฎาคม 2569']
    );
  });

  it('returns 404 for unknown phone number', async () => {
    const res = await fetch(`${baseUrl}/api/user/bills?phone=0999999999`);
    assert.equal(res.status, 404);
  });

  it('requires admin auth and supports full admin workflow', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(unauthRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' })
    });
    assert.equal(loginRes.status, 200);
    const { token } = await loginRes.json();
    assert.ok(token);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // Add subscriber
    const subRes = await fetch(`${baseUrl}/api/admin/subscribers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: '085-555-6666', name: 'ทดสอบ ระบบ', plan: '5G 499' })
    });
    assert.equal(subRes.status, 201);

    // Create unpaid bill
    const billRes = await fetch(`${baseUrl}/api/admin/bills`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: '0855556666',
        month: 11,
        year: 2569,
        amount: 499,
        status: 'unpaid',
        note: 'รอบบิลใหม่'
      })
    });
    assert.equal(billRes.status, 201);
    const { bill } = await billRes.json();
    assert.equal(bill.monthLabel, 'พฤศจิกายน 2569');

    // Verify user sees the new unpaid bill
    const userRes1 = await fetch(`${baseUrl}/api/user/bills?phone=0855556666`);
    const userData1 = await userRes1.json();
    assert.equal(userData1.totalOutstanding, 499);
    assert.equal(userData1.unpaidCount, 1);

    // Admin marks bill as paid
    const patchRes = await fetch(`${baseUrl}/api/admin/bills/${bill.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'paid' })
    });
    assert.equal(patchRes.status, 200);

    // Verify user now sees 0 outstanding and 1 paid bill
    const userRes2 = await fetch(`${baseUrl}/api/user/bills?phone=0855556666`);
    const userData2 = await userRes2.json();
    assert.equal(userData2.totalOutstanding, 0);
    assert.equal(userData2.paidCount, 1);

    // Delete bill
    const delRes = await fetch(`${baseUrl}/api/admin/bills/${bill.id}`, {
      method: 'DELETE',
      headers
    });
    assert.equal(delRes.status, 200);
  });
});

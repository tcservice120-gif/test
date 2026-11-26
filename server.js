const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const activeTokens = new Set();

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function getDefaultData() {
  return {
    subscribers: [
      { phone: '0812345678', name: 'สมชาย ใจดี', plan: '5G Max Speed 599' },
      { phone: '0898765432', name: 'สมหญิง รักสงบ', plan: 'Smart Net 399' },
      { phone: '0623456789', name: 'วิชัย มั่งมี', plan: 'Unlimited Pro 899' },
      { phone: '0911112222', name: 'นภา สดใส', plan: 'Starter 299' }
    ],
    bills: [
      { id: 'b-101', phone: '0812345678', month: 7, year: 2569, amount: 599, dueDate: '2026-08-05', status: 'paid', paidAt: '2026-08-03', note: 'ชำระผ่าน Mobile Banking' },
      { id: 'b-102', phone: '0812345678', month: 8, year: 2569, amount: 599, dueDate: '2026-09-05', status: 'paid', paidAt: '2026-09-04', note: 'ชำระผ่าน Mobile Banking' },
      { id: 'b-103', phone: '0812345678', month: 9, year: 2569, amount: 642, dueDate: '2026-10-05', status: 'unpaid', paidAt: null, note: 'รวมค่าโทรส่วนเกิน 43 บาท' },
      { id: 'b-104', phone: '0812345678', month: 10, year: 2569, amount: 599, dueDate: '2026-11-05', status: 'unpaid', paidAt: null, note: 'ค่าบริการรายเดือนปกติ' },

      { id: 'b-201', phone: '0898765432', month: 8, year: 2569, amount: 399, dueDate: '2026-09-05', status: 'paid', paidAt: '2026-09-01', note: 'หักบัญชีอัตโนมัติ' },
      { id: 'b-202', phone: '0898765432', month: 9, year: 2569, amount: 399, dueDate: '2026-10-05', status: 'paid', paidAt: '2026-10-02', note: 'หักบัญชีอัตโนมัติ' },
      { id: 'b-203', phone: '0898765432', month: 10, year: 2569, amount: 399, dueDate: '2026-11-05', status: 'paid', paidAt: '2026-11-01', note: 'หักบัญชีอัตโนมัติ' },

      { id: 'b-301', phone: '0623456789', month: 6, year: 2569, amount: 899, dueDate: '2026-07-05', status: 'paid', paidAt: '2026-07-05', note: 'ชำระผ่านเคาน์เตอร์' },
      { id: 'b-302', phone: '0623456789', month: 7, year: 2569, amount: 899, dueDate: '2026-08-05', status: 'unpaid', paidAt: null, note: 'ค้างชำระ' },
      { id: 'b-303', phone: '0623456789', month: 8, year: 2569, amount: 950, dueDate: '2026-09-05', status: 'unpaid', paidAt: null, note: 'ค้างชำระ + แพ็กเกจเสริม' },
      { id: 'b-304', phone: '0623456789', month: 9, year: 2569, amount: 899, dueDate: '2026-10-05', status: 'unpaid', paidAt: null, note: 'ค้างชำระ' },

      { id: 'b-401', phone: '0911112222', month: 9, year: 2569, amount: 299, dueDate: '2026-10-05', status: 'paid', paidAt: '2026-10-04', note: 'PromptPay' },
      { id: 'b-402', phone: '0911112222', month: 10, year: 2569, amount: 299, dueDate: '2026-11-05', status: 'unpaid', paidAt: null, note: 'รอชำระ' }
    ]
  };
}

function ensureDb(dbPath = DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(getDefaultData(), null, 2), 'utf8');
  }
}

function readDb(dbPath = DB_PATH) {
  ensureDb(dbPath);
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDb(data, dbPath = DB_PATH) {
  ensureDb(dbPath);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function formatBill(bill) {
  const monthIdx = Number(bill.month) - 1;
  const monthName = THAI_MONTHS[monthIdx] || `เดือน ${bill.month}`;
  return {
    ...bill,
    monthLabel: `${monthName} ${bill.year}`
  };
}

function sortBillsDesc(a, b) {
  if (b.year !== a.year) return b.year - a.year;
  return b.month - a.month;
}

function getUserBillSummary(db, rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { error: 'กรุณากรอกหมายเลขโทรศัพท์', statusCode: 400 };
  }

  const subscriber = db.subscribers.find((s) => s.phone === phone);
  const rawBills = db.bills
    .filter((b) => b.phone === phone)
    .sort(sortBillsDesc)
    .map(formatBill);

  if (!subscriber && rawBills.length === 0) {
    return { error: 'ไม่พบข้อมูลหมายเลขโทรศัพท์นี้ในระบบ', statusCode: 404 };
  }

  const unpaidBills = rawBills.filter((b) => b.status !== 'paid');
  const paidBills = rawBills.filter((b) => b.status === 'paid');
  const totalOutstanding = unpaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const totalPaid = paidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);

  return {
    statusCode: 200,
    data: {
      subscriber: subscriber || { phone, name: 'ผู้ใช้บริการ', plan: '-' },
      totalOutstanding,
      totalPaid,
      unpaidCount: unpaidBills.length,
      paidCount: paidBills.length,
      unpaidBills,
      paidBills,
      allBills: rawBills
    }
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return activeTokens.has(token);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function createAppServer(options = {}) {
  const dbPath = options.dbPath || DB_PATH;
  const adminPassword = options.adminPassword || ADMIN_PASSWORD;

  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      try {
        // User: check bills by phone number
        if (req.method === 'GET' && pathname === '/api/user/bills') {
          const phone = reqUrl.searchParams.get('phone') || '';
          const db = readDb(dbPath);
          const result = getUserBillSummary(db, phone);
          if (result.error) {
            return sendJson(res, result.statusCode, { error: result.error });
          }
          return sendJson(res, 200, result.data);
        }

        // Admin: login
        if (req.method === 'POST' && pathname === '/api/admin/login') {
          const body = await parseBody(req);
          if (body.password !== adminPassword) {
            return sendJson(res, 401, { error: 'รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง' });
          }
          const token = crypto.randomBytes(24).toString('hex');
          activeTokens.add(token);
          return sendJson(res, 200, { token });
        }

        // Protected Admin routes
        if (pathname.startsWith('/api/admin/')) {
          if (!isAuthorized(req)) {
            return sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบผู้ดูแลระบบก่อน' });
          }

          const db = readDb(dbPath);

          if (req.method === 'GET' && pathname === '/api/admin/overview') {
            const bills = db.bills.map(formatBill).sort(sortBillsDesc);
            const unpaidBills = bills.filter((b) => b.status !== 'paid');
            const paidBills = bills.filter((b) => b.status === 'paid');
            const totalOutstanding = unpaidBills.reduce((s, b) => s + Number(b.amount || 0), 0);
            const totalCollected = paidBills.reduce((s, b) => s + Number(b.amount || 0), 0);

            return sendJson(res, 200, {
              stats: {
                subscriberCount: db.subscribers.length,
                totalBills: bills.length,
                unpaidCount: unpaidBills.length,
                paidCount: paidBills.length,
                totalOutstanding,
                totalCollected
              },
              subscribers: db.subscribers,
              bills
            });
          }

          if (req.method === 'POST' && pathname === '/api/admin/subscribers') {
            const body = await parseBody(req);
            const phone = normalizePhone(body.phone);
            const name = String(body.name || '').trim();
            const plan = String(body.plan || '').trim() || 'Standard';

            if (phone.length < 9 || phone.length > 10) {
              return sendJson(res, 400, { error: 'หมายเลขโทรศัพท์ต้องมี 9-10 หลัก' });
            }
            if (!name) {
              return sendJson(res, 400, { error: 'กรุณาระบุชื่อเจ้าของเบอร์' });
            }
            if (db.subscribers.some((s) => s.phone === phone)) {
              return sendJson(res, 409, { error: 'หมายเลขโทรศัพท์นี้มีอยู่ในระบบแล้ว' });
            }

            const subscriber = { phone, name, plan };
            db.subscribers.push(subscriber);
            writeDb(db, dbPath);
            return sendJson(res, 201, { subscriber });
          }

          if (req.method === 'POST' && pathname === '/api/admin/bills') {
            const body = await parseBody(req);
            const phone = normalizePhone(body.phone);
            const month = Number(body.month);
            const year = Number(body.year);
            const amount = Number(body.amount);
            const dueDate = String(body.dueDate || '').trim();
            const status = body.status === 'paid' ? 'paid' : 'unpaid';
            const note = String(body.note || '').trim();

            if (!phone || !db.subscribers.some((s) => s.phone === phone)) {
              return sendJson(res, 400, { error: 'ไม่พบเบอร์โทรนี้ในระบบ กรุณาเพิ่มลูกค้าก่อน' });
            }
            if (!Number.isInteger(month) || month < 1 || month > 12) {
              return sendJson(res, 400, { error: 'เดือนไม่ถูกต้อง (1-12)' });
            }
            if (!Number.isInteger(year) || year < 2500) {
              return sendJson(res, 400, { error: 'ปี พ.ศ. ไม่ถูกต้อง' });
            }
            if (!Number.isFinite(amount) || amount <= 0) {
              return sendJson(res, 400, { error: 'ยอดเงินต้องมากกว่า 0' });
            }

            const newBill = {
              id: `b-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              phone,
              month,
              year,
              amount,
              dueDate: dueDate || new Date().toISOString().slice(0, 10),
              status,
              paidAt: status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
              note
            };

            db.bills.push(newBill);
            writeDb(db, dbPath);
            return sendJson(res, 201, { bill: formatBill(newBill) });
          }

          if (req.method === 'PATCH' && pathname.startsWith('/api/admin/bills/')) {
            const billId = pathname.split('/').pop();
            const body = await parseBody(req);
            const bill = db.bills.find((b) => b.id === billId);
            if (!bill) {
              return sendJson(res, 404, { error: 'ไม่พบบิลที่ต้องการแก้ไข' });
            }

            if (body.status === 'paid' || body.status === 'unpaid') {
              bill.status = body.status;
              bill.paidAt = body.status === 'paid'
                ? (body.paidAt || new Date().toISOString().slice(0, 10))
                : null;
            }
            if (body.amount !== undefined) {
              const amount = Number(body.amount);
              if (!Number.isFinite(amount) || amount <= 0) {
                return sendJson(res, 400, { error: 'ยอดเงินต้องมากกว่า 0' });
              }
              bill.amount = amount;
            }
            if (body.note !== undefined) {
              bill.note = String(body.note).trim();
            }

            writeDb(db, dbPath);
            return sendJson(res, 200, { bill: formatBill(bill) });
          }

          if (req.method === 'DELETE' && pathname.startsWith('/api/admin/bills/')) {
            const billId = pathname.split('/').pop();
            const idx = db.bills.findIndex((b) => b.id === billId);
            if (idx === -1) {
              return sendJson(res, 404, { error: 'ไม่พบบิลที่ต้องการลบ' });
            }
            db.bills.splice(idx, 1);
            writeDb(db, dbPath);
            return sendJson(res, 200, { deleted: true });
          }
        }

        return sendJson(res, 404, { error: 'API endpoint not found' });
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Bad request' });
      }
    }

    // Static files
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    });
  });
}

if (require.main === module) {
  ensureDb(DB_PATH);
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`Phone Bill App running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createAppServer,
  normalizePhone,
  getUserBillSummary,
  getDefaultData,
  THAI_MONTHS
};

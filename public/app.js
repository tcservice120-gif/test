const state = {
  mode: 'user',
  userResult: null,
  userFilter: 'all',
  adminToken: localStorage.getItem('telebill_admin_token') || '',
  adminData: null
};

// Elements
const btnUserMode = document.getElementById('btnUserMode');
const btnAdminMode = document.getElementById('btnAdminMode');
const userView = document.getElementById('userView');
const adminView = document.getElementById('adminView');

const userSearchForm = document.getElementById('userSearchForm');
const phoneInput = document.getElementById('phoneInput');
const userError = document.getElementById('userError');
const userResultEl = document.getElementById('userResult');

const resPhone = document.getElementById('resPhone');
const resName = document.getElementById('resName');
const resPlan = document.getElementById('resPlan');
const resOutstanding = document.getElementById('resOutstanding');
const resDebtStatus = document.getElementById('resDebtStatus');
const debtCard = document.getElementById('debtCard');
const resPaidTotal = document.getElementById('resPaidTotal');
const resPaidCount = document.getElementById('resPaidCount');
const overdueBox = document.getElementById('overdueBox');
const overdueBadge = document.getElementById('overdueBadge');
const overdueList = document.getElementById('overdueList');
const allClearBox = document.getElementById('allClearBox');
const userBillsBody = document.getElementById('userBillsBody');
const userFilterTabs = document.getElementById('userFilterTabs');

// Admin Elements
const adminLoginCard = document.getElementById('adminLoginCard');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminLoginError = document.getElementById('adminLoginError');
const adminDashboard = document.getElementById('adminDashboard');
const btnAdminLogout = document.getElementById('btnAdminLogout');
const adminFeedback = document.getElementById('adminFeedback');

const statSubscribers = document.getElementById('statSubscribers');
const statOutstanding = document.getElementById('statOutstanding');
const statUnpaidCount = document.getElementById('statUnpaidCount');
const statCollected = document.getElementById('statCollected');

const addSubscriberForm = document.getElementById('addSubscriberForm');
const addBillForm = document.getElementById('addBillForm');
const billPhoneSelect = document.getElementById('billPhoneSelect');
const adminSearchInput = document.getElementById('adminSearchInput');
const adminStatusFilter = document.getElementById('adminStatusFilter');
const adminBillsBody = document.getElementById('adminBillsBody');

function formatMoney(amount) {
  return `฿${Number(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Mode Switching
function switchMode(mode) {
  state.mode = mode;
  if (mode === 'user') {
    btnUserMode.classList.add('active');
    btnAdminMode.classList.remove('active');
    userView.classList.remove('hidden');
    adminView.classList.add('hidden');
  } else {
    btnAdminMode.classList.add('active');
    btnUserMode.classList.remove('active');
    adminView.classList.remove('hidden');
    userView.classList.add('hidden');
    if (state.adminToken) {
      loadAdminOverview();
    } else {
      showAdminLogin();
    }
  }
}

btnUserMode.addEventListener('click', () => switchMode('user'));
btnAdminMode.addEventListener('click', () => switchMode('admin'));

// ==================== USER LOGIC ====================
async function lookupPhone(phone) {
  userError.classList.add('hidden');
  try {
    const res = await fetch(`/api/user/bills?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) {
      userResultEl.classList.add('hidden');
      userError.textContent = data.error || 'ไม่สามารถค้นหาข้อมูลได้';
      userError.classList.remove('hidden');
      return;
    }
    state.userResult = data;
    state.userFilter = 'all';
    updateUserFilterTabs();
    renderUserResult();
  } catch {
    userError.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
    userError.classList.remove('hidden');
  }
}

function renderUserResult() {
  const data = state.userResult;
  if (!data) return;

  userResultEl.classList.remove('hidden');
  resPhone.textContent = formatPhoneDisplay(data.subscriber.phone);
  resName.textContent = data.subscriber.name;
  resPlan.textContent = data.subscriber.plan;

  resOutstanding.textContent = formatMoney(data.totalOutstanding);
  resPaidTotal.textContent = formatMoney(data.totalPaid);
  resPaidCount.textContent = `ชำระแล้ว ${data.paidCount} เดือน`;

  if (data.unpaidCount > 0) {
    debtCard.classList.remove('clear');
    resDebtStatus.textContent = `ค้างชำระ ${data.unpaidCount} เดือน`;
    overdueBox.classList.remove('hidden');
    allClearBox.classList.add('hidden');
    overdueBadge.textContent = `ค้าง ${data.unpaidCount} เดือน`;
    overdueList.innerHTML = data.unpaidBills
      .map(
        (b) => `
        <div class="overdue-item">
          <div>
            <div class="month">${b.monthLabel}</div>
            <div class="due">ครบกำหนด: ${b.dueDate || '-'}</div>
          </div>
          <div class="amt">${formatMoney(b.amount)}</div>
        </div>`
      )
      .join('');
  } else {
    debtCard.classList.add('clear');
    resDebtStatus.textContent = 'ไม่มียอดค้างชำระ';
    overdueBox.classList.add('hidden');
    allClearBox.classList.remove('hidden');
  }

  renderUserBillsTable();
}

function updateUserFilterTabs() {
  userFilterTabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === state.userFilter);
  });
}

function renderUserBillsTable() {
  const data = state.userResult;
  if (!data) return;

  let rows = data.allBills;
  if (state.userFilter === 'unpaid') rows = data.unpaidBills;
  if (state.userFilter === 'paid') rows = data.paidBills;

  if (rows.length === 0) {
    userBillsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;">ไม่มีรายการบิลในหมวดนี้</td></tr>`;
    return;
  }

  userBillsBody.innerHTML = rows
    .map((b) => {
      const statusBadge =
        b.status === 'paid'
          ? '<span class="badge badge-success">ชำระแล้ว</span>'
          : '<span class="badge badge-danger">ค้างชำระ</span>';
      return `
        <tr>
          <td><strong>${b.monthLabel}</strong></td>
          <td>${formatMoney(b.amount)}</td>
          <td>${b.dueDate || '-'}</td>
          <td>${statusBadge}</td>
          <td>${b.paidAt || '-'}</td>
          <td>${b.note || '-'}</td>
        </tr>`;
    })
    .join('');
}

userSearchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  lookupPhone(phoneInput.value);
});

document.querySelectorAll('.pill-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    phoneInput.value = btn.dataset.phone;
    lookupPhone(btn.dataset.phone);
  });
});

userFilterTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  state.userFilter = btn.dataset.filter;
  updateUserFilterTabs();
  renderUserBillsTable();
});

// ==================== ADMIN LOGIC ====================
function showAdminLogin() {
  adminLoginCard.classList.remove('hidden');
  adminDashboard.classList.add('hidden');
}

function showAdminFeedback(message, isError = false) {
  adminFeedback.textContent = message;
  adminFeedback.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
  adminFeedback.classList.remove('hidden');
  setTimeout(() => adminFeedback.classList.add('hidden'), 4000);
}

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.adminToken}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    state.adminToken = '';
    localStorage.removeItem('telebill_admin_token');
    showAdminLogin();
    throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'เกิดข้อผิดพลาด');
  }
  return data;
}

async function loadAdminOverview() {
  try {
    const data = await adminFetch('/api/admin/overview');
    state.adminData = data;
    adminLoginCard.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    renderAdminDashboard();
  } catch (err) {
    showAdminLogin();
  }
}

function renderAdminDashboard() {
  const { stats, subscribers } = state.adminData;
  statSubscribers.textContent = stats.subscriberCount;
  statOutstanding.textContent = formatMoney(stats.totalOutstanding);
  statUnpaidCount.textContent = stats.unpaidCount;
  statCollected.textContent = formatMoney(stats.totalCollected);

  billPhoneSelect.innerHTML = subscribers
    .map((s) => `<option value="${s.phone}">${formatPhoneDisplay(s.phone)} - ${s.name}</option>`)
    .join('');

  renderAdminBillsTable();
}

function renderAdminBillsTable() {
  const { bills, subscribers } = state.adminData;
  const subMap = new Map(subscribers.map((s) => [s.phone, s]));
  const query = adminSearchInput.value.replace(/\D/g, '');
  const statusFilter = adminStatusFilter.value;

  const filtered = bills.filter((b) => {
    if (query && !b.phone.includes(query)) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    adminBillsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;">ไม่พบรายการบิล</td></tr>`;
    return;
  }

  adminBillsBody.innerHTML = filtered
    .map((b) => {
      const sub = subMap.get(b.phone);
      const isPaid = b.status === 'paid';
      const badge = isPaid
        ? '<span class="badge badge-success">ชำระแล้ว</span>'
        : '<span class="badge badge-danger">ค้างชำระ</span>';
      const toggleBtn = isPaid
        ? `<button type="button" class="btn btn-sm btn-warning" data-action="toggle" data-id="${b.id}" data-next="unpaid">ตั้งเป็นค้างชำระ</button>`
        : `<button type="button" class="btn btn-sm btn-success" data-action="toggle" data-id="${b.id}" data-next="paid">บันทึกชำระเงิน</button>`;

      return `
        <tr>
          <td>${formatPhoneDisplay(b.phone)}</td>
          <td>${sub ? sub.name : '-'}</td>
          <td><strong>${b.monthLabel}</strong></td>
          <td>${formatMoney(b.amount)}</td>
          <td>${b.dueDate || '-'}</td>
          <td>${badge}</td>
          <td>
            <div class="action-btns">
              ${toggleBtn}
              <button type="button" class="btn btn-sm btn-danger-outline" data-action="delete" data-id="${b.id}">ลบ</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  adminLoginError.classList.add('hidden');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPasswordInput.value })
    });
    const data = await res.json();
    if (!res.ok) {
      adminLoginError.textContent = data.error || 'รหัสผ่านไม่ถูกต้อง';
      adminLoginError.classList.remove('hidden');
      return;
    }
    state.adminToken = data.token;
    localStorage.setItem('telebill_admin_token', data.token);
    adminPasswordInput.value = '';
    await loadAdminOverview();
  } catch {
    adminLoginError.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    adminLoginError.classList.remove('hidden');
  }
});

btnAdminLogout.addEventListener('click', () => {
  state.adminToken = '';
  localStorage.removeItem('telebill_admin_token');
  showAdminLogin();
});

addSubscriberForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await adminFetch('/api/admin/subscribers', {
      method: 'POST',
      body: JSON.stringify({
        phone: document.getElementById('newSubPhone').value,
        name: document.getElementById('newSubName').value,
        plan: document.getElementById('newSubPlan').value
      })
    });
    addSubscriberForm.reset();
    showAdminFeedback('เพิ่มหมายเลขโทรศัพท์ใหม่เรียบร้อยแล้ว');
    await loadAdminOverview();
  } catch (err) {
    showAdminFeedback(err.message, true);
  }
});

addBillForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await adminFetch('/api/admin/bills', {
      method: 'POST',
      body: JSON.stringify({
        phone: billPhoneSelect.value,
        month: Number(document.getElementById('billMonthSelect').value),
        year: Number(document.getElementById('billYearInput').value),
        amount: Number(document.getElementById('billAmountInput').value),
        status: document.getElementById('billStatusSelect').value,
        dueDate: document.getElementById('billDueDateInput').value,
        note: document.getElementById('billNoteInput').value
      })
    });
    document.getElementById('billAmountInput').value = '';
    document.getElementById('billNoteInput').value = '';
    showAdminFeedback('สร้างบิลรายเดือนเรียบร้อยแล้ว');
    await loadAdminOverview();
  } catch (err) {
    showAdminFeedback(err.message, true);
  }
});

adminSearchInput.addEventListener('input', renderAdminBillsTable);
adminStatusFilter.addEventListener('change', renderAdminBillsTable);

adminBillsBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id, next } = btn.dataset;
  try {
    if (action === 'toggle') {
      await adminFetch(`/api/admin/bills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next })
      });
      showAdminFeedback(next === 'paid' ? 'บันทึกการชำระเงินเรียบร้อยแล้ว' : 'อัปเดตสถานะเป็นค้างชำระแล้ว');
      await loadAdminOverview();
    } else if (action === 'delete') {
      await adminFetch(`/api/admin/bills/${id}`, { method: 'DELETE' });
      showAdminFeedback('ลบบิลเรียบร้อยแล้ว');
      await loadAdminOverview();
    }
  } catch (err) {
    showAdminFeedback(err.message, true);
  }
});

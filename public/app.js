const app = document.getElementById('app');
const S = { view: 'welcome', me: null, stack: [], k: 'expense', inviteToken: new URLSearchParams(location.search).get('invite'), resetToken: new URLSearchParams(location.search).get('reset'), paymentReturn: new URLSearchParams(location.search).get('payment'), inviteInfo: null, newInvite: null, pendingPayment: null, resetRequested: false, editingTx: null, editingBill: null, editingBudget: null, billing: 'monthly' };
const peso = n => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const billDueStatus = bill => bill.due_status || (bill.due < today() ? 'overdue' : bill.due === today() ? 'due_today' : 'upcoming');
function prepareProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve('');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return reject(new Error('Choose a JPEG, PNG, or WebP photo.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Choose an image smaller than 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected photo could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('The selected photo could not be opened.'));
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL('image/jpeg', .82);
        if (resized.length > 1_350_000) return reject(new Error('This photo is too large after resizing. Choose another image.'));
        resolve(resized);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2800); }
async function api(p, m = 'GET', b) {
  const r = await fetch('/api/' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.t || '') }, body: b ? JSON.stringify(b) : undefined });
  if (p === 'export' && r.ok) return r.blob();
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && p !== 'signin') { localStorage.removeItem('t'); S.view = 'welcome'; }
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status}). Please refresh and try again.`);
  return d;
}
const lbl = d => { const t = today(), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); return d === t ? 'Today' : d === y ? 'Yesterday' : d; };
const bar = p => `<div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>`;
const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;

const V = {};
V.welcome = async () => ({ bare: 1, html: `<h1 class="logo">GASTOS</h1><button class="btn" data-go="signup">Create Account</button><button class="btn alt" data-go="signin">Sign In</button>` });
V.signup = async () => ({ title: 'Create Account', html: `<form data-f="signup">${S.inviteToken ? '<p class="notice">Your new account will join the invited family automatically. Use the invited email address.</p><input type="hidden" name="invite_token" value="' + esc(S.inviteToken) + '">' : ''}<label>Full name</label><input name="name" autocomplete="name" placeholder="Enter your name" required><label>Email address</label><input name="email" type="email" autocomplete="email" placeholder="you@example.com" ${S.inviteInfo?.email ? `value="${esc(S.inviteInfo.email)}" readonly` : ''} required><label>Password (8+ characters)</label><input name="password" type="password" autocomplete="new-password" placeholder="Create a password" minlength="8" required><label>Confirm password</label><input name="password2" type="password" autocomplete="new-password" placeholder="Repeat your password" required><a class="lnk" data-go="signin">Already have an account? Sign In</a><button class="btn">Create Account</button></form>` });
V.signin = async () => ({ title: 'Welcome Back', html: `<form data-f="signin"><label>Email</label><input name="email" type="email" autocomplete="username" placeholder="you@example.com" ${S.inviteInfo?.email ? `value="${esc(S.inviteInfo.email)}" readonly` : ''} required>${S.inviteInfo?.email ? `<p class="mu">Sign in with the invited email address, ${esc(S.inviteInfo.email)}.</p>` : ''}<label>Password</label><input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required><a class="lnk" data-go="resetrequest">Forgot password?</a><a class="lnk" data-go="signup">New to Gastos? Create Account</a><button class="btn">Sign In</button></form>` });
V.resetrequest = async () => ({title:'Reset your password',back:1,html:S.resetRequested?'<div class="notice">If an account exists for that address, a reset email will arrive shortly. Check your inbox and spam folder.</div>':`<p class="mu">Enter the email address on your Gastos account. If it exists, we’ll send a secure reset link that expires in 15 minutes.</p><form data-f="resetrequest"><label>Email address</label><input name="email" type="email" autocomplete="email" placeholder="you@example.com" required><button class="btn">Send reset link</button></form>`});
V.resetform = async () => ({title:'Choose a new password',html:`<p class="mu">Choose a new password for your Gastos account.</p><form data-f="resetcomplete"><input type="hidden" name="token" value="${esc(S.resetToken||'')}"><label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><label>Confirm new password</label><input name="password2" type="password" minlength="8" autocomplete="new-password" required><button class="btn">Save new password</button></form>`});
V.invitation = async () => {
  try { S.inviteInfo = await api(`invitations/${encodeURIComponent(S.inviteToken)}`); }
  catch (e) { return { title: 'Family invitation', html: `<div class="card"><b>Invitation unavailable</b><span class="sm">${esc(e.message)}</span></div><button class="btn" data-go="welcome">Back to Gastos</button>` }; }
  let signedIn = null;
  if (localStorage.t) { try { signedIn = await api('me'); } catch (_) { localStorage.removeItem('t'); } }
  const sameAccount = signedIn?.email?.toLowerCase() === S.inviteInfo.email.toLowerCase();
  const accountMessage = signedIn && !sameAccount
    ? `<p class="notice">This browser is signed in as ${esc(signedIn.email)}. The invitation was sent to ${esc(S.inviteInfo.email)}. Continue with the invited account below.</p>`
    : `<p class="mu">Use ${esc(S.inviteInfo.email)} to sign in or create your account. Your account will join this family as a member.</p>`;
  const actions = sameAccount
    ? `<button class="btn" data-act="acceptinvite">Accept invitation</button>`
    : `<button class="btn" data-go="signin">${signedIn ? 'Sign in as the invited member' : 'Already have an account? Sign In'}</button><button class="btn alt" data-go="signup">Create Account to Join</button>`;
  return { title: 'Family invitation', html: `<div class="invite-hero"><div class="invite-brand">GASTOS</div><h3>You’re invited to join ${esc(S.inviteInfo.family)}</h3><p>${S.inviteInfo.inviter ? `${esc(S.inviteInfo.inviter)} invited you` : 'Your family invited you'} to manage household finances together.</p><span class="sm">This invitation is for ${esc(S.inviteInfo.email)} and expires ${new Date(S.inviteInfo.expires).toLocaleDateString()}.</span></div>${accountMessage}${actions}` };
};
V.family = async () => ({ title: 'Set Up Your Family', html: `<form data-f="family"><label>Family Name</label><input name="name" placeholder="e.g. Furio Family" required><label>Your Role</label><select name="role"><option>Parent</option><option>Member</option></select><p class="mu">Create your family space to start tracking money together.</p><button class="btn">Continue</button></form>` });
V.invite = async () => {
  const f = S.me?.family;
  if (!f) return {title:'Family members',html:'<div class="notice">Your family details could not be loaded. Please return home and try again.</div><button class="btn" data-act="finish">Return to Gastos</button>'};
  const familyMembers=Array.isArray(f.members)?f.members:[], familyInvites=Array.isArray(f.invites)?f.invites:[];
  const activeInvites = familyInvites.filter(i => i.status === 'pending').length, usedSlots = familyMembers.length + activeInvites;
  const members = familyMembers.map(m => `<div class="invite-row"><span class="sm"><b>${esc(m.name)}</b> • ${m.owner ? 'Owner' : esc(m.role)}</span>${f.owner&&!m.owner?`<button class="btn sm alt danger" data-act="removemember" data-id="${m.id}">Remove member</button>`:''}</div>`).join('');
  const deliveryLabel = status => status === 'sent' ? 'SMTP relay accepted the email' : status === 'failed' ? 'Email delivery failed — retry or share the link' : 'Email not configured — share the link manually';
  const invites = familyInvites.map(i => `<div class="invite-row"><span class="sm"><b>${esc(i.email)}</b> • ${esc(i.status?.[0]?.toUpperCase() + (i.status?.slice(1)||''))}${i.expires ? ` until ${new Date(i.expires).toLocaleDateString()}` : ''}</span>${i.status === 'pending' ? `<span class="delivery ${i.delivery === 'sent' ? 'ok' : i.delivery === 'failed' ? 'bad' : ''}">${esc(deliveryLabel(i.delivery))}</span><button class="btn sm alt" data-act="copy" data-id="${i.id}">Copy link</button><button class="btn sm alt danger" data-act="revoke" data-id="${i.id}">Cancel invitation</button>` : ''}${i.status !== 'accepted' && i.status !== 'revoked' && i.status !== 'pending' ? `<button class="btn sm alt" data-act="resend" data-id="${i.id}">Resend</button>` : ''}</div>`).join('');
  const created = S.newInvite ? `<div class="card invite-created"><b>Invitation created for ${esc(S.newInvite.email)}</b><span class="delivery ${S.newInvite.delivery === 'sent' ? 'ok' : S.newInvite.delivery === 'failed' ? 'bad' : ''}">${esc(deliveryLabel(S.newInvite.delivery))}</span><span class="sm">Expires ${new Date(S.newInvite.expires).toLocaleString()}</span><input readonly value="${esc(S.newInvite.link)}" aria-label="Invitation link"><button class="btn alt" data-act="copynew">Copy invitation link</button>${S.newInvite.delivery !== 'sent' ? '<p class="mu">The invitation is saved. You can retry email delivery from the invitation list.</p>' : ''}</div>` : '';
  return { title: 'Add Family Members', back: 1, html: `${created}${f.owner ? (usedSlots < f.limit ? `<form data-f="invite"><label>Member email</label><input name="email" type="email" autocomplete="email" placeholder="family@example.com" required><button class="btn alt">Send invitation</button></form>` : `<div class="notice">This family has used all ${f.limit} member slots on the ${f.plan} plan. <a class="lnk" data-go="premium">Explore Premium</a></div>`) : '<p class="mu">Only the family owner can invite members.</p>'}<p class="mu">${usedSlots} of ${f.limit} family member slots used. Invitations expire after 7 days.</p><div class="card"><b>Family Members & Invitations</b>${members}${invites || '<span class="sm">No pending invitations.</span>'}</div><button class="btn" data-act="finish">Finish Setup</button>` };
};
V.home = async () => {
  const [response, profile] = await Promise.all([api('dashboard'), api('profile')]);
  const profileButton = `<button class="ico" data-go="profile" aria-label="Profile">${profile.avatar_data ? `<img class="dashboard-avatar" src="${esc(profile.avatar_data)}" alt="">` : '👤'}</button>`;
  // Keep the dashboard usable when an older server response or partial payload
  // omits a chart/list field (for example while the backend is being restarted).
  const d = {
    ...response,
    income: Number(response?.income) || 0,
    expense: Number(response?.expense) || 0,
    balance: Number(response?.balance) || 0,
    category_totals: response?.category_totals && typeof response.category_totals === 'object' && !Array.isArray(response.category_totals) ? response.category_totals : {},
    months: Array.isArray(response?.months) ? response.months : [],
    recent: Array.isArray(response?.recent) ? response.recent : [],
    bills: Array.isArray(response?.bills) ? response.bills : [],
    budgets: Array.isArray(response?.budgets) ? response.budgets : [],
    savings: response?.savings && typeof response.savings === 'object' ? response.savings : { saved: 0, target: 0, percent: 0 },
  };
  const colors = ['#167a55','#43a77f','#f4a340','#7786d5','#dd6b5c','#54a6c4','#9980be'];
  const categories = Object.entries(d.category_totals || {}).sort((a,b)=>b[1]-a[1]);
  let consumed = 0;
  const donut = categories.length ? `<div class="donut" role="img" aria-label="Spending by category" style="background:conic-gradient(${categories.map(([_,amount],i)=>{const start=consumed;consumed+=Number(amount);return `${colors[i%colors.length]} ${start/d.expense*100}% ${consumed/d.expense*100}%`;}).join(',')})"><span>${peso(d.expense)}<small>spent</small></span></div><div class="legend">${categories.map(([name,amount],i)=>`<div class="legend-row"><i style="background:${colors[i%colors.length]}"></i><span>${esc(name)}</span><b>${peso(amount)}</b><small>${d.expense?Math.round(amount*100/d.expense):0}%</small></div>`).join('')}</div>` : '<p class="mu empty">No expenses this month yet. Add an expense to see category insights.</p>';
  const maxMonth = Math.max(1, ...d.months.reduce((values, month) => values.concat(month.income, month.expense), []));
  const trend = d.months.some(x=>x.income||x.expense) ? `<div class="trend">${d.months.map(x=>`<div class="trend-month"><div class="trend-bars"><i class="incbar" style="height:${Math.max(2,x.income/maxMonth*100)}%" title="Income ${peso(x.income)}"></i><i class="expbar" style="height:${Math.max(2,x.expense/maxMonth*100)}%" title="Expenses ${peso(x.expense)}"></i></div><small>${esc(x.label)}</small></div>`).join('')}</div><div class="chart-key"><span><i class="incbar"></i> Income</span><span><i class="expbar"></i> Expenses</span></div>` : '<p class="mu empty">Add transactions to compare income and expenses.</p>';
  const recent = d.recent.length ? d.recent.map(x=>`<div class="list-row"><span class="category-icon">${x.kind==='income'?'↗':'↘'}</span><div class="grow"><b>${esc(x.note||x.category)}</b><small>${esc(x.category)} · ${esc(x.date)} · ${esc(x.member)}</small></div><b class="${x.kind==='income'?'inc':'exp'}">${x.kind==='income'?'+':'−'}${peso(x.amount)}</b></div>`).join('') : '<p class="mu empty">Your latest income and expenses will appear here.</p>';
  const bills = d.bills.length ? d.bills.map(x=>{const due=billDueStatus(x);return `<div class="list-row"><span class="category-icon">${due==='overdue'?'!':'◷'}</span><div class="grow"><b>${esc(x.name)}</b><small class="bill-${due}">${due==='overdue'?'Overdue':due==='due_today'?'Due today':'Upcoming'} · ${esc(x.due)}</small></div><b>${peso(x.amount)}</b></div>`;}).join('') : '<p class="mu empty">No upcoming bills. Add one to get a reminder.</p>';
  const budgets = d.budgets.length ? d.budgets.map(x=>`<div class="budget-item"><div class="row"><b>${esc(x.category)}</b><span class="budget-state ${x.status}">${x.status==='exceeded'?'Over limit':x.status==='approaching'?'Near limit':'On track'}</span></div><span class="sm">${peso(x.spent)} of ${peso(x.limit)} · ${x.percent}%</span><div class="bar ${x.status}"><i style="width:${Math.min(100,x.percent)}%"></i></div></div>`).join('') : '<p class="mu empty">Set category limits to keep spending on track.</p>';
  return { title: 'Gastos', nav: 1, right: profileButton, html: `<p class="fam">${esc(S.me.family.name)} <span>This month</span></p>
  <div class="summary-grid"><div class="card summary-card"><small>Income</small><b class="inc">${peso(d.income)}</b></div><div class="card summary-card"><small>Expenses</small><b class="exp">${peso(d.expense)}</b></div><div class="card summary-card"><small>Balance</small><b>${peso(d.balance)}</b></div><div class="card summary-card"><small>Savings progress</small><b>${d.savings.percent}%</b><span class="sm">${peso(d.savings.saved)} / ${peso(d.savings.target)}</span>${bar(d.savings.percent)}</div></div>
  <div class="card"><div class="section-heading"><b>Spending by category</b><span class="sm">This month</span></div><div class="category-chart">${donut}</div></div>
  <div class="card"><div class="section-heading"><b>Income vs expenses</b><span class="sm">Last 6 months</span></div>${trend}</div>
  <div class="card"><div class="section-heading"><b>Quick actions</b></div><div class="chips"><a data-go="addtx" data-k="income">+ Add income</a><a data-go="addtx" data-k="expense">− Add expense</a><a data-tab="bills">Bills</a><a data-tab="savings">Savings goal</a><a data-go="budgets">Budgets</a></div></div>
  <div class="card"><div class="section-heading"><b>Budget progress</b>${S.me.family.owner?'<a class="lnk" data-go="budgets">Manage</a>':''}</div>${budgets}</div>
  <div class="card"><div class="section-heading"><b>Recent transactions</b><a class="lnk" data-tab="tx">See all</a></div>${recent}</div>
  <div class="card"><div class="section-heading"><b>Upcoming bills</b><a class="lnk" data-tab="bills">See all</a></div>${bills}</div>
  <button class="btn alt" data-go="reports">View financial reports</button>` };
};
V.tx = async () => {
  const r = await api('transactions');
  const categories=[...new Set(r.map(t=>t.category))].sort();
  const rows=r.map(t => `<div class="card tx-card transaction-item" data-kind="${t.kind}" data-category="${esc(t.category)}" data-date="${t.date}" data-amount="${t.amount}" data-search="${esc(`${t.note||''} ${t.category} ${t.member}`.toLowerCase())}"><div class="row"><div class="grow"><b>${lbl(t.date)} · ${esc(t.note || t.category)}</b><small>${esc(t.category)} · ${esc(t.member)}</small></div><b class="${t.kind === 'income' ? 'inc' : 'exp'}">${t.kind === 'income' ? '+' : '−'}${peso(t.amount)}</b></div>${t.can_edit?`<div class="tx-actions"><button class="btn sm alt" data-act="edittx" data-id="${t.id}">Edit</button><button class="btn sm alt" data-act="deletetx" data-id="${t.id}">Delete</button></div>`:''}</div>`).join('');
  return { title: 'Transactions', nav: 1, html: `<div class="filters"><input id="tx-search" type="search" placeholder="Search transactions" aria-label="Search transactions"><input id="tx-month" type="month" aria-label="Filter by month"><select id="tx-category"><option value="">All categories</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select><select id="tx-kind"><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></select><select id="tx-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest amount</option><option value="lowest">Lowest amount</option></select></div><div id="tx-list">${rows || '<p class="mu empty" id="tx-empty">No transactions yet. Add your first income or expense.</p>'}</div><button class="btn" data-go="addtx" data-k="expense">+ Add Transaction</button>` };
};
V.edittx = async () => { const t = S.editingTx; if (!t) return { title: 'Edit transaction', html: '<p class="mu">Transaction not found.</p>' }; return { title: 'Edit transaction', back: 1, html: `<form data-f="edittx"><label>Type</label><select name="kind"><option value="expense" ${t.kind === 'expense' ? 'selected' : ''}>Expense</option><option value="income" ${t.kind === 'income' ? 'selected' : ''}>Income</option></select><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${t.amount}" required><label>Category</label><input name="category" maxlength="60" value="${esc(t.category)}" required><label>Date</label><input name="date" type="date" value="${esc(t.date)}" required><label>Note</label><input name="note" maxlength="200" value="${esc(t.note)}"><button class="btn">Save changes</button></form>` }; };
V.addtx = async () => ({ title: S.k === 'income' ? 'Add Income' : 'Add Expense', back: 1, html: `<form data-f="addtx"><label>Type</label><select name="kind"><option value="expense" ${S.k !== 'income' ? 'selected' : ''}>Expense</option><option value="income" ${S.k === 'income' ? 'selected' : ''}>Income</option></select><label>Amount</label><input name="amount" type="number" step="0.01" min="0.01" placeholder="₱ 0.00" required><label>Category</label><select name="category"><option>Food</option><option>Bills</option><option>Tuition</option><option>Allowance</option><option>Salary</option><option>Other</option></select><label>Date</label><input name="date" type="date" value="${today()}"><label>Note</label><input name="note" placeholder="What was this for?"><button class="btn">Save</button></form>` });
V.bills = async () => {
  const b = await api('bills'), owner = S.me?.family?.owner;
  return { title: 'Bills & Reminders', nav: 1, html: (b.map(x => {const due=billDueStatus(x);return `<div class="card"><div class="row"><b>${esc(x.name)}</b><span class="budget-state ${due==='overdue'?'exceeded':due==='due_today'?'approaching':'normal'}">${due==='overdue'?'Overdue':due==='due_today'?'Due today':'Upcoming'}</span></div><span class="sm">Due ${esc(x.due)} • ${peso(x.amount)}</span>${owner?`<div class="tx-actions"><button class="btn sm alt" data-act="editbill" data-id="${x.id}">Edit</button><button class="btn sm" data-act="pay" data-id="${x.id}">Mark paid</button><button class="btn sm alt" data-act="deletebill" data-id="${x.id}">Delete</button></div>`:''}</div>`;}).join('') || '<div class="card"><b>All caught up</b><span class="sm">No unpaid bills. Add a bill to track its due date.</span></div>') + (owner?`<button class="btn" data-go="addbill">+ Add Bill</button>`:'<p class="mu">Only the family owner can manage bills.</p>') };
};
V.addbill = async () => ({ title: 'Add Bill', back: 1, html: `<form data-f="addbill"><label>Name</label><input name="name" placeholder="e.g. Electricity" required><label>Amount</label><input name="amount" type="number" step="0.01" min="0.01" required><label>Due date</label><input name="due" type="date" value="${today()}"><button class="btn">Save Bill</button></form>` });
V.editbill = async () => { const b=S.editingBill; if(!b) return {title:'Edit bill',html:'<p class="mu">Bill not found.</p>'}; return {title:'Edit bill',back:1,html:`<form data-f="savebill"><label>Name</label><input name="name" maxlength="120" value="${esc(b.name)}" required><label>Amount</label><input name="amount" type="number" step="0.01" min="0.01" value="${b.amount}" required><label>Due date</label><input name="due" type="date" value="${esc(b.due)}" required><button class="btn">Save changes</button></form>`}; };
V.savings = async () => {
  const g = await api('goals'), owner = S.me?.family?.owner;
  return { title: 'Savings Goals', nav: 1, html: (g.map(x => { const p = Math.round(x.saved * 100 / x.target); return `<div class="card"><div class="row"><b>${esc(x.name)}</b><button class="btn sm" data-act="fund" data-id="${x.id}">+ Add</button></div><span class="sm">${peso(x.saved)} / ${peso(x.target)}<br>${p}% complete</span>${bar(p)}</div>`; }).join('') || '<p class="mu">No goals yet.</p>') + (owner?`<button class="btn" data-go="addgoal">+ Create Goal</button>`:'<p class="mu">You can contribute to shared goals. The family owner manages goal settings.</p>') };
};
V.addgoal = async () => ({ title: 'Create Goal', back: 1, html: `<form data-f="addgoal"><label>Goal name</label><input name="name" placeholder="e.g. Emergency Fund" required><label>Target amount</label><input name="target" type="number" step="0.01" min="1" required><button class="btn">Create Goal</button></form>` });
V.budgets = async () => { const rows = await api('budgets'), owner = S.me?.family?.owner; return { title: 'Monthly Budgets', back: 1, html: `${rows.length ? rows.map(b=>{const pct=b.monthly_limit?Math.round(b.spent*100/b.monthly_limit):0;const state=pct>=100?'exceeded':pct>=80?'approaching':'normal';return `<div class="card budget-item"><div class="row"><b>${esc(b.category)}</b><span class="budget-state ${state}">${state==='exceeded'?'Over limit':state==='approaching'?'Near limit':'On track'}</span></div><span class="sm">${peso(b.spent)} spent of ${peso(b.monthly_limit)} · ${pct}%</span><div class="bar ${state}"><i style="width:${Math.min(100,pct)}%"></i></div>${owner?`<div class="tx-actions"><button class="btn sm alt" data-act="editbudget" data-id="${b.id}">Edit</button><button class="btn sm alt" data-act="deletebudget" data-id="${b.id}">Delete</button></div>`:''}</div>`;}).join('') : '<div class="card"><b>No budgets yet</b><span class="sm">Create a monthly limit for a spending category. Gastos will compare it with this month’s expenses.</span></div>'}${owner?`<button class="btn" data-go="addbudget">+ Set category budget</button>`:'<p class="mu">Budgets are managed by the family owner.</p>'}` }; };
V.addbudget = async () => { const b=S.editingBudget||{}; return { title: b.id?'Edit budget':'Set a budget', back: 1, html: `<form data-f="savebudget"><label>Category</label><input name="category" maxlength="60" placeholder="e.g. Food" value="${esc(b.category||'')}" required><label>Monthly limit</label><input name="monthly_limit" type="number" min="0.01" step="0.01" placeholder="₱ 0.00" value="${b.monthly_limit||''}" required><p class="mu">Progress is calculated from actual expenses in the current month.</p><button class="btn">${b.id?'Save changes':'Create budget'}</button></form>` }; };
V.members = async () => {
  const f = S.me.family;
  const pending=f.invites.filter(i=>i.status==='pending').length, used=f.members.length+pending;
  const invitationCards=f.invites.map(i=>`<div class="card"><div class="row"><b>${esc(i.email)}</b>${f.owner&&i.status==='pending'?`<button class="btn sm alt danger" data-act="revoke" data-id="${i.id}">Cancel invite</button>`:''}</div><span class="sm">Invitation ${esc(i.status)}${i.expires?` · expires ${new Date(i.expires).toLocaleDateString()}`:''}</span>${i.status==='pending'?`<span class="delivery ${i.delivery==='sent'?'ok':i.delivery==='failed'?'bad':''}">${i.delivery==='sent'?'SMTP relay accepted the email':i.delivery==='failed'?'Email failed — retry is available':'Manual sharing'}</span>`:''}</div>`).join('');
  return { title: 'Family', nav: 1, html: `<div class="card"><b>${esc(f.name)}</b><span class="sm">${f.plan === 'free' ? 'Free' : 'Premium'} plan · ${used} of ${f.limit} member slots used</span>${bar(used*100/f.limit)}</div>${f.members.map(m => `<div class="card"><div class="row"><b>${esc(m.name)}</b>${f.owner&&!m.owner?`<button class="btn sm alt danger" data-act="removemember" data-id="${m.id}">Remove</button>`:''}</div><span class="sm">${m.owner ? 'Owner • Full access' : esc(m.role)}</span></div>`).join('')}${invitationCards}${f.owner?'<button class="btn" data-go="invite">+ Add Member</button>':''}` };
};
V.premium = async () => ({ title: 'Gastos Premium', back: 1, html: `<h2>Family Premium</h2><p class="price">₱99 / month or ₱999 / year</p><div class="card"><b>Free</b><span class="sm">One family · Up to 4 members · Transactions · Bills · Savings goals · Category budgets · Monthly reports</span></div><div class="card"><b>Premium</b><span class="sm">Up to 10 family members. Premium starts only after PayMongo confirms an active subscription.</span></div>${S.me.family.plan === 'premium' ? `<div class="card"><b>✓ Active Premium</b><span class="sm">Manage recurring billing below.</span></div><button class="btn alt" data-act="cancelsubscription">Cancel subscription</button>` : `<form data-f="checkout"><label>Billing period</label><select name="period"><option value="monthly">Monthly — ₱99</option><option value="annual">Annual — ₱999</option></select><label>Payment method</label><select name="payment_method"><option value="card">Visa / Mastercard</option><option value="paymaya">Maya</option></select><p class="mu">Card and Maya details are sent directly to PayMongo. Gastos never receives or stores card numbers.</p><button class="btn">Continue to secure checkout</button></form>`}<button class="btn alt" data-go="addons">View planned add-ons</button>` });
V.payment = async () => { const p=S.pendingPayment;if(!p)return {title:'Checkout',html:'<div class="notice">No payment session is open. Return to Premium and start checkout.</div><button class="btn" data-go="premium">Back to Premium</button>'};const card=p.payment_method==='card';return {title:'Secure checkout',back:1,html:`<div class="card"><b>Gastos Family Premium</b><span class="sm">${p.payment_method==='card'?'Visa / Mastercard':'Maya'} · ₱${p.amount} ${p.period==='monthly'?'per month':'per year'}</span></div><p class="mu">Payment details go directly from this browser to PayMongo.</p><form data-f="paymongo">${card?`<label>Card number</label><input name="card_number" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="1234 5678 9012 3456" required><div class="form-grid"><div><label>Expiry month</label><input name="exp_month" inputmode="numeric" autocomplete="cc-exp-month" placeholder="MM" maxlength="2" required></div><div><label>Expiry year</label><input name="exp_year" inputmode="numeric" autocomplete="cc-exp-year" placeholder="YYYY" maxlength="4" required></div><div><label>Security code</label><input name="cvc" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></div></div>`:''}<label>Name on payment</label><input name="billing_name" autocomplete="name" value="${esc(S.me.name)}" required><label>Email</label><input name="billing_email" type="email" autocomplete="email" value="${esc(S.me.email)}" required>${!card?'<label>Maya mobile number</label><input name="billing_phone" type="tel" autocomplete="tel" placeholder="09XXXXXXXXX" required>':''}<button class="btn">${card?'Pay securely':'Continue to Maya'}</button></form>`}; };
V.paymentstatus = async () => { let s;try{s=await api('subscriptions/status');}catch(e){return {title:'Payment status',html:`<div class="notice">${esc(e.message)}</div><button class="btn" data-act="refreshpayment">Check again</button>`};}if(s.status==='active')return {title:'Payment confirmed',html:`<div class="invite-hero"><div class="invite-brand">GASTOS PREMIUM</div><h3>Your family is on Premium</h3><p>PayMongo confirmed the subscription.</p></div><button class="btn" data-go="home">Continue</button>`};return {title:'Payment processing',html:`<div class="card"><b>${s.status==='past_due'?'Payment needs attention':'Waiting for PayMongo confirmation'}</b><span class="sm">Gastos grants Premium only after a verified PayMongo update. Current status: ${esc(s.status)}.</span></div><button class="btn" data-act="refreshpayment">Refresh status</button><button class="btn alt" data-go="home">Return to Gastos</button>`}; };
V.addons = async () => ({ title: 'Planned Add-ons', back: 1, html: `<div class="notice">These add-ons are not available for purchase yet.</div>${[['Extra Family Members', 20], ['Advanced Financial Reports', 49], ['Extra Receipt Storage', 29], ['Premium Financial Challenges', 19]].map(a => `<div class="card"><b>${a[0]}</b><span class="sm">Planned · ₱${a[1]} / month</span></div>`).join('')}` });
V.partners = async () => ({ title: 'Partner Services', back: 1, html: `<p class="mu">Optional services from participating partners.</p>` + [['Banks & Digital Wallets', 'Access participating financial services'], ['Insurance', 'Explore participating insurance providers'], ['Utilities & Groceries', 'Household service offers and referrals'], ['Education', 'Participating school and tuition services']].map(a => `<div class="card"><b>${a[0]}</b><span class="sm">${a[1]}</span></div>`).join('') });
V.reports = async () => {
  const response = await api('reports'), m = response.month || {}, y = response.year || {}, monthRows = response.months || {};
  const categories = Object.entries(response.category_totals || {}).sort((a,b)=>b[1]-a[1]);
  const months = Object.entries(monthRows).sort(([a],[b])=>Number(a)-Number(b));
  const monthMax = Math.max(1, ...months.map(([,v])=>Number(v.income)||0), ...months.map(([,v])=>Number(v.expense)||0));
  const monthBars = months.map(([month,v])=>`<div class="report-month"><div class="report-bar-pair"><i class="report-income" style="height:${Math.max(2,(Number(v.income)||0)/monthMax*100)}%" title="Income ${peso(v.income)}"></i><i class="report-expense" style="height:${Math.max(2,(Number(v.expense)||0)/monthMax*100)}%" title="Expenses ${peso(v.expense)}"></i></div><small>${new Date(2000,Number(month)-1,1).toLocaleString('en',{month:'short'})}</small></div>`).join('');
  return { title: 'Financial Reports', back: 1, html: `<section class="report-page"><div class="report-heading"><div><span class="report-eyebrow">GASTOS · FAMILY FINANCES</span><h3>Financial overview</h3><p>Monthly and year-to-date activity at a glance.</p></div><span class="report-period">${new Date().toLocaleString('en-PH',{month:'long',year:'numeric'})}</span></div>
  <div class="report-summary"><article class="report-stat"><span>Income this month</span><b class="inc">${peso(m.income)}</b></article><article class="report-stat"><span>Expenses this month</span><b class="exp">${peso(m.expense)}</b></article><article class="report-stat"><span>Net this month</span><b>${peso(m.balance)}</b></article><article class="report-stat"><span>Year to date</span><b>${peso(y.balance)}</b><small>Net balance</small></article></div>
  <div class="card report-card"><div class="section-heading"><div><b>Cash flow</b><span class="sm">Income and expenses by month</span></div><div class="report-legend"><span><i class="report-income"></i>Income</span><span><i class="report-expense"></i>Expenses</span></div></div>${months.length?`<div class="report-chart">${monthBars}</div>`:'<p class="mu empty">Monthly activity will appear here when you add transactions.</p>'}</div>
  <div class="report-columns"><div class="card report-card"><div class="section-heading"><div><b>Spending breakdown</b><span class="sm">This month by category</span></div></div>${categories.length?categories.map(([name,value])=>`<div class="report-category"><div class="row"><span>${esc(name)}</span><b>${peso(value)}</b></div><div class="bar"><i style="width:${m.expense?Math.min(100,Number(value)*100/m.expense):0}%"></i></div></div>`).join(''):'<p class="mu empty">No spending recorded this month.</p>'}</div>
  <div class="card report-card report-savings"><div><span class="report-eyebrow">SAVINGS GOALS</span><h4>Progress so far</h4></div><b class="report-percent">${response.savings||0}%</b><p class="sm">Progress across your family’s savings goals.</p>${bar(response.savings||0)}</div></div>
  <div class="report-actions"><button class="btn" data-act="pdfreport">Save report as PDF</button><button class="btn alt" data-act="export">Export transactions (CSV)</button></div></section>` };
};
V.profile = async () => {
  const f = S.me.family, profile = await api('profile');
  const avatar = profile.avatar_data ? `<img class="profile-avatar" id="profile-avatar-preview" src="${profile.avatar_data}" alt="Profile photo">` : `<div class="profile-avatar profile-avatar-placeholder" id="profile-avatar-preview">${esc(profile.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</div>`;
  return { title: 'Profile Settings', back: 1, html: `<div class="profile-heading">${avatar}<div><b>${esc(profile.name)}</b><span class="sm">${esc(profile.email)}<br>${esc(f.name)} • ${f.owner ? 'Owner' : 'Member'}</span></div></div>
  <form class="card profile-form" data-f="saveprofile"><b>Personal information</b><label for="profile-photo">Profile photo</label><input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"><label>Name</label><input name="name" autocomplete="name" maxlength="120" value="${esc(profile.name)}" required><label>Email address</label><input name="email" type="email" autocomplete="email" maxlength="200" value="${esc(profile.email)}" required><p class="mu">Changing your email requires your current password and takes effect immediately.</p><label>Current password <span class="mu">(only needed to change email)</span></label><input name="current_password" type="password" autocomplete="current-password"><label class="check-row"><input name="remove_avatar" type="checkbox"> Remove profile photo</label><button class="btn">Save profile</button></form>
  <form class="card profile-form" data-f="changepassword"><b>Change password</b><label>Current password</label><input name="current_password" type="password" autocomplete="current-password" required><label>New password</label><input name="new_password" type="password" autocomplete="new-password" minlength="8" required><label>Confirm new password</label><input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required><button class="btn alt">Update password</button></form>
  <div class="card"><b>Family plan</b><span class="sm">${f.plan === 'free' ? 'Free' : 'Premium'} • Up to ${f.limit} family members</span></div>${f.owner?'<button class="btn" data-go="premium">Manage plan</button>':''}<button class="btn alt" data-go="reports">Reports</button><button class="btn alt" data-act="signout">Sign Out</button>` };
};

const TABS = [['home', 'Home'], ['tx', 'Transactions'], ['bills', 'Bills'], ['savings', 'Savings'], ['members', 'Family']];
function filterTransactions() {
  const list=document.getElementById('tx-list'); if(!list) return;
  const q=(document.getElementById('tx-search')?.value||'').trim().toLowerCase(), month=document.getElementById('tx-month')?.value||'', category=document.getElementById('tx-category')?.value||'', kind=document.getElementById('tx-kind')?.value||'', sort=document.getElementById('tx-sort')?.value||'newest';
  const rows=[...list.querySelectorAll('.transaction-item')];
  rows.forEach(row=>{row.hidden=Boolean((q&&!row.dataset.search.includes(q))||(month&&!row.dataset.date.startsWith(month))||(category&&row.dataset.category!==category)||(kind&&row.dataset.kind!==kind));});
  rows.sort((a,b)=>sort==='oldest'?a.dataset.date.localeCompare(b.dataset.date):sort==='highest'?Number(b.dataset.amount)-Number(a.dataset.amount):sort==='lowest'?Number(a.dataset.amount)-Number(b.dataset.amount):b.dataset.date.localeCompare(a.dataset.date)).forEach(row=>list.appendChild(row));
  let empty=document.getElementById('tx-empty');
  if(!rows.length){if(!empty){empty=document.createElement('p');empty.id='tx-empty';empty.className='mu empty';empty.textContent='No transactions yet. Add your first income or expense.';list.appendChild(empty);}}
  else if(!empty){empty=document.createElement('p');empty.id='tx-empty';empty.className='mu empty';empty.textContent='No transactions match these filters.';list.appendChild(empty);}
  if(empty) empty.hidden=rows.some(r=>!r.hidden);
}
async function render() {
  try {
    const v = await V[S.view]();
    app.innerHTML = (v.bare ? '' : `<header>${v.back || (!v.nav && S.stack.length) ? '<button class="back" data-back>‹</button>' : ''}<h2>${v.title}</h2>${v.right || ''}</header>`) + `<main class="${v.bare ? 'bare' : ''}">${v.html}</main>` + (v.nav ? `<nav>${TABS.map(t => `<a data-tab="${t[0]}" class="${S.view === t[0] ? 'on' : ''}">${t[1]}</a>`).join('')}</nav>` : '');
    scrollTo(0, 0);
  } catch (e) { toast(e.message); if (!localStorage.t) { S.view = 'welcome'; render(); } }
}
const go = v => { S.stack.push(S.view); S.view = v; render(); };
const tab = v => { S.stack = []; S.view = v; render(); };
async function loadMe() { S.me = await api('me'); }
async function enter() { await loadMe(); S.stack = []; S.view = S.me.family ? 'home' : 'family'; render(); }

const F = {
  async signup(d) { if (d.password !== d.password2) throw new Error('Passwords do not match'); if (S.inviteToken) d.invite_token = S.inviteToken; localStorage.t = (await api('signup', 'POST', d)).token; if (S.inviteToken) { history.replaceState({}, '', '/'); S.inviteToken = null; } await enter(); },
  async signin(d) { localStorage.t = (await api('signin', 'POST', d)).token; if (S.inviteToken) { await api(`invitations/${encodeURIComponent(S.inviteToken)}/accept`, 'POST'); history.replaceState({}, '', '/'); S.inviteToken = null; } await enter(); },
  async saveprofile(d) {
    const photo = d.photo;
    delete d.photo;
    if (photo?.size) d.avatar_data = await prepareProfilePhoto(photo);
    else if (d.remove_avatar === 'on') d.avatar_data = '';
    delete d.remove_avatar;
    await api('profile', 'PUT', d);
    await loadMe();
    render();
    toast('Profile saved');
  },
  async changepassword(d) {
    if (d.new_password !== d.confirm_password) throw new Error('New passwords do not match');
    const result = await api('profile', 'PUT', {current_password:d.current_password,new_password:d.new_password});
    localStorage.t = result.token;
    await loadMe();
    render();
    toast('Password updated');
  },
  async resetrequest(d) { await api('password-reset/request','POST',d); S.resetRequested=true; render(); },
  async resetcomplete(d) { if(d.password!==d.password2) throw new Error('Passwords do not match'); await api('password-reset/complete','POST',{token:S.resetToken,password:d.password}); localStorage.removeItem('t'); S.me=null; S.resetToken=null; history.replaceState({},'', '/'); S.view='signin'; S.stack=[]; render(); toast('Password updated. Sign in with your new password.'); },
  async family(d) { await api('family', 'POST', d); await loadMe(); S.stack = []; S.view = 'invite'; render(); },
  async invite(d) { S.newInvite = (await api('invite', 'POST', d)).invitation; await loadMe(); render(); toast(S.newInvite.delivery === 'sent' ? 'Invitation email sent' : S.newInvite.delivery === 'failed' ? 'Email failed; invitation is saved' : 'Invitation saved; share the link'); },
  async edittx(d) { if (!S.editingTx) throw new Error('Transaction not found'); await api(`transactions/${S.editingTx.id}`, 'PUT', d); S.editingTx = null; S.stack=[]; S.view='tx'; await render(); toast('Transaction updated'); },
  async addtx(d) { await api('transactions', 'POST', d); toast('Saved'); tab('tx'); },
  async addbill(d) { await api('bills', 'POST', d); tab('bills'); },
  async savebill(d) { if(!S.editingBill) throw new Error('Bill not found'); await api(`bills/${S.editingBill.id}`,'PUT',d); S.editingBill=null; toast('Bill updated'); tab('bills'); },
  async addgoal(d) { await api('goals', 'POST', d); tab('savings'); },
  async savebudget(d) { if(S.editingBudget?.id) await api(`budgets/${S.editingBudget.id}`,'PUT',d); else await api('budgets','POST',d); S.editingBudget=null; toast('Budget saved'); tab('budgets'); },
  async checkout(d) { S.billing=d.period;const result=await api('subscriptions/checkout','POST',d);S.pendingPayment=result;go('payment'); },
  async paymongo(d) {
    const p=S.pendingPayment;if(!p)throw new Error('Checkout session expired. Start again from Premium.');
    const auth='Basic '+btoa(p.public_key+':'),headers={'Content-Type':'application/json','Accept':'application/json','Authorization':auth};
    const attrs={type:p.payment_method,billing:{name:d.billing_name,email:d.billing_email}};
    if(p.payment_method==='card')attrs.details={card_number:d.card_number.replace(/\s/g,''),exp_month:Number(d.exp_month),exp_year:Number(d.exp_year),cvc:d.cvc};
    else attrs.billing.phone=d.billing_phone;
    const methodResponse=await fetch('https://api.paymongo.com/v1/payment_methods',{method:'POST',headers,body:JSON.stringify({data:{attributes:attrs}})}),methodBody=await methodResponse.json().catch(()=>({}));
    if(!methodResponse.ok||!methodBody.data?.id)throw new Error('PayMongo could not create the payment method. Check the details or try again.');
    const attachResponse=await fetch(`https://api.paymongo.com/v1/payment_intents/${encodeURIComponent(p.payment_intent_id)}/attach`,{method:'POST',headers,body:JSON.stringify({data:{attributes:{payment_method:methodBody.data.id,client_key:p.client_key,return_url:p.return_url}}})}),attachBody=await attachResponse.json().catch(()=>({}));
    if(!attachResponse.ok)throw new Error('PayMongo could not attach the payment method. No Premium access was granted.');
    const intent=attachBody.data?.attributes||{};
    if(intent.next_action?.redirect?.url){const redirect=new URL(intent.next_action.redirect.url);if(redirect.protocol!=='https:')throw new Error('PayMongo returned an invalid secure redirect.');location.assign(redirect.href);return;}
    S.pendingPayment=null;S.paymentReturn=String(p.subscription_id);history.replaceState({},'','/?payment='+encodeURIComponent(S.paymentReturn));S.view='paymentstatus';S.stack=[];render();
  },
};
const A = {
  finish: () => tab('home'),
  signout() { localStorage.removeItem('t'); S.me = null; tab('welcome'); },
  async pay(id) { await api(`bills/${id}/pay`, 'POST'); toast('Marked as paid'); render(); },
  async editbill(id) { S.editingBill=await api(`bills/${id}`); go('editbill'); },
  async deletebill(id) { if(!confirm('Delete this unpaid bill?')) return; await api(`bills/${id}`,'DELETE'); toast('Bill deleted'); render(); },
  async edittx(id) { S.editingTx = await api(`transactions/${id}`); go('edittx'); },
  async deletetx(id) { if (!confirm('Delete this transaction?')) return; await api(`transactions/${id}`, 'DELETE'); toast('Transaction deleted'); render(); },
  async editbudget(id) { S.editingBudget = (await api('budgets')).find(b=>String(b.id)===String(id)); if(!S.editingBudget) throw new Error('Budget not found'); go('addbudget'); },
  async deletebudget(id) { if(!confirm('Delete this budget?')) return; await api(`budgets/${id}`,'DELETE'); toast('Budget deleted'); render(); },
  async refreshpayment() { await render(); },
  async cancelsubscription() { if(!confirm('Cancel the recurring Premium subscription? Existing open invoices may still be collectible.'))return;await api('subscriptions/cancel','POST');await loadMe();toast('Subscription canceled');render(); },
  async fund(id) { const a = prompt('Amount to add (₱)'); if (!a) return; await api(`goals/${id}/add`, 'POST', { amount: a }); render(); },
  async copy(id) { const inv = S.me.family.invites.find(x => String(x.id) === String(id)); if (!inv) throw new Error('Invitation not found'); await navigator.clipboard.writeText(inv.link); toast('Invitation link copied'); },
  async copynew() { if (!S.newInvite) return; await navigator.clipboard.writeText(S.newInvite.link); toast('Invitation link copied'); },
  async revoke(id) { if (!confirm('Cancel this invitation? The link will stop working.')) return; await api(`invitations/${id}/revoke`, 'POST'); await loadMe(); toast('Invitation canceled'); render(); },
  async removemember(id) { if (!confirm('Remove this person from the family? Their account and past transactions will remain, but they will lose access to this family.')) return; await api(`family/members/${id}`, 'DELETE'); await loadMe(); toast('Member removed from the family'); render(); },
  async resend(id) { const result = await api(`invitations/${id}/resend`, 'POST'); S.newInvite = { ...result, email: S.me.family.invites.find(x => String(x.id) === String(id))?.email || '', delivery: result.delivery }; await loadMe(); render(); toast(result.delivery === 'sent' ? 'Invitation email sent' : result.delivery === 'failed' ? 'Email failed; invitation link is available' : 'Invitation link is available to share'); },
  async acceptinvite() { await api(`invitations/${encodeURIComponent(S.inviteToken)}/accept`, 'POST'); history.replaceState({}, '', '/'); S.inviteToken = null; await enter(); toast('You joined the family'); },
  async export() { const b = await api('export'), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'gastos-transactions.csv'; l.click(); setTimeout(()=>URL.revokeObjectURL(l.href),1000); },
  pdfreport() { window.print(); },
};
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-go],[data-back],[data-act],[data-tab]'); if (!el) return;
  try {
    if (el.dataset.k) S.k = el.dataset.k;
    if (el.dataset.go) go(el.dataset.go);
    else if (el.dataset.tab) tab(el.dataset.tab);
    else if (el.hasAttribute('data-back')) { S.view = S.stack.pop() || 'home'; render(); }
    else await A[el.dataset.act](el.dataset.id);
  } catch (x) { toast(x.message); }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, button = form.querySelector('button[type="submit"],button:not([type])');
  if (button?.disabled) return;
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Please wait…'; }
  try { await F[form.dataset.f](Object.fromEntries(new FormData(form))); } catch (x) { toast(x.message); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = label; } }
});
document.addEventListener('input', e => { if(e.target.id==='tx-search') filterTransactions(); });
document.addEventListener('change', e => { if(['tx-month','tx-category','tx-kind','tx-sort'].includes(e.target.id)) filterTransactions(); });
document.addEventListener('change', e => {
  if (e.target.id !== 'profile-photo' || !e.target.files?.[0]) return;
  const image = document.getElementById('profile-avatar-preview');
  if (image) image.src = URL.createObjectURL(e.target.files[0]);
});
(async () => { if (S.inviteToken) { S.view = 'invitation'; render(); return; } if(S.resetToken){S.view='resetform';render();return;} if(S.paymentReturn&&localStorage.t){S.view='paymentstatus';render();return;} if (localStorage.t) { try { await enter(); return; } catch (e) { } } render(); })();

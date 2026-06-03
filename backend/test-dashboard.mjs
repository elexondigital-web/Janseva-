// Smoke test for Dashboard endpoint
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;

function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function bad(label, detail) { fail++; console.log(`  ✗ ${label}`); if (detail) console.log(`     ${detail}`); }
function expect(cond, label, detail) { cond ? ok(label) : bad(label, detail); }

async function req(method, path, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json };
}

(async () => {
  console.log('[SETUP] Logging in as super admin…');
  const login = await req('POST', '/auth/login', {
    body: { email: 'admin@janseva.in', password: 'Admin@123' },
  });
  if (login.status !== 200) { bad('login', `status ${login.status}`); process.exit(1); }
  const auth = login.body.data.accessToken;
  ok('Logged in');

  console.log('\n=== DASHBOARD STATS ===');

  const noAuth = await req('GET', '/dashboard/stats');
  expect(noAuth.status === 401, 'GET /dashboard/stats without token → 401',
    `got ${noAuth.status}`);

  const res = await req('GET', '/dashboard/stats', { auth });
  expect(res.status === 200, 'GET /dashboard/stats → 200', `got ${res.status}`);

  const data = res.body?.data;
  expect(!!data, 'response has data envelope');

  // Totals
  expect(
    data && typeof data.totals === 'object' &&
      typeof data.totals.totalMembers === 'number' &&
      typeof data.totals.activeMembers === 'number' &&
      typeof data.totals.totalBlocks === 'number' &&
      typeof data.totals.totalWards === 'number' &&
      typeof data.totals.totalBooths === 'number',
    'totals has all KPI fields',
    `totals=${JSON.stringify(data?.totals)}`,
  );

  console.log(
    `  (seed: ${data.totals.totalMembers} members, ${data.totals.totalBlocks} blocks, ${data.totals.totalWards} wards, ${data.totals.totalBooths} booths)`,
  );

  // Breakdowns
  expect(
    Array.isArray(data.byGender) && data.byGender.length === 3,
    'byGender has 3 entries',
  );
  expect(
    Array.isArray(data.byRole) && data.byRole.length === 4,
    'byRole has 4 entries',
  );
  expect(
    Array.isArray(data.byStatus) && data.byStatus.length === 3,
    'byStatus has 3 entries',
  );

  // Sum-check: status totals should equal totalMembers
  const statusSum = data.byStatus.reduce((s, r) => s + r.value, 0);
  expect(
    statusSum === data.totals.totalMembers,
    `status breakdown sums to totalMembers (${statusSum} === ${data.totals.totalMembers})`,
  );

  const genderSum = data.byGender.reduce((s, r) => s + r.value, 0);
  expect(
    genderSum === data.totals.totalMembers,
    `gender breakdown sums to totalMembers (${genderSum} === ${data.totals.totalMembers})`,
  );

  // Recent members
  expect(
    Array.isArray(data.recentMembers) && data.recentMembers.length <= 5,
    `recentMembers has ≤5 items (got ${data.recentMembers?.length})`,
  );
  if (data.recentMembers.length > 0) {
    const m = data.recentMembers[0];
    expect(
      m.id && m.uniqueId && m.fullName && m.phone,
      'recent member has id/uniqueId/fullName/phone',
    );
  }

  // Top blocks
  expect(
    Array.isArray(data.topBlocks) && data.topBlocks.length >= 1,
    `topBlocks has ≥1 entry (got ${data.topBlocks?.length})`,
  );
  if (data.topBlocks.length > 0) {
    const b = data.topBlocks[0];
    expect(
      b.id && b.name && b.district && typeof b.count === 'number',
      'top block has id/name/district/count',
    );
  }

  // new-this-month should be ≤ new-last-30-days
  expect(
    data.totals.newThisMonth <= data.totals.newLast30Days ||
      data.totals.newLast30Days === data.totals.newThisMonth,
    'newThisMonth ≤ newLast30Days (consistent time windows)',
  );

  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(2);
});

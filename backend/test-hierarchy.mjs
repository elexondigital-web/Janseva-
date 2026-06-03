// One-shot smoke test for Hierarchy endpoints
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
  return { status: res.status, body: json, raw: text };
}

(async () => {
  // ---- LOGIN ----
  console.log('[SETUP] Logging in as super admin…');
  const login = await req('POST', '/auth/login', {
    body: { email: 'admin@janseva.in', password: 'Admin@123' },
  });
  if (login.status !== 200) { bad('login', `status ${login.status}`); process.exit(1); }
  const auth = login.body.data.accessToken;
  ok('Logged in');

  // ========= BLOCKS =========
  console.log('\n=== BLOCKS ===');

  const blocks = await req('GET', '/blocks', { auth });
  expect(blocks.status === 200 && blocks.body.data.length === 1, 'GET /blocks → 1 seeded block',
    `got status=${blocks.status}, count=${blocks.body?.data?.length}`);
  const seedBlockId = blocks.body.data[0].id;

  const detail = await req('GET', `/blocks/${seedBlockId}`, { auth });
  expect(detail.status === 200 && detail.body.data.wards.length === 3,
    'GET /blocks/:id → detail with 3 wards',
    `got status=${detail.status}, wards=${detail.body?.data?.wards?.length}`);

  const create = await req('POST', '/blocks', {
    auth,
    body: { name: 'Test Block', district: 'Amritsar', state: 'Punjab' },
  });
  expect(create.status === 201, 'POST /blocks → 201', `got ${create.status}`);
  const newBlockId = create.body.data.id;

  const dup = await req('POST', '/blocks', {
    auth,
    body: { name: 'Test Block', district: 'Amritsar' },
  });
  expect(dup.status === 409, 'POST /blocks duplicate → 409', `got ${dup.status}`);

  const patch = await req('PATCH', `/blocks/${newBlockId}`, {
    auth,
    body: { district: 'Jalandhar' },
  });
  expect(patch.status === 200 && patch.body.data.district === 'Jalandhar',
    'PATCH /blocks/:id → 200 with updated district',
    `status=${patch.status}, district=${patch.body?.data?.district}`);

  const badDto = await req('POST', '/blocks', { auth, body: { state: 'Punjab' } });
  expect(badDto.status === 400, 'POST /blocks missing name → 400 ValidationPipe',
    `got ${badDto.status}`);

  const noAuth = await req('GET', '/blocks');
  expect(noAuth.status === 401, 'GET /blocks without token → 401',
    `got ${noAuth.status}`);

  const delSeeded = await req('DELETE', `/blocks/${seedBlockId}`, { auth });
  expect(delSeeded.status === 409, 'DELETE seeded block (has wards) → 409',
    `got ${delSeeded.status} msg="${delSeeded.body?.message}"`);

  const delEmpty = await req('DELETE', `/blocks/${newBlockId}`, { auth });
  expect(delEmpty.status === 200, 'DELETE empty test block → 200',
    `got ${delEmpty.status}`);

  // ========= WARDS =========
  console.log('\n=== WARDS ===');

  const wards = await req('GET', '/wards', { auth });
  expect(wards.status === 200 && wards.body.data.length === 3,
    'GET /wards → 3 seeded wards', `got ${wards.body?.data?.length}`);

  const wardsFilt = await req('GET', `/wards?blockId=${seedBlockId}`, { auth });
  expect(wardsFilt.body.data.length === 3,
    'GET /wards?blockId=X → filter works',
    `got ${wardsFilt.body?.data?.length}`);

  const wardWithBooths = wards.body.data.find((w) => w._count.booths > 0);
  expect(!!wardWithBooths, 'Found at least one ward with booths');

  const createWard = await req('POST', '/wards', {
    auth,
    body: { name: 'Ward 99 — Test', blockId: seedBlockId },
  });
  expect(createWard.status === 201, 'POST /wards → 201', `got ${createWard.status}`);
  const newWardId = createWard.body.data.id;

  const badBlock = await req('POST', '/wards', {
    auth,
    body: { name: 'Orphan', blockId: 'does-not-exist' },
  });
  expect(badBlock.status === 400, 'POST /wards with invalid blockId → 400',
    `got ${badBlock.status}`);

  const delWardWithBooths = await req('DELETE', `/wards/${wardWithBooths.id}`, { auth });
  expect(delWardWithBooths.status === 409, 'DELETE ward with booths → 409',
    `got ${delWardWithBooths.status}`);

  const delEmptyWard = await req('DELETE', `/wards/${newWardId}`, { auth });
  expect(delEmptyWard.status === 200, 'DELETE empty ward → 200',
    `got ${delEmptyWard.status}`);

  // ========= BOOTHS =========
  console.log('\n=== BOOTHS ===');

  const booths = await req('GET', '/booths', { auth });
  expect(booths.status === 200 && booths.body.data.length === 5,
    'GET /booths → 5 seeded booths', `got ${booths.body?.data?.length}`);

  const boothWithPeople = booths.body.data.find((b) => b._count.people > 0);
  const boothsByWard = await req('GET', `/booths?wardId=${wardWithBooths.id}`, { auth });
  expect(boothsByWard.body.data.length > 0,
    `GET /booths?wardId=X → filter returns ${boothsByWard.body?.data?.length} booths`);

  const createBooth = await req('POST', '/booths', {
    auth,
    body: { name: 'Booth 99', wardId: wardWithBooths.id, location: 'Test Location' },
  });
  expect(createBooth.status === 201, 'POST /booths → 201',
    `got ${createBooth.status} body=${JSON.stringify(createBooth.body)}`);
  const newBoothId = createBooth.body.data.id;

  const patchBooth = await req('PATCH', `/booths/${newBoothId}`, {
    auth,
    body: { location: 'Updated Location' },
  });
  expect(patchBooth.status === 200 && patchBooth.body.data.location === 'Updated Location',
    'PATCH /booths/:id → 200 with updated location');

  if (boothWithPeople) {
    const delBoothPeople = await req('DELETE', `/booths/${boothWithPeople.id}`, { auth });
    expect(delBoothPeople.status === 409, 'DELETE booth with people → 409',
      `got ${delBoothPeople.status}`);
  } else {
    console.log('  - Skipping booth-with-people test (none found)');
  }

  const delEmptyBooth = await req('DELETE', `/booths/${newBoothId}`, { auth });
  expect(delEmptyBooth.status === 200, 'DELETE empty booth → 200');

  const nope = await req('GET', '/booths/does-not-exist', { auth });
  expect(nope.status === 404, 'GET /booths/nonexistent → 404');

  // ========= SUMMARY =========
  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(2);
});

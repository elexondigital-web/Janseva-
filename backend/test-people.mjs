// Smoke test for People + IDCard endpoints
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
  console.log('[SETUP] Logging in…');
  const login = await req('POST', '/auth/login', {
    body: { email: 'admin@janseva.in', password: 'Admin@123' },
  });
  if (login.status !== 200) { bad('login', `status ${login.status}`); process.exit(1); }
  const auth = login.body.data.accessToken;
  ok('Logged in');

  // Get hierarchy for person creation
  const blocks = await req('GET', '/blocks', { auth });
  const blockId = blocks.body.data[0].id;
  const blockDetail = await req('GET', `/blocks/${blockId}`, { auth });
  const ward = blockDetail.body.data.wards[0];
  const wardId = ward.id;
  const booths = await req('GET', `/booths?wardId=${wardId}`, { auth });
  const boothId = booths.body.data[0].id;

  console.log('\n=== PEOPLE LIST ===');
  const listAll = await req('GET', '/people', { auth });
  expect(listAll.status === 200, 'GET /people → 200', `got ${listAll.status}`);
  expect(
    typeof listAll.body?.data?.total === 'number',
    'list response has pagination meta',
    `total=${listAll.body?.data?.total}`,
  );
  const seedCount = listAll.body.data.total;
  console.log(`  (seed contains ${seedCount} people)`);

  const searchByPhone = await req('GET', '/people?search=9876', { auth });
  expect(
    searchByPhone.status === 200 && searchByPhone.body.data.items.length >= 0,
    'GET /people?search=… works',
    `items=${searchByPhone.body?.data?.items?.length}`,
  );

  const filterByRole = await req('GET', '/people?role=MEMBER', { auth });
  expect(
    filterByRole.status === 200,
    `GET /people?role=MEMBER → ${filterByRole.body?.data?.items?.length} items`,
  );

  const paged = await req('GET', '/people?page=1&limit=2', { auth });
  expect(
    paged.status === 200 && paged.body.data.limit === 2,
    'pagination works (limit=2)',
    `got limit=${paged.body?.data?.limit}`,
  );

  console.log('\n=== PEOPLE STATS ===');
  const stats = await req('GET', '/people/stats', { auth });
  expect(
    stats.status === 200 && typeof stats.body.data.total === 'number',
    'GET /people/stats → 200 with total',
    `status=${stats.status}, total=${stats.body?.data?.total}`,
  );
  expect(
    Array.isArray(stats.body.data.byGender) && stats.body.data.byGender.length === 3,
    'stats has byGender breakdown (3 entries)',
  );

  console.log('\n=== PEOPLE CRUD ===');
  const newPerson = {
    fullName: 'Test Person One',
    gender: 'MALE',
    phone: '9999900001',
    blockId,
    wardId,
    boothId,
    role: 'MEMBER',
    status: 'ACTIVE',
  };
  const create = await req('POST', '/people', { auth, body: newPerson });
  expect(
    create.status === 201 && create.body.data.uniqueId?.startsWith('JS-'),
    'POST /people → 201 with JS- uniqueId',
    `status=${create.status}, uniqueId=${create.body?.data?.uniqueId}`,
  );
  const personId = create.body.data.id;
  const uniqueId = create.body.data.uniqueId;

  const getOne = await req('GET', `/people/${personId}`, { auth });
  expect(
    getOne.status === 200 && getOne.body.data.fullName === 'Test Person One',
    'GET /people/:id → 200 with full detail',
  );

  const badPhone = await req('POST', '/people', {
    auth,
    body: { ...newPerson, phone: '123', fullName: 'Bad' },
  });
  expect(badPhone.status === 400, 'POST /people bad phone → 400 validation',
    `got ${badPhone.status}`);

  const badHierarchy = await req('POST', '/people', {
    auth,
    body: { ...newPerson, fullName: 'Bad H', boothId: 'does-not-exist' },
  });
  expect(badHierarchy.status === 400, 'POST /people invalid booth → 400',
    `got ${badHierarchy.status}`);

  const patch = await req('PATCH', `/people/${personId}`, {
    auth,
    body: { occupation: 'Farmer', status: 'INACTIVE' },
  });
  expect(
    patch.status === 200 && patch.body.data.occupation === 'Farmer' && patch.body.data.status === 'INACTIVE',
    'PATCH /people/:id → 200 updated',
  );

  console.log('\n=== ID CARDS ===');
  const card = await req('POST', `/idcards/person/${personId}`, { auth });
  expect(
    card.status === 201 && card.body.data.uniqueCardId === `CARD-${uniqueId}`,
    'POST /idcards/person/:id → 201 CARD-JS-xxxxxx',
    `status=${card.status}, cardId=${card.body?.data?.uniqueCardId}`,
  );
  expect(
    typeof card.body.data.qrCodeDataUrl === 'string' &&
      card.body.data.qrCodeDataUrl.startsWith('data:image/png;base64,'),
    'issue returns QR code data URL',
  );

  const dupCard = await req('POST', `/idcards/person/${personId}`, { auth });
  expect(dupCard.status === 409, 'POST /idcards duplicate → 409',
    `got ${dupCard.status}`);

  const getCard = await req('GET', `/idcards/person/${personId}`, { auth });
  expect(
    getCard.status === 200 && getCard.body.data.person.fullName === 'Test Person One',
    'GET /idcards/person/:id → 200 with person details',
  );

  const revoke = await req('DELETE', `/idcards/person/${personId}`, { auth });
  expect(
    revoke.status === 200 && revoke.body.data.isActive === false,
    'DELETE /idcards/person/:id → 200, isActive=false',
  );

  console.log('\n=== CLEANUP ===');
  const del = await req('DELETE', `/people/${personId}`, { auth });
  expect(del.status === 200, 'DELETE /people/:id → 200',
    `got ${del.status} msg="${del.body?.message}"`);

  const gone = await req('GET', `/people/${personId}`, { auth });
  expect(gone.status === 404, 'GET deleted person → 404',
    `got ${gone.status}`);

  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(2);
});

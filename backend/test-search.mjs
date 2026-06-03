// Smoke test for GET /people/search (trigram + multi-field fuzzy search)
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

  // Discover hierarchy + create a known seed person so the test is deterministic
  const blocks = await req('GET', '/blocks', { auth });
  const blockId = blocks.body.data[0].id;
  const blockDetail = await req('GET', `/blocks/${blockId}`, { auth });
  const wardId = blockDetail.body.data.wards[0].id;
  const booths = await req('GET', `/booths?wardId=${wardId}`, { auth });
  const boothId = booths.body.data[0].id;

  console.log('\n=== SETUP: seed a known person ===');
  const seed = {
    fullName: 'Harpreet Singh Dhillon',
    gender: 'MALE',
    phone: '9812345678',
    aadhaarNumber: '432156789012',
    voterId: 'ABC1234567',
    address: 'House 42, Gali 7, Ludhiana',
    blockId,
    wardId,
    boothId,
    role: 'MEMBER',
    status: 'ACTIVE',
  };
  const created = await req('POST', '/people', { auth, body: seed });
  expect(created.status === 201, 'seeded Harpreet Singh Dhillon',
    `status=${created.status}`);
  const personId = created.body?.data?.id;
  const uniqueId = created.body?.data?.uniqueId;

  console.log('\n=== BASELINE ===');
  const empty = await req('GET', '/people/search', { auth });
  expect(
    empty.status === 200 && typeof empty.body.data.total === 'number',
    'GET /people/search (no q) → 200 with pagination envelope',
    `status=${empty.status}, total=${empty.body?.data?.total}`,
  );
  expect(
    typeof empty.body.data.query === 'string',
    'response includes query echo',
    `query=${JSON.stringify(empty.body?.data?.query)}`,
  );

  console.log('\n=== EXACT MATCH ===');
  const byExactName = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet Singh')}`,
    { auth },
  );
  expect(
    byExactName.status === 200 && byExactName.body.data.items.length >= 1,
    `full name match → ${byExactName.body?.data?.items?.length} items`,
  );
  expect(
    byExactName.body.data.items.some((p) => p.id === personId),
    'seeded person appears in results for "Harpreet Singh"',
  );

  const byPhone = await req('GET', '/people/search?q=9812345678', { auth });
  expect(
    byPhone.status === 200 &&
      byPhone.body.data.items.some((p) => p.id === personId),
    'phone exact match returns seeded person',
  );

  const byAadhaar = await req('GET', '/people/search?q=432156789012', { auth });
  expect(
    byAadhaar.status === 200 &&
      byAadhaar.body.data.items.some((p) => p.id === personId),
    'aadhaar exact match returns seeded person',
  );

  const byVoter = await req('GET', '/people/search?q=ABC1234567', { auth });
  expect(
    byVoter.status === 200 &&
      byVoter.body.data.items.some((p) => p.id === personId),
    'voterId exact match returns seeded person',
  );

  const byUnique = await req(
    'GET',
    `/people/search?q=${encodeURIComponent(uniqueId)}`,
    { auth },
  );
  expect(
    byUnique.status === 200 &&
      byUnique.body.data.items.some((p) => p.id === personId),
    `uniqueId (${uniqueId}) match returns seeded person`,
  );

  console.log('\n=== PARTIAL / FUZZY ===');
  const partial = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet')}`,
    { auth },
  );
  expect(
    partial.status === 200 &&
      partial.body.data.items.some((p) => p.id === personId),
    'partial name "Harpreet" matches',
  );

  const typo = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpret')}`,
    { auth },
  );
  // Trigram should still rank seeded person in the top results for a 1-letter typo
  expect(
    typo.status === 200 && typo.body.data.items.length >= 1,
    `fuzzy typo "Harpret" returns ${typo.body?.data?.items?.length} items`,
  );

  const addressPartial = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Ludhiana')}`,
    { auth },
  );
  expect(
    addressPartial.status === 200 &&
      addressPartial.body.data.items.some((p) => p.id === personId),
    'address substring "Ludhiana" matches',
  );

  console.log('\n=== FILTERS ===');
  const byGender = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet')}&gender=MALE`,
    { auth },
  );
  expect(
    byGender.status === 200 &&
      byGender.body.data.items.every((p) => p.gender === 'MALE'),
    'gender filter honored',
  );

  const byGenderOpposite = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet')}&gender=FEMALE`,
    { auth },
  );
  expect(
    byGenderOpposite.status === 200 &&
      !byGenderOpposite.body.data.items.some((p) => p.id === personId),
    'gender=FEMALE excludes our MALE seed',
  );

  const byWard = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet')}&wardId=${wardId}`,
    { auth },
  );
  expect(
    byWard.status === 200 &&
      byWard.body.data.items.some((p) => p.id === personId),
    'wardId filter still returns seeded person in that ward',
  );

  const byBooth = await req(
    'GET',
    `/people/search?q=${encodeURIComponent('Harpreet')}&boothId=${boothId}`,
    { auth },
  );
  expect(
    byBooth.status === 200 &&
      byBooth.body.data.items.some((p) => p.id === personId),
    'boothId filter works',
  );

  const filtersOnly = await req(
    'GET',
    `/people/search?wardId=${wardId}&gender=MALE`,
    { auth },
  );
  expect(
    filtersOnly.status === 200 && filtersOnly.body.data.total >= 1,
    `filters without q → ${filtersOnly.body?.data?.total} total`,
  );

  console.log('\n=== VALIDATION ===');
  const badAge = await req('GET', '/people/search?ageMin=abc', { auth });
  expect(badAge.status === 400, 'non-numeric ageMin → 400', `got ${badAge.status}`);

  const tooOld = await req('GET', '/people/search?ageMax=500', { auth });
  expect(tooOld.status === 400, 'ageMax > 120 → 400', `got ${tooOld.status}`);

  const badGender = await req('GET', '/people/search?gender=INVALID', { auth });
  expect(badGender.status === 400, 'bad gender enum → 400', `got ${badGender.status}`);

  console.log('\n=== PAGINATION ===');
  const paged = await req('GET', '/people/search?limit=2&page=1', { auth });
  expect(
    paged.status === 200 &&
      paged.body.data.limit === 2 &&
      paged.body.data.items.length <= 2,
    'pagination limit=2 honored',
    `items=${paged.body?.data?.items?.length}`,
  );

  console.log('\n=== AUTH ===');
  const noAuth = await req('GET', '/people/search?q=test');
  expect(noAuth.status === 401, 'unauthenticated → 401', `got ${noAuth.status}`);

  console.log('\n=== CLEANUP ===');
  const del = await req('DELETE', `/people/${personId}`, { auth });
  expect(del.status === 200, 'cleanup: delete seeded person', `got ${del.status}`);

  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(2);
});

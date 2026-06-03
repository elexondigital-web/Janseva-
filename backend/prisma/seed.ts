/* eslint-disable no-console */
/**
 * JanSeva demo seed.
 *
 * Wipes the database and reloads a complete, presentation-ready
 * dataset:
 *   - 1 block, 4 wards, 8 booths
 *   - 4 admin accounts (one per role)
 *   - 30 members spanning gender / category / age groups
 *   - 6 events (3 past + 3 upcoming)
 *   - ~110 attendance records spread across the past events
 *   - 8 messages in history (mix of channels + statuses, including demo)
 *   - 12 audit log entries to populate the activity panel
 *
 * Phone numbers are 10-digit (matches DTO regex).
 * Aadhaar numbers are 12-digit synthetic but valid-format.
 * Voter IDs are 10-char alphanumeric.
 *
 * Login credentials printed at the end.
 */

import {
  PrismaClient,
  Gender,
  Category,
  PartyRole,
  Status,
  AdminRole,
  EventType,
  AttendanceMethod,
  MessageType,
  TargetLevel,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---- Helpers ----------------------------------------------------------

const BCRYPT_ROUNDS = 12;

function pad6(n: number) {
  return String(n).padStart(6, '0');
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function daysAgo(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t;
}

function daysAhead(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t;
}

// ---- Main -------------------------------------------------------------

async function main() {
  console.log('==> Wiping database');

  await prisma.auditLog.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.iDCard.deleteMany();
  await prisma.message.deleteMany();
  await prisma.event.deleteMany();
  await prisma.person.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.booth.deleteMany();
  await prisma.ward.deleteMany();
  await prisma.block.deleteMany();

  // ---- Hierarchy -----------------------------------------------------

  console.log('==> Creating hierarchy');
  const block = await prisma.block.create({
    data: { name: 'Block 4', district: 'Ludhiana', state: 'Punjab' },
  });

  const ward7 = await prisma.ward.create({
    data: { name: 'Ward 7 — Sarabha Nagar', blockId: block.id },
  });
  const ward12 = await prisma.ward.create({
    data: { name: 'Ward 12 — Model Town', blockId: block.id },
  });
  const ward23 = await prisma.ward.create({
    data: { name: 'Ward 23 — Civil Lines', blockId: block.id },
  });
  const ward31 = await prisma.ward.create({
    data: { name: 'Ward 31 — BRS Nagar', blockId: block.id },
  });

  const booth1 = await prisma.booth.create({
    data: {
      name: 'Booth 1',
      location: 'Govt Senior Secondary School, Room 1',
      wardId: ward7.id,
    },
  });
  const booth2 = await prisma.booth.create({
    data: {
      name: 'Booth 2',
      location: 'Govt Senior Secondary School, Room 2',
      wardId: ward7.id,
    },
  });
  const booth3 = await prisma.booth.create({
    data: {
      name: 'Booth 3',
      location: 'Community Hall, Model Town',
      wardId: ward12.id,
    },
  });
  const booth4 = await prisma.booth.create({
    data: {
      name: 'Booth 4',
      location: 'Primary School, Model Town',
      wardId: ward12.id,
    },
  });
  const booth5 = await prisma.booth.create({
    data: {
      name: 'Booth 5',
      location: 'Panchayat Bhawan, Civil Lines',
      wardId: ward23.id,
    },
  });
  const booth6 = await prisma.booth.create({
    data: { name: 'Booth 6', location: 'DMC Annex, Civil Lines', wardId: ward23.id },
  });
  const booth7 = await prisma.booth.create({
    data: { name: 'Booth 7', location: 'BRS Senior Secondary', wardId: ward31.id },
  });
  const booth8 = await prisma.booth.create({
    data: { name: 'Booth 8', location: 'BRS Community Centre', wardId: ward31.id },
  });

  // ---- Admins (one per role for the demo) ----------------------------

  console.log('==> Creating admin accounts');
  const superHash = await bcrypt.hash('Admin@123', BCRYPT_ROUNDS);
  const blockHash = await bcrypt.hash('Block@123', BCRYPT_ROUNDS);
  const wardHash = await bcrypt.hash('Ward@123', BCRYPT_ROUNDS);
  const boothHash = await bcrypt.hash('Booth@123', BCRYPT_ROUNDS);

  const superAdmin = await prisma.admin.create({
    data: {
      name: 'Rajinder Singh',
      email: 'admin@janseva.in',
      passwordHash: superHash,
      role: AdminRole.SUPER_ADMIN,
      lastLoginAt: daysAgo(0),
      loginCount: 14,
    },
  });
  const blockAdmin = await prisma.admin.create({
    data: {
      name: 'Harpreet Kaur',
      email: 'block@janseva.in',
      passwordHash: blockHash,
      role: AdminRole.BLOCK_ADMIN,
      blockId: block.id,
      lastLoginAt: daysAgo(1),
      loginCount: 9,
    },
  });
  const wardAdmin = await prisma.admin.create({
    data: {
      name: 'Sandeep Sharma',
      email: 'ward@janseva.in',
      passwordHash: wardHash,
      role: AdminRole.WARD_ADMIN,
      blockId: block.id,
      wardId: ward12.id,
      lastLoginAt: daysAgo(2),
      loginCount: 4,
    },
  });
  const boothWorker = await prisma.admin.create({
    data: {
      name: 'Manjit Singh',
      email: 'booth@janseva.in',
      passwordHash: boothHash,
      role: AdminRole.BOOTH_WORKER,
      blockId: block.id,
      wardId: ward7.id,
      boothId: booth1.id,
      lastLoginAt: daysAgo(3),
      loginCount: 2,
    },
  });

  // ---- People --------------------------------------------------------

  console.log('==> Creating people');
  const allBooths = [
    { booth: booth1, ward: ward7 },
    { booth: booth2, ward: ward7 },
    { booth: booth3, ward: ward12 },
    { booth: booth4, ward: ward12 },
    { booth: booth5, ward: ward23 },
    { booth: booth6, ward: ward23 },
    { booth: booth7, ward: ward31 },
    { booth: booth8, ward: ward31 },
  ];

  // 30 members — names span Sikh, Hindu, OBC, SC backgrounds; ages
  // span 18-35 / 36-55 / 55+; genders balanced.
  const peopleData: Array<{
    fullName: string;
    fatherName: string;
    gender: Gender;
    phone: string;
    dob: string;
    occupation: string;
    category: Category;
    caste: string;
    address: string;
    pincode: string;
    aadhaar?: string;
    voterId?: string;
    role?: PartyRole;
    status?: Status;
    enrolled?: boolean;
  }> = [
    { fullName: 'Gurpreet Singh', fatherName: 'Balwinder Singh', gender: Gender.MALE, phone: '9876543210', dob: '1988-04-12', occupation: 'Businessman', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 234, Gurdev Nagar, Ludhiana', pincode: '141001', aadhaar: '210198765432', voterId: 'PBA1234567', enrolled: true },
    { fullName: 'Harjinder Kaur', fatherName: 'Joginder Singh', gender: Gender.FEMALE, phone: '9765432109', dob: '1981-08-22', occupation: 'Teacher', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 56, Sarabha Nagar Main Road, Ludhiana', pincode: '141001', aadhaar: '654321098765', voterId: 'PBA2345678' },
    { fullName: 'Sukhwinder Pal', fatherName: 'Ram Lal', gender: Gender.MALE, phone: '9654321098', dob: '1974-01-15', occupation: 'Farmer', category: Category.OBC, caste: 'Pal', address: 'Village Ayali Kalan, Ludhiana', pincode: '141001', aadhaar: '987654321098', status: Status.PENDING },
    { fullName: 'Manpreet Bhatia', fatherName: 'Rakesh Bhatia', gender: Gender.FEMALE, phone: '9543210987', dob: '1997-06-30', occupation: 'Software Engineer', category: Category.GENERAL, caste: 'Khatri', address: 'Flat 12B, Green Avenue Apartments, Model Town, Ludhiana', pincode: '141002', aadhaar: '432109876543', voterId: 'PBA3456789', enrolled: true },
    { fullName: 'Baldev Kumar', fatherName: 'Hari Ram', gender: Gender.MALE, phone: '9432109876', dob: '1965-11-08', occupation: 'Retired Govt Officer', category: Category.SC, caste: 'Ravidasia', address: 'H.No 89, Bhagat Singh Nagar, Ludhiana', pincode: '141003', aadhaar: '321098765432', status: Status.INACTIVE },
    { fullName: 'Navneet Sharma', fatherName: 'Pawan Sharma', gender: Gender.MALE, phone: '9321098765', dob: '1992-03-25', occupation: 'Shopkeeper', category: Category.GENERAL, caste: 'Brahmin', address: 'Shop 45, Chaura Bazaar, Ludhiana', pincode: '141001' },
    { fullName: 'Amarjit Singh', fatherName: 'Gurbachan Singh', gender: Gender.MALE, phone: '9210987654', dob: '1985-09-18', occupation: 'Transporter', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 112, Transport Nagar, Civil Lines, Ludhiana', pincode: '141001', role: PartyRole.BOOTH_WORKER, aadhaar: '109876543210', voterId: 'PBA4567890' },
    { fullName: 'Simranpreet Kaur', fatherName: 'Jaswinder Singh', gender: Gender.FEMALE, phone: '9109876543', dob: '1994-12-05', occupation: 'Nurse', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 78, Civil Lines, Near DMC Hospital', pincode: '141001', enrolled: true },
    { fullName: 'Deepak Verma', fatherName: 'Surinder Verma', gender: Gender.MALE, phone: '9098765432', dob: '1979-07-14', occupation: 'Advocate', category: Category.OBC, caste: 'Verma', address: 'Chamber 23, District Courts Complex, Ludhiana', pincode: '141001' },
    { fullName: 'Kulwinder Kaur', fatherName: 'Harbhajan Singh', gender: Gender.FEMALE, phone: '8987654321', dob: '1990-02-28', occupation: 'Homemaker', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 345, Sector 32-A, Sarabha Nagar', pincode: '141001' },
    { fullName: 'Rajveer Singh Sidhu', fatherName: 'Major Singh Sidhu', gender: Gender.MALE, phone: '8876543210', dob: '1983-10-20', occupation: 'Property Dealer', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'Office 5, GT Road, Model Town', pincode: '141002', role: PartyRole.WARD_ADMIN, aadhaar: '098765432109' },
    { fullName: 'Prabhjot Singh', fatherName: 'Avtar Singh', gender: Gender.MALE, phone: '8765432109', dob: '1999-05-11', occupation: 'Student', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 67, PAU Campus Road, Ludhiana', pincode: '141001' },
    { fullName: 'Jaspreet Kaur Gill', fatherName: 'Charanjit Singh Gill', gender: Gender.FEMALE, phone: '8654321098', dob: '1987-08-03', occupation: 'Bank Manager', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 890, Dugri Phase 1, Ludhiana', pincode: '141002' },
    { fullName: 'Mohinder Pal', fatherName: 'Banarsi Das', gender: Gender.MALE, phone: '8543210987', dob: '1970-04-17', occupation: 'Factory Worker', category: Category.SC, caste: 'Ad Dharmi', address: 'H.No 23, Industrial Area-A, Ludhiana', pincode: '141003', voterId: 'PBA5678901' },
    { fullName: 'Ravinder Kaur', fatherName: 'Darshan Singh', gender: Gender.FEMALE, phone: '8432109876', dob: '1995-01-22', occupation: 'Tailor', category: Category.OBC, caste: 'Ramgarhia', address: 'Shop 12, Ghumar Mandi, Ludhiana', pincode: '141001' },
    { fullName: 'Lakhwinder Singh', fatherName: 'Nirmal Singh', gender: Gender.MALE, phone: '8321098765', dob: '1976-06-09', occupation: 'Truck Driver', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 456, Hambran Road, Ludhiana', pincode: '141001' },
    { fullName: 'Amandeep Kaur', fatherName: 'Paramjit Singh', gender: Gender.FEMALE, phone: '8210987654', dob: '2001-11-30', occupation: 'Student', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 78, Pakhowal Road', pincode: '141001' },
    { fullName: 'Harpal Singh Brar', fatherName: 'Kuldeep Singh Brar', gender: Gender.MALE, phone: '8109876543', dob: '1968-03-14', occupation: 'Retired Army', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 234, Sarabha Nagar Phase 2', pincode: '141001', enrolled: true },
    { fullName: 'Paramjeet Kaur Dhillon', fatherName: 'Sukhdev Singh Dhillon', gender: Gender.FEMALE, phone: '8098765432', dob: '1989-09-07', occupation: 'Dentist', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'Clinic 3, Ferozepur Road', pincode: '141001' },
    { fullName: 'Satnam Singh', fatherName: 'Kartar Singh', gender: Gender.MALE, phone: '7987654321', dob: '1982-12-25', occupation: 'Electrician', category: Category.SC, caste: 'Mazbi Sikh', address: 'H.No 45, BRS Nagar', pincode: '141001', status: Status.PENDING },
    { fullName: 'Anita Devi', fatherName: 'Ram Kumar', gender: Gender.FEMALE, phone: '7876543210', dob: '1962-07-19', occupation: 'Retired Anganwadi Worker', category: Category.OBC, caste: 'Saini', address: 'H.No 12, BRS Nagar Phase 1', pincode: '141001' },
    { fullName: 'Vikram Aggarwal', fatherName: 'Suresh Aggarwal', gender: Gender.MALE, phone: '7765432109', dob: '1996-02-17', occupation: 'Chartered Accountant', category: Category.GENERAL, caste: 'Aggarwal', address: 'Office 8, Feroze Gandhi Market', pincode: '141001', enrolled: true },
    { fullName: 'Pinky Rani', fatherName: 'Mohan Lal', gender: Gender.FEMALE, phone: '7654321098', dob: '2003-04-10', occupation: 'College Student', category: Category.SC, caste: 'Valmiki', address: 'H.No 7, Industrial Area-B', pincode: '141003' },
    { fullName: 'Sukhdev Sharma', fatherName: 'Hari Lal Sharma', gender: Gender.MALE, phone: '7543210987', dob: '1955-10-02', occupation: 'Retired Teacher', category: Category.GENERAL, caste: 'Brahmin', address: 'H.No 99, Civil Lines', pincode: '141001' },
    { fullName: 'Reena Kaur', fatherName: 'Tejinder Singh', gender: Gender.FEMALE, phone: '7432109876', dob: '1998-08-14', occupation: 'Software Tester', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'Flat 4F, Skyline Heights, Model Town', pincode: '141002' },
    { fullName: 'Bharat Bhushan', fatherName: 'Krishan Kumar', gender: Gender.MALE, phone: '7321098765', dob: '1971-05-25', occupation: 'Mechanic', category: Category.OBC, caste: 'Lohar', address: 'Workshop 12, Industrial Area-A', pincode: '141003' },
    { fullName: 'Surinder Kaur Bains', fatherName: 'Joga Singh Bains', gender: Gender.FEMALE, phone: '7210987654', dob: '1959-12-12', occupation: 'Retired Govt Officer', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 567, BRS Nagar Phase 2', pincode: '141001' },
    { fullName: 'Inderpreet Singh', fatherName: 'Dilbag Singh', gender: Gender.MALE, phone: '7109876543', dob: '2000-09-06', occupation: 'Apprentice Mechanic', category: Category.GENERAL, caste: 'Jatt Sikh', address: 'H.No 23, Hambran Road', pincode: '141001', status: Status.PENDING },
    { fullName: 'Geeta Rani', fatherName: 'Rajan Kumar', gender: Gender.FEMALE, phone: '6998765432', dob: '1986-03-19', occupation: 'Beautician', category: Category.OBC, caste: 'Nai', address: 'Salon 3, Ghumar Mandi', pincode: '141001' },
    { fullName: 'Mohan Singh Tomar', fatherName: 'Bhagwan Singh', gender: Gender.MALE, phone: '6887654321', dob: '1948-01-30', occupation: 'Retired', category: Category.ST, caste: 'Tomar', address: 'H.No 9, Sarabha Nagar Phase 3', pincode: '141001' },
  ];

  const createdPeople: Array<{
    id: string;
    uniqueId: string;
    fullName: string;
    boothId: string;
    wardId: string;
  }> = [];

  for (let i = 0; i < peopleData.length; i++) {
    const p = peopleData[i];
    const slot = allBooths[i % allBooths.length];
    const uniqueId = `JS-${pad6(i + 1)}`;
    const created = await prisma.person.create({
      data: {
        uniqueId,
        fullName: p.fullName,
        fatherName: p.fatherName,
        dob: new Date(p.dob),
        gender: p.gender,
        phone: p.phone,
        whatsapp: p.phone,
        email: `${p.fullName.toLowerCase().split(' ')[0]}.${i + 1}@example.com`,
        aadhaarNumber: p.aadhaar ?? null,
        voterId: p.voterId ?? null,
        occupation: p.occupation,
        category: p.category,
        caste: p.caste,
        address: p.address,
        pincode: p.pincode,
        role: p.role ?? PartyRole.MEMBER,
        status: p.status ?? Status.ACTIVE,
        fingerprintEnrolled: p.enrolled ?? false,
        fingerprintTemplate: p.enrolled
          ? Buffer.from(`demo-fp-${uniqueId}`).toString('base64').padEnd(64, '=')
          : null,
        boothId: slot.booth.id,
        wardId: slot.ward.id,
        blockId: block.id,
      },
    });

    await prisma.iDCard.create({
      data: {
        personId: created.id,
        uniqueCardId: `CARD-${uniqueId}`,
        qrCodeData: JSON.stringify({
          id: created.id,
          uniqueId,
          name: p.fullName,
        }),
      },
    });

    createdPeople.push({
      id: created.id,
      uniqueId,
      fullName: p.fullName,
      boothId: slot.booth.id,
      wardId: slot.ward.id,
    });
  }
  console.log(`Created ${createdPeople.length} members + ID cards`);

  // ---- Events --------------------------------------------------------

  console.log('==> Creating events');
  const events = [
    {
      name: 'Vikas Rally — Sarabha Nagar',
      type: EventType.RALLY,
      date: daysAgo(28),
      location: 'Punjab Agricultural University grounds',
      wardId: null as string | null,
      boothId: null as string | null,
      attendanceFraction: 0.62,
    },
    {
      name: 'Booth Worker Training',
      type: EventType.MEETING,
      date: daysAgo(14),
      location: 'Block 4 Office',
      wardId: ward7.id,
      boothId: null,
      attendanceFraction: 0.81,
    },
    {
      name: 'Independence Day Function',
      type: EventType.FUNCTION,
      date: daysAgo(7),
      location: 'Civil Lines Community Centre',
      wardId: null,
      boothId: null,
      attendanceFraction: 0.74,
    },
    {
      name: 'Ward 12 Members Meet',
      type: EventType.GET_TOGETHER,
      date: daysAgo(2),
      location: 'Model Town Park',
      wardId: ward12.id,
      boothId: null,
      attendanceFraction: 0.88,
    },
    {
      name: 'Public Forum — Civil Lines',
      type: EventType.MEETING,
      date: daysAhead(3),
      location: 'Civil Lines Community Centre',
      wardId: ward23.id,
      boothId: null,
      attendanceFraction: 0,
    },
    {
      name: 'Diwali Celebration Rally',
      type: EventType.RALLY,
      date: daysAhead(14),
      location: 'Block 4 Stadium',
      wardId: null,
      boothId: null,
      attendanceFraction: 0,
    },
  ];

  const createdEvents = [];
  for (const e of events) {
    const ev = await prisma.event.create({
      data: {
        name: e.name,
        type: e.type,
        date: e.date,
        location: e.location,
        blockId: block.id,
        wardId: e.wardId,
        boothId: e.boothId,
        targetLevel: e.wardId
          ? TargetLevel.WARD
          : e.boothId
            ? TargetLevel.BOOTH
            : TargetLevel.BLOCK,
      },
    });
    createdEvents.push({ ...ev, attendanceFraction: e.attendanceFraction });
  }

  // ---- Attendance ----------------------------------------------------

  console.log('==> Generating attendance records');
  const methods = [
    AttendanceMethod.QR,
    AttendanceMethod.QR,
    AttendanceMethod.QR,
    AttendanceMethod.MANUAL,
    AttendanceMethod.MANUAL,
    AttendanceMethod.FINGERPRINT,
  ];

  let totalAttendance = 0;
  for (const ev of createdEvents) {
    if (ev.attendanceFraction === 0) continue;

    // Eligible members are those whose ward (and booth, if set) matches.
    const eligible = createdPeople.filter((p) => {
      if (ev.wardId && p.wardId !== ev.wardId) return false;
      if (ev.boothId && p.boothId !== ev.boothId) return false;
      return true;
    });
    if (eligible.length === 0) continue;

    const targetCount = Math.max(
      1,
      Math.round(eligible.length * ev.attendanceFraction),
    );
    const chosen = pickN(eligible, targetCount);

    for (const person of chosen) {
      // Stagger marked-at within ±2 hours of event start so the
      // recent-checkins panel looks realistic.
      const offsetMs =
        (Math.random() - 0.5) * 4 * 60 * 60 * 1000;
      await prisma.attendance.create({
        data: {
          personId: person.id,
          eventId: ev.id,
          method: rand(methods),
          markedAt: new Date(ev.date.getTime() + offsetMs),
        },
      });
      totalAttendance++;
    }
  }
  console.log(`Created ${totalAttendance} attendance records`);

  // ---- Messages ------------------------------------------------------

  console.log('==> Generating messages history');
  const messages = [
    {
      type: MessageType.SMS,
      content: 'Namaste {name} ji, please join the rally at PAU grounds tomorrow at 5pm. - JanSeva',
      subject: null,
      targetLevel: TargetLevel.BLOCK,
      targetId: null,
      recipients: createdPeople.length,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(28),
    },
    {
      type: MessageType.WHATSAPP,
      content: 'Hi {name}, please confirm your attendance for tomorrow’s training at {booth}. Reply YES to confirm.',
      subject: null,
      targetLevel: TargetLevel.WARD,
      targetId: ward7.id,
      recipients: createdPeople.filter((p) => p.wardId === ward7.id).length,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(15),
    },
    {
      type: MessageType.SMS,
      content: 'Independence Day function this Friday at Civil Lines Community Centre. - JanSeva',
      subject: null,
      targetLevel: TargetLevel.BLOCK,
      targetId: null,
      recipients: createdPeople.length,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(8),
    },
    {
      type: MessageType.EMAIL,
      content: '<p>Dear {name},</p><p>Thank you for attending the Independence Day function. Photos and minutes are attached.</p><p>— JanSeva Team</p>',
      subject: 'Thank you — Independence Day 2026',
      targetLevel: TargetLevel.BLOCK,
      targetId: null,
      recipients: 18,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(6),
    },
    {
      type: MessageType.WHATSAPP,
      content: 'Reminder: Ward 12 members meet at Model Town Park, 6 PM today. - JanSeva',
      subject: null,
      targetLevel: TargetLevel.WARD,
      targetId: ward12.id,
      recipients: createdPeople.filter((p) => p.wardId === ward12.id).length,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(2),
    },
    {
      type: MessageType.SMS,
      content: 'Save the date: Public Forum at Civil Lines on {{date}}. - JanSeva',
      subject: null,
      targetLevel: TargetLevel.WARD,
      targetId: ward23.id,
      recipients: createdPeople.filter((p) => p.wardId === ward23.id).length,
      failed: 0,
      status: 'demo',
      sentAt: daysAgo(1),
    },
    {
      type: MessageType.EMAIL,
      content: '<p>Hi {name},</p><p>Diwali celebration rally invitation enclosed. RSVP by next week.</p>',
      subject: 'Diwali Celebration Rally — Invitation',
      targetLevel: TargetLevel.BLOCK,
      targetId: null,
      recipients: 22,
      failed: 1,
      status: 'partial',
      sentAt: daysAgo(0),
    },
  ];

  for (const m of messages) {
    await prisma.message.create({
      data: {
        type: m.type,
        content: m.content,
        subject: m.subject,
        targetLevel: m.targetLevel,
        targetId: m.targetId,
        sentBy: superAdmin.id,
        sentAt: m.sentAt,
        recipientCount: m.recipients,
        failedCount: m.failed,
        status: m.status,
        blockId: block.id,
      },
    });
  }
  console.log(`Created ${messages.length} messages`);

  // ---- Audit log -----------------------------------------------------

  console.log('==> Seeding audit log');
  const auditEntries = [
    { who: superAdmin, action: 'LOGIN', entity: 'Admin', entityId: superAdmin.id, details: null, when: daysAgo(0) },
    { who: blockAdmin, action: 'LOGIN', entity: 'Admin', entityId: blockAdmin.id, details: null, when: daysAgo(1) },
    { who: superAdmin, action: 'CREATE_PERSON', entity: 'Person', entityId: createdPeople[0].id, details: `${createdPeople[0].fullName} (${createdPeople[0].uniqueId})`, when: daysAgo(30) },
    { who: superAdmin, action: 'CREATE_PERSON', entity: 'Person', entityId: createdPeople[3].id, details: `${createdPeople[3].fullName} (${createdPeople[3].uniqueId})`, when: daysAgo(20) },
    { who: blockAdmin, action: 'UPDATE_PERSON', entity: 'Person', entityId: createdPeople[5].id, details: `${createdPeople[5].fullName}`, when: daysAgo(15) },
    { who: superAdmin, action: 'SEND_MESSAGE', entity: 'Message', entityId: null, details: 'SMS → 30 recipients (target=BLOCK)', when: daysAgo(28) },
    { who: blockAdmin, action: 'CREATE_EVENT', entity: 'Event', entityId: createdEvents[0].id, details: createdEvents[0].name, when: daysAgo(35) },
    { who: wardAdmin, action: 'MARK_ATTENDANCE', entity: 'Attendance', entityId: null, details: `${createdPeople[2].fullName} via QR`, when: daysAgo(7) },
    { who: wardAdmin, action: 'MARK_ATTENDANCE', entity: 'Attendance', entityId: null, details: `${createdPeople[4].fullName} via QR`, when: daysAgo(7) },
    { who: superAdmin, action: 'CREATE_ADMIN', entity: 'Admin', entityId: blockAdmin.id, details: `${blockAdmin.name} <${blockAdmin.email}> as BLOCK_ADMIN`, when: daysAgo(40) },
    { who: superAdmin, action: 'CREATE_ADMIN', entity: 'Admin', entityId: wardAdmin.id, details: `${wardAdmin.name} <${wardAdmin.email}> as WARD_ADMIN`, when: daysAgo(38) },
    { who: blockAdmin, action: 'RESET_PASSWORD', entity: 'Admin', entityId: boothWorker.id, details: `${boothWorker.email} (email skipped — SMTP not configured)`, when: daysAgo(5) },
  ];
  for (const a of auditEntries) {
    await prisma.auditLog.create({
      data: {
        adminId: a.who.id,
        adminName: a.who.name,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        details: a.details,
        blockId: a.who.blockId,
        createdAt: a.when,
      },
    });
  }
  console.log(`Created ${auditEntries.length} audit entries`);

  console.log('\n==> Seeding complete!\n');
  console.log('LOGIN CREDENTIALS:');
  console.log('  Super Admin:  admin@janseva.in / Admin@123');
  console.log('  Block Admin:  block@janseva.in / Block@123');
  console.log('  Ward Admin:   ward@janseva.in  / Ward@123');
  console.log('  Booth Worker: booth@janseva.in / Booth@123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

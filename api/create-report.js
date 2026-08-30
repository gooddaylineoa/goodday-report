import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const adminDb = getFirestore();

function generateReportCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return 'RPT-' + rand;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { uid, title, category, description, imageUrl, lat, lng } = req.body;

  if (!uid || !title || !category || !description || !imageUrl || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }

  try {
    const reportCode = generateReportCode();
    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

    const reportRef = await adminDb.collection('reports').add({
      title, category, description, imageUrl,
      location: { lat, lng },
      mapLink,
      reportCode,
      reportedBy: uid,
      status: 'pending',
      rating: null,
      createdAt: Timestamp.now()
    });

    // เก็บสำเนาไว้ในประวัติของผู้ใช้ด้วย (ให้เช็คได้เร็วไม่ต้อง query ทั้ง collection)
    await adminDb.collection('users').doc(uid).collection('myReports').doc(reportRef.id).set({
      reportId: reportRef.id,
      title, category, description, imageUrl, mapLink, reportCode,
      status: 'pending',
      rating: null,
      createdAt: Timestamp.now()
    });

    return res.status(200).json({ success: true, reportId: reportRef.id, reportCode });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
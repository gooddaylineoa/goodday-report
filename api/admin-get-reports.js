import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { adminSecret } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'รหัสผ่านแอดมินไม่ถูกต้อง' });
  }

  try {
    const snap = await adminDb.collection('reports').orderBy('createdAt', 'desc').get();
    const reports = [];
    snap.forEach(doc => {
      const data = doc.data();
      reports.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      });
    });
    return res.status(200).json({ reports });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
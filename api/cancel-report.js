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

  const { uid, reportId } = req.body;
  if (!uid || !reportId) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const reportRef = adminDb.collection('reports').doc(reportId);
    const myReportRef = adminDb.collection('users').doc(uid).collection('myReports').doc(reportId);

    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });

    const data = reportDoc.data();
    if (data.reportedBy !== uid) return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกเรื่องนี้' });
    if (data.status !== 'pending') return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เพราะเจ้าหน้าที่เริ่มดำเนินการแล้ว' });

    // เช็คว่าเกิน 1 สัปดาห์หรือยัง
    const createdDate = data.createdAt.toDate();
    const daysPassed = (new Date() - createdDate) / (1000 * 60 * 60 * 24);
    if (daysPassed > 7) {
      return res.status(400).json({ error: 'ไม่สามารถยกเลิกได้ เพราะเกิน 1 สัปดาห์นับจากวันที่แจ้งแล้ว' });
    }

    await reportRef.update({ status: 'cancelled' });
    await myReportRef.update({ status: 'cancelled' });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
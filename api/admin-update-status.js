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

const statusMessages = {
  pending: 'รอรับเรื่อง',
  inprogress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขเสร็จสิ้นแล้ว',
  cancelled: 'ถูกยกเลิก'
};

async function sendLinePush(lineUserId, message) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }]
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { adminSecret, reportId, newStatus } = req.body;

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'รหัสผ่านแอดมินไม่ถูกต้อง' });
  }
  if (!reportId || !newStatus) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }

  try {
    const reportRef = adminDb.collection('reports').doc(reportId);
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) return res.status(404).json({ error: 'ไม่พบเรื่องนี้' });

    const data = reportDoc.data();
    const uid = data.reportedBy;

    await reportRef.update({ status: newStatus });
    await adminDb.collection('users').doc(uid).collection('myReports').doc(reportId).update({ status: newStatus });

    // ส่งแจ้งเตือนผ่าน LINE (ถ้า uid มาจาก LINE login เท่านั้น)
    if (uid.startsWith('line_')) {
      const lineUserId = uid.replace('line_', '');
      const statusText = statusMessages[newStatus] || newStatus;
      await sendLinePush(
        lineUserId,
        `📢 อัปเดตสถานะแจ้งเหตุ\n\nเรื่อง: ${data.title}\nรหัส: ${data.reportCode}\nสถานะใหม่: ${statusText}\n\nเปิดแอปเพื่อดูรายละเอียดเพิ่มเติมได้เลยครับ`
      );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// CRITICAL: Must pass firestoreDatabaseId
export const firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test connection on boot
if (typeof window !== 'undefined') {
  (async function testConnection() {
    try {
      await getDocFromServer(doc(firestore, 'test', 'connection'));
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn('[Firebase] Offline or checking configuration');
      }
    }
  })();
}

export interface FirestoreSubmission {
  sessionId: string;
  examId: string;
  examCode: string;
  studentName: string;
  studentClass: string;
  sbd?: string;
  score: number;
  bestScore?: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  totalQuestions: number;
  attemptNumber: number;
  violationCount: number;
  submittedAt: string;
  status: string;
  answers?: Record<string, string>;
}

// 1. Permanent Student Submission to Firestore (Saved ONLY upon submission or time expiry)
export async function savePermanentSubmission(sub: FirestoreSubmission): Promise<boolean> {
  if (!sub || !sub.sessionId) return false;
  try {
    const docId = `sub_${sub.sessionId}`;
    const cleanExamId = String(sub.examId || '').trim();
    const cleanExamCode = String(sub.examCode || cleanExamId).trim();

    await setDoc(doc(firestore, 'submissions', docId), {
      ...sub,
      examId: cleanExamId,
      examCode: cleanExamCode,
      score: Number(sub.score) || 0,
      bestScore: Number(sub.bestScore ?? sub.score) || 0,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return true;
  } catch (err) {
    console.warn('[Firebase] savePermanentSubmission error:', err);
    return false;
  }
}

// 2. Load all permanent submissions for an exam from Firestore
export async function getSubmissionsFromFirestore(examId: string): Promise<FirestoreSubmission[]> {
  if (!examId || examId.trim() === '') return [];
  const cleanId = String(examId).trim();
  const results: FirestoreSubmission[] = [];

  try {
    // Query submissions by examId or examCode
    const colRef = collection(firestore, 'submissions');
    const snap = await getDocs(colRef);

    snap.forEach((d) => {
      const data = d.data() as FirestoreSubmission;
      if (
        data &&
        (data.examId === cleanId ||
          data.examCode === cleanId ||
          String(data.examId).toUpperCase() === cleanId.toUpperCase() ||
          String(data.examCode).toUpperCase() === cleanId.toUpperCase())
      ) {
        results.push(data);
      }
    });
  } catch (err) {
    console.warn('[Firebase] getSubmissionsFromFirestore error:', err);
  }

  return results;
}

// 3. Delete all submissions for an exam from Firestore when teacher deletes an exam
export async function deleteSubmissionsForExamFromFirestore(examId: string, examCode?: string): Promise<void> {
  if (!examId) return;
  const cleanId = String(examId).trim().toUpperCase();
  const cleanCode = String(examCode || '').trim().toUpperCase();

  try {
    const colRef = collection(firestore, 'submissions');
    const snap = await getDocs(colRef);
    const deletePromises: Promise<void>[] = [];

    snap.forEach((d) => {
      const data = d.data();
      const sExamId = String(data.examId || '').trim().toUpperCase();
      const sExamCode = String(data.examCode || '').trim().toUpperCase();
      if (sExamId === cleanId || sExamCode === cleanId || (cleanCode && (sExamId === cleanCode || sExamCode === cleanCode))) {
        deletePromises.push(deleteDoc(d.ref));
      }
    });

    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('[Firebase] deleteSubmissionsForExamFromFirestore error:', err);
  }
}

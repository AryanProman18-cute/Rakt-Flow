import { collection, getFirestore, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getRaktFlowAuth } from './auth.js';

export function subscribeToOperationalEvents(onEvent, onError = console.error) {
  const user = getRaktFlowAuth().currentUser;
  if (!user) throw new Error('Authentication required');
  const events = query(
    collection(getFirestore(), 'operational_events'),
    where('recipientUid', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(events, (snapshot) => {
    snapshot.docChanges().filter((change) => change.type === 'added').forEach((change) => onEvent({ id: change.doc.id, ...change.doc.data() }));
  }, onError);
}

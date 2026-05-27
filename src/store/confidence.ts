import type { AnnotationStore } from './annotations.js';

/** Boost confidence for an annotation, logging the evolution event */
export function boostConfidence(
  store: AnnotationStore,
  annotationId: string,
  increment: number = 0.1,
): void {
  // Get current annotation
  const results = store.recall({ limit: 1000 });
  const ann = results.find(a => a.id === annotationId);
  if (!ann) return;
  const oldConf = ann.confidence;
  const newConf = Math.min(oldConf + increment, 1.0);
  if (newConf !== oldConf) {
    store.logEvolutionEvent(annotationId, 'confidence_up', String(oldConf), String(newConf));
  }
}

/** Decay confidence for stale annotations */
export function decayConfidence(
  store: AnnotationStore,
  annotationId: string,
  decrement: number = 0.1,
): void {
  const results = store.recall({ limit: 1000 });
  const ann = results.find(a => a.id === annotationId);
  if (!ann) return;
  const oldConf = ann.confidence;
  const newConf = Math.max(oldConf - decrement, 0.0);
  if (newConf !== oldConf) {
    store.logEvolutionEvent(annotationId, 'confidence_down', String(oldConf), String(newConf));
  }
}

/** Get stale annotations older than daysOld with confidence below threshold */
export function getStaleAnnotations(
  store: AnnotationStore,
  daysOld: number = 30,
  confidenceThreshold: number = 0.5,
): ReturnType<typeof store.recall> {
  const stale = store.getStaleAnnotations(daysOld, confidenceThreshold);
  return stale;
}

/** Run full decay pass on all annotations */
export function runDecayPass(store: AnnotationStore): { decayed: number; archived: number } {
  const stale = store.getStaleAnnotations(30, 1.0); // all older than 30 days
  let decayed = 0;
  let archived = 0;
  for (const ann of stale) {
    if (ann.confidence >= 0.9 && ann.updatedAt && new Date(ann.updatedAt).getTime() > Date.now() - 90 * 86400000) {
      // High confidence and recently used — keep
      continue;
    }
    if (ann.confidence < 0.3) {
      store.archiveAnnotation(ann.id);
      archived++;
    } else {
      decayConfidence(store, ann.id, 0.1);
      decayed++;
    }
  }
  return { decayed, archived };
}
